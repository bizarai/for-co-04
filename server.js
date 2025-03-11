// Backend server to handle API requests securely
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Setup __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Validate that required environment variables are set
const requiredEnvVars = ['MAPBOX_TOKEN', 'GEMINI_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(env => !process.env[env]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Create a .env file with these variables or set them in your environment');
  process.exit(1);
}

// Proxy route for Mapbox API
app.post('/api/mapbox-directions', async (req, res) => {
  try {
    const { coordinates, profile, alternatives, geometries, steps, overview, waypoints_per_route } = req.body;
    
    console.log('Received directions request with coordinates:', coordinates);
    console.log('Profile:', profile);
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      console.error('Invalid coordinates provided:', coordinates);
      return res.status(400).json({ error: 'Invalid coordinates. At least 2 coordinates are required.' });
    }
    
    const coordinatesString = coordinates.map(coord => coord.join(',')).join(';');
    const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinatesString}`;
    
    console.log('Mapbox URL:', mapboxUrl);
    
    // Add parameters for the Mapbox Directions API
    const params = {
      access_token: process.env.MAPBOX_TOKEN,
      alternatives: alternatives || false,
      geometries: geometries || 'geojson',
      steps: steps || false,
      overview: overview || 'full'
    };
    
    // Only add waypoints_per_route if it's explicitly provided
    if (waypoints_per_route !== undefined) {
      params.waypoints_per_route = waypoints_per_route;
    }
    
    console.log('Request params:', params);
    
    try {
      const response = await axios.get(mapboxUrl, { 
        params,
        timeout: 10000 // 10 second timeout
      });
      
      console.log('Mapbox response status:', response.status);
      console.log('Mapbox response contains routes:', response.data && response.data.routes ? response.data.routes.length : 'none');
      
      if (!response.data || !response.data.routes || response.data.routes.length === 0) {
        console.error('No routes found in Mapbox response:', response.data);
        return res.status(404).json({
          error: 'No route found between the specified locations',
          mapboxResponse: response.data
        });
      }
      
      console.log('Route successfully retrieved from Mapbox. Length:', 
                  response.data.routes[0].geometry.coordinates.length, 
                  'coordinates');
      
      res.json(response.data);
    } catch (axiosError) {
      console.error('Axios error when calling Mapbox API:', axiosError.message);
      
      if (axiosError.response) {
        console.error('Mapbox API error status:', axiosError.response.status);
        console.error('Mapbox API error data:', axiosError.response.data);
        
        return res.status(axiosError.response.status).json({
          error: 'Mapbox API error',
          details: axiosError.response.data
        });
      } else if (axiosError.request) {
        console.error('No response received from Mapbox API');
        return res.status(504).json({
          error: 'No response received from Mapbox API'
        });
      } else {
        console.error('Error setting up Mapbox API request');
        return res.status(500).json({
          error: 'Error setting up Mapbox API request',
          message: axiosError.message
        });
      }
    }
  } catch (error) {
    console.error('Error in Mapbox directions endpoint:', error.message);
    res.status(500).json({ 
      error: 'Failed to process Mapbox request',
      details: error.message
    });
  }
});

// Proxy route for Mapbox Geocoding API
app.post('/api/mapbox-geocoding', async (req, res) => {
  try {
    const { location } = req.body;
    
    if (!location || typeof location !== 'string' || location.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid location provided' });
    }
    
    console.log('Geocoding location:', location);
    
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json`;
    
    const response = await axios.get(mapboxUrl, {
      params: {
        access_token: process.env.MAPBOX_TOKEN,
        limit: 1
      },
      timeout: 10000 // 10 second timeout
    });
    
    if (!response.data || !response.data.features || response.data.features.length === 0) {
      console.warn(`No geocoding results found for: ${location}`);
      return res.status(404).json({ error: `Location not found: ${location}` });
    }
    
    console.log(`Successfully geocoded "${location}" to:`, response.data.features[0].geometry.coordinates);
    
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying Mapbox Geocoding request:', error.message);
    
    if (error.response) {
      console.error('Geocoding API error status:', error.response.status);
      console.error('Geocoding API error data:', error.response.data);
    } else if (error.request) {
      console.error('No response received from Geocoding API');
    }
    
    res.status(500).json({ 
      error: 'Failed to process geocoding request',
      details: error.response?.data || error.message
    });
  }
});

// Endpoint to provide the Mapbox token to the client
app.get('/api/mapbox-token', (req, res) => {
  console.log('Request received for Mapbox token');
  
  if (!process.env.MAPBOX_TOKEN) {
    console.error('MAPBOX_TOKEN is not set in environment variables');
    return res.status(500).json({ 
      error: 'Mapbox token is not configured on the server',
      message: 'Please check the server configuration and make sure MAPBOX_TOKEN is set in the .env file'
    });
  }
  
  console.log('Sending token (first 10 chars):', process.env.MAPBOX_TOKEN.substring(0, 10) + '...');
  res.json({ token: process.env.MAPBOX_TOKEN });
});

// Proxy route for Gemini API
app.post('/api/gemini', async (req, res) => {
  try {
    const { prompt, functionDeclarations } = req.body;
    
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';
    
    const data = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };
    
    // Add function declarations if provided
    if (functionDeclarations) {
      data.tools = [{
        functionDeclarations
      }];
    }
    
    console.log('Sending request to Gemini API...');
    
    // Set a timeout of 5 seconds for the request
    const response = await axios.post(
      `${geminiUrl}?key=${process.env.GEMINI_API_KEY}`, 
      data,
      { timeout: 5000 } // 5 second timeout
    );
    
    console.log('Received response from Gemini API');
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying Gemini request:', error.message);
    
    // Provide more specific error information
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.error('Request to Gemini API timed out');
      return res.status(504).json({ 
        error: 'Gemini API request timed out',
        fallback: true,
        message: 'Consider trying a simpler query or using the manual location entry'
      });
    }
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received from Gemini API');
    }
    
    res.status(500).json({ 
      error: 'Failed to process Gemini request',
      details: error.response?.data || error.message,
      fallback: true,
      message: 'Try entering locations directly'
    });
  }
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
}); 