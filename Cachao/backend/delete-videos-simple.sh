#!/bin/bash
# Simple script to delete all videos - uses AWS profile
DB_HOST="cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "⚠️  WARNING: This will delete ALL videos from the database!"
read -p "Are you sure? Type 'yes' to confirm: " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

read -sp "Database password: " DB_PASSWORD
echo ""

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "DELETE FROM videos; SELECT COUNT(*) as remaining_videos FROM videos;"

echo "Done!"
