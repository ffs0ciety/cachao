#!/bin/bash

# Script to add date column to albums table
# This allows albums to be associated with specific dates within an event
# (e.g., for events that occur multiple times like "every Sunday")

DB_HOST="${DB_HOST:-cachao-db.c9qjqjqjqjqjqjqjqjqjqjqjqjqjqj.eu-west-1.rds.amazonaws.com}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-cachao}"

# Get password from AWS Parameter Store
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --region eu-west-1 --query 'Parameter.Value' --output text 2>/dev/null)

if [ -z "$DB_PASSWORD" ]; then
    echo "Error: Could not retrieve database password from AWS Parameter Store"
    echo "Make sure you have the correct AWS profile configured and the parameter exists"
    exit 1
fi

echo "Adding date column to albums table..."

mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" <<EOF
-- Add date column to albums table if it doesn't exist
ALTER TABLE albums 
ADD COLUMN IF NOT EXISTS album_date DATE NULL AFTER name;

-- Update unique constraint to include date (allow same name on different dates)
-- First, drop the old unique constraint if it exists
ALTER TABLE albums 
DROP INDEX IF EXISTS unique_event_album_name;

-- Add new unique constraint that includes date
-- Note: NULL values are treated as distinct, so albums with NULL date can have same name
ALTER TABLE albums 
ADD UNIQUE KEY unique_event_album_name_date (event_id, name, album_date);

-- Add index on date for faster queries
ALTER TABLE albums 
ADD INDEX IF NOT EXISTS idx_album_date (album_date);

SELECT 'Date column added to albums table successfully' AS result;
EOF

if [ $? -eq 0 ]; then
    echo "✅ Successfully added date column to albums table"
else
    echo "❌ Error adding date column to albums table"
    exit 1
fi





