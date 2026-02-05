# API URL Update

## ✅ Updated Configuration

The frontend has been updated to use the new API endpoint after the VPC removal migration.

### Changes Made

1. **nuxt.config.ts**
   - Updated default `apiUrl`: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com`
   - Updated default `apiBasePath`: `/Prod`
   - Updated Cognito User Pool ID: `eu-west-1_y1FDQpQ9b`
   - Updated Cognito Client ID: `37a41hu5u7mlm6nbh9n3d23ogb`

2. **composables/useUserProfile.ts**
   - Updated fallback API URL to new endpoint

3. **README.md**
   - Updated API URL documentation

### New API Endpoints

- **Base URL**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod`
- **Events**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/events`
- **Videos**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/videos`
- **User Profile**: `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/user/profile`

### Old Endpoint (No Longer Active)

- ~~`https://6wwci7xpkc.execute-api.eu-west-1.amazonaws.com`~~ ❌

### Environment Variables

You can override the API URL using environment variables:

```bash
# .env file
NUXT_PUBLIC_API_URL=https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com
NUXT_PUBLIC_API_BASE_PATH=/Prod
NUXT_PUBLIC_COGNITO_USER_POOL_ID=eu-west-1_y1FDQpQ9b
NUXT_PUBLIC_COGNITO_CLIENT_ID=37a41hu5u7mlm6nbh9n3d23ogb
```

### Next Steps

1. Restart your frontend development server if running
2. Clear browser cache if needed
3. Test the application to ensure all API calls work

The frontend should now connect to the new API endpoint successfully!




