#!/bin/bash
# Script to check CloudWatch logs for EventBridge handler

echo "📊 Checking CloudWatch Logs for StripeEventBridgeHandler"
echo "=========================================================="
echo ""

# Get the log group name (SAM creates it automatically)
LOG_GROUP="/aws/lambda/Cachao-StripeEventBridgeHandler-*"

echo "Searching for recent EventBridge events..."
echo ""

# Get logs from the last hour
aws logs tail "$LOG_GROUP" --since 1h --format short --profile personal 2>/dev/null | grep -E "(EventBridge|checkout.session.completed|order_id|paid)" || echo "No recent events found"

echo ""
echo "To see all logs, run:"
echo "aws logs tail /aws/lambda/Cachao-StripeEventBridgeHandler-<random-id> --follow --profile personal"


