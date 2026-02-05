#!/bin/bash

# Script to add image_url column to events table
# Run this script: ./add-image-url-column.sh

echo "Adding image_url column to events table..."

DB_HOST="${DB_HOST:-cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-cachao}"
DB_USER="${DB_USER:-admin}"

if [ -z "$DB_PASSWORD" ]; then
  read -sp "Database password: " DB_PASSWORD
  echo ""
fi

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
-- Check if column exists, if not add it
SET @dbname = DATABASE();
SET @tablename = 'events';
SET @columnname = 'image_url';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT "Column image_url already exists" as result;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(500) NULL; SELECT "Column image_url added successfully!" as result;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
EOF

echo ""
echo "✅ Done!"

