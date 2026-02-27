#!/usr/bin/env npx tsx

import { config, TestResult, TestSuite } from './config.js';
import { log, printTestResult, printSuiteSummary, getAuthToken } from './test-utils.js';
import {
  runHealthCheckTests,
  runPublicEndpointTests,
  runPublicUserEndpointTests,
  runAuthEndpointTests,
  runProtectedEndpointAuthTests,
  runAuthenticatedEndpointTests,
} from './api-tests.js';

const args = process.argv.slice(2);
const runPublicOnly = args.includes('--public');
const runAuthOnly = args.includes('--auth');
const runQuick = args.includes('--quick');

async function runSuite(
  name: string,
  testFn: () => Promise<TestResult[]>
): Promise<TestSuite> {
  console.log('\n' + '─'.repeat(60));
  log(`📋 ${name}`, 'cyan');
  console.log('─'.repeat(60));

  const start = Date.now();
  const results = await testFn();
  const duration = Date.now() - start;

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of results) {
    printTestResult(result);
    if (result.skipped) {
      skipped++;
    } else if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  return { name, tests: results, passed, failed, skipped, duration };
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  log('🧪 CACHAO API TEST SUITE', 'cyan');
  console.log('═'.repeat(60));
  log(`API Base URL: ${config.apiBaseUrl}`, 'dim');
  log(`Mode: ${runQuick ? 'Quick' : runPublicOnly ? 'Public Only' : runAuthOnly ? 'Auth Only' : 'Full'}`, 'dim');

  const suites: TestSuite[] = [];

  // Health check tests (always run)
  suites.push(await runSuite('Health Check', runHealthCheckTests));

  if (!runAuthOnly) {
    // Public endpoint tests
    suites.push(await runSuite('Public Events API', runPublicEndpointTests));
    suites.push(await runSuite('Public Users API', runPublicUserEndpointTests));
    suites.push(await runSuite('Auth Endpoints', runAuthEndpointTests));
  }

  if (!runPublicOnly && !runQuick) {
    // Protected endpoint tests (verify 401 without auth)
    suites.push(await runSuite('Protected Endpoints (No Auth)', runProtectedEndpointAuthTests));
  }

  if (!runPublicOnly) {
    // Authenticated tests (if credentials provided)
    log('\n🔐 Attempting to get auth token...', 'dim');
    const authToken = await getAuthToken();

    if (authToken) {
      log('✓ Auth token obtained', 'green');
      suites.push(await runSuite('Authenticated Endpoints', () => runAuthenticatedEndpointTests(authToken)));
    } else {
      log('⚠ No auth token available - skipping authenticated tests', 'yellow');
      log('  Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables', 'dim');
      
      suites.push({
        name: 'Authenticated Endpoints',
        tests: [],
        passed: 0,
        failed: 0,
        skipped: 1,
        duration: 0,
      });
    }
  }

  // Print summary
  const allPassed = printSuiteSummary(suites);

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
