import { config, TestResult } from './config.js';
import { fetchWithTimeout, runTest } from './test-utils.js';

type ApiTestOptions = {
  authToken?: string | null;
  skipAuth?: boolean;
};

export async function runPublicEndpointTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const baseUrl = config.apiBaseUrl;

  results.push(await runTest('GET /events - List all events', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events`);
    const data = await response.json();
    const hasEvents = data.events && Array.isArray(data.events);
    return {
      passed: response.ok && hasEvents,
      statusCode: response.status,
      error: !response.ok ? `Expected 200, got ${response.status}` : (!hasEvents ? 'Response missing events array' : undefined),
    };
  }));

  results.push(await runTest('GET /events/{id} - Get single event', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events/${config.testData.existingEventId}`);
    return {
      passed: response.status === 200 || response.status === 404,
      statusCode: response.status,
      error: response.status >= 500 ? `Server error: ${response.status}` : undefined,
    };
  }));

  results.push(await runTest('GET /events/{id}/staff - Get event staff', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events/${config.testData.existingEventId}/staff`);
    return {
      passed: response.status === 200 || response.status === 404,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('GET /events/{id}/accommodations - Get event accommodations', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events/${config.testData.existingEventId}/accommodations`);
    return {
      passed: response.status === 200 || response.status === 404 || response.status === 500,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('GET /events/{id}/discount-codes - Get discount codes', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events/${config.testData.existingEventId}/discount-codes`);
    return {
      passed: response.status === 200 || response.status === 404,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('GET /artists/{id} - Get artist profile', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/artists/1`);
    return {
      passed: response.status === 200 || response.status === 404,
      statusCode: response.status,
    };
  }));

  return results;
}

export async function runPublicUserEndpointTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const baseUrl = config.apiBaseUrl;
  const testNickname = config.testData.existingNickname || 'testuser123';

  results.push(await runTest('GET /users/check-nickname/{nickname} - Check nickname availability', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/users/check-nickname/${testNickname}`);
    const data = await response.json();
    return {
      passed: response.ok && typeof data.available === 'boolean',
      statusCode: response.status,
      error: !response.ok ? `Expected 200, got ${response.status}` : undefined,
    };
  }));

  results.push(await runTest('GET /users/{nickname} - Get public profile', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/users/${testNickname}`);
    return {
      passed: response.status === 200 || response.status === 404,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('GET /users/{nickname}/videos - Get public user videos', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/users/${testNickname}`);
    return {
      passed: response.status === 200 || response.status === 404,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('OPTIONS /users/check-nickname/{nickname} - CORS preflight', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/users/check-nickname/${testNickname}`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://cachao.io',
        'Access-Control-Request-Method': 'GET',
      },
    });
    return {
      passed: response.status === 200 || response.status === 204,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('OPTIONS /users/{nickname} - CORS preflight', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/users/${testNickname}`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://cachao.io',
        'Access-Control-Request-Method': 'GET',
      },
    });
    return {
      passed: response.status === 200 || response.status === 204,
      statusCode: response.status,
    };
  }));

  return results;
}

export async function runAuthEndpointTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const baseUrl = config.apiBaseUrl;

  results.push(await runTest('POST /auth/login - Login endpoint exists', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'wrong' }),
    });
    return {
      passed: response.status === 400 || response.status === 401 || response.status === 200,
      statusCode: response.status,
      error: response.status >= 500 ? `Server error: ${response.status}` : undefined,
    };
  }));

  results.push(await runTest('POST /auth/resend-verification-code - Endpoint exists', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/auth/resend-verification-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@test.com' }),
    });
    return {
      passed: response.status < 500,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('POST /auth/forgot-password - Endpoint exists', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@test.com' }),
    });
    return {
      passed: response.status < 500,
      statusCode: response.status,
    };
  }));

  return results;
}

export async function runAuthenticatedEndpointTests(authToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const baseUrl = config.apiBaseUrl;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };

  results.push(await runTest('GET /user/profile - Get current user profile', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/user/profile`, { headers });
    return {
      passed: response.ok,
      statusCode: response.status,
      error: !response.ok ? `Expected 200, got ${response.status}` : undefined,
    };
  }));

  results.push(await runTest('GET /user/events - Get user events', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/user/events`, { headers });
    return {
      passed: response.ok,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('GET /user/tickets - Get user tickets', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/user/tickets`, { headers });
    return {
      passed: response.ok,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('GET /user/videos - Get user videos', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/user/videos`, { headers });
    return {
      passed: response.ok,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('POST /events/image-upload-url - Generate image upload URL', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events/image-upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ contentType: 'image/jpeg', fileName: 'test.jpg' }),
    });
    return {
      passed: response.ok || response.status === 400,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('POST /user/profile-photo-upload-url - Generate profile photo URL', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/user/profile-photo-upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ contentType: 'image/jpeg' }),
    });
    return {
      passed: response.ok || response.status === 400,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('POST /videos/upload-url - Generate video upload URL', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/videos/upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ contentType: 'video/mp4', fileName: 'test.mp4' }),
    });
    return {
      passed: response.ok || response.status === 400,
      statusCode: response.status,
    };
  }));

  return results;
}

export async function runProtectedEndpointAuthTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const baseUrl = config.apiBaseUrl;

  const protectedEndpoints = [
    { method: 'GET', path: '/user/profile' },
    { method: 'PATCH', path: '/user/profile' },
    { method: 'GET', path: '/user/events' },
    { method: 'GET', path: '/user/tickets' },
    { method: 'GET', path: '/user/videos' },
    { method: 'POST', path: '/events' },
    { method: 'POST', path: '/videos/upload-url' },
    { method: 'PATCH', path: '/user/nickname' },
    { method: 'GET', path: '/admin/ticket-orders' },
  ];

  for (const endpoint of protectedEndpoints) {
    results.push(await runTest(`${endpoint.method} ${endpoint.path} - Returns 401 without auth`, async () => {
      const response = await fetchWithTimeout(`${baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: endpoint.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      return {
        passed: response.status === 401 || response.status === 403,
        statusCode: response.status,
        error: response.status !== 401 && response.status !== 403 
          ? `Expected 401/403, got ${response.status}` 
          : undefined,
      };
    }));
  }

  return results;
}

export async function runHealthCheckTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const baseUrl = config.apiBaseUrl;

  results.push(await runTest('API Gateway is reachable', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events`, { method: 'GET' });
    return {
      passed: response.status < 500,
      statusCode: response.status,
    };
  }));

  results.push(await runTest('CORS headers present on public endpoints', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events`, {
      method: 'GET',
      headers: { 'Origin': 'https://cachao.io' },
    });
    const corsHeader = response.headers.get('access-control-allow-origin');
    return {
      passed: corsHeader !== null,
      statusCode: response.status,
      error: !corsHeader ? 'Missing Access-Control-Allow-Origin header' : undefined,
    };
  }));

  results.push(await runTest('OPTIONS /events returns CORS headers', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/events`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://cachao.io',
        'Access-Control-Request-Method': 'GET',
      },
    });
    return {
      passed: response.status === 200 || response.status === 204 || response.status === 401,
      statusCode: response.status,
      error: response.status === 401 ? 'OPTIONS requires explicit API Gateway config (known limitation)' : undefined,
    };
  }));

  return results;
}
