#!/bin/bash
# Script to query the database and show data
# Usage: ./query-database.sh

DB_HOST="cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "🔍 Database Query Tool"
echo "===================="
echo ""
echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo "User: $DB_USER"
echo ""

# Try to get password from AWS Parameter Store
echo "Attempting to retrieve password from AWS Parameter Store..."
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

if [ -z "$DB_PASSWORD" ]; then
  echo "⚠️  Could not retrieve password from Parameter Store"
  echo "   Please enter the database password manually:"
  read -sp "Database password: " DB_PASSWORD
  echo ""
else
  echo "✅ Password retrieved from Parameter Store"
fi

echo ""
echo "📊 Querying database..."
echo ""

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

echo "📋 Events:"
echo "----------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  id, 
  name, 
  DATE_FORMAT(start_date, '%Y-%m-%d %H:%i') as start_date,
  DATE_FORMAT(end_date, '%Y-%m-%d %H:%i') as end_date,
  CASE WHEN image_url IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as created_at
FROM events 
ORDER BY created_at DESC;
" 2>/dev/null || echo "❌ Failed to query events"

echo ""
echo "📹 Videos:"
echo "----------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  v.id, 
  v.title, 
  v.event_id,
  e.name as event_name,
  v.album_id,
  a.name as album_name,
  CASE WHEN v.cognito_sub IS NOT NULL THEN 'Yes' ELSE 'No' END as has_user,
  DATE_FORMAT(v.created_at, '%Y-%m-%d %H:%i') as created_at
FROM videos v
LEFT JOIN events e ON v.event_id = e.id
LEFT JOIN albums a ON v.album_id = a.id
ORDER BY v.created_at DESC
LIMIT 20;
" 2>/dev/null || echo "❌ Failed to query videos"

echo ""
echo "📁 Albums:"
echo "----------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  a.id, 
  a.name, 
  a.event_id,
  e.name as event_name,
  (SELECT COUNT(*) FROM videos WHERE album_id = a.id) as video_count,
  DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') as created_at
FROM albums a
LEFT JOIN events e ON a.event_id = e.id
ORDER BY a.created_at DESC;
" 2>/dev/null || echo "❌ Failed to query albums"

echo ""
echo "📊 Summary:"
echo "----------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  'Events' as table_name, COUNT(*) as count FROM events
UNION ALL
SELECT 
  'Videos' as table_name, COUNT(*) as count FROM videos
UNION ALL
SELECT 
  'Albums' as table_name, COUNT(*) as count FROM albums;
" 2>/dev/null || echo "❌ Failed to get summary"

echo ""
echo "✅ Done!"
echo ""
echo "💡 Tip: To run custom queries, use:"
echo "   $CLIENT_CMD -h $DB_HOST -P $DB_PORT -u $DB_USER -p'<password>' $DB_NAME -e \"YOUR_SQL_QUERY\""





