export const config = {
  apiBaseUrl: process.env.API_BASE_URL || 'https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod',
  
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || 'eu-west-1_y1FDQpQ9b',
  cognitoClientId: process.env.COGNITO_CLIENT_ID || '37a41hu5u7mlm6nbh9n3d23ogb',
  
  testUser: {
    email: process.env.TEST_USER_EMAIL || '',
    password: process.env.TEST_USER_PASSWORD || '',
  },
  
  testData: {
    existingEventId: process.env.TEST_EVENT_ID || '1',
    existingNickname: process.env.TEST_NICKNAME || 'testuser',
  },
  
  timeoutMs: 30000,
};

export type TestResult = {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  statusCode?: number;
  skipped?: boolean;
};

export type TestSuite = {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
};
