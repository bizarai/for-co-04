export async function onRequestPost({ request, env }) {
  try {
    const { location } = await request.json();
    console.log(`Geocoding location: ${location}`);

    if (!location) {
      return new Response(
        JSON.stringify({ error: 'Location is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?access_token=${env.MAPBOX_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Mapbox geocoding error:', data);
      return new Response(
        JSON.stringify({ error: 'Failed to geocode location', details: data }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    if (data.features && data.features.length > 0) {
      const coordinates = data.features[0].center;
      console.log(`Successfully geocoded "${location}" to:`, coordinates);
      return new Response(
        JSON.stringify({ coordinates }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    } else {
      console.log(`No results found for "${location}"`);
      return new Response(
        JSON.stringify({ error: 'No results found for this location' }),
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
    console.error('Error in geocoding handler:', error);
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