#!/bin/bash

# Script to delete all videos from the database
# Usage: ./delete-all-videos.sh

DB_HOST="${DB_HOST:-cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-cachao}"
DB_USER="${DB_USER:-admin}"

echo "⚠️  WARNING: This will delete ALL videos from the database!"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Operation cancelled."
    exit 0
fi

# Read password securely
read -sp "Enter database password: " DB_PASSWORD
echo ""

# Connect to database and delete all videos
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" <<EOF
-- Delete all videos
DELETE FROM videos;

-- Show count to confirm
SELECT COUNT(*) as remaining_videos FROM videos;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All videos have been deleted from the database."
else
    echo ""
    echo "❌ Error deleting videos. Please check your credentials and connection."
    exit 1
fi





