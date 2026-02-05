#!/bin/bash
# Script to verify EventBridge setup

echo "🔍 Verifying EventBridge Setup"
echo "==============================="
echo ""

echo "1️⃣ Checking EventBridge Rules:"
echo "-------------------------------"
aws events list-rules \
  --name-prefix "Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1 \
  --query 'Rules[*].[Name,State,EventPattern]' \
  --output json 2>/dev/null | jq -r '.[] | "\(.[0]) | State: \(.[1]) | Pattern: \(.[2])"' || echo "Could not list rules"

echo ""
echo "2️⃣ Checking Rule Targets:"
echo "--------------------------"
RULE_NAME=$(aws events list-rules \
  --name-prefix "Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1 \
  --query 'Rules[0].Name' \
  --output text 2>/dev/null)

if [ -n "$RULE_NAME" ] && [ "$RULE_NAME" != "None" ]; then
  echo "Rule name: $RULE_NAME"
  aws events list-targets-by-rule \
    --rule "$RULE_NAME" \
    --profile personal \
    --region eu-west-1 \
    --query 'Targets[*].[Id,Arn,Input]' \
    --output table 2>/dev/null || echo "Could not list targets"
else
  echo "❌ No rule found"
fi

echo ""
echo "3️⃣ Checking Lambda Function:"
echo "------------------------------"
aws lambda get-function \
  --function-name "Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1 \
  --query 'Configuration.[FunctionName,LastModified,State]' \
  --output table 2>/dev/null || echo "Could not get Lambda function"

echo ""
echo "4️⃣ Checking Partner Event Source:"
echo "-----------------------------------"
aws events describe-event-source \
  --name "aws.partner/stripe.com/ed_test_61Tw6AOzu6iJQhjyn16Tw5y8SfCQEXXHewXuBVM88FuC" \
  --profile personal \
  --region eu-west-1 \
  --query '[Name,State]' \
  --output table 2>/dev/null || echo "Could not describe event source"

echo ""
echo "✅ Verification complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Ensure the EventBridge rule is ENABLED"
echo "  2. Ensure the rule pattern matches: source='stripe.com', detail-type='checkout.session.completed'"
echo "  3. Ensure the rule target points to StripeEventBridgeHandler Lambda"
echo "  4. Make a test purchase and check CloudWatch logs"


