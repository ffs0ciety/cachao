#!/bin/bash
# Script to run the migrate-add-staff-public migration directly
# Usage: ./run-migrate-add-staff-public.sh

DB_HOST="cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "🔄 Running migration: Add is_public column to event_staff table"
echo "================================================================"
echo ""

# Try to get password from AWS Parameter Store
echo "Attempting to retrieve password from AWS Parameter Store..."
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --region eu-west-1 --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

if [ -z "$DB_PASSWORD" ]; then
  echo "⚠️  Could not retrieve password from Parameter Store"
  echo "   Please enter the database password manually:"
  read -sp "Database password: " DB_PASSWORD
  echo ""
else
  echo "✅ Password retrieved from Parameter Store"
fi

# Check if mysql/mariadb client is available
if ! command -v mysql &> /dev/null && ! command -v mariadb &> /dev/null; then
  echo "❌ Error: mysql or mariadb client not found"
  echo ""
  echo "Please install MariaDB client:"
  echo "  macOS: brew install mariadb"
  echo "  Ubuntu: sudo apt-get install mariadb-client"
  exit 1
fi

# Use mariadb if available, otherwise mysql
CLIENT_CMD=$(command -v mariadb || command -v mysql)

echo ""
echo "📊 Checking if is_public column exists..."
echo ""

# Check if column exists
COLUMN_EXISTS=$($CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
SELECT COUNT(*) 
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'event_staff'
  AND COLUMN_NAME = 'is_public';
" 2>/dev/null)

if [ "$COLUMN_EXISTS" = "1" ]; then
  echo "✅ Column is_public already exists in event_staff table"
  echo ""
  echo "Migration already completed!"
  exit 0
fi

echo "📝 Column does not exist. Adding is_public column..."
echo ""

# Add the column
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
ALTER TABLE event_staff
ADD COLUMN is_public BOOLEAN DEFAULT FALSE AFTER role;
" 2>&1

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration completed successfully!"
  echo "   Column is_public added to event_staff table"
  echo ""
  echo "📊 Verifying column exists..."
  $CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  DESCRIBE event_staff;
  " 2>/dev/null | grep -i "is_public" && echo "✅ Column verified!" || echo "⚠️  Column not found in describe output"
else
  echo ""
  echo "❌ Migration failed!"
  exit 1
fi

echo ""
echo "✅ Done!"


