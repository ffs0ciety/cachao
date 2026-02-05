#!/bin/bash
# Script to add thumbnail_url column to videos table
# Run this script: ./add-thumbnail-column.sh

echo "Adding thumbnail_url column to videos table..."

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
SET @dbname = DATABASE();
SET @tablename = 'videos';
SET @columnname = 'thumbnail_url';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT "Column thumbnail_url already exists" as result;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(500) NULL; SELECT "Column thumbnail_url added successfully!" as result;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SELECT "Thumbnail column setup complete!" as result;
EOF

echo ""
echo "✅ Done!"





