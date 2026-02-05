#!/bin/bash
# Manual test to send a test event to EventBridge

echo "🧪 Testing EventBridge with Manual Event"
echo "========================================"
echo ""

# Create a test event that matches the Stripe event structure
TEST_EVENT=$(cat <<EOF
{
  "source": "stripe.com",
  "detail-type": "checkout.session.completed",
  "detail": {
    "type": "checkout.session.completed",
    "id": "evt_test_manual_$(date +%s)",
    "object": "event",
    "api_version": "2023-10-16",
    "created": $(date +%s),
    "data": {
      "object": {
        "id": "cs_test_manual_test",
        "object": "checkout.session",
        "metadata": {
          "order_id": "11",
          "event_id": "1",
          "ticket_id": "1"
        },
        "payment_intent": "pi_test_manual",
        "payment_status": "paid"
      }
    },
    "livemode": false,
    "pending_webhooks": 0,
    "request": {
      "id": null,
      "idempotency_key": null
    }
  }
}
EOF
)

echo "📤 Sending test event to default event bus..."
echo ""

aws events put-events \
  --entries "[{
    \"Source\": \"stripe.com\",
    \"DetailType\": \"checkout.session.completed\",
    \"Detail\": $(echo "$TEST_EVENT" | jq -c '.detail'),
    \"EventBusName\": \"default\"
  }]" \
  --profile personal \
  --region eu-west-1 \
  --output json 2>&1

echo ""
echo ""
echo "✅ Test event sent!"
echo ""
echo "📊 Now check:"
echo "  1. CloudWatch logs for StripeEventBridgeHandler"
echo "  2. Database: SELECT * FROM ticket_orders WHERE id = 11"
echo ""
echo "If the test event works, the issue is that Stripe events aren't reaching EventBridge."
echo "If the test event doesn't work, there's an issue with the Lambda handler."


