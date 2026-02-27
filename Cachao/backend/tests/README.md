# Cachao API Tests

Automated API tests to verify all backend endpoints are working correctly.

## Quick Start

```bash
cd backend/tests
npm install
npm test
```

## Test Modes

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests (public + auth checks) |
| `npm run test:public` | Run only public endpoint tests |
| `npm run test:auth` | Run only authenticated endpoint tests |
| `npm run test:quick` | Run minimal health checks |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | API Gateway base URL | `https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod` |
| `TEST_USER_EMAIL` | Test user email for authenticated tests | - |
| `TEST_USER_PASSWORD` | Test user password | - |
| `TEST_EVENT_ID` | Existing event ID for testing | `1` |
| `TEST_NICKNAME` | Existing nickname for testing | `testuser` |

### Running with Auth

To run authenticated tests:

```bash
TEST_USER_EMAIL="your@email.com" TEST_USER_PASSWORD="yourpassword" npm test
```

### Custom API URL

To test against a different environment:

```bash
API_BASE_URL="https://your-api.execute-api.region.amazonaws.com/Prod" npm test
```

## Test Coverage

### Public Endpoints (No Auth Required)
- `GET /events` - List events
- `GET /events/{id}` - Get single event
- `GET /events/{id}/staff` - Get event staff
- `GET /events/{id}/accommodations` - Get accommodations
- `GET /events/{id}/discount-codes` - Get discount codes
- `GET /artists/{id}` - Get artist profile
- `GET /users/check-nickname/{nickname}` - Check nickname
- `GET /users/{nickname}` - Public profile
- `GET /users/{nickname}/videos` - User videos

### Auth Endpoints
- `POST /auth/login` - User login
- `POST /auth/resend-verification-code` - Resend code
- `POST /auth/forgot-password` - Password reset

### Protected Endpoints (Require Auth)
- `GET /user/profile` - Get profile
- `PATCH /user/profile` - Update profile
- `GET /user/events` - User's events
- `GET /user/tickets` - User's tickets
- `GET /user/videos` - User's videos
- `POST /events` - Create event
- `POST /videos/upload-url` - Get upload URL
- `PATCH /user/nickname` - Update nickname
- And more...

## CI/CD Integration

Add to your deployment pipeline:

```yaml
# GitHub Actions example
- name: Run API Tests
  run: |
    cd backend/tests
    npm ci
    npm test
  env:
    API_BASE_URL: ${{ secrets.API_BASE_URL }}
    TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
```

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed
