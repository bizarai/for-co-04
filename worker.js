/**
 * Route Visualization API Worker
 * Handles API requests for Mapbox and Gemini services
 */

// Define allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'https://route-visualization.pages.dev',
  'http://localhost:3000',
  'http://localhost:8788' // Wrangler dev server
];

// Helper function to handle CORS
function handleCors(request) {
  const origin = request.headers.get('Origin');
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  // Set the Access-Control-Allow-Origin header if the origin is allowed
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  } else {
    corsHeaders['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS[0];
  }

  return corsHeaders;
}

// Helper function to create a response with CORS headers
function createCorsResponse(body, status = 200, headers = {}) {
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
    return createCorsResponse(
      JSON.stringify({ error: 'Mapbox token not configured' }),
      500
    );
  }

  return createCorsResponse(
    JSON.stringify({ token: env.MAPBOX_TOKEN })
  );
}

// Handle Mapbox geocoding requests
async function handleMapboxGeocoding(request, env) {
  try {
    const { location } = await request.json();
    console.log(`Geocoding location: ${location}`);

    if (!location) {
      return createCorsResponse(
        JSON.stringify({ error: 'Location is required' }),
        400
      );
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?access_token=${env.MAPBOX_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Mapbox geocoding error:', data);
      return createCorsResponse(
        JSON.stringify({ error: 'Failed to geocode location', details: data }),
        response.status
      );
    }

    if (data.features && data.features.length > 0) {
      const coordinates = data.features[0].center;
      console.log(`Successfully geocoded "${location}" to:`, coordinates);
      return createCorsResponse(
        JSON.stringify({ coordinates })
      );
    } else {
      console.log(`No results found for "${location}"`);
      return createCorsResponse(
        JSON.stringify({ error: 'No results found for this location' }),
        404
      );
    }
  } catch (error) {
    console.error('Error in geocoding handler:', error);
    return createCorsResponse(
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
      return createCorsResponse(
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
      
      return createCorsResponse(
        JSON.stringify({ error: 'Failed to get directions', details: data }),
        response.status
      );
    }

    console.log(`Mapbox response status: ${response.status}`);
    console.log(`Mapbox response contains routes: ${data.routes?.length}`);

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      console.log(`Route successfully retrieved from Mapbox. Length: ${route.geometry.coordinates.length} coordinates`);
      return createCorsResponse(
        JSON.stringify({ route })
      );
    } else {
      console.log('No routes found');
      return createCorsResponse(
        JSON.stringify({ error: 'No routes found between the specified locations' }),
        404
      );
    }
  } catch (error) {
    console.error('Error in directions handler:', error);
    return createCorsResponse(
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
      return createCorsResponse(
        JSON.stringify({ error: 'Failed to get directions on retry', details: data }),
        response.status
      );
    }
    
    console.log(`Retry successful. Routes: ${data.routes?.length}`);
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return createCorsResponse(
        JSON.stringify({ route })
      );
    } else {
      return createCorsResponse(
        JSON.stringify({ error: 'No routes found between the specified locations' }),
        404
      );
    }
  } catch (error) {
    console.error('Error in retry handler:', error);
    return createCorsResponse(
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
      return createCorsResponse(
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
      return createCorsResponse(
        JSON.stringify({ error: 'Error from Gemini API', details: errorData }),
        response.status
      );
    }
    
    const data = await response.json();
    return createCorsResponse(
      JSON.stringify(data)
    );
  } catch (error) {
    console.error('Error in Gemini handler:', error);
    return createCorsResponse(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      500
    );
  }
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = handleCors(request);
    
    // Handle OPTIONS requests for CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // Route requests to appropriate handlers
    if (url.pathname === '/api/mapbox-token' && request.method === 'GET') {
      const response = await handleMapboxToken(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: { ...response.headers, ...corsHeaders }
      });
    }
    
    if (url.pathname === '/api/mapbox-geocoding' && request.method === 'POST') {
      const response = await handleMapboxGeocoding(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: { ...response.headers, ...corsHeaders }
      });
    }
    
    if (url.pathname === '/api/mapbox-directions' && request.method === 'POST') {
      const response = await handleMapboxDirections(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: { ...response.headers, ...corsHeaders }
      });
    }
    
    if (url.pathname === '/api/gemini' && request.method === 'POST') {
      const response = await handleGeminiRequest(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: { ...response.headers, ...corsHeaders }
      });
    }
    
    // Handle static assets if this worker is also serving the frontend
    if (request.method === 'GET') {
      try {
        // Handle root path - serve index.html explicitly
        if (url.pathname === '/' || url.pathname === '') {
          return new Response(await env.__STATIC_CONTENT.get('index.html'), {
            headers: {
              'Content-Type': 'text/html;charset=UTF-8'
            }
          });
        }
        
        // Try to serve a static asset
        const asset = await env.__STATIC_CONTENT.get(url.pathname.slice(1));
        
        if (asset) {
          // Determine content type based on file extension
          let contentType = 'text/plain';
          if (url.pathname.endsWith('.html')) contentType = 'text/html;charset=UTF-8';
          if (url.pathname.endsWith('.css')) contentType = 'text/css';
          if (url.pathname.endsWith('.js')) contentType = 'text/javascript';
          if (url.pathname.endsWith('.json')) contentType = 'application/json';
          if (url.pathname.endsWith('.png')) contentType = 'image/png';
          if (url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg')) contentType = 'image/jpeg';
          
          return new Response(asset, {
            headers: {
              'Content-Type': contentType
            }
          });
        }
      } catch (e) {
        console.error('Error serving static content:', e);
      }
    }
    
    // Return 404 for any other routes
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}; 