#!/bin/bash
# Script to add users table for user profiles
# Run this script: ./add-users-table.sh

echo "Adding users table to database..."

DB_HOST="${DB_HOST:-cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-cachao}"
DB_USER="${DB_USER:-admin}"
DB_PASSWORD_PARAM_NAME="/cachao/database/password"

# Try to get password from AWS Parameter Store
echo "Attempting to retrieve password from AWS Parameter Store..."
DB_PASSWORD=$(aws ssm get-parameter --name "$DB_PASSWORD_PARAM_NAME" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

if [ -z "$DB_PASSWORD" ]; then
  echo "⚠️  Could not retrieve password from Parameter Store"
  echo "   Please enter the database password manually:"
  read -sp "Database password: " DB_PASSWORD
  echo ""
fi

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    cognito_sub VARCHAR(50) NOT NULL PRIMARY KEY,
    name VARCHAR(200) NULL,
    photo_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
);

-- Add cognito_sub to events table if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'events';
SET @columnname = 'cognito_sub';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT "Column cognito_sub already exists in events table" as result;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(50) NULL, ADD INDEX idx_cognito_sub (', @columnname, '); SELECT "Column cognito_sub added to events table successfully!" as result;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SELECT "Users table and events.cognito_sub column setup complete!" as result;
EOF

echo ""
echo "✅ Done!"

