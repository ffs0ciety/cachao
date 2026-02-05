#!/bin/bash
# Add cognito_sub column to events table

DB_PASSWORD="wyPbuv-9kacno-corvuv"
DB_HOST="cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "Adding cognito_sub column to events table..."

RESULT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'cognito_sub';")

if [ "$RESULT" = "0" ]; then
  echo "Column doesn't exist, adding it..."
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'SQL'
    ALTER TABLE events
    ADD COLUMN cognito_sub VARCHAR(50) NULL;
    
    ALTER TABLE events
    ADD INDEX idx_cognito_sub (cognito_sub);
SQL
  echo "✅ Column added successfully!"
else
  echo "✅ Column already exists!"
fi

echo ""
echo "Verifying column exists:"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW COLUMNS FROM events LIKE 'cognito_sub';"
