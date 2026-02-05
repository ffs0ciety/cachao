# Testing DELETE /videos API Endpoint

## Method 1: Using Browser Console

1. Open your browser console on the frontend (logged in)
2. Run this code:

```javascript
// Get your auth token
const { useAuth } = await import('./composables/useAuth');
const auth = useAuth();
const token = await auth.getAuthToken();

// Get a video ID (from an event page)
// You can find video IDs in the network tab when loading an event page
const videoId = 'YOUR_VIDEO_ID_HERE';

// Test the delete endpoint
const response = await fetch('https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com/Prod/videos', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    video_ids: [videoId]
  })
});

const result = await response.json();
console.log('Delete result:', result);
```

## Method 2: Using the Test Script

```bash
./test-delete-video.sh <VIDEO_ID> <JWT_TOKEN>
```

## Method 3: Using curl directly

```bash
curl -X DELETE "https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com/Prod/videos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{"video_ids": ["VIDEO_ID_HERE"]}'
```

## Expected Response

Success:
```json
{
  "success": true,
  "deleted_count": 1,
  "deleted_ids": ["VIDEO_ID"]
}
```

Error (not owner):
```json
{
  "success": false,
  "error": "You do not have permission to delete these videos"
}
```

Error (not authenticated):
```json
{
  "success": false,
  "error": "Authentication required"
}
```





