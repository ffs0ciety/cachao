# EventBridge Troubleshooting Guide

## Current Issue
All ticket orders remain in `pending` status, meaning EventBridge events are not updating the database.

## Step-by-Step Debugging

### 1. Check if EventBridge Events are Reaching Lambda

**Check CloudWatch Logs:**
```bash
# Find the log group
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1

# View recent logs
aws logs tail "/aws/lambda/Cachao-StripeEventBridgeHandler-<id>" \
  --since 1h \
  --profile personal \
  --region eu-west-1
```

**What to look for:**
- `🚀 EventBridge handler invoked` - Lambda is being called
- `🔔 Received EventBridge event` - Event is being received
- `✅ Processing checkout.session.completed event` - Event is being processed
- `✅ Order update result` - Database update succeeded

**If you see NO logs:**
- EventBridge events are NOT reaching the Lambda
- Check EventBridge rule configuration
- Check Stripe destination status

### 2. Verify EventBridge Rule

**Check rule status:**
```bash
aws events list-rules \
  --name-prefix "Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1
```

**In AWS Console:**
1. Go to: https://eu-west-1.console.aws.amazon.com/events/home?region=eu-west-1#/rules
2. Find rule: `Cachao-StripeEventBridgeHandler-StripeEventBridge-*`
3. Verify:
   - ✅ State: **Enabled**
   - ✅ Event pattern matches:
     ```json
     {
       "source": ["stripe.com"],
       "detail-type": ["checkout.session.completed"]
     }```
   - ✅ Target: Points to `StripeEventBridgeHandler` Lambda

### 3. Verify Stripe EventBridge Destination

**In Stripe Dashboard:**
1. Go to: https://dashboard.stripe.com/settings/event-destinations
2. Find your destination (e.g., `cachao-stripe-destination`)
3. Verify:
   - ✅ Status: **Active**
   - ✅ Events: `checkout.session.completed` is enabled
   - ✅ No error messages

### 4. Verify Partner Event Source Association

**In AWS Console:**
1. Go to: https://eu-west-1.console.aws.amazon.com/events/home?region=eu-west-1#/partners
2. Find Stripe event source: `aws.partner/stripe.com/...`
3. Verify:
   - ✅ State: **Active** (not "Pending")
   - ✅ Associated with: **default** event bus

**If it's "Pending":**
- Click on it
- Click "Associate with event bus"
- Select "default" event bus
- Click "Associate"

### 5. Test with a New Purchase

After verifying the above:
1. Make a test purchase
2. Complete payment with test card: `4242 4242 4242 4242`
3. Immediately check CloudWatch logs
4. Check database: `SELECT * FROM ticket_orders WHERE id = <new_order_id>`

**Expected result:**
- Order status should change from `pending` to `paid` within seconds
- `stripe_payment_intent_id` should be populated
- Ticket `sold_quantity` should increment

### 6. Manual Database Update (Temporary Fix)

If EventBridge is not working, you can manually update orders:

```sql
-- Update a specific order
UPDATE ticket_orders 
SET status = 'paid',
    stripe_payment_intent_id = 'pi_xxx'
WHERE id = 8;

-- Update ticket sold quantity
UPDATE tickets 
SET sold_quantity = sold_quantity + 1
WHERE id = 1;
```

**⚠️ This is only a temporary workaround. The root cause must be fixed.**

## Common Issues and Solutions

### Issue 1: No CloudWatch Logs
**Cause:** Lambda not being invoked
**Solution:**
- Verify EventBridge rule is enabled
- Verify rule target points to correct Lambda
- Check Lambda permissions

### Issue 2: Logs Show Events But No Updates
**Cause:** Event parsing or database update failing
**Solution:**
- Check logs for parsing errors
- Verify `order_id` is in metadata
- Check database connection and permissions

### Issue 3: Events Not Reaching EventBridge
**Cause:** Stripe destination not active or not configured
**Solution:**
- Verify Stripe destination is active
- Check Stripe dashboard for errors
- Re-create destination if needed

## Quick Verification Commands

```bash
# Check Lambda function exists
aws lambda get-function \
  --function-name "Cachao-StripeEventBridgeHandler" \
  --profile personal \
  --region eu-west-1

# Check EventBridge rule
aws events describe-rule \
  --name "Cachao-StripeEventBridgeHandler-StripeEventBridge-<id>" \
  --profile personal \
  --region eu-west-1

# Check recent invocations
aws lambda list-functions \
  --profile personal \
  --region eu-west-1 \
  --query 'Functions[?contains(FunctionName, `StripeEventBridge`)].FunctionName'
```


