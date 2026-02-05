# Testing Guide for Cachao

This guide shows you how to test your hello world Lambda function in three different ways.

## Prerequisites

Make sure you have:
- Node.js 20.x installed
- Docker installed (for local testing with SAM)

## Method 1: Unit Tests (Fastest - Recommended for Development)

Unit tests run directly in Node.js without needing Docker or AWS.

```bash
# Install dependencies (first time only)
cd hello-world
npm install

# Run unit tests
npm test
```

This will:
- Compile TypeScript on-the-fly using `ts-node`
- Run the test suite using Mocha
- Verify the function returns the expected response

**Expected output:**
```
  Tests index
    ✓ verifies successful response

  1 passing
```

## Method 2: Local Lambda Invocation (Test with Real Event)

Test the function locally using SAM CLI with a real API Gateway event.

```bash
# From the project root directory
cd /Users/raulmadrid/vscode/Cachao

# Build the application (compiles TypeScript)
sam build

# Invoke the function locally with the test event
sam local invoke HelloWorldFunction --event events/event.json
```

**Expected output:**
```json
{
  "statusCode": 200,
  "body": "{\"message\":\"hello world\"}"
}
```

## Method 3: Local API Server (Test Full API Endpoint)

Start a local API Gateway server to test the full HTTP endpoint.

```bash
# From the project root directory
cd /Users/raulmadrid/vscode/Cachao

# Build the application
sam build

# Start the local API server
sam local start-api
```

This will start a local server (usually on `http://localhost:3000`).

Then in another terminal, test the endpoint:

```bash
# Test the GET endpoint
curl http://localhost:3000/hello
```

**Expected output:**
```json
{"message":"hello world"}
```

Or open `http://localhost:3000/hello` in your browser.

## Quick Test Commands Summary

```bash
# 1. Unit tests
cd hello-world && npm test

# 2. Local invocation
sam build && sam local invoke HelloWorldFunction --event events/event.json

# 3. Local API server
sam build && sam local start-api
# Then: curl http://localhost:3000/hello
```

## Troubleshooting

### If npm is not found:
Install Node.js from https://nodejs.org/ (version 20.x recommended)

### If Docker is not running:
Start Docker Desktop before running `sam local` commands.

### If build fails:
Make sure you're in the project root when running `sam build`, not in the `hello-world` directory.

