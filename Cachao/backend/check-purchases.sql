-- Query to check all ticket purchases
-- Run this with: mariadb -h cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com -u admin -p cachao < check-purchases.sql

-- All ticket orders with details
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

-- Summary by status
SELECT 
  status,
  COUNT(*) as count,
  SUM(quantity) as total_tickets,
  ROUND(SUM(total_amount), 2) as total_revenue
FROM ticket_orders
GROUP BY status;

-- Orders by cognito_sub (logged-in users)
SELECT 
  cognito_sub,
  email,
  COUNT(*) as order_count,
  SUM(quantity) as total_tickets,
  ROUND(SUM(total_amount), 2) as total_spent
FROM ticket_orders
WHERE cognito_sub IS NOT NULL
GROUP BY cognito_sub, email
ORDER BY total_spent DESC;

-- Orders by email (guest purchases or where cognito_sub is NULL)
SELECT 
  email,
  COUNT(*) as order_count,
  SUM(quantity) as total_tickets,
  ROUND(SUM(total_amount), 2) as total_spent,
  GROUP_CONCAT(DISTINCT cognito_sub) as cognito_subs
FROM ticket_orders
WHERE cognito_sub IS NULL
GROUP BY email
ORDER BY total_spent DESC;


