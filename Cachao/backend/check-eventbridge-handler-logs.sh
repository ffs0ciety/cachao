#!/bin/bash
# Check logs for the EventBridge handler specifically

LAMBDA_NAME="Cachao-StripeEventBridgeHandler-gr24BTyhAVr7"
LOG_GROUP="/aws/lambda/$LAMBDA_NAME"

echo "🔍 Checking EventBridge Handler Logs"
echo "====================================="
echo ""
echo "Lambda: $LAMBDA_NAME"
echo "Log Group: $LOG_GROUP"
echo ""

echo "📊 Recent logs (last 1 hour):"
echo "----------------------------"
aws logs tail "$LOG_GROUP" --since 1h --format short --profile personal --region eu-west-1 2>/dev/null | tail -100 || echo "❌ No logs found - Lambda has never been invoked"

echo ""
echo "📈 Invocation count (last 24 hours):"
echo "------------------------------------"
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value="$LAMBDA_NAME" \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --profile personal \
  --region eu-west-1 \
  --output table 2>/dev/null || echo "Could not get metrics"

echo ""
echo "💡 If you see NO logs, the EventBridge handler is NOT being invoked."
echo "   This means Stripe events are not reaching EventBridge."
echo ""
echo "   Check:"
echo "   1. Stripe Dashboard → Event Destinations → Verify events are being sent"
echo "   2. AWS Console → EventBridge → Partner event sources → Verify Stripe source is Active"
echo "   3. Make a test purchase and complete payment, then check logs again"


