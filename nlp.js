// Natural Language Processing module using Gemini API

// Import configuration - no longer directly importing API keys
// import config from './config.js';

/**
 * Process natural language input to extract locations and route preferences
 * @param {string} query - The natural language query from the user
 * @returns {Promise<Object>} - Structured data with locations and preferences
 */
async function processNaturalLanguage(query) {
  try {
    // Try regex approach first as a fast fallback
    const regexLocations = extractLocationsWithRegex(query);
    
    if (regexLocations && regexLocations.length >= 2) {
      console.log('Successfully extracted locations with regex:', regexLocations);
      return {
        locations: regexLocations,
        preferences: {
          transportMode: query.match(/walk|walking|on foot/i) ? 'walking' : 
                         query.match(/cycl|bike|biking|bicycle/i) ? 'cycling' : 'driving',
          avoidTolls: !!query.match(/no toll|avoid toll|without toll/i),
          avoidHighways: !!query.match(/no highway|avoid highway|without highway/i),
          avoidFerries: !!query.match(/no ferr|avoid ferr|without ferr/i)
        }
      };
    }
    
    // If regex doesn't find enough locations, try using Gemini API
    console.log('Regex found insufficient locations, trying Gemini API...');
    
    // First try using function calling capabilities
    const response = await fetchGeminiWithFunctionCalling(query);
    return validateAndFormatResponse(response);
  } catch (error) {
    console.error('Error with function calling approach:', error);
    
    // Check if the error contains a fallback message from the server
    if (error.fallback) {
      console.log('Received fallback instruction from server:', error.message);
      // Try one more time with regex as a final fallback
      const regexLocations = extractLocationsWithRegex(query);
      if (regexLocations && regexLocations.length >= 2) {
        return {
          locations: regexLocations,
          preferences: {
            transportMode: 'driving',
            avoidTolls: false,
            avoidHighways: false,
            avoidFerries: false
          }
        };
      }
    }
    
    try {
      // Fallback to traditional prompt-based approach
      console.log('Falling back to traditional prompt approach');
      const prompt = `
        Extract location information and route preferences from the following text.
        Return a JSON object with the following structure:
        {
          "locations": [array of location names in order],
          "preferences": {
            "transportMode": "driving/walking/cycling/etc",
            "avoidTolls": boolean,
            "avoidHighways": boolean,
            "avoidFerries": boolean
          }
        }
        
        Important instructions:
        1. Ignore common prepositions like "from", "to", "through", "via", "between", "starting at", "ending at" when extracting locations.
        2. Only include actual place names, cities, addresses, or landmarks in the locations array.
        3. Preserve the correct order of locations as they appear in the text.
        4. Keep multi-word location names together (e.g., "New York", "Los Angeles", "San Francisco") - do not split them.
        5. If any preference is not specified, use null for that value.
        6. Be flexible with input formats and focus on extracting the key information.
        7. If you're uncertain about a location name, include it anyway.
        
        Text: "${query}"
      `;

      const response = await fetchGeminiResponse(prompt);
      return validateAndFormatResponse(response);
    } catch (secondError) {
      console.error('Error with traditional prompt approach:', secondError);
      
      // Final fallback: try to extract locations using regex patterns
      return extractLocationsWithRegex(query);
    }
  }
}

/**
 * Call the Gemini API with function calling capabilities via our secure server
 * @param {string} query - The user's natural language query
 * @returns {Promise<Object>} - The structured data extracted from the query
 */
async function fetchGeminiWithFunctionCalling(query) {
  // The function declarations for the Gemini model
  const functionDeclarations = [{
    name: "extractRouteInfo",
    description: "Extract locations and routing preferences from natural language",
    parameters: {
      type: "OBJECT",
      properties: {
        locations: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "List of locations mentioned in order of travel"
        },
        preferences: {
          type: "OBJECT",
          properties: {
            transportMode: {
              type: "STRING",
              enum: ["driving", "walking", "cycling", "transit"],
              description: "Mode of transportation"
            },
            avoidTolls: {
              type: "BOOLEAN",
              description: "Whether to avoid toll roads"
            },
            avoidHighways: {
              type: "BOOLEAN",
              description: "Whether to avoid highways"
            },
            avoidFerries: {
              type: "BOOLEAN",
              description: "Whether to avoid ferries"
            }
          }
        }
      },
      required: ["locations"]
    }
  }];

  // Using our server proxy endpoint instead of calling Gemini directly
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: `Extract routing information from this text: "${query}"`,
      functionDeclarations
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Try to extract the function call results
  if (data.candidates && 
      data.candidates[0] && 
      data.candidates[0].content && 
      data.candidates[0].content.parts) {
    
    for (const part of data.candidates[0].content.parts) {
      if (part.functionCall && part.functionCall.name === "extractRouteInfo") {
        return JSON.parse(JSON.stringify(part.functionCall.args));
      }
    }
    
    // If we didn't find a function call, try to extract from text
    for (const part of data.candidates[0].content.parts) {
      if (part.text) {
        try {
          // Find JSON content within the response
          const jsonMatch = part.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                           part.text.match(/({[\s\S]*})/);
          
          if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1].trim());
          }
        } catch (error) {
          console.error('Failed to parse text response as JSON:', error);
        }
      }
    }
  }
  
  throw new Error('Could not extract structured data from Gemini response');
}

/**
 * Call the Gemini API with the given prompt via our secure server
 * @param {string} prompt - The prompt to send to Gemini
 * @returns {Promise<Object>} - The parsed JSON response
 */
async function fetchGeminiResponse(prompt) {
  // Using our server proxy endpoint instead of calling Gemini directly
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Extract the text response from Gemini
  if (data.candidates && 
      data.candidates[0] && 
      data.candidates[0].content && 
      data.candidates[0].content.parts && 
      data.candidates[0].content.parts[0]) {
    const textResponse = data.candidates[0].content.parts[0].text;
    
    // Try to extract JSON from the response
    try {
      // Find JSON content within the response (it might be wrapped in markdown code blocks)
      const jsonMatch = textResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                       textResponse.match(/({[\s\S]*})/);
      
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1].trim());
      } else {
        // If no JSON block found, try parsing the whole response
        return JSON.parse(textResponse.trim());
      }
    } catch (error) {
      console.error('Failed to parse Gemini response as JSON:', error);
      throw new Error('Invalid response format from Gemini API');
    }
  } else {
    throw new Error('Unexpected response structure from Gemini API');
  }
}

/**
 * Validate and format the response from Gemini
 * @param {Object} response - The parsed response from Gemini
 * @returns {Object} - Validated and formatted response
 */
function validateAndFormatResponse(response) {
  // Ensure we have a locations array
  const locations = Array.isArray(response.locations) ? response.locations : [];
  
  // Default preferences
  const defaultPreferences = {
    transportMode: 'driving',
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false
  };
  
  // Merge with provided preferences or use defaults
  const preferences = response.preferences ? 
    { ...defaultPreferences, ...response.preferences } : 
    defaultPreferences;
  
  // Ensure transportMode is valid
  const validModes = ['driving', 'walking', 'cycling', 'transit'];
  if (!validModes.includes(preferences.transportMode)) {
    preferences.transportMode = 'driving';
  }
  
  return {
    locations,
    preferences
  };
}

/**
 * Extract locations and preferences using regex patterns as a last resort fallback
 * @param {string} query - The user's natural language query
 * @returns {Object} - Extracted locations and preferences
 */
function extractLocationsWithRegex(query) {
  console.log('Using regex fallback extraction for:', query);
  
  // Default preferences
  const preferences = {
    transportMode: 'driving',
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false
  };
  
  // Extract transport mode
  const transportModeMatch = query.match(/(?:by|using|with|via)\s+(car|driving|walking|cycling|bike|transit|bus|train)/i);
  if (transportModeMatch) {
    const mode = transportModeMatch[1].toLowerCase();
    if (mode === 'car') {
      preferences.transportMode = 'driving';
    } else if (mode === 'bike') {
      preferences.transportMode = 'cycling';
    } else if (['bus', 'train'].includes(mode)) {
      preferences.transportMode = 'transit';
    } else if (['driving', 'walking', 'cycling', 'transit'].includes(mode)) {
      preferences.transportMode = mode;
    }
  }
  
  // Extract avoidance preferences
  if (query.match(/avoid(?:ing)?\s+(?:toll|tolls)/i)) {
    preferences.avoidTolls = true;
  }
  if (query.match(/avoid(?:ing)?\s+(?:highway|highways|freeway|freeways)/i)) {
    preferences.avoidHighways = true;
  }
  if (query.match(/avoid(?:ing)?\s+(?:ferry|ferries)/i)) {
    preferences.avoidFerries = true;
  }
  
  // Extract locations using various patterns
  let locations = [];
  
  // First try specific "route from X to Y" pattern
  const routeFromToPattern = /route\s+from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)(?:\s|$)/i;
  const routeMatch = routeFromToPattern.exec(query);
  if (routeMatch && routeMatch[1] && routeMatch[2]) {
    locations = [routeMatch[1].trim(), routeMatch[2].trim()];
    console.log('Extracted locations from "route from X to Y" pattern:', locations);
    return { locations, preferences };
  }
  
  // Try to extract with common prepositions
  const prepositionPattern = /(?:from|to|through|via|between|in|at)\s+([A-Z][a-zA-Z0-9\s,]+?)(?:\s+(?:to|and|through|via|,)|$)/gi;
  let match;
  while ((match = prepositionPattern.exec(query)) !== null) {
    if (match[1] && match[1].trim()) {
      locations.push(match[1].trim());
    }
  }
  
  // If no locations found with prepositions, try splitting by common separators
  if (locations.length === 0) {
    const separators = [' to ', ', ', ' and ', ' => ', ','];
    const separatorPattern = new RegExp(separators.join('|'), 'gi');
    locations = query
      .split(separatorPattern)
      .map(loc => loc.trim())
      .filter(loc => loc.length > 0 && /[A-Za-z]/.test(loc));
  }
  
  // If still no locations, use the whole query as a single location
  if (locations.length === 0) {
    // Remove common descriptive words at the beginning
    const cleanedQuery = query
      .replace(/^(?:route|path|directions|way|road|show me|find|get|display)\s+(?:from|to|between)?\s+/i, '')
      .trim();
    
    if (cleanedQuery) {
      locations = [cleanedQuery];
    }
  }
  
  console.log('Extracted locations using regex patterns:', locations);
  return {
    locations,
    preferences
  };
}

// Export the functions
export { 
  processNaturalLanguage,
  extractLocationsWithRegex
};