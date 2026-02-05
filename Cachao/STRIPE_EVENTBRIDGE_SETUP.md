# Stripe EventBridge Integration Setup

## ✅ Completed Steps

1. ✅ Stripe destination created: `cachao-stripe-destination`
2. ✅ AWS Lambda function deployed: `StripeEventBridgeHandler`
3. ✅ EventBridge rule configured in CloudFormation

## 🔧 Next Steps Required

### Step 1: Associate Partner Event Source in AWS

After creating the destination in Stripe, you need to associate it in AWS EventBridge:

1. **Go to AWS EventBridge Console:**
   - Navigate to: https://eu-west-1.console.aws.amazon.com/events/home?region=eu-west-1#/partners
   - Or: AWS Console → EventBridge → Partner event sources

2. **Find the Stripe Event Source:**
   - Look for an event source named: `aws.partner/stripe.com/{UNIQUE_ID}`
   - It should show as "Pending" or "Active"

3. **Associate the Event Source:**
   - Click on the event source
   - Click **"Associate with event bus"**
   - Select the **default** event bus
   - Click **"Associate"**

### Step 2: Verify EventBridge Rule

The EventBridge rule is already configured in `template.yaml`:
- **Source:** `stripe.com`
- **Detail-type:** `checkout.session.completed`
- **Target:** `StripeEventBridgeHandler` Lambda function

### Step 3: Test the Integration

1. **Create a test checkout:**
   - Go to your frontend
   - Select a ticket and proceed to checkout
   - Use test card: `4242 4242 4242 4242`

2. **Monitor CloudWatch Logs:**
   - Go to: https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#logsV2:log-groups
   - Find log group: `/aws/lambda/Cachao-StripeEventBridgeHandler-*`
   - Check for logs showing: "Received EventBridge event"

3. **Verify Database Updates:**
   - Check `ticket_orders` table - status should be `paid`
   - Check `tickets` table - `sold_quantity` should be incremented

## 🔍 Troubleshooting

### If events aren't being received:

1. **Check EventBridge Partner Sources:**
   - Ensure the Stripe event source is "Active" (not "Pending")
   - If pending, complete the association

2. **Check EventBridge Rules:**
   - Go to: https://eu-west-1.console.aws.amazon.com/events/home?region=eu-west-1#/rules
   - Find rule: `Cachao-StripeEventBridgeHandler-StripeEventBridge-*`
   - Verify it's "Enabled" and has correct pattern

3. **Check Lambda Logs:**
   - Look for errors in CloudWatch Logs
   - The handler logs the full event structure for debugging

4. **Verify Stripe Destination:**
   - In Stripe Dashboard → Settings → Event Destinations
   - Ensure `cachao-stripe-destination` shows as "Active"
   - Check for any error messages

## 📝 Event Format

Stripe sends events to EventBridge with:
- **Source:** `stripe.com`
- **Detail-type:** `checkout.session.completed`
- **Detail:** Contains the full Stripe event object

The Lambda function automatically:
- Detects EventBridge format (source: `stripe.com`)
- Extracts the Stripe event from `event.detail`
- Processes the checkout session
- Updates order status and ticket quantities


