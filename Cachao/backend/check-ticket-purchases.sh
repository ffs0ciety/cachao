#!/bin/bash
# Quick script to check ticket purchases

DB_HOST="cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com"
DB_PORT="3306"
DB_NAME="cachao"
DB_USER="admin"

# Try to get password from Parameter Store
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

# If not found, try CloudFormation
if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD=$(aws cloudformation describe-stacks --stack-name Cachao --profile personal --query 'Stacks[0].Parameters[?ParameterKey==`DatabasePassword`].ParameterValue' --output text 2>/dev/null)
fi

# If still not found, prompt user
if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" == "None" ]; then
  echo "⚠️  Could not retrieve password from AWS"
  echo "Please enter the database password manually:"
  read -sp "Database password: " DB_PASSWORD
  echo ""
fi

CLIENT_CMD=$(command -v mariadb || command -v mysql)

echo "🎫 All Ticket Orders:"
echo "===================="
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
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
  DATE_FORMAT(to.created_at, '%Y-%m-%d %H:%i:%s') as created_at
FROM ticket_orders to
LEFT JOIN events e ON to.event_id = e.id
LEFT JOIN tickets t ON to.ticket_id = t.id
ORDER BY to.created_at DESC;
EOF

echo ""
echo "📊 Summary:"
echo "==========="
$CLIENT_CMD -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
SELECT 
  status,
  COUNT(*) as count,
  SUM(quantity) as total_tickets,
  ROUND(SUM(total_amount), 2) as total_revenue
FROM ticket_orders
GROUP BY status;
EOF

