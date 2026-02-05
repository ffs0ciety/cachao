#!/bin/bash
# Script to query ticket purchases from the database
# Usage: ./query-ticket-purchases.sh

DB_HOST="cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

echo "🎫 Ticket Purchase Query Tool"
echo "============================="
echo ""
echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo "User: $DB_USER"
echo ""

# Try to get password from AWS Parameter Store
echo "Attempting to retrieve password from AWS Parameter Store..."
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

if [ -z "$DB_PASSWORD" ]; then
  echo "⚠️  Could not retrieve password from Parameter Store"
  echo "   Please enter the database password manually:"
  read -sp "Database password: " DB_PASSWORD
  echo ""
else
  echo "✅ Password retrieved from Parameter Store"
fi

echo ""
echo "📊 Querying ticket purchases..."
echo ""

# Check if mysql/mariadb client is available
if ! command -v mysql &> /dev/null && ! command -v mariadb &> /dev/null; then
  echo "❌ Error: mysql or mariadb client not found"
  echo ""
  echo "Please install MariaDB client:"
  echo "  macOS: brew install mariadb"
  echo "  Ubuntu: sudo apt-get install mariadb-client"
  exit 1
fi

# Use mariadb if available, otherwise mysql
CLIENT_CMD=$(command -v mariadb || command -v mysql)

echo "🎫 All Ticket Orders:"
echo "-------------------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  to.id,
  to.event_id,
  e.name as event_name,
  to.ticket_id,
  t.name as ticket_name,
  to.cognito_sub,
  to.email,
  to.quantity,
  to.unit_price,
  to.discount_amount,
  to.total_amount,
  to.status,
  to.stripe_checkout_session_id,
  DATE_FORMAT(to.created_at, '%Y-%m-%d %H:%i:%s') as created_at
FROM ticket_orders to
LEFT JOIN events e ON to.event_id = e.id
LEFT JOIN tickets t ON to.ticket_id = t.id
ORDER BY to.created_at DESC;
" 2>/dev/null || echo "❌ Failed to query ticket orders"

echo ""
echo "📊 Summary by Status:"
echo "-------------------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  status,
  COUNT(*) as count,
  SUM(quantity) as total_tickets,
  SUM(total_amount) as total_revenue
FROM ticket_orders
GROUP BY status;
" 2>/dev/null || echo "❌ Failed to get summary"

echo ""
echo "👤 Orders by User (cognito_sub):"
echo "-------------------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  cognito_sub,
  email,
  COUNT(*) as order_count,
  SUM(quantity) as total_tickets,
  SUM(total_amount) as total_spent
FROM ticket_orders
WHERE cognito_sub IS NOT NULL
GROUP BY cognito_sub, email
ORDER BY total_spent DESC;
" 2>/dev/null || echo "❌ Failed to query by user"

echo ""
echo "📧 Orders by Email (guest purchases):"
echo "-------------------"
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT 
  email,
  COUNT(*) as order_count,
  SUM(quantity) as total_tickets,
  SUM(total_amount) as total_spent,
  GROUP_CONCAT(DISTINCT cognito_sub) as cognito_subs
FROM ticket_orders
WHERE cognito_sub IS NULL
GROUP BY email
ORDER BY total_spent DESC;
" 2>/dev/null || echo "❌ Failed to query by email"

echo ""
echo "✅ Done!"


