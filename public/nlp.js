/**
 * Extract locations from text using regex patterns
 * @param {string} text - The input text to extract locations from
 * @returns {Array<string>} - Array of extracted locations
 */
export function extractLocationsWithRegex(text) {
  if (!text) return [];
  
  console.log('Extracting locations with regex from:', text);
  
  // Normalize text: lowercase and remove extra spaces
  const normalizedText = text.trim().replace(/\s+/g, ' ');
  console.log('Normalized text:', normalizedText);
  
  // Extract transport mode and avoidance preferences
  const transportMode = 
    normalizedText.match(/\b(walk|walking|on foot)\b/i) ? 'walking' :
    normalizedText.match(/\b(cycl|bike|biking|bicycle)\b/i) ? 'cycling' : 'driving';
  
  const avoidTolls = !!normalizedText.match(/\b(no toll|avoid toll|without toll)\b/i);
  const avoidHighways = !!normalizedText.match(/\b(no highway|avoid highway|without highway)\b/i);
  const avoidFerries = !!normalizedText.match(/\b(no ferr|avoid ferr|without ferr)\b/i);
  
  console.log('Extracted preferences:', { transportMode, avoidTolls, avoidHighways, avoidFerries });
  
  // First, try to match the specific pattern "route from X to Y"
  const routePattern = /route\s+from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)(?:\s|$)/i;
  const routeMatch = normalizedText.match(routePattern);
  
  if (routeMatch) {
    const locations = [routeMatch[1].trim(), routeMatch[2].trim()];
    console.log('Extracted locations from route pattern:', locations);
    
    return {
      locations,
      preferences: {
        transportMode,
        avoidTolls,
        avoidHighways,
        avoidFerries
      }
    };
  }
  
  // Common separators that might indicate different locations
  const separators = [
    /\s+to\s+/i,           // "New York to Los Angeles"
    /\s+and\s+/i,          // "New York and Los Angeles"
    /\s*,\s*/,             // "New York, Los Angeles"
    /\s+through\s+/i,      // "New York through Chicago"
    /\s+via\s+/i,          // "New York via Chicago"
    /\s+between\s+/i,      // "between New York and Los Angeles"
  ];
  
  // Try each separator pattern
  for (const separator of separators) {
    if (separator.test(normalizedText)) {
      // Special handling for "between X and Y"
      if (separator.toString() === /\s+between\s+/i.toString()) {
        const betweenMatch = normalizedText.match(/between\s+([A-Za-z\s]+)\s+and\s+([A-Za-z\s]+)/i);
        if (betweenMatch) {
          const locations = [betweenMatch[1].trim(), betweenMatch[2].trim()];
          console.log('Extracted locations from between pattern:', locations);
          
          return {
            locations,
            preferences: {
              transportMode,
              avoidTolls,
              avoidHighways,
              avoidFerries
            }
          };
        }
      } else {
        // For other separators, split the text
        let parts = normalizedText.split(separator);
        
        // Clean up the parts
        parts = parts
          .map(part => {
            // Remove common prepositions at the start
            return part.replace(/^(from|to|in|at|starting|ending|beginning|route)\s+/i, '').trim();
          })
          .filter(part => part.length > 0);
        
        if (parts.length >= 2) {
          console.log('Extracted locations using separator:', parts);
          
          return {
            locations: parts,
            preferences: {
              transportMode,
              avoidTolls,
              avoidHighways,
              avoidFerries
            }
          };
        }
      }
    }
  }
  
  // If we couldn't extract multiple locations, check if there's a single location
  // Remove common words that aren't locations
  const cleanedText = normalizedText
    .replace(/^(show|find|get|display|give me|route|path|directions?|map)\s+/i, '')
    .replace(/^(from|to|in|at)\s+/i, '')
    .replace(/\s+(route|path|directions?|map)$/i, '')
    .trim();
  
  if (cleanedText && cleanedText !== normalizedText) {
    console.log('Extracted single location:', cleanedText);
    
    return {
      locations: [cleanedText],
      preferences: {
        transportMode,
        avoidTolls,
        avoidHighways,
        avoidFerries
      }
    };
  }
  
  // If all else fails, just return the original text as a single location
  console.log('Falling back to original text as location');
  
  return {
    locations: [text.trim()],
    preferences: {
      transportMode,
      avoidTolls,
      avoidHighways,
      avoidFerries
    }
  };
} 