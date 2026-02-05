# Flight Entry Guide

The application uses **manual entry** for flight information. Users enter flight details directly into the form.

## Manual Entry (Current Setup)

**This is the default and recommended approach:**
- ✅ **No setup required** - Works immediately
- ✅ **No API keys needed** - No external dependencies
- ✅ **Unlimited entries** - No rate limits
- ✅ **Full control** - Users enter exactly what they need
- ✅ **No costs** - Completely free

Users simply fill in the flight form with:
- Flight number (e.g., "AA123")
- Flight type (Departure/Return)
- Departure date (optional)
- All other details are optional and can be added later

## Optional: Automatic Flight Lookup APIs

If you want automatic flight information lookup in the future, you can optionally configure:

## Supported APIs

### 1. AviationStack (Primary)
- **Website**: https://aviationstack.com
- **Free Tier**: 100 requests/month (requires signup, no credit card needed)
- **Paid Plans**: Start at $49.99/month for 10,000 requests
- **Setup**: 
  1. Sign up at https://aviationstack.com/signup
  2. Get your API key from the dashboard
  3. Add it as a parameter when deploying: `--parameter-overrides AviationStackApiKey=your_key_here`

### 2. AirLabs (Fallback)
- **Website**: https://airlabs.co
- **Free Tier**: 1,000 requests/month (requires signup, no credit card needed)
- **Paid Plans**: Start at $19/month for 10,000 requests
- **Setup**:
  1. Sign up at https://airlabs.co
  2. Get your API key from the dashboard
  3. Add it as a parameter when deploying: `--parameter-overrides AirLabsApiKey=your_key_here`

### 3. No API Required (Manual Entry)
- **Option**: Users can manually enter all flight details
- **No Setup Required**: Works immediately without any API keys
- **Limitation**: No automatic lookup, all fields must be filled manually

## How It Works (Manual Entry)

When a user adds a flight, they enter:
1. **Flight number** (required) - e.g., "AA123"
2. **Flight type** (required) - Departure or Return
3. **Departure date** (optional) - Helps organize flights
4. **Other details** - Can be added or edited later

The system saves exactly what the user enters - no automatic lookups.

## Optional: How Automatic Lookup Would Work

If API keys were configured (not currently used), the system would:
1. **First try AviationStack API** (if API key is configured)
2. **Fall back to AirLabs API** (if AviationStack fails or isn't configured)
3. **Allow manual entry** if no API keys are configured (current default)

## Deployment

### Standard Deployment (Manual Entry - Recommended):
```bash
cd backend
sam build
sam deploy
```

No API keys needed! Users enter flight information manually.

### Optional: Deploy with API keys (for automatic lookup):
If you want to enable automatic flight lookup in the future:
```bash
cd backend
sam build
sam deploy --parameter-overrides AviationStackApiKey=your_key_here
```

## What Information Users Enter

Users can enter the following flight information:
- **Flight number** (required) - e.g., "AA123"
- **Flight type** (required) - Departure or Return
- **Departure date** (optional)
- **Departure airport code** (optional) - e.g., "JFK"
- **Departure airport name** (optional)
- **Departure city** (optional)
- **Departure time** (optional)
- **Arrival airport code** (optional) - e.g., "LAX"
- **Arrival airport name** (optional)
- **Arrival city** (optional)
- **Arrival date and time** (optional)
- **Aircraft type** (optional)
- **Flight status** (optional)

All fields except flight number and type are optional and can be added or edited later.

## Flight Number Format

The system accepts flight numbers in the format:
- **IATA format**: 2-3 letter airline code + numbers (e.g., "AA123", "BA456", "UAL789")
- Examples: `AA123`, `BA456`, `DL789`, `UA1234`

## Current Setup: Manual Entry Only

**Benefits:**
- ✅ **No costs** - Completely free, no API subscriptions
- ✅ **No setup** - Works immediately without configuration
- ✅ **Unlimited** - No rate limits or monthly quotas
- ✅ **Reliable** - No dependency on external services
- ✅ **Flexible** - Users enter exactly what they need

**How it works:**
- Users fill out the flight form with the information they have
- All fields are saved to the database
- Users can edit flights later to add more details
- Simple and straightforward

## Notes

- **Manual entry is the default and recommended approach**
- No API keys or external services needed
- Users have full control over the data they enter
- All flight information is stored in your database
- Flights can be edited at any time to add or update details

