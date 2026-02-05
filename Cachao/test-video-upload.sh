#!/bin/bash
# Test video upload for PS_97714.mov

API_URL="https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com/Prod"
EVENT_ID=2
ALBUM_ID=2
FILE_PATH="$HOME/Downloads/PS_97714.mov"
FILENAME="PS_97714.mov"
FILE_SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH" 2>/dev/null)
MIME_TYPE="video/quicktime"

echo "=========================================="
echo "📹 Video Upload Test - PS_97714.mov"
echo "=========================================="
echo "File: $FILENAME"
echo "Size: $FILE_SIZE bytes ($(echo "scale=2; $FILE_SIZE/1024/1024" | bc) MB)"
echo "Event ID: $EVENT_ID"
echo "Album ID: $ALBUM_ID"
echo ""

# Get JWT token
echo "Step 1: Authentication"
echo "Get your JWT token from browser console: await useAuth().getAuthToken()"
read -p "JWT Token: " JWT_TOKEN

if [ -z "$JWT_TOKEN" ]; then
  echo "❌ No token provided"
  exit 1
fi

echo "✅ Token received (length: ${#JWT_TOKEN})"
echo ""

# Step 2: Generate presigned URL
echo "Step 2: Generating presigned URL..."
UPLOAD_URL_RESPONSE=$(curl -s -X POST "$API_URL/videos/upload-url" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"filename\": \"$FILENAME\",
    \"file_size\": $FILE_SIZE,
    \"event_id\": $EVENT_ID,
    \"album_id\": $ALBUM_ID,
    \"mime_type\": \"$MIME_TYPE\"
  }")

echo "$UPLOAD_URL_RESPONSE" | jq '.'

SUCCESS=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.success // false')
if [ "$SUCCESS" != "true" ]; then
  echo "❌ Failed to generate presigned URL"
  exit 1
fi

UPLOAD_URL=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.upload_url')
S3_KEY=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.s3_key')
VIDEO_ID=$(echo "$UPLOAD_URL_RESPONSE" | jq -r '.video_id')

echo ""
echo "✅ Presigned URL generated"
echo "   Video ID: $VIDEO_ID"
echo "   S3 Key: $S3_KEY"
echo ""

# Step 3: Upload to S3
echo "Step 3: Uploading to S3..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$UPLOAD_URL" \
  -H "Content-Type: $MIME_TYPE" \
  --data-binary "@$FILE_PATH")

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Upload failed with HTTP $HTTP_CODE"
  exit 1
fi

echo "✅ File uploaded to S3 (HTTP $HTTP_CODE)"
echo ""

# Step 4: Confirm upload
echo "Step 4: Confirming upload..."
CONFIRM_RESPONSE=$(curl -s -X POST "$API_URL/videos/confirm" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"s3_key\": \"$S3_KEY\",
    \"video_id\": \"$VIDEO_ID\",
    \"event_id\": $EVENT_ID,
    \"album_id\": $ALBUM_ID
  }")

echo "$CONFIRM_RESPONSE" | jq '.'

CONFIRM_SUCCESS=$(echo "$CONFIRM_RESPONSE" | jq -r '.success // false')
if [ "$CONFIRM_SUCCESS" != "true" ]; then
  echo "❌ Failed to confirm upload"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ Upload Complete!"
echo "=========================================="
echo "Video ID: $(echo "$CONFIRM_RESPONSE" | jq -r '.video.id // "N/A"')"
