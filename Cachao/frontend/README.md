# Cachao Frontend

Nuxt 3 frontend for the Cachao application.

## Environment Configuration

The frontend is configured to use different API endpoints based on the environment:

### Local Development (`.env`)
- **API URL**: `http://localhost:3001` (local SAM API Gateway)
- **Base Path**: `` (empty)

### Production (`.env.production`)
- **API URL**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod` (AWS API Gateway)
- **Base Path**: `/Prod`

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (uses local API)
npm run dev

# Build for production (uses AWS API)
npm run build

# Preview production build
npm run preview
```

## API Configuration

The API URL is configured via environment variables:

- `NUXT_PUBLIC_API_URL` - Base URL for the API Gateway
- `NUXT_PUBLIC_API_BASE_PATH` - Base path (e.g., `/Prod` for AWS)

These are automatically loaded from `.env` (development) or `.env.production` (production).

## Using the Events API

The `useEvents` composable provides a simple way to fetch events:

```typescript
const { fetchEvents } = useEvents();
const response = await fetchEvents();
```

## Video Upload

The application includes a video upload component that supports:

- **Regular uploads** (up to 500MB): Uses presigned URLs for direct S3 upload
- **Multipart uploads** (500MB+): Automatically handles large files in chunks
- **Progress tracking**: Real-time upload progress with percentage
- **Event association**: Optional event selection for video organization

### Using the Video Upload Component

The `VideoUpload` component is already integrated into the main app:

```vue
<VideoUpload :events="events" @uploaded="handleVideoUploaded" />
```

### Using the Video Upload Composable

You can also use the `useVideos` composable directly:

```typescript
const { uploadVideo } = useVideos();

const result = await uploadVideo(
  file,
  eventId, // optional
  (progress) => {
    console.log(`Upload progress: ${progress}%`);
  }
);
```

### Features

- **Automatic file size detection**: Chooses the best upload method based on file size
- **Direct S3 upload**: Bypasses API Gateway payload limits
- **Database registration**: Automatically creates video records in the database
- **Error handling**: Comprehensive error messages and retry logic

## Development

The frontend runs on `http://localhost:3000` by default.

Make sure the backend API Gateway is running:
- Local: `cd backend && ./start-local.sh` (runs on port 3001)
- AWS: Already deployed and available



