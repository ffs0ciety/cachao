#!/bin/bash
# Add album_id column to videos table

DB_PASSWORD="wyPbuv-9kacno-corvuv"
DB_HOST="cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "Adding album_id column to videos table..."

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'SQL'
-- Check if column exists
SELECT COUNT(*) as count
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'videos'
  AND COLUMN_NAME = 'album_id';
SQL

RESULT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'videos' AND COLUMN_NAME = 'album_id';")

if [ "$RESULT" = "0" ]; then
  echo "Column doesn't exist, adding it..."
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'SQL'
    ALTER TABLE videos
    ADD COLUMN album_id BIGINT UNSIGNED NULL;
    
    ALTER TABLE videos
    ADD INDEX idx_album_id (album_id);
    
    ALTER TABLE videos
    ADD CONSTRAINT fk_videos_album_id
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL;
SQL
  echo "✅ Column added successfully!"
else
  echo "✅ Column already exists!"
fi

echo ""
echo "Verifying column exists:"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW COLUMNS FROM videos LIKE 'album_id';"
