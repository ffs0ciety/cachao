# Stripe Payment Setup Guide

## Overview

Your application uses **Stripe Checkout** to process ticket payments. The setup uses:
- **Stripe Checkout Sessions** for payment collection
- **AWS EventBridge** (preferred) or **Webhooks** (fallback) to receive payment confirmations
- **Lambda functions** to handle checkout creation and payment events

## Architecture

```
User → Frontend → API Gateway → StripePaymentFunction → Stripe Checkout
                                                              ↓
                                                         Payment Complete
                                                              ↓
                                    EventBridge/Webhook → StripeEventBridgeHandler → Database Update
```

## Configuration

### 1. Stripe Account Setup

1. **Get Stripe API Keys:**
   - Go to https://dashboard.stripe.com/apikeys
   - Copy your **Secret Key** (starts with `sk_test_` for test mode or `sk_live_` for production)
   - Copy your **Publishable Key** (starts with `pk_test_` or `pk_live_`)

2. **Set up Webhook Endpoint (for fallback):**
   - Go to https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://YOUR_API_GATEWAY_URL/Prod/webhooks/stripe`
   - Select events: `checkout.session.completed`
   - Copy the **Webhook Signing Secret** (starts with `whsec_`)

3. **Set up EventBridge Destination (preferred method):**
   - Go to https://dashboard.stripe.com/settings/events
   - Click "Add destination" → "Amazon EventBridge"
   - Follow AWS setup instructions
   - This automatically sends events to AWS EventBridge

### 2. AWS SAM Configuration

The Stripe credentials are configured as CloudFormation parameters in `template.yaml`:

```yaml
Parameters:
  StripeSecretKey:
    Type: String
    Description: Stripe secret key (get from https://dashboard.stripe.com/apikeys)
    Default: ""
    NoEcho: true
  StripeWebhookSecret:
    Type: String
    Description: Stripe webhook secret (get from Stripe dashboard after creating webhook endpoint)
    Default: ""
    NoEcho: true
```

### 3. Setting Parameters

When deploying with SAM, you need to provide these parameters:

**Option 1: Using samconfig.toml**
```toml
[default.deploy.parameters]
parameter_overrides = [
  "StripeSecretKey=sk_test_YOUR_SECRET_KEY",
  "StripeWebhookSecret=whsec_YOUR_WEBHOOK_SECRET"
]
```

**Option 2: Command line**
```bash
sam deploy --parameter-overrides StripeSecretKey=sk_test_... StripeWebhookSecret=whsec_...
```

**Option 3: AWS Systems Manager Parameter Store (Recommended)**
Store secrets in AWS SSM Parameter Store and reference them:
```yaml
Environment:
  Variables:
    STRIPE_SECRET_KEY: !Sub "{{resolve:ssm:/cachao/stripe/secret-key}}"
    STRIPE_WEBHOOK_SECRET: !Sub "{{resolve:ssm:/cachao/stripe/webhook-secret}}"
```

## Payment Flow

### Step 1: User Initiates Purchase
- User clicks "Buy Ticket" on frontend
- Frontend calls: `POST /events/{id}/tickets/{ticketId}/checkout`
- Body: `{ quantity: 1, email: "user@example.com", discount_code: "SUMMER2024" }`

### Step 2: Create Order & Checkout Session
**Lambda:** `StripePaymentFunction.createTicketCheckoutSession`

1. **Validates ticket availability**
2. **Calculates price** (with discounts if provided)
3. **Creates order in database:**
   ```sql
   INSERT INTO ticket_orders (
     event_id, ticket_id, email, quantity,
     unit_price, discount_amount, total_amount,
     status
   ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
   ```
4. **Creates Stripe Checkout Session:**
   ```javascript
   stripe.checkout.sessions.create({
     payment_method_types: ['card'],
     line_items: [{
       price_data: {
         currency: 'eur',
         product_data: {
           name: 'Ticket Name - Event Name',
           description: 'Ticket for Event Name'
         },
         unit_amount: 20000 // in cents (€200.00)
       },
       quantity: 1
     }],
     mode: 'payment',
     success_url: 'https://yourapp.com/events/1?payment=success',
     cancel_url: 'https://yourapp.com/events/1?payment=cancelled',
     customer_email: 'user@example.com',
     metadata: {
       order_id: "123",  // ← CRITICAL: Links payment to order
       event_id: "1",
       ticket_id: "1"
     }
   })
   ```
5. **Returns checkout URL** to frontend

### Step 3: User Completes Payment
- User is redirected to Stripe Checkout
- User enters payment details
- Stripe processes payment

### Step 4: Payment Confirmation

**Method A: EventBridge (Preferred)**
- Stripe sends event to AWS EventBridge
- EventBridge rule triggers `StripeEventBridgeHandler` Lambda
- Lambda updates order status to `paid`

**Method B: Webhook (Fallback)**
- Stripe sends webhook to `/webhooks/stripe` endpoint
- `StripePaymentFunction.handleStripeEvent` processes it
- Updates order status to `paid`

### Step 5: Database Update
```sql
-- Update order status
UPDATE ticket_orders 
SET status = 'paid',
    stripe_payment_intent_id = 'pi_xxx'
WHERE id = ?;  -- From session.metadata.order_id

-- Increment ticket sold quantity
UPDATE tickets 
SET sold_quantity = sold_quantity + quantity
WHERE id = ?;

-- Update discount code usage (if used)
UPDATE discount_codes 
SET used_count = used_count + 1
WHERE id = ?;
```

## Key Components

### 1. StripePaymentFunction
- **Location:** `backend/stripe-payment-function/app.ts`
- **Endpoints:**
  - `POST /events/{id}/tickets/{ticketId}/checkout` - Create checkout session
  - `POST /webhooks/stripe` - Handle webhook events (fallback)
- **Environment Variables:**
  - `STRIPE_SECRET_KEY` - Stripe API secret key
  - `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (for webhook verification)

### 2. StripeEventBridgeHandler
- **Location:** `backend/stripe-payment-function/app.ts` (eventBridgeHandler)
- **Trigger:** AWS EventBridge rule for `checkout.session.completed` events
- **Function:** Updates order status when payment completes

### 3. Frontend Integration
- **Component:** `frontend/components/TicketPurchase.vue`
- **Composable:** `frontend/composables/useTickets.ts` (createTicketCheckout function)
- **Flow:** Calls checkout endpoint → Redirects to Stripe → Returns to success URL

## Testing

### Test Mode
- Use test API keys (`sk_test_...`)
- Test card: `4242 4242 4242 4242`
- Any future expiry date
- Any 3-digit CVC

### Verify Setup
1. **Check Lambda logs:**
   ```bash
   aws logs tail /aws/lambda/StripePaymentFunction --follow
   aws logs tail /aws/lambda/StripeEventBridgeHandler --follow
   ```

2. **Test checkout:**
   - Create a ticket purchase
   - Check CloudWatch logs for checkout session creation
   - Complete payment with test card
   - Verify order status updates to `paid`

3. **Check EventBridge:**
   - AWS Console → EventBridge → Rules
   - Verify rule is enabled
   - Check rule targets

## Troubleshooting

### Orders Stay "Pending"
- **Check EventBridge:** Verify rule is enabled and events are being received
- **Check Lambda logs:** Look for errors in `StripeEventBridgeHandler`
- **Verify metadata:** Ensure `order_id` is in checkout session metadata
- **Check Stripe dashboard:** Verify events are being sent

### Webhook Not Working
- **Verify URL:** Check webhook endpoint URL in Stripe dashboard
- **Check signature:** Ensure `STRIPE_WEBHOOK_SECRET` is correct
- **Check logs:** Look for signature verification errors

### Checkout Session Not Created
- **Verify API key:** Check `STRIPE_SECRET_KEY` is set correctly
- **Check Lambda logs:** Look for Stripe API errors
- **Verify ticket:** Ensure ticket exists and is active

## Security Notes

1. **Never commit secrets** to version control
2. **Use AWS Systems Manager Parameter Store** or **Secrets Manager** for production
3. **Enable webhook signature verification** for webhook endpoints
4. **Use HTTPS** for all webhook endpoints
5. **Validate metadata** before processing events

## Current Status

Based on the code:
- ✅ Checkout session creation is implemented
- ✅ Order creation in database is working
- ✅ EventBridge handler is configured
- ✅ Webhook fallback is available
- ✅ Discount codes are supported
- ✅ Price calculation with discounts works

## Next Steps

1. **Set up Stripe account** and get API keys
2. **Configure EventBridge destination** in Stripe dashboard
3. **Deploy with Stripe credentials** as SAM parameters
4. **Test payment flow** with test cards
5. **Monitor CloudWatch logs** for any issues
