# Route Visualization Application

This application allows users to visualize routes between locations using the Mapbox API and Gemini API for natural language processing. The application has been secured to protect API keys from client-side exposure.

## Security Improvements

The application has been refactored to implement the following security best practices:

1. **Server-Side API Key Storage**: All API keys are now stored securely on the server side in environment variables using the `dotenv` package, preventing exposure in client-side code.

2. **Proxy API Endpoints**: Created server-side proxy endpoints that handle all external API requests to Mapbox and Gemini, keeping API keys hidden from clients.

3. **Environment Variables**: Added proper environment variable handling with validation to ensure the application has the necessary credentials to function.

4. **Secure Configuration**: Updated the client-side code to remove all direct API calls with exposed keys.

## Setup and Running

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   MAPBOX_TOKEN=your_mapbox_token_here
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000  # optional, defaults to 3000
   ```

### Running the Application

1. Start the server:
   ```
   npm start
   ```
2. Open your browser and navigate to `http://localhost:3000`

## Development

To run the application in development mode with automatic server restarts:
```
npm run dev
```

## Architecture

The application now uses a client-server architecture:

1. **Server (server.js)**: Handles API requests, proxies them to external services, and serves the static frontend.
2. **Client (script.js, nlp.js)**: Communicates with the server instead of directly with external APIs.

## Security Considerations

- Always keep your `.env` file out of version control (already added to `.gitignore`)
- Regularly rotate API keys as a security best practice
- Consider adding rate limiting to the proxy endpoints to prevent abuse 