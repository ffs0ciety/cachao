#!/bin/bash
# Script to check if tickets and discount_codes tables exist

DB_HOST="cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

# Try to get password from AWS Parameter Store
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

if [ -z "$DB_PASSWORD" ]; then
  echo "⚠️  Could not retrieve password from Parameter Store"
  exit 1
fi

# Check if mysql/mariadb client is available
if ! command -v mysql &> /dev/null && ! command -v mariadb &> /dev/null; then
  echo "❌ Error: mysql or mariadb client not found"
  exit 1
fi

# Use mariadb if available, otherwise mysql
CLIENT_CMD=$(command -v mariadb || command -v mysql)

echo "🔍 Checking for tickets and discount_codes tables..."
echo ""

# Check if tables exist
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ EXISTS'
    ELSE '❌ NOT FOUND'
  END as status,
  'tickets' as table_name
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'cachao' AND TABLE_NAME = 'tickets'

UNION ALL

SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ EXISTS'
    ELSE '❌ NOT FOUND'
  END as status,
  'discount_codes' as table_name
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'cachao' AND TABLE_NAME = 'discount_codes';
" 2>&1

echo ""
echo "📋 Table structures (if they exist):"
echo ""

# Show table structure for tickets if it exists
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 'tickets' as table_name;
DESCRIBE tickets;
" 2>&1 | head -20

echo ""

# Show table structure for discount_codes if it exists
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 'discount_codes' as table_name;
DESCRIBE discount_codes;
" 2>&1 | head -20


