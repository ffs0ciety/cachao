#!/bin/bash
# Script to check if EventBridge is working

echo "🔍 Checking EventBridge Status"
echo "=============================="
echo ""

echo "1️⃣ Checking EventBridge Rules..."
aws events list-rules --name-prefix "Cachao-StripeEventBridgeHandler" --profile personal --region eu-west-1 --query 'Rules[*].[Name,State,EventPattern]' --output table 2>/dev/null || echo "Could not list rules"

echo ""
echo "2️⃣ Checking Partner Event Sources..."
aws events list-partner-event-sources --profile personal --region eu-west-1 --query 'PartnerEventSources[*].[Name,State]' --output table 2>/dev/null || echo "Could not list partner sources"

echo ""
echo "3️⃣ Checking Lambda Function..."
aws lambda get-function --function-name "Cachao-StripeEventBridgeHandler" --profile personal --region eu-west-1 --query 'Configuration.[FunctionName,LastModified,State]' --output table 2>/dev/null || echo "Could not get Lambda function"

echo ""
echo "4️⃣ Recent CloudWatch Logs (last 10 minutes)..."
LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/Cachao-StripeEventBridgeHandler" --profile personal --region eu-west-1 --query 'logGroups[0].logGroupName' --output text 2>/dev/null)

if [ -n "$LOG_GROUP" ] && [ "$LOG_GROUP" != "None" ]; then
  echo "Log group: $LOG_GROUP"
  aws logs tail "$LOG_GROUP" --since 10m --format short --profile personal --region eu-west-1 2>/dev/null | tail -20 || echo "No recent logs"
else
  echo "No log group found"
fi

echo ""
echo "✅ To check logs manually:"
echo "   AWS Console → CloudWatch → Log groups → /aws/lambda/Cachao-StripeEventBridgeHandler-*"
echo ""
echo "✅ To check EventBridge rules:"
echo "   AWS Console → EventBridge → Rules → Look for Cachao-StripeEventBridgeHandler-StripeEventBridge-*"


