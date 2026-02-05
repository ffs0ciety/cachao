# Quick Start - Local Testing

## Important: Using Local MariaDB (Not Docker Container)

This setup uses your **local MariaDB installation** (Homebrew), not a Docker container. The Lambda functions run in Docker and connect to your local MariaDB via `host.docker.internal`.

## 1. Configure Local MariaDB for TCP Access

Your local MariaDB needs to accept TCP connections (not just socket connections):

```bash
# Edit MariaDB config (usually /opt/homebrew/etc/my.cnf or /usr/local/etc/my.cnf)
# Add or modify:
[mysqld]
bind-address = 0.0.0.0
port = 3306

# Restart MariaDB
brew services restart mariadb

# Verify it's listening on TCP
lsof -i :3306
```

## 2. Create Database and Table

```bash
# Connect to local MariaDB
mariadb -u root -p

# Create database and table
CREATE DATABASE IF NOT EXISTS cachao;
USE cachao;

CREATE TABLE events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_start_date (start_date),
    INDEX idx_end_date (end_date)
);
```

## 3. Configure Environment

Edit `backend/.env.local.json` and update with your local MariaDB password:
```json
{
  "EventsFunction": {
    "DB_HOST": "host.docker.internal",
    "DB_PORT": "3306",
    "DB_NAME": "cachao",
    "DB_USER": "root",
    "DB_PASSWORD": "your_actual_password"
  }
}
```

**Note**: `host.docker.internal` allows Docker containers (where Lambda runs) to access your local MariaDB on the host machine.

## 4. Build and Run

```bash
cd backend

# Build
sam build

# Start local API (runs on port 3001)
./start-local.sh
```

## 5. Test

In another terminal:
```bash
# Test events endpoint
curl http://localhost:3001/events

# Test hello endpoint
curl http://localhost:3001/hello
```

## Troubleshooting

- **Can't connect**: Make sure MariaDB is configured with `bind-address = 0.0.0.0` and restarted
- **Connection refused**: Verify MariaDB is running: `brew services list`
- **Wrong password**: Update `DB_PASSWORD` in `.env.local.json`
- **Socket error**: Make sure you're using TCP (`-h 127.0.0.1`) not socket connections

For more details, see [LOCAL_TESTING.md](./LOCAL_TESTING.md)
