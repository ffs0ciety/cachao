# Local Testing Guide

This guide explains how to test the Lambda functions and API Gateway locally, connecting to a local MariaDB database.

## Prerequisites

1. **Docker** - Required for `sam local` to run Lambda functions
2. **MariaDB/MySQL** - Running locally on your machine
3. **Node.js 20.x** - Already installed

## Setup Local MariaDB

### Option 1: Using Docker (Recommended)

```bash
# Run MariaDB in Docker
docker run --name cachao-mariadb \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=cachao \
  -p 3306:3306 \
  -d mariadb:latest

# Create the events table (connect to the database)
docker exec -it cachao-mariadb mariadb -uroot -pyour_password cachao

# Then run the CREATE TABLE statement from your schema
```

### Option 2: Local MariaDB Installation

If you have MariaDB installed locally, make sure it's running and create the database:

```bash
# Connect to MariaDB
mariadb -u root -p

# Create database and table
CREATE DATABASE cachao;
USE cachao;
# Then run your CREATE TABLE statement
```

## Configure Local Environment

1. **Update `.env.local`** with your local database credentials:

```bash
cd backend
# Edit .env.local and update:
DB_HOST=localhost
DB_PORT=3306
DB_NAME=cachao
DB_USER=root
DB_PASSWORD=your_local_password
```

## Running Locally

### Step 1: Build the Application

```bash
cd backend
sam build
```

### Step 2: Start Local API Gateway

**Option A: Using the helper script (Recommended)**
```bash
./start-local.sh
```

**Option B: Manual command**
```bash
# This will start the API Gateway on port 3001 (to avoid conflict with frontend)
sam local start-api --port 3001 --env-vars .env.local

# Or use the configured settings:
sam local start-api --env-vars .env.local
```

The API will be available at:
- **Base URL**: `http://localhost:3001`
- **Hello World**: `http://localhost:3001/hello`
- **Events**: `http://localhost:3001/events`

### Step 3: Test the Endpoints

In another terminal:

```bash
# Test Hello World
curl http://localhost:3001/hello

# Test Events endpoint
curl http://localhost:3001/events
```

## Important Notes

### VPC Configuration
When running locally, the Lambda functions run in Docker containers. To access your **local MariaDB installation** (not Docker container), use:
- **host.docker.internal** - This allows Docker containers to access services on your host machine (macOS/Windows)

### Network Access - Local MariaDB Setup
To use your local MariaDB installation (Homebrew), you need to configure it to accept TCP connections:

1. **Edit MariaDB configuration** to allow TCP connections:
   ```bash
   # Find your MariaDB config file (usually in /opt/homebrew/etc/my.cnf or /usr/local/etc/my.cnf)
   # Add or modify these lines:
   [mysqld]
   bind-address = 0.0.0.0  # or 127.0.0.1 if you only want localhost
   port = 3306
   ```

2. **Restart MariaDB**:
   ```bash
   brew services restart mariadb
   ```

3. **Verify MariaDB is listening on TCP**:
   ```bash
   lsof -i :3306
   # Should show mariadb listening on *:3306 or 0.0.0.0:3306
   ```

4. **Test TCP connection**:
   ```bash
   mariadb -h 127.0.0.1 -u root -p
   ```

### Environment Variables
The `.env.local` file is automatically loaded by SAM CLI when using `sam local start-api`. The environment variables override the template.yaml values.

## Troubleshooting

### Connection Refused
If you get connection errors:
1. Check MariaDB is running: `docker ps` or `brew services list`
2. Verify port 3306 is open
3. Check MariaDB bind-address in config (should allow external connections)

### Docker Network Issues
If Lambda can't reach localhost:
- Use `host.docker.internal` instead of `localhost` in `.env.local`
- On Linux, you may need to use `172.17.0.1` or your Docker bridge IP

### Database Credentials
Make sure the credentials in `.env.local` match your local MariaDB setup.

## Testing Individual Functions

You can also test individual functions without the API Gateway:

```bash
# Test EventsFunction directly
sam local invoke EventsFunction --env-vars .env.local --event events/event.json
```

## Next Steps

Once local testing works:
1. Test all endpoints
2. Verify data is returned correctly
3. Test error handling
4. Deploy to AWS when ready

