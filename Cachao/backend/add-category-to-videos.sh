#!/bin/bash
# Add category column to videos table

DB_PASSWORD="wyPbuv-9kacno-corvuv"
DB_HOST="cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "Adding category column to videos table..."

RESULT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'videos' AND COLUMN_NAME = 'category';")

if [ "$RESULT" = "0" ]; then
  echo "Column doesn't exist, adding it..."
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'SQL'
    ALTER TABLE videos
    ADD COLUMN category ENUM('shows', 'social', 'workshops', 'demos') NULL;
    
    ALTER TABLE videos
    ADD INDEX idx_category (category);
SQL
  echo "✅ Column added successfully!"
else
  echo "✅ Column already exists!"
fi

echo ""
echo "Verifying column exists:"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW COLUMNS FROM videos LIKE 'category';"
