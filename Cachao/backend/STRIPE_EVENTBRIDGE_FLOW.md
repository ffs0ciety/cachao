# Stripe EventBridge → Database Flow

## 📊 Complete Flow Diagram

```
┌─────────────┐
│   User      │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. Clicks "Buy Ticket"
       │    POST /events/{id}/tickets/{ticketId}/checkout
       │    Body: { quantity: 1, email: "user@example.com" }
       ▼
┌─────────────────────────────────────┐
│   StripePaymentFunction              │
│   (createTicketCheckoutSession)      │
└──────┬───────────────────────────────┘
       │
       │ 2. Creates order in database
       │    INSERT INTO ticket_orders
       │    - status: 'pending'
       │    - cognito_sub: (from JWT if logged in)
       │    - email: user email
       │    - total_amount: calculated price
       │    - stripe_checkout_session_id: NULL (will be set later)
       │
       │ 3. Creates Stripe Checkout Session
       │    stripe.checkout.sessions.create({
       │      metadata: {
       │        order_id: "123",  ← CRITICAL: Links order to payment
       │        event_id: "1",
       │        ticket_id: "1"
       │      }
       │    })
       │
       │ 4. Returns checkout_url to frontend
       │
       ▼
┌─────────────┐
│   User      │
│  (Browser)  │
└──────┬──────┘
       │
       │ 5. Redirected to Stripe Checkout
       │    Uses test card: 4242 4242 4242 4242
       │
       ▼
┌─────────────┐
│   Stripe    │
│  (Payment)  │
└──────┬──────┘
       │
       │ 6. Payment successful
       │    Stripe generates event: checkout.session.completed
       │
       │ 7. Stripe sends event to EventBridge
       │    Event structure:
       │    {
       │      source: "stripe.com",
       │      "detail-type": "checkout.session.completed",
       │      detail: {
       │        type: "checkout.session.completed",
       │        id: "evt_xxx",
       │        data: {
       │          object: {
       │            id: "cs_test_xxx",  ← Checkout session ID
       │            metadata: {
       │              order_id: "123"   ← Links back to our order!
       │            },
       │            payment_intent: "pi_xxx",
       │            payment_status: "paid"
       │          }
       │        }
       │      }
       │    }
       │
       ▼
┌─────────────────────────────────────┐
│   AWS EventBridge                    │
│   (Event Router)                     │
└──────┬───────────────────────────────┘
       │
       │ 8. EventBridge Rule matches:
       │    - Source: "stripe.com"
       │    - Detail-type: "checkout.session.completed"
       │    - Target: StripeEventBridgeHandler Lambda
       │
       ▼
┌─────────────────────────────────────┐
│   StripeEventBridgeHandler           │
│   (eventBridgeHandler)               │
└──────┬───────────────────────────────┘
       │
       │ 9. Lambda receives EventBridge event
       │    event = {
       │      source: "stripe.com",
       │      "detail-type": "checkout.session.completed",
       │      detail: { ... Stripe event ... }
       │    }
       │
       │ 10. Parses Stripe event from event.detail
       │     stripeEvent = event.detail
       │     stripeEvent.type = "checkout.session.completed"
       │
       │ 11. Extracts checkout session
       │     session = stripeEvent.data.object
       │     orderId = session.metadata.order_id  ← "123"
       │
       │ 12. Updates database:
       │     UPDATE ticket_orders
       │     SET status = 'paid',
       │         stripe_payment_intent_id = 'pi_xxx'
       │     WHERE id = 123
       │
       │ 13. Updates ticket sold quantity:
       │     UPDATE tickets
       │     SET sold_quantity = sold_quantity + 1
       │     WHERE id = 1
       │
       │ 14. Updates discount code (if used):
       │     UPDATE discount_codes
       │     SET used_count = used_count + 1
       │     WHERE id = ...
       │
       ▼
┌─────────────────────────────────────┐
│   Database (MariaDB)                 │
│   ticket_orders table                │
└─────────────────────────────────────┘
       │
       │ ✅ Order status changed: pending → paid
       │ ✅ Ticket sold_quantity incremented
       │ ✅ User can now see ticket in profile
```

## 🔑 Key Components

### 1. **Order Creation** (Step 2)
```sql
INSERT INTO ticket_orders (
  event_id, ticket_id, cognito_sub, email,
  quantity, unit_price, total_amount,
  status, stripe_checkout_session_id
) VALUES (
  1, 1, 'user-sub', 'user@example.com',
  1, 200.00, 200.00,
  'pending', NULL  -- Will be set after Stripe session creation
)
```

### 2. **Stripe Checkout Session** (Step 3)
```javascript
stripe.checkout.sessions.create({
  metadata: {
    order_id: "123",  // ← CRITICAL: This links payment to order
    event_id: "1",
    ticket_id: "1"
  },
  // ... other config
})
```

### 3. **EventBridge Event Structure** (Step 7)
```json
{
  "version": "0",
  "id": "event-id",
  "source": "stripe.com",
  "detail-type": "checkout.session.completed",
  "detail": {
    "type": "checkout.session.completed",
    "id": "evt_xxx",
    "data": {
      "object": {
        "id": "cs_test_xxx",
        "metadata": {
          "order_id": "123",  // ← This is how we find the order!
          "event_id": "1",
          "ticket_id": "1"
        },
        "payment_intent": "pi_xxx",
        "payment_status": "paid"
      }
    }
  }
}
```

### 4. **Database Update** (Step 12)
```sql
-- Update order status
UPDATE ticket_orders 
SET status = 'paid',
    stripe_payment_intent_id = 'pi_xxx'
WHERE id = 123;  -- From session.metadata.order_id

-- Increment ticket sold quantity
UPDATE tickets 
SET sold_quantity = sold_quantity + 1
WHERE id = 1;  -- From order.ticket_id
```

## 🔗 Critical Link: order_id in Metadata

The **most important** part is the `order_id` in the Stripe checkout session metadata:

1. **When creating checkout** (Step 3):
   - We create the order in the database first (gets an `id`)
   - We pass this `id` as `metadata.order_id` to Stripe

2. **When payment completes** (Step 11):
   - Stripe sends the event with the same `metadata.order_id`
   - We use this to find and update the correct order in the database

## ⚠️ Common Issues

### Issue 1: Events Not Reaching Lambda
**Symptoms:** No CloudWatch logs, orders stay `pending`

**Causes:**
- EventBridge partner event source not associated
- EventBridge rule not enabled
- Stripe destination not active

**Fix:**
- AWS Console → EventBridge → Partner event sources → Associate Stripe source
- AWS Console → EventBridge → Rules → Enable rule

### Issue 2: Events Received But Not Processed
**Symptoms:** CloudWatch logs show events but orders stay `pending`

**Causes:**
- Event structure parsing fails
- `order_id` not found in metadata
- Database update fails

**Fix:**
- Check CloudWatch logs for parsing errors
- Verify `order_id` is in checkout session metadata
- Check database connection and permissions

### Issue 3: order_id Not in Metadata
**Symptoms:** Events processed but no order updated

**Causes:**
- `order_id` not passed when creating checkout session
- Metadata not preserved by Stripe

**Fix:**
- Verify checkout session creation includes `metadata.order_id`
- Check Stripe dashboard to see if metadata is present

## 📝 Current Status Check

Based on your data, all orders are `pending`, which means:

1. ✅ Orders are being created (Step 2 works)
2. ✅ Stripe checkout sessions are created (Step 3 works)
3. ✅ Users can complete payment (Step 5-6 works)
4. ❌ EventBridge events are NOT updating database (Step 7-14 not working)

**Next steps:**
1. Check CloudWatch logs for `StripeEventBridgeHandler`
2. Verify EventBridge rule is enabled
3. Verify Stripe destination is active
4. Check if events are being received (look for logs)


