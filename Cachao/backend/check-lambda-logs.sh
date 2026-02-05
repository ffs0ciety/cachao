#!/bin/bash
# Check Lambda logs and invocations

LAMBDA_NAME="Cachao-StripeEventBridgeHandler-gr24BTyhAVr7"
LOG_GROUP="/aws/lambda/$LAMBDA_NAME"

echo "🔍 Checking Lambda Function: $LAMBDA_NAME"
echo "=========================================="
echo ""

echo "1️⃣ Recent CloudWatch Logs (last 30 minutes):"
echo "--------------------------------------------"
aws logs tail "$LOG_GROUP" --since 30m --format short --profile personal --region eu-west-1 2>/dev/null | tail -50 || echo "❌ No logs found or log group doesn't exist"

echo ""
echo "2️⃣ Lambda Invocations (last 24 hours):"
echo "--------------------------------------"
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
echo "3️⃣ Lambda Errors (last 24 hours):"
echo "----------------------------------"
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value="$LAMBDA_NAME" \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --profile personal \
  --region eu-west-1 \
  --output table 2>/dev/null || echo "Could not get metrics"

echo ""
echo "4️⃣ Lambda Function Configuration:"
echo "----------------------------------"
aws lambda get-function \
  --function-name "$LAMBDA_NAME" \
  --profile personal \
  --region eu-west-1 \
  --query 'Configuration.[FunctionName,LastModified,State,LastUpdateStatus]' \
  --output table 2>/dev/null || echo "Could not get function"

echo ""
echo "💡 Next Steps:"
echo "  1. If you see NO logs → Lambda is not being invoked (Stripe events not reaching EventBridge)"
echo "  2. If you see logs with errors → Check the error messages"
echo "  3. If you see logs but no database updates → Check database connection/permissions"
echo "  4. Make a test purchase NOW and check logs immediately after"


