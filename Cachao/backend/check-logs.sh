#!/bin/bash
# Script to check CloudWatch logs for EventBridge handler

echo "📊 Checking CloudWatch Logs for StripeEventBridgeHandler"
echo "=========================================================="
echo ""

# Find the log group
LOG_GROUP=$(aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1 \
  --query 'logGroups[0].logGroupName' \
  --output text 2>/dev/null)

if [ -z "$LOG_GROUP" ] || [ "$LOG_GROUP" == "None" ]; then
  echo "❌ No log group found for StripeEventBridgeHandler"
  echo ""
  echo "This could mean:"
  echo "  1. The Lambda function hasn't been invoked yet"
  echo "  2. The function name is different"
  echo ""
  echo "Let's check all Lambda functions:"
  aws lambda list-functions --profile personal --region eu-west-1 --query 'Functions[?contains(FunctionName, `Stripe`) || contains(FunctionName, `EventBridge`)].FunctionName' --output table
else
  echo "✅ Found log group: $LOG_GROUP"
  echo ""
  echo "📋 Recent logs (last 30 minutes):"
  echo "-----------------------------------"
  aws logs tail "$LOG_GROUP" --since 30m --format short --profile personal --region eu-west-1 2>/dev/null | tail -50 || echo "No recent logs found"
fi

echo ""
echo "🔍 Checking EventBridge Rules:"
echo "-------------------------------"
aws events list-rules \
  --name-prefix "Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1 \
  --query 'Rules[*].[Name,State,EventPattern]' \
  --output table 2>/dev/null || echo "Could not list rules"

echo ""
echo "🔍 Checking Partner Event Sources:"
echo "-----------------------------------"
aws events list-partner-event-sources \
  --profile personal \
  --region eu-west-1 \
  --query 'PartnerEventSources[*].[Name,State]' \
  --output table 2>/dev/null || echo "Could not list partner sources"


