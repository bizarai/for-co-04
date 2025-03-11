// This file is no longer used in the secure architecture
// API keys are now stored in environment variables on the server

// This template is kept for reference only
// The application now uses the .env file and server.js to securely handle API keys

// IMPORTANT: DO NOT USE THIS FILE FOR ACTUAL API KEYS
// Use the .env file instead as described in the README.md

const config = {
  mapbox: {
    token: 'YOUR_MAPBOX_TOKEN_HERE'
  },
  gemini: {
    apiKey: 'YOUR_GEMINI_API_KEY_HERE'
  }
};

// Export the configuration - not used in the current architecture
export default config;