# Cachao Monorepo

A monorepo containing the AWS SAM backend and Nuxt 3 frontend for the Cachao project.

## Project Structure

```
Cachao/
├── backend/          # AWS SAM Serverless Backend
│   ├── hello-world/  # Lambda functions
│   ├── events/       # Test events
│   ├── template.yaml # SAM template
│   └── samconfig.toml
│
└── frontend/         # Nuxt 3 Frontend
    ├── app.vue
    ├── nuxt.config.ts
    └── package.json
```

## Backend (AWS SAM)

The backend is built using AWS Serverless Application Model (SAM) with TypeScript.

### Prerequisites
- Node.js 20.x
- AWS SAM CLI
- Docker (for local testing)

### Getting Started

```bash
cd backend

# Install dependencies
cd hello-world && npm install && cd ..

# Build the application
sam build

# Test locally
sam local start-api

# Deploy
sam deploy --guided
```

For more details, see [backend/README.md](./backend/README.md)

## Frontend (Nuxt 3)

The frontend is built with Nuxt 3.

### Prerequisites
- Node.js 20.x

### Getting Started

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The development server will be available at `http://localhost:3000`

## Development Workflow

1. **Backend Development**: Work in the `backend/` directory
   - Use `sam local start-api` to test API endpoints locally
   - The API will be available at `http://localhost:3000` (backend)

2. **Frontend Development**: Work in the `frontend/` directory
   - Use `npm run dev` to start the Nuxt dev server
   - The frontend will be available at `http://localhost:3000` (frontend)
   - Configure the frontend to call the backend API

3. **Integration**: 
   - Update frontend API calls to point to the backend API Gateway endpoint
   - Use environment variables to configure API endpoints

## Environment Variables

### Frontend
Environment files are already configured:
- **`.env`** - Local development (uses `http://localhost:3001`)
- **`.env.production`** - Production (uses AWS API Gateway)

The frontend automatically switches between local and AWS API based on the environment.

### Backend
Backend configuration is managed through `samconfig.toml` and AWS environment variables.

## License

ISC

