/**
 * Route Visualization API Worker
 * Handles API requests for Mapbox and Gemini services
 */

// Helper function to create a response with appropriate headers
function createResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

// Handle Mapbox token requests
async function handleMapboxToken(request, env) {
  console.log('Request received for Mapbox token');
  
  if (!env.MAPBOX_TOKEN) {
    return createResponse(
      JSON.stringify({ error: 'Mapbox token not configured' }),
      500
    );
  }

  return createResponse(
    JSON.stringify({ token: env.MAPBOX_TOKEN })
  );
}

// Handle Mapbox geocoding requests
async function handleMapboxGeocoding(request, env) {
  try {
    const { location } = await request.json();
    console.log(`Geocoding location: ${location}`);

    if (!location) {
      return createResponse(
        JSON.stringify({ error: 'Location is required' }),
        400
      );
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?access_token=${env.MAPBOX_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Mapbox geocoding error:', data);
      return createResponse(
        JSON.stringify({ error: 'Failed to geocode location', details: data }),
        response.status
      );
    }

    if (data.features && data.features.length > 0) {
      const coordinates = data.features[0].center;
      console.log(`Successfully geocoded "${location}" to:`, coordinates);
      return createResponse(
        JSON.stringify({ coordinates })
      );
    } else {
      console.log(`No results found for "${location}"`);
      return createResponse(
        JSON.stringify({ error: 'No results found for this location' }),
        404
      );
    }
  } catch (error) {
    console.error('Error in geocoding handler:', error);
    return createResponse(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      500
    );
  }
}

// Handle Mapbox directions requests
async function handleMapboxDirections(request, env) {
  try {
    const { coordinates, profile = 'driving' } = await request.json();
    console.log(`Received directions request with coordinates:`, coordinates);
    console.log(`Profile: ${profile}`);

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      return createResponse(
        JSON.stringify({ error: 'At least two valid coordinates are required' }),
        400
      );
    }

    // Format coordinates for Mapbox API
    const coordinatesString = coordinates
      .map(coord => coord.join(','))
      .join(';');

    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinatesString}`;
    console.log(`Mapbox URL: ${url}`);

    const params = new URLSearchParams({
      access_token: env.MAPBOX_TOKEN,
      alternatives: false,
      geometries: 'geojson',
      steps: false,
      overview: 'full'
    });

    console.log(`Request params:`, Object.fromEntries(params));

    const response = await fetch(`${url}?${params}`);
    const data = await response.json();

    if (!response.ok) {
      console.error(`Mapbox API error status: ${response.status}`);
      console.error(`Mapbox API error data:`, data);
      
      // Try again without annotations if we get a 422 error
      if (response.status === 422 && data.code === 'InvalidInput') {
        console.log('Retrying without problematic parameters...');
        return await retryDirectionsRequest(url, env.MAPBOX_TOKEN);
      }
      
      return createResponse(
        JSON.stringify({ error: 'Failed to get directions', details: data }),
        response.status
      );
    }

    console.log(`Mapbox response status: ${response.status}`);
    console.log(`Mapbox response contains routes: ${data.routes?.length}`);

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      console.log(`Route successfully retrieved from Mapbox. Length: ${route.geometry.coordinates.length} coordinates`);
      return createResponse(
        JSON.stringify({ route })
      );
    } else {
      console.log('No routes found');
      return createResponse(
        JSON.stringify({ error: 'No routes found between the specified locations' }),
        404
      );
    }
  } catch (error) {
    console.error('Error in directions handler:', error);
    return createResponse(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      500
    );
  }
}

// Retry directions request without problematic parameters
async function retryDirectionsRequest(url, token) {
  try {
    const params = new URLSearchParams({
      access_token: token,
      alternatives: false,
      geometries: 'geojson',
      steps: false,
      overview: 'full'
    });

    console.log('Retrying with params:', Object.fromEntries(params));
    
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`Retry failed. Status: ${response.status}`);
      console.error('Error data:', data);
      return createResponse(
        JSON.stringify({ error: 'Failed to get directions on retry', details: data }),
        response.status
      );
    }
    
    console.log(`Retry successful. Routes: ${data.routes?.length}`);
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return createResponse(
        JSON.stringify({ route })
      );
    } else {
      return createResponse(
        JSON.stringify({ error: 'No routes found between the specified locations' }),
        404
      );
    }
  } catch (error) {
    console.error('Error in retry handler:', error);
    return createResponse(
      JSON.stringify({ error: 'Internal server error during retry', message: error.message }),
      500
    );
  }
}

// Handle Gemini API requests
async function handleGeminiRequest(request, env) {
  try {
    console.log('Sending request to Gemini API...');
    const requestData = await request.json();
    
    if (!env.GEMINI_API_KEY) {
      return createResponse(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        500
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${env.GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      return createResponse(
        JSON.stringify({ error: 'Error from Gemini API', details: errorData }),
        response.status
      );
    }
    
    const data = await response.json();
    return createResponse(
      JSON.stringify(data)
    );
  } catch (error) {
    console.error('Error in Gemini handler:', error);
    return createResponse(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      500
    );
  }
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle OPTIONS requests for CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    
    // Route requests to appropriate handlers
    if (url.pathname === '/api/mapbox-token' && request.method === 'GET') {
      return await handleMapboxToken(request, env);
    }
    
    if (url.pathname === '/api/mapbox-geocoding' && request.method === 'POST') {
      return await handleMapboxGeocoding(request, env);
    }
    
    if (url.pathname === '/api/mapbox-directions' && request.method === 'POST') {
      return await handleMapboxDirections(request, env);
    }
    
    if (url.pathname === '/api/gemini' && request.method === 'POST') {
      return await handleGeminiRequest(request, env);
    }
    
    // Return 404 for any other routes
    return new Response(JSON.stringify({ error: 'Not found', path: url.pathname }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}; 