#!/bin/bash
# Test script to delete a video via the API
# Usage: ./test-delete-video.sh <VIDEO_ID> <JWT_TOKEN>

API_URL="https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com/Prod"

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <VIDEO_ID> <JWT_TOKEN>"
  echo ""
  echo "To get your JWT token:"
  echo "1. Open browser console on the frontend"
  echo "2. Run: await useAuth().getAuthToken()"
  echo "3. Copy the token"
  echo ""
  echo "To get a video ID:"
  echo "1. Visit an event page in the frontend"
  echo "2. Check the browser console or network tab for video IDs"
  exit 1
fi

VIDEO_ID=$1
JWT_TOKEN=$2

echo "Testing DELETE /videos endpoint..."
echo "Video ID: $VIDEO_ID"
echo ""

curl -X DELETE "${API_URL}/videos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{\"video_ids\": [\"${VIDEO_ID}\"]}" \
  -v

echo ""
echo ""
echo "Done!"

