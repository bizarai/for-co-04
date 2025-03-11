// Import configuration and NLP module
// import config from './config.js';
import { processNaturalLanguage, extractLocationsWithRegex } from './nlp.js';

// No longer getting the token from config
// const mapboxToken = config.mapbox.token;

// We need to set a valid Mapbox token for the map to load properly
// Let's fetch it from the server first
let map;

// Initialize the map after we fetch the token
async function initializeMap() {
  try {
    console.log('Starting map initialization...');
    // Fetch the Mapbox token from the server
    console.log('Fetching Mapbox token from server...');
    const response = await fetch('/api/mapbox-token');
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
    // Race between the NLP processing and the timeout
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

// Remove the geocodingUrl direct reference
// const geocodingUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places/';

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

  // Now we need to geocode each location using our server proxy
  const geocodePromises = locations.map(location =>
    fetch('/api/mapbox-geocoding', {
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
        if (data.features && data.features.length > 0) {
          const coordinates = data.features[0].geometry.coordinates;
          console.log(`Geocoded "${location}" to:`, coordinates);
          return coordinates; // Return as array, not string
        } else {
          throw new Error(`Unable to geocode location: ${location}`);
        }
      })
      .catch(error => {
        console.error(`Error geocoding "${location}":`, error.message);
        throw new Error(`Unable to find "${location}" on the map`);
      })
  );

  // Use our server proxy instead of directly calling Mapbox API
  let routeAttempt = 0;
  const maxRouteAttempts = 2;

  function findRoute(coordinates, preferences) {
    routeAttempt++;
    console.log(`Route attempt ${routeAttempt} of ${maxRouteAttempts}`);
    
    // Simplify parameters on retry attempts
    const requestBody = {
      coordinates,
      profile: preferences.transportMode,
      geometries: 'geojson',
      overview: 'full'
    };
    
    // Only add optional parameters on first attempt
    if (routeAttempt === 1) {
      requestBody.alternatives = false;
      requestBody.steps = false;
    }
    
    fetch('/api/mapbox-directions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(errorData => {
          throw new Error(errorData.error || 'Error finding route');
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('Route data:', data);
      if (data.routes && data.routes.length > 0) {
        const routeCoordinates = data.routes[0].geometry.coordinates;
        
        if (!routeCoordinates || routeCoordinates.length < 2) {
          console.error('Route coordinates are invalid:', routeCoordinates);
          throw new Error('Received invalid route data from the server');
        }
        
        console.log('Drawing route with', routeCoordinates.length, 'points');
        
        const mapData = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: routeCoordinates
          }
        };
        
        // Update the map with the route data
        if (map.loaded() && map.getSource('route')) {
          console.log('Updating map with route data');
          map.getSource('route').setData(mapData);
          
          // Compute the bounding box for all coordinates
          const bounds = routeCoordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
          }, new mapboxgl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]));

          // Fit the map to the bounds
          map.fitBounds(bounds, {
            padding: 50
          });
        } else {
          console.error('Map or source not ready');
        }
      } else {
        console.error('No valid route found in the API response');
        throw new Error('Could not find a valid route between the specified locations');
      }
      // Hide loading indicator after processing completes
      document.getElementById('loading-indicator').style.display = 'none';
      // Reset route attempt counter
      routeAttempt = 0;
    })
    .catch(error => {
      console.error('Error fetching directions:', error);
      
      // Try again with simpler parameters if we haven't reached max attempts
      if (routeAttempt < maxRouteAttempts) {
        console.log('Retrying with simpler parameters...');
        findRoute(coordinates, preferences);
      } else {
        alert('Error getting directions: ' + error.message);
        // Hide loading indicator in case of error too
        document.getElementById('loading-indicator').style.display = 'none';
        // Reset route attempt counter
        routeAttempt = 0;
      }
    });
  }

  Promise.all(geocodePromises)
    .then(coordinates => {
      console.log('Geocoded coordinates:', coordinates);
      console.log('Number of locations:', locations.length, 'Number of coordinates:', coordinates.length);
      
      // Determine if this should be treated as a route request or just centering on a location
      const startsWithFrom = input.toString().toLowerCase().trim().startsWith('from ');
      const hasToKeyword = input.toString().toLowerCase().includes(' to ');
      const isRouteRequest = coordinates.length > 1 || startsWithFrom || hasToKeyword;
      
      // Handle differently based on number of coordinates and whether it's a route request
      if (coordinates.length === 1 && !isRouteRequest) {
        // If there's only one location and it's not a route request, center the map on it
        const singleLocation = coordinates[0];  // Already an array [lng, lat]
        map.setCenter(singleLocation);
        map.setZoom(12);
        console.log('Single location:', singleLocation);

        // Clear the route data
        map.getSource('route').setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        });
        
        // Hide loading indicator for single location case
        document.getElementById('loading-indicator').style.display = 'none';
        return;
      }
      
      // Ensure we have at least 2 coordinates for a valid route
      if (coordinates.length < 2) {
        console.error('Need at least 2 valid coordinates for a route');
        alert('Please provide at least two valid locations for a route');
        // Hide loading indicator when not enough coordinates
        document.getElementById('loading-indicator').style.display = 'none';
        return;
      }
      
      // Make sure we're using all waypoints in multi-stop routes
      // This fixes issues like "From New York to Los Angeles to Chicago" only routing NY to Chicago
      console.log('Processing multi-stop route with all waypoints:', locations);
      
      // Call our new findRoute function
      findRoute(coordinates, preferences);
    })
    .catch(error => {
      console.error('Error geocoding locations:', error);
      alert('Error finding locations: ' + error.message);
      // Hide loading indicator in case of geocoding error
      document.getElementById('loading-indicator').style.display = 'none';
    });
}