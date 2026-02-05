#!/bin/bash
# Script to add albums support to the database
# Run this script: ./add-albums-support.sh

echo "Adding albums support to database..."

DB_HOST="${DB_HOST:-cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-cachao}"
DB_USER="${DB_USER:-admin}"

if [ -z "$DB_PASSWORD" ]; then
  read -sp "Database password: " DB_PASSWORD
  echo ""
fi

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
-- Create albums table
CREATE TABLE IF NOT EXISTS albums (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_id (event_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE KEY unique_event_album_name (event_id, name)
);

-- Add album_id column to videos table if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'videos';
SET @columnname = 'album_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT "Column album_id already exists" as result;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' BIGINT UNSIGNED NULL, ADD INDEX idx_album_id (', @columnname, '), ADD FOREIGN KEY (', @columnname, ') REFERENCES albums(id) ON DELETE SET NULL; SELECT "Column album_id added successfully!" as result;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SELECT "Albums support added successfully!" as result;
EOF

echo ""
echo "✅ Done!"





