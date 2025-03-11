export async function onRequestPost({ request, env }) {
  try {
    const { coordinates, profile = 'driving' } = await request.json();
    console.log(`Received directions request with coordinates:`, coordinates);
    console.log(`Profile: ${profile}`);

    // Validate and normalize the profile parameter
    const validProfiles = ['driving', 'walking', 'cycling'];
    let normalizedProfile = 'driving';
    
    if (profile === 'walking' || profile === 'walk' || profile === 'on foot') {
      normalizedProfile = 'walking';
    } else if (profile === 'cycling' || profile === 'bicycle' || profile === 'bike') {
      normalizedProfile = 'cycling';
    } else if (validProfiles.includes(profile)) {
      normalizedProfile = profile;
    }
    
    console.log(`Normalized profile: ${normalizedProfile}`);

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      return new Response(
        JSON.stringify({ error: 'At least two valid coordinates are required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Format coordinates for Mapbox API
    const coordinatesString = coordinates
      .map(coord => coord.join(','))
      .join(';');

    const url = `https://api.mapbox.com/directions/v5/mapbox/${normalizedProfile}/${coordinatesString}`;
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
        return await retryDirectionsRequest(url, env.MAPBOX_TOKEN, normalizedProfile);
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to get directions', details: data }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    console.log(`Mapbox response status: ${response.status}`);
    console.log(`Mapbox response contains routes: ${data.routes?.length}`);

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      console.log(`Route successfully retrieved from Mapbox. Length: ${route.geometry.coordinates.length} coordinates`);
      return new Response(
        JSON.stringify({ route }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    } else {
      console.log('No routes found');
      return new Response(
        JSON.stringify({ 
          error: 'No routes found between the specified locations', 
          message: `No ${normalizedProfile} route could be found between these locations. The locations might be too far apart for ${normalizedProfile}, or there may not be a suitable path.`
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  } catch (error) {
    console.error('Error in directions handler:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

// Retry directions request without problematic parameters
async function retryDirectionsRequest(url, token, profile = 'driving') {
  try {
    console.log(`Retrying request with profile: ${profile}`);
    
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
      
      // For walking/cycling, we should try with a simpler request
      if ((profile === 'walking' || profile === 'cycling') && response.status === 422) {
        console.log(`Attempting final retry with simplified ${profile} request`);
        
        // Extract just the start and end coordinates for a simpler path
        const urlParts = url.split('/');
        const allCoords = urlParts[urlParts.length - 1].split(';');
        
        if (allCoords.length >= 2) {
          const startCoord = allCoords[0];
          const endCoord = allCoords[allCoords.length - 1];
          const simplifiedUrl = url.replace(urlParts[urlParts.length - 1], `${startCoord};${endCoord}`);
          
          console.log(`Simplified URL: ${simplifiedUrl}`);
          const finalResponse = await fetch(`${simplifiedUrl}?${params}`);
          const finalData = await finalResponse.json();
          
          if (finalResponse.ok && finalData.routes && finalData.routes.length > 0) {
            return new Response(
              JSON.stringify({ route: finalData.routes[0] }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                }
              }
            );
          }
        }
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get directions on retry', 
          details: data,
          message: `Could not find a ${profile} route between these locations. The distance might be too far for ${profile} mode.`
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    console.log(`Retry successful. Routes: ${data.routes?.length}`);
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return new Response(
        JSON.stringify({ route }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'No routes found between the specified locations' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  } catch (error) {
    console.error('Error in retry handler:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error during retry', message: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

// Handle CORS preflight requests
export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
} 