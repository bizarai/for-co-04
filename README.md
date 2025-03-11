# Route Visualization Application

A route visualization application that securely handles API keys using a separate backend API service.

## Architecture

This application uses a split architecture:

1. **Frontend**: Static HTML/JS/CSS hosted on Cloudflare Pages
2. **Backend API**: Cloudflare Worker that handles API requests to Mapbox and Gemini APIs

This approach keeps API keys secure by storing them only on the backend.

## Deployment Instructions

### Deploy the API Worker:

1. Navigate to the API directory:
   ```bash
   cd api
   ```

2. Deploy the Worker:
   ```bash
   npx wrangler deploy
   ```

3. Set environment variables in the Cloudflare dashboard:
   - Go to Workers & Pages > Your Worker > Settings > Variables
   - Add `MAPBOX_TOKEN` and `GEMINI_API_KEY` variables

### Deploy the Frontend to Cloudflare Pages:

1. From the repository root:
   ```bash
   npx wrangler pages deploy public
   ```

2. Or configure automatic deployments from GitHub:
   - Go to Cloudflare Dashboard > Pages
   - Create a new project and connect your GitHub repository
   - Configure settings:
     - Build command: (leave empty)
     - Build output directory: `public`
     - Root directory: `/`

## Development

### Run the API Worker locally:

```bash
cd api
npx wrangler dev
```

### Run the frontend locally:

```bash
npx wrangler pages dev public
```

## Important URLs

- API Worker: https://route-visualization-api.cartube.workers.dev
- Frontend: https://route-visualization.pages.dev (after deployment) 