#!/bin/bash
# Script to add event_staff table for managing staff and artists for events
# Run this script: ./add-event-staff-table.sh

echo "Adding event_staff table to database..."

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
-- Create event_staff table
CREATE TABLE IF NOT EXISTS event_staff (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(200) NOT NULL,
    role ENUM('staff', 'artist') NOT NULL DEFAULT 'staff',
    email VARCHAR(255) NULL,
    phone VARCHAR(50) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_id (event_id),
    INDEX idx_role (role),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

SELECT "Event staff table created successfully!" as result;
EOF

echo ""
echo "✅ Done!"


