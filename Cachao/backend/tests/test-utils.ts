import { config, TestResult } from './config.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

export function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = config.timeoutMs
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runTest(
  name: string,
  testFn: () => Promise<{ passed: boolean; statusCode?: number; error?: string }>
): Promise<TestResult> {
  const start = Date.now();
  
  try {
    const result = await testFn();
    const duration = Date.now() - start;
    
    return {
      name,
      passed: result.passed,
      duration,
      statusCode: result.statusCode,
      error: result.error,
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      name,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function printTestResult(result: TestResult) {
  const icon = result.skipped ? '⏭️' : result.passed ? '✓' : '✗';
  const color = result.skipped ? 'yellow' : result.passed ? 'green' : 'red';
  const status = result.statusCode ? ` [${result.statusCode}]` : '';
  const duration = `${result.duration}ms`;
  
  log(`  ${icon} ${result.name}${status} (${duration})`, color);
  
  if (result.error && !result.passed) {
    log(`    └─ ${result.error}`, 'dim');
  }
}

export function printSuiteSummary(suites: { name: string; passed: number; failed: number; skipped: number; duration: number }[]) {
  console.log('\n' + '═'.repeat(60));
  log('TEST SUMMARY', 'cyan');
  console.log('═'.repeat(60));
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalDuration = 0;
  
  for (const suite of suites) {
    const icon = suite.failed > 0 ? '✗' : '✓';
    const color = suite.failed > 0 ? 'red' : 'green';
    log(`${icon} ${suite.name}: ${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped (${suite.duration}ms)`, color);
    
    totalPassed += suite.passed;
    totalFailed += suite.failed;
    totalSkipped += suite.skipped;
    totalDuration += suite.duration;
  }
  
  console.log('─'.repeat(60));
  const overallColor = totalFailed > 0 ? 'red' : 'green';
  log(`Total: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`, overallColor);
  log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'dim');
  
  return totalFailed === 0;
}

export async function getAuthToken(): Promise<string | null> {
  const { testUser, cognitoClientId } = config;
  
  if (!testUser.email || !testUser.password) {
    return null;
  }
  
  try {
    const response = await fetchWithTimeout(`${config.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });
    
    if (!response.ok) {
      console.error('Failed to get auth token:', await response.text());
      return null;
    }
    
    const data = await response.json();
    return data.accessToken || data.AccessToken || data.idToken || data.IdToken || null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}
