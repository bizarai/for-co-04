// Define the API URL based on the environment - using same domain
const API_URL = '';

// Import NLP module
import { extractLocationsWithRegex } from './nlp.js';

// We need to set a valid Mapbox token for the map to load properly
// Let's fetch it from the Cloudflare Worker
let map;

// Initialize the map after we fetch the token
async function initializeMap() {
  try {
    console.log('Starting map initialization...');
    // Fetch the Mapbox token from the Worker
    console.log('Fetching Mapbox token from server...');
    const response = await fetch(`${API_URL}/api/mapbox-token`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('Token received:', data.token ? 'yes (length: ' + data.token.length + ')' : 'no');
    
    if (!data.token) {
      throw new Error('No Mapbox token received from server');
    }
    
    // Set the token for Mapbox GL
    mapboxgl.accessToken = data.token;
    console.log('Mapbox token set, initializing map...');
    
    // Initialize the map
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-122.42136449, 37.80176523], // Center the map on San Francisco
      zoom: 8
    });
    
    console.log('Map object created, waiting for load event...');
    
    map.on('load', () => {
      console.log('Map loaded successfully');
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });
    
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00a0f0',
          'line-width': 3
        }
      });
      console.log('Layer added');
    });
    
    // Add error event listener to the map
    map.on('error', (e) => {
      console.error('Mapbox GL error:', e.error);
    });
  } catch (error) {
    console.error('Error initializing map:', error);
    document.getElementById('map').innerHTML = 
      '<div style="color: red; padding: 20px;">Error loading map: ' + error.message + '. Please try refreshing the page.</div>';
  }
}

// Call the initialize function when the page loads
document.addEventListener('DOMContentLoaded', initializeMap);

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const loadingIndicator = document.getElementById('loading-indicator');

searchButton.addEventListener('click', async () => {
  const inputValue = searchInput.value;
  
  if (!inputValue.trim()) {
    alert('Please enter a search query');
    return;
  }
  
  // Show loading indicator
  loadingIndicator.style.display = 'block';
  loadingIndicator.textContent = 'Processing your request...';
  
  // Set a timeout for the entire operation
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timed out')), 10000)
  );
  
  try {
    // Process the input with Gemini API through our Worker
    const result = await Promise.race([
      processNaturalLanguage(inputValue),
      timeoutPromise
    ]);
    
    console.log('NLP Result:', result);
    
    if (result.locations && result.locations.length > 0) {
      // Process the extracted locations and preferences
      loadingIndicator.textContent = 'Finding route...';
      getRouteCoordinates(result.locations, result.preferences, true);
    } else {
      // Fallback to direct processing if NLP fails to extract locations
      loadingIndicator.textContent = 'Finding route...';
      getRouteCoordinates(inputValue);
    }
  } catch (error) {
    console.error('Error processing input:', error);
    
    // Don't show technical error to the user, just continue with a simpler message
    loadingIndicator.textContent = 'Finding route...';
    
    // Try extracting locations with regex directly
    const regexLocations = extractLocationsWithRegex(inputValue);
    if (regexLocations && regexLocations.length >= 2) {
      console.log('Using regex-extracted locations as fallback:', regexLocations);
      getRouteCoordinates(regexLocations, null, true);
    } else {
      // If no locations found with regex, try direct processing
      getRouteCoordinates(inputValue);
    }
  }
});

// Process natural language using Gemini API through our Worker
async function processNaturalLanguage(text) {
  try {
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
        
        Text: "${text}"
      `;

    const response = await fetch(`${API_URL}/api/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      
      const text = data.candidates[0].content.parts[0].text;
      
      // Extract the JSON object from the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        return JSON.parse(jsonStr);
      }
    }
    
    throw new Error('Could not parse Gemini API response');
  } catch (error) {
    console.error('Error in processNaturalLanguage:', error);
    throw error;
  }
}

/**
 * Get route coordinates based on input and preferences
 * @param {string|Array} input - The input string or array of locations
 * @param {Object} preferences - Optional route preferences
 * @param {boolean} isLocationArray - Whether the input is already an array of locations
 */
function getRouteCoordinates(input, preferences = null, isLocationArray = false) {
  // Default preferences if not provided
  preferences = preferences || {
    transportMode: 'driving',
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false
  };

  // Handle the input based on whether it's an array or string
  let locations;
  
  if (isLocationArray && Array.isArray(input)) {
    // If input is already an array of locations, use it directly
    console.log('Using provided locations array:', input);
    locations = input;
  } else {
    // Process the input string to extract locations
    // First, remove any trailing punctuation like periods
    let inputString = input.trim();
    inputString = inputString.replace(/[.!?]+$/, '').trim();
    
    console.log('Input after removing trailing punctuation:', inputString);
    
    // Improved location extraction logic
    
    // 1. Check if the input starts with "from" and remove it, but store this information
    const startsWithFrom = inputString.toLowerCase().startsWith('from ');
    if (startsWithFrom) {
      inputString = inputString.substring(5).trim();
    }
    
    // 2. Split by " to " to get all locations
    locations = inputString
      .split(/\s+to\s+/i)
      .map(location => location.trim())
      .filter(location => location.length > 0);
    
    // 3. Handle the case where we have a "from" prefix but only one location
    // This fixes the issue where "From Paris to London" was centering on Paris
    if (startsWithFrom && locations.length === 1) {
      // If we only have one location after removing "from", it might be because
      // the query was something like "From Paris" without a destination
      // In this case, we should just use the location as is
      console.log('Single location with "from" prefix detected');
    }
    
    // 4. Ensure we always treat the input as a route request when there are multiple locations
    // or when the input explicitly uses "to" or "from" keywords
    const hasToKeyword = input.toLowerCase().includes(' to ');
    const isRouteRequest = locations.length > 1 || startsWithFrom || hasToKeyword;
    
    // If this is not explicitly a route request and we have only one location,
    // we'll just center on that location
    if (!isRouteRequest && locations.length === 1) {
      console.log('Single location without route indicators detected');
    }
    
    console.log('Extracted locations:', locations);
    console.log('Is route request:', isRouteRequest);
  }

  if (!locations || locations.length < 1) {
    console.error('No valid locations found in input');
    alert('Please enter valid locations separated by "to"');
    // Hide loading indicator when no valid locations are found
    document.getElementById('loading-indicator').style.display = 'none';
    return;
  }

  // Now we need to geocode each location using our Worker
  const geocodePromises = locations.map(location =>
    fetch(`${API_URL}/api/mapbox-geocoding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ location })
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            throw new Error(errorData.error || `Unable to geocode location: ${location}`);
          });
        }
        return response.json();
      })
      .then(data => {
        if (data.coordinates) {
          console.log(`Geocoded "${location}" to:`, data.coordinates);
          return data.coordinates;
        } else {
          throw new Error(`Unable to geocode location: ${location}`);
        }
      })
      .catch(error => {
        console.error(`Error geocoding "${location}":`, error.message);
        throw new Error(`Unable to find "${location}" on the map`);
      })
  );

  // Process all geocoding requests
  Promise.all(geocodePromises)
    .then(coordinates => {
      console.log('All locations geocoded:', coordinates);
      
      if (coordinates.length < 2) {
        throw new Error('At least two valid locations are needed to create a route');
      }
      
      // Get the route using our Worker
      return fetch(`${API_URL}/api/mapbox-directions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coordinates,
          profile: preferences.transportMode || 'driving'
        })
      });
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(errorData => {
          throw new Error(errorData.error || 'Unable to get directions');
        });
      }
      return response.json();
    })
    .then(data => {
      if (data.route && data.route.geometry && data.route.geometry.coordinates) {
        console.log('Route data received:', data.route);
        
        // Update the map with the route
        if (map) {
          const source = map.getSource('route');
          if (source) {
            source.setData({
              type: 'Feature',
              properties: {},
              geometry: data.route.geometry
            });
            
            // Fit the map to the route bounds
            const coordinates = data.route.geometry.coordinates;
            const bounds = coordinates.reduce((bounds, coord) => {
              return bounds.extend(coord);
            }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
            
            map.fitBounds(bounds, {
              padding: 50
            });
            
            console.log('Map updated with route');
          } else {
            console.error('Route source not found in map');
          }
        } else {
          console.error('Map not initialized');
        }
      } else {
        throw new Error('Invalid route data received');
      }
      
      // Hide loading indicator
      document.getElementById('loading-indicator').style.display = 'none';
    })
    .catch(error => {
      console.error('Error in route processing:', error);
      alert(`Error: ${error.message}`);
      // Hide loading indicator
      document.getElementById('loading-indicator').style.display = 'none';
    });
} 