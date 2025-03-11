export async function onRequestGet({ env }) {
  console.log('Mapbox token request received');
  console.log('Environment variables available:', Object.keys(env));
  console.log('MAPBOX_TOKEN available:', !!env.MAPBOX_TOKEN);
  
  if (!env.MAPBOX_TOKEN) {
    console.error('Mapbox token not configured in environment variables');
    return new Response(
      JSON.stringify({ error: 'Mapbox token not configured' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  console.log('Returning Mapbox token');
  return new Response(
    JSON.stringify({ token: env.MAPBOX_TOKEN }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
} 