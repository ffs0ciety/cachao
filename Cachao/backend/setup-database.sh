#!/bin/bash

# Script to drop and recreate the cachao database with proper permissions
# Run this script: ./setup-database.sh

echo "Setting up cachao database..."
echo ""

# Drop and recreate database
echo "1. Dropping existing database (if exists)..."
sudo mariadb -e "DROP DATABASE IF EXISTS cachao;"

echo "2. Creating cachao database..."
sudo mariadb -e "CREATE DATABASE cachao;"

echo "3. Granting permissions to admin user..."
sudo mariadb -e "GRANT ALL PRIVILEGES ON cachao.* TO 'admin'@'localhost';"
sudo mariadb -e "GRANT ALL PRIVILEGES ON cachao.* TO 'admin'@'%';"
sudo mariadb -e "FLUSH PRIVILEGES;"

echo "4. Creating events table..."
mariadb -u admin cachao << 'EOF'
CREATE TABLE IF NOT EXISTS events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NULL,
    image_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_start_date (start_date),
    INDEX idx_end_date (end_date)
);
EOF


echo "5. Creating videos table..."
mariadb -u admin cachao << 'EOF'
CREATE TABLE IF NOT EXISTS videos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NULL,
    filename VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    s3_url VARCHAR(1000) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_id (event_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);
EOF

echo ""
echo "✅ Database setup complete!"
echo ""
echo "5. Verifying setup..."
mariadb -u admin cachao -e "SHOW TABLES;"
mariadb -u admin cachao -e "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'cachao';"

echo ""
echo "✅ Ready to use! You can now run: ./start-local.sh"



