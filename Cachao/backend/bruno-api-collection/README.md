# Cachao API - Bruno Collection

This Bruno collection contains all API endpoints for the Cachao application.

## Setup

1. Install [Bruno](https://www.usebruno.com/) if you haven't already
2. Open Bruno and click "Open Collection"
3. Navigate to this folder: `Cachao/backend/bruno-api-collection`
4. The collection will be loaded with all endpoints organized by category

## Environment Variables

Edit `environments/local.bru` to set your:
- `api_url`: Full API URL including base path (default: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod`)
- `base_url`: Base URL without path (optional, for reference)
- `base_path`: Base path (optional, for reference)
- `id_token`: Your Cognito ID token (JWT token only, without "Bearer " prefix)
- `event_id`, `staff_id`, etc.: Default IDs for testing

**Important Notes:** 
- All requests use `{{api_url}}` which includes the `/Prod` base path
- Set your `id_token` (just the token, no "Bearer " prefix) in the environment
- After logging in via `/auth/login`, copy the `idToken` value and paste it as `id_token` in the environment
- **Tokens expire after 1 hour** - if you get "Invalid key=value pair" or 401 errors, get a new token via the Login endpoint
- The Authorization header format is automatically set to `Bearer {{id_token}}` in all requests

## Endpoints Overview

### 01-Auth
- **Login** - Authenticate user and get tokens
- Resend Verification Code
- Mark Email Verified (Admin)

### 02-Events
- Get All Events
- Get Event by ID
- Get My Event Info (Get current user's staff/artist info for an event, including flights and accommodations)
- Create Event
- Update Event
- Delete Event
- Get Event Image Upload URL

### 03-Staff
- Get Event Staff
- Add Event Staff
- Update Event Staff
- Delete Event Staff
- Get Staff Image Upload URL

### 04-Tickets
- Get Event Tickets
- Create Ticket
- Update Ticket
- Delete Ticket
- Get Ticket Image Upload URL
- Discount Codes (CRUD)
- Ticket Discounts (CRUD)

### 05-Flights
- Get Staff Flights
- Create Staff Flight
- Update Staff Flight
- Delete Staff Flight

### 06-Accommodations
- Get Event Accommodations
- Create Accommodation
- Update Accommodation
- Delete Accommodation
- Assign Accommodation
- Unassign Accommodation
- Get Staff Accommodations

### 07-Videos
- Get Event Videos
- Get Video Upload URL
- Initiate Multipart Upload
- Complete Multipart Upload
- Confirm Video Upload
- Update Video Category
- Get Thumbnail Upload URL
- Update Video Thumbnail
- Delete Videos

### 08-Albums
- Get Event Albums
- Create Album

### 09-Artists
- Get Artist Profile

### 10-User
- Get User Profile
- Update User Profile
- Get Profile Photo Upload URL
- Get User Events (includes owned events and events where user is staff/artist/media/videographer)
- Get User Videos
- Get User Tickets

### 11-Admin
- Get All Ticket Orders

### 12-Health
- Health Check

### 13-Payments
- Create Ticket Checkout (Stripe)
- Stripe Webhook

## Authentication

**Important:** Cachao uses AWS Cognito for authentication. You can now use the **Login endpoint** (`POST /auth/login`) to authenticate and get tokens, or authenticate client-side through AWS Amplify.

### Getting an Auth Token for Testing

You have **two options** to get an auth token:

#### Option 1: Use the Login Endpoint (Recommended)
1. Use the **Login** request in the `01-Auth` folder
2. Send your email and password
3. Copy the `idToken` from the response
4. Set in environment: `auth_token: Bearer YOUR_ID_TOKEN_HERE`

**Which token to use?**
- **Use `idToken`** - This is the token you need for API Gateway authentication
- `accessToken` - Used for AWS service calls (not needed for API requests)
- `refreshToken` - Used to get new tokens when they expire

#### Option 2: From Browser
1. Log in to the Cachao frontend
2. Open DevTools → Application → Local Storage
3. Find `CognitoIdentityServiceProvider.*.idToken`
4. Copy the token value
5. Set in environment: `auth_token: Bearer YOUR_TOKEN_HERE`

#### Option 3: Using AWS CLI
```bash
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id YOUR_CLIENT_ID \
  --auth-parameters USERNAME=user@example.com,PASSWORD=yourpassword \
  --region eu-west-1
```
Extract the `IdToken` from the response.

### Public Endpoints

These endpoints don't require authentication:
- GET /events
- GET /events/{id}
- GET /events/{id}/staff
- GET /events/{id}/tickets
- GET /events/{id}/discount-codes
- GET /events/{id}/videos
- GET /events/{id}/albums
- GET /artists/{id}
- GET /health
- POST /auth/resend-verification-code

## Notes

- Replace placeholder values in request bodies with actual data
- Update environment variables with your actual IDs and tokens
- Some endpoints may require specific permissions or event ownership
