# API Testing in Cursor

## Option 1: REST Client Extension (Recommended)

1. **Install the Extension:**
   - Open Cursor
   - Press `Cmd+Shift+X` (or `Ctrl+Shift+X` on Windows/Linux)
   - Search for "REST Client"
   - Install: **REST Client** by Huachao Mao
   - Extension ID: `humao.rest-client`

2. **Use the Test File:**
   - Open `backend/api-tests.http`
   - Click the "Send Request" button above each request
   - Or use `Cmd+Alt+R` (Mac) / `Ctrl+Alt+R` (Windows/Linux)

3. **Update Variables:**
   - Edit the `@authToken` variable at the top with your actual JWT token
   - The `@baseUrl` is already set to your API Gateway URL

## Option 2: Thunder Client Extension

1. **Install:**
   - Search for "Thunder Client" in Cursor extensions
   - Install: **Thunder Client** by Ranga Vadhineni

2. **Features:**
   - GUI-based REST client
   - Collection management
   - Environment variables
   - Request history

## Option 3: Built-in Terminal (curl)

You can also test directly in the terminal:

```bash
# Test checkout endpoint
curl -X POST "https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/events/1/tickets/1/checkout" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"test@example.com","quantity":1}'
```

## Quick Test: Checkout Endpoint

The most important test right now is the checkout endpoint. Use this in REST Client:

```http
POST https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/events/1/tickets/1/checkout
Content-Type: application/json
Origin: http://localhost:3000

{
  "email": "test@example.com",
  "quantity": 1
}
```

**Expected Response:**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/...",
  "session_id": "cs_test_..."
}
```

## Troubleshooting

- **401 Unauthorized**: Add your JWT token to `@authToken` variable
- **502 Bad Gateway**: Check CloudWatch logs for the Lambda function
- **CORS Error**: Make sure `Origin` header is set
- **404 Not Found**: Verify the endpoint path is correct


