#!/bin/bash
# Check EventBridge rule target

RULE_NAME="Cachao-StripeEventBridgeHandlerStripeEventBridge-d7hi5C1tdaDW"

echo "🔍 Checking EventBridge Rule Target"
echo "===================================="
echo ""
echo "Rule: $RULE_NAME"
echo ""

echo "📋 Rule Targets:"
aws events list-targets-by-rule \
  --rule "$RULE_NAME" \
  --profile personal \
  --region eu-west-1 \
  --output json 2>/dev/null | jq -r '.[] | "ID: \(.Id)\nARN: \(.Arn)\nInput: \(.Input // "none")\n---"' || echo "Could not list targets"

echo ""
echo "📊 Recent CloudWatch Logs (last 10 minutes):"
echo "--------------------------------------------"
LOG_GROUP=$(aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1 \
  --query 'logGroups[0].logGroupName' \
  --output text 2>/dev/null)

if [ -n "$LOG_GROUP" ] && [ "$LOG_GROUP" != "None" ]; then
  echo "Log group: $LOG_GROUP"
  echo ""
  aws logs tail "$LOG_GROUP" --since 10m --format short --profile personal --region eu-west-1 2>/dev/null | tail -30 || echo "No recent logs"
else
  echo "❌ No log group found"
  echo "This means the Lambda has never been invoked"
fi

echo ""
echo "💡 If you see no logs, try making a test purchase now and check again"


