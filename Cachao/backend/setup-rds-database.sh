#!/bin/bash
# Script to set up database tables on the new RDS instance

set -e

DB_HOST="cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"
REGION="eu-west-1"

echo "🔧 Setting up database tables on RDS..."
echo ""

# Get password from Parameter Store
DB_PASSWORD=$(aws ssm get-parameter \
  --name "/cachao/database/password" \
  --with-decryption \
  --region "$REGION" \
  --profile personal \
  --query 'Parameter.Value' \
  --output text)

if [ -z "$DB_PASSWORD" ]; then
  echo "❌ Could not retrieve password from Parameter Store"
  exit 1
fi

echo "✅ Password retrieved from Parameter Store"
echo ""

# Check if mariadb/mysql client is available
if ! command -v mariadb &> /dev/null && ! command -v mysql &> /dev/null; then
  echo "❌ Error: mariadb or mysql client not found"
  echo "   Please install: brew install mariadb"
  exit 1
fi

CLIENT_CMD=$(command -v mariadb || command -v mysql)

echo "📦 Creating database tables..."
echo ""

# Create events table
echo "1. Creating events table..."
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
CREATE TABLE IF NOT EXISTS events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NULL,
    image_url VARCHAR(500) NULL,
    cognito_sub VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_start_date (start_date),
    INDEX idx_end_date (end_date),
    INDEX idx_cognito_sub (cognito_sub)
);
EOF

# Create videos table
echo "2. Creating videos table..."
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
CREATE TABLE IF NOT EXISTS videos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NULL,
    cognito_sub VARCHAR(50) NULL,
    title VARCHAR(255) NULL,
    video_url VARCHAR(1000) NOT NULL,
    description TEXT NULL,
    thumbnail_url VARCHAR(1000) NULL,
    duration_seconds INT UNSIGNED NULL,
    category VARCHAR(50) NULL,
    filename VARCHAR(255) NULL,
    s3_key VARCHAR(500) NULL,
    s3_url VARCHAR(1000) NULL,
    mime_type VARCHAR(100) NULL,
    file_size BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_id (event_id),
    INDEX idx_cognito_sub (cognito_sub),
    INDEX idx_created_at (created_at),
    INDEX idx_category (category),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);
EOF

# Create users table
echo "3. Creating users table..."
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
CREATE TABLE IF NOT EXISTS users (
    cognito_sub VARCHAR(50) NOT NULL PRIMARY KEY,
    name VARCHAR(200) NULL,
    photo_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
);
EOF

# Create albums table
echo "4. Creating albums table..."
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
CREATE TABLE IF NOT EXISTS albums (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(200) NOT NULL,
    album_date DATE NULL,
    cognito_sub VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_id (event_id),
    INDEX idx_album_date (album_date),
    INDEX idx_cognito_sub (cognito_sub),
    UNIQUE KEY unique_event_album_name_date (event_id, name, album_date),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
EOF

# Create event_staff table
echo "5. Creating event_staff table..."
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
CREATE TABLE IF NOT EXISTS event_staff (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(200) NOT NULL,
    role ENUM('staff', 'artist') NOT NULL DEFAULT 'staff',
    email VARCHAR(255) NULL,
    phone VARCHAR(50) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_id (event_id),
    INDEX idx_role (role),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
EOF

# Create flights table
echo "6. Creating flights table..."
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
CREATE TABLE IF NOT EXISTS flights (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NOT NULL,
    flight_number VARCHAR(20) NOT NULL,
    airline_code VARCHAR(10) NOT NULL,
    flight_type ENUM('departure', 'return') NOT NULL DEFAULT 'departure',
    departure_airport_code VARCHAR(10) NULL,
    departure_airport_name VARCHAR(200) NULL,
    departure_city VARCHAR(100) NULL,
    departure_date DATE NULL,
    departure_time TIME NULL,
    arrival_airport_code VARCHAR(10) NULL,
    arrival_airport_name VARCHAR(200) NULL,
    arrival_city VARCHAR(100) NULL,
    arrival_date DATE NULL,
    arrival_time TIME NULL,
    aircraft_type VARCHAR(50) NULL,
    status VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_id (event_id),
    INDEX idx_flight_type (flight_type),
    INDEX idx_departure_date (departure_date),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
EOF

echo ""
echo "✅ Database tables created successfully!"
echo ""
echo "📊 Verifying tables..."
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW TABLES;"
echo ""
echo "✅ Database setup complete!"




