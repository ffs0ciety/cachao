# Thunder Client Setup for Cursor

## Installation

1. **Open Extensions:**
   - Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows/Linux)

2. **Search and Install:**
   - Search for "Thunder Client"
   - Install: **Thunder Client** by Ranga Vadhineni

3. **Open Thunder Client:**
   - Click the Thunder Client icon in the left sidebar (lightning bolt icon)
   - Or press `Cmd+Shift+P` and type "Thunder Client"

## Import Collection

1. **Import the Collection:**
   - Click the folder icon (Collections) in Thunder Client
   - Click "Import" or the "+" button
   - Select "Import from File"
   - Choose `backend/thunder-client-collection.json`

2. **Or Create Manually:**
   - Click "New Request"
   - Use the requests below as templates

## Test Checkout Endpoint

### Quick Test:

1. **Create New Request:**
   - Click "New Request" in Thunder Client
   - Name it: "Create Ticket Checkout"

2. **Configure Request:**
   - **Method:** `POST`
   - **URL:** `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/events/1/tickets/1/checkout`
   
3. **Headers:**
   - `Content-Type`: `application/json`
   - `Origin`: `http://localhost:3000`

4. **Body (JSON):**
   ```json
   {
     "email": "test@example.com",
     "quantity": 1,
     "discount_code": ""
   }
   ```

5. **Send Request:**
   - Click "Send" button
   - Check the response

### Expected Response:

**Success (200):**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/...",
  "session_id": "cs_test_..."
}
```

**Error (400/500):**
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Environment Variables

You can set up environment variables in Thunder Client:

1. Click "Env" tab in Thunder Client
2. Create new environment: "Production"
3. Add variables:
   - `baseUrl`: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod`
   - `authToken`: `your_jwt_token_here`

4. Use in requests: `{{baseUrl}}/events/1`

## Troubleshooting

- **502 Bad Gateway**: Check CloudWatch logs for Lambda errors
- **CORS Error**: Make sure `Origin` header is set
- **401 Unauthorized**: Add `Authorization: Bearer YOUR_TOKEN` header
- **404 Not Found**: Verify the endpoint path is correct

## Quick Test Checklist

✅ Health check endpoint works  
✅ Get events endpoint works  
✅ Checkout endpoint returns checkout_url  
✅ Checkout URL redirects to Stripe  


