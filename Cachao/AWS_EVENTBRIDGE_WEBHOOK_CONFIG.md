# AWS EventBridge & Webhook Configuration

## Current Configuration Summary

Your application has **two methods** configured to receive Stripe payment confirmations:

1. **EventBridge (Preferred)** - Automated event routing from Stripe to Lambda
2. **Webhook (Fallback)** - Direct HTTP endpoint for Stripe webhooks

---

## 1. EventBridge Configuration

### EventBridge Rule

**Location:** `backend/template.yaml` (lines 615-623)

```yaml
StripeEventBridgeHandler:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.eventBridgeHandler
    Runtime: nodejs20.x
    Timeout: 60
    MemorySize: 512
    Events:
      StripeEventBridge:
        Type: EventBridgeRule
        Properties:
          EventBusName: default
          Pattern:
            source:
              - stripe.com
            detail-type:
              - checkout.session.completed
```

### Key Details:

- **Event Bus:** `default` (AWS default event bus)
- **Event Pattern:**
  - **Source:** `stripe.com` (Stripe partner events)
  - **Detail Type:** `checkout.session.completed` (payment completion events)
- **Target:** `StripeEventBridgeHandler` Lambda function
- **Handler Function:** `app.eventBridgeHandler` in `stripe-payment-function/app.ts`

### Lambda Function Configuration:

**Function Name:** `Cachao-StripeEventBridgeHandler-{unique-id}`

**Environment Variables:**
- `DB_HOST`: `cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com`
- `DB_PORT`: `3306`
- `DB_NAME`: `cachao`
- `DB_USER`: (from CloudFormation parameter)
- `DB_PASSWORD`: (from CloudFormation parameter)
- `STRIPE_SECRET_KEY`: (from CloudFormation parameter)

**Runtime:** Node.js 20.x  
**Architecture:** x86_64  
**Timeout:** 60 seconds  
**Memory:** 512 MB

### EventBridge Rule Name Pattern:

When deployed, the rule will be named:
```
Cachao-StripeEventBridgeHandler-StripeEventBridge-{unique-id}
```

### How It Works:

1. Stripe sends `checkout.session.completed` events to AWS EventBridge
2. EventBridge matches events with pattern: `source: stripe.com`
3. EventBridge triggers `StripeEventBridgeHandler` Lambda
4. Lambda processes the event and updates the database

---

## 2. Webhook Configuration (Fallback)

### API Gateway Endpoint

**Location:** `backend/template.yaml` (lines 580-587)

```yaml
StripePaymentFunction:
  Properties:
    Events:
      StripeWebhook:
        Type: Api
        Properties:
          RestApiId: !Ref CachaoApi
          Path: /webhooks/stripe
          Method: post
          Auth:
            Authorizer: NONE
```

### Key Details:

- **API Gateway:** `CachaoApi` (your main API Gateway)
- **Path:** `/webhooks/stripe`
- **Method:** `POST`
- **Authentication:** `NONE` (public endpoint for Stripe webhooks)
- **Handler Function:** `app.lambdaHandler` in `stripe-payment-function/app.ts`

### Full Webhook URL:

After deployment, the webhook URL will be:
```
https://{api-gateway-id}.execute-api.{region}.amazonaws.com/Prod/webhooks/stripe
```

You can find your API Gateway URL in:
- CloudFormation stack outputs
- AWS Console → API Gateway → Stages → Prod

### Lambda Function Configuration:

**Function Name:** `Cachao-StripePaymentFunction-{unique-id}`

**Environment Variables:**
- `DB_HOST`: `cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com`
- `DB_PORT`: `3306`
- `DB_NAME`: `cachao`
- `DB_USER`: (from CloudFormation parameter)
- `DB_PASSWORD`: (from CloudFormation parameter)
- `STRIPE_SECRET_KEY`: (from CloudFormation parameter)
- `STRIPE_WEBHOOK_SECRET`: (from CloudFormation parameter) ⚠️ **Required for webhook signature verification**

### How It Works:

1. Stripe sends HTTP POST request to `/webhooks/stripe`
2. API Gateway routes to `StripePaymentFunction` Lambda
3. Lambda verifies webhook signature using `STRIPE_WEBHOOK_SECRET`
4. Lambda processes the event and updates the database

---

## 3. Event Processing Logic

Both EventBridge and Webhook use the same processing function: `handleStripeEvent()`

**Location:** `backend/stripe-payment-function/app.ts` (line 556)

### Event Detection:

The function automatically detects the event source:

```typescript
// EventBridge format detection
const isEventBridge = event.source === 'stripe.com' || 
                     event.source === 'aws.events' || 
                     event['detail-type'] || 
                     (event.detail && typeof event.detail === 'object' && !event.body);
```

### Processing Steps:

1. **Parse Stripe Event:**
   - EventBridge: Extracts event from `event.detail`
   - Webhook: Verifies signature and constructs event from body

2. **Handle `checkout.session.completed` event:**
   - Extract `order_id` from `session.metadata.order_id`
   - Extract `payment_intent` from session
   - Update order status: `pending` → `paid`
   - Increment ticket `sold_quantity`
   - Update discount code `used_count` (if applicable)

3. **Database Updates:**
   ```sql
   UPDATE ticket_orders 
   SET status = 'paid',
       stripe_payment_intent_id = ?
   WHERE id = ?;
   
   UPDATE tickets 
   SET sold_quantity = sold_quantity + ?
   WHERE id = ?;
   ```

---

## 4. Required AWS Resources

### EventBridge Resources:

1. **Partner Event Source** (created by Stripe):
   - Name pattern: `aws.partner/stripe.com/{unique-id}`
   - Status: Must be "Active" (associated with default event bus)
   - **Action Required:** Associate in AWS Console if not already done

2. **EventBridge Rule:**
   - Created automatically by SAM/CloudFormation
   - Must be **ENABLED** to receive events
   - Pattern matches: `source: stripe.com`, `detail-type: checkout.session.completed`

3. **Lambda Function:**
   - `StripeEventBridgeHandler` - Processes EventBridge events

### API Gateway Resources:

1. **REST API:**
   - `CachaoApi` - Main API Gateway
   - Stage: `Prod`

2. **Resource:**
   - Path: `/webhooks/stripe`
   - Method: `POST`

3. **Lambda Function:**
   - `StripePaymentFunction` - Handles webhook requests

---

## 5. Verification Commands

### Check EventBridge Rule:

```bash
aws events list-rules \
  --name-prefix "Cachao-StripeEventBridgeHandler" \
  --region eu-west-1 \
  --query 'Rules[*].[Name,State,EventPattern]' \
  --output table
```

### Check Rule Targets:

```bash
RULE_NAME=$(aws events list-rules \
  --name-prefix "Cachao-StripeEventBridgeHandler" \
  --region eu-west-1 \
  --query 'Rules[0].Name' \
  --output text)

aws events list-targets-by-rule \
  --rule "$RULE_NAME" \
  --region eu-west-1
```

### Check Lambda Functions:

```bash
# EventBridge Handler
aws lambda get-function \
  --function-name "Cachao-StripeEventBridgeHandler" \
  --region eu-west-1 \
  --query 'Configuration.[FunctionName,LastModified,State]'

# Webhook Handler
aws lambda get-function \
  --function-name "Cachao-StripePaymentFunction" \
  --region eu-west-1 \
  --query 'Configuration.[FunctionName,LastModified,State]'
```

### Check Partner Event Source:

```bash
aws events list-partner-event-sources \
  --region eu-west-1 \
  --query 'PartnerEventSources[*].[Name,State]' \
  --output table
```

### View CloudWatch Logs:

```bash
# EventBridge Handler logs
aws logs tail "/aws/lambda/Cachao-StripeEventBridgeHandler" \
  --since 1h \
  --region eu-west-1

# Webhook Handler logs
aws logs tail "/aws/lambda/Cachao-StripePaymentFunction" \
  --since 1h \
  --region eu-west-1 \
  --filter-pattern "webhook"
```

---

## 6. Stripe Dashboard Configuration

### For EventBridge (Preferred):

1. **Go to:** https://dashboard.stripe.com/settings/event-destinations
2. **Find destination:** Should show "Amazon EventBridge" destination
3. **Verify:**
   - Status: **Active**
   - Events: `checkout.session.completed` is enabled
   - AWS Account ID: Your AWS account ID
   - Region: `eu-west-1` (or your region)

### For Webhook (Fallback):

1. **Go to:** https://dashboard.stripe.com/webhooks
2. **Find endpoint:** Should point to `/webhooks/stripe`
3. **Verify:**
   - URL: `https://{api-id}.execute-api.{region}.amazonaws.com/Prod/webhooks/stripe`
   - Events: `checkout.session.completed`
   - Status: **Enabled**
   - Signing secret: Copied to `STRIPE_WEBHOOK_SECRET` parameter

---

## 7. Current Status Checklist

- [ ] EventBridge rule deployed and **ENABLED**
- [ ] Partner event source **ASSOCIATED** with default event bus
- [ ] Stripe EventBridge destination **ACTIVE** in Stripe dashboard
- [ ] Webhook endpoint configured in Stripe dashboard (if using fallback)
- [ ] `STRIPE_SECRET_KEY` parameter set in SAM deployment
- [ ] `STRIPE_WEBHOOK_SECRET` parameter set (if using webhooks)
- [ ] Lambda functions have correct IAM permissions
- [ ] Database connection working from Lambda

---

## 8. Troubleshooting

### Events Not Reaching Lambda:

1. **Check EventBridge Rule State:**
   ```bash
   aws events describe-rule \
     --name "Cachao-StripeEventBridgeHandler-StripeEventBridge-*" \
     --region eu-west-1
   ```
   - Ensure `State: ENABLED`

2. **Check Partner Event Source:**
   - AWS Console → EventBridge → Partner event sources
   - Ensure status is "Active" (not "Pending")

3. **Check Stripe Destination:**
   - Stripe Dashboard → Settings → Event destinations
   - Ensure destination is "Active"

### Webhook Not Working:

1. **Verify Webhook URL:**
   - Check Stripe Dashboard → Webhooks
   - Ensure URL matches your API Gateway endpoint

2. **Check Signature Verification:**
   - Ensure `STRIPE_WEBHOOK_SECRET` matches Stripe webhook secret
   - Check CloudWatch logs for signature errors

3. **Check API Gateway:**
   - Verify endpoint is deployed
   - Check API Gateway logs for errors

---

## 9. Architecture Diagram

```
┌─────────────┐
│   Stripe    │
└──────┬──────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌──────────────┐
│ EventBridge │   │ API Gateway │
│  (default)  │   │ /webhooks/  │
└──────┬──────┘   │   stripe     │
       │         └──────┬───────┘
       │                 │
       │                 │
       ▼                 ▼
┌─────────────────────────────────┐
│  StripeEventBridgeHandler       │
│  (app.eventBridgeHandler)       │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  handleStripeEvent()            │
│  - Parse event                   │
│  - Update order status           │
│  - Update ticket sold_quantity   │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│     MariaDB Database            │
│  - ticket_orders                │
│  - tickets                      │
│  - discount_codes               │
└─────────────────────────────────┘
```

---

## Summary

**EventBridge Configuration:**
- ✅ Rule pattern: `source: stripe.com`, `detail-type: checkout.session.completed`
- ✅ Target: `StripeEventBridgeHandler` Lambda
- ✅ Event bus: `default`
- ⚠️ Requires: Partner event source association in AWS Console

**Webhook Configuration:**
- ✅ Endpoint: `/webhooks/stripe` (POST)
- ✅ Handler: `StripePaymentFunction` Lambda
- ✅ Authentication: None (public for Stripe)
- ⚠️ Requires: `STRIPE_WEBHOOK_SECRET` for signature verification

Both methods use the same processing logic and update the same database tables.
