#!/bin/bash

# Script to set up local MariaDB user for the application
# Run this script manually: ./setup-local-db.sh

echo "Setting up local MariaDB user for Cachao application..."
echo ""

# Connect via socket (no password needed) and create user
sudo mariadb << EOF
-- Create user if it doesn't exist
CREATE USER IF NOT EXISTS 'cachao_user'@'%' IDENTIFIED BY 'your_password';

-- Grant privileges on cachao database
GRANT ALL PRIVILEGES ON cachao.* TO 'cachao_user'@'%';

-- Flush privileges
FLUSH PRIVILEGES;

-- Show user created
SELECT user, host FROM mysql.user WHERE user='cachao_user';
EOF

echo ""
echo "✅ User 'cachao_user' created with password 'your_password'"
echo "✅ Granted all privileges on 'cachao' database"
echo ""
echo "Now update backend/.env.local.json with:"
echo "  DB_USER: cachao_user"
echo "  DB_PASSWORD: your_password"







