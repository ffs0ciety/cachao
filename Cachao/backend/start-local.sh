#!/bin/bash

# Script to start local API Gateway with environment variables

echo "Starting local API Gateway..."
echo "Make sure MariaDB is running locally and .env.local is configured"
echo ""

# Check if .env.local.json exists
if [ ! -f .env.local.json ]; then
    echo "Error: .env.local.json file not found!"
    echo "Please create .env.local.json with your local database credentials"
    echo "Example format:"
    echo '{'
    echo '  "EventsFunction": {'
    echo '    "DB_HOST": "host.docker.internal",'
    echo '    "DB_PORT": "3306",'
    echo '    "DB_NAME": "cachao",'
    echo '    "DB_USER": "admin",'
    echo '    "DB_PASSWORD": "admin"'
    echo '  }'
    echo '}'
    exit 1
fi

# Start SAM local API
echo "Starting API Gateway on http://localhost:3001"
echo "Using environment variables from .env.local.json"
sam local start-api \
    --port 3001 \
    --env-vars .env.local.json \
    --warm-containers EAGER

