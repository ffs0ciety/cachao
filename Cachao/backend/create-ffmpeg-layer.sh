#!/bin/bash
# Script to create an FFmpeg Lambda layer
# This creates a layer with FFmpeg binary for Lambda functions
# Based on: https://github.com/serverlesspub/ffmpeg-aws-lambda-layer

set -e

echo "Creating FFmpeg Lambda layer..."

# Create temporary directory
TEMP_DIR=$(mktemp -d)
LAYER_DIR="$TEMP_DIR/ffmpeg-layer"
mkdir -p "$LAYER_DIR/bin"

echo "Downloading FFmpeg static build..."
# Download FFmpeg static build for Amazon Linux 2 (Lambda runtime)
cd "$LAYER_DIR/bin"
wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz || \
  curl -L -o ffmpeg-release-amd64-static.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz

echo "Extracting FFmpeg..."
tar -xf ffmpeg-release-amd64-static.tar.xz --strip-components=1
rm ffmpeg-release-amd64-static.tar.xz

# Keep only ffmpeg and ffprobe binaries
find . -type f ! -name 'ffmpeg' ! -name 'ffprobe' -delete
find . -type d -empty -delete

echo "Creating layer package..."
cd "$TEMP_DIR"
zip -r ffmpeg-layer.zip ffmpeg-layer/ > /dev/null

# Get S3 bucket name for layers (use videos bucket or create a layers bucket)
BUCKET_NAME="cachao-lambda-layers-$(aws sts get-caller-identity --profile personal --query Account --output text)"

echo "Creating S3 bucket for layers (if needed)..."
aws s3 mb "s3://$BUCKET_NAME" --profile personal --region eu-west-1 2>/dev/null || true

echo "Uploading layer zip to S3..."
S3_KEY="ffmpeg-layer-$(date +%s).zip"
aws s3 cp ffmpeg-layer.zip "s3://$BUCKET_NAME/$S3_KEY" --profile personal --region eu-west-1

echo "Publishing layer from S3..."
LAYER_ARN=$(aws lambda publish-layer-version \
  --layer-name ffmpeg \
  --description "FFmpeg binary for Lambda" \
  --content "S3Bucket=$BUCKET_NAME,S3Key=$S3_KEY" \
  --compatible-runtimes nodejs20.x \
  --profile personal \
  --region eu-west-1 \
  --query 'LayerVersionArn' \
  --output text)

echo ""
echo "✅ FFmpeg layer created successfully!"
echo "Layer ARN: $LAYER_ARN"
echo ""
echo "Update template.yaml with this ARN:"
echo "  Layers:"
echo "    - $LAYER_ARN"

# Cleanup
rm -rf "$TEMP_DIR"

