#!/bin/bash
# Script to open an interactive database connection
# Usage: ./connect-database.sh

DB_HOST="cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "🔌 Connecting to database..."
echo ""

# Try to get password from AWS Parameter Store
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

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
echo "📝 Opening interactive database session..."
echo "   Database: $DB_NAME"
echo "   Host: $DB_HOST"
echo ""
echo "💡 Useful queries:"
echo "   SHOW TABLES;"
echo "   SELECT * FROM events;"
echo "   SELECT * FROM videos;"
echo "   SELECT * FROM albums;"
echo "   SELECT COUNT(*) FROM videos;"
echo ""
echo "   Press Ctrl+D or type 'exit' to quit"
echo ""

# Connect to database
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"





