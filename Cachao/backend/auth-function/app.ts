import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as mariadb from 'mariadb';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

let pool: mariadb.Pool | null = null;
let cognitoClient: CognitoIdentityProviderClient | null = null;

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, Accept, Origin, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function getPool(): mariadb.Pool {
  if (!pool) {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306');
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'cachao';
    const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';

    pool = mariadb.createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 10,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectTimeout: 10000,
      acquireTimeout: 15000,
    });
  }
  return pool;
}

function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
    });
  }
  return cognitoClient;
}

function jsonResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
    body: JSON.stringify(body),
  };
}

function parseBody(event: APIGatewayProxyEvent): any {
  if (!event.body) return {};
  try {
    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return JSON.parse(bodyString);
  } catch {
    return null;
  }
}

function getCognitoSub(event: APIGatewayProxyEvent): string | null {
  const claims = event.requestContext?.authorizer?.claims;
  if (claims) {
    return claims.sub || claims['cognito:username'] || null;
  }
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.sub || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function login(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (body === null) return jsonResponse(400, { success: false, error: 'Invalid JSON in request body' });

  const email = (body.email || body.username)?.toLowerCase().trim();
  const password = body.password;
  const newPassword = body.newPassword;
  const session = body.session;

  if (!email || !password) {
    return jsonResponse(400, { success: false, error: 'Email and password are required' });
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID;

  if (!userPoolId || !clientId) {
    return jsonResponse(500, { success: false, error: 'Cognito configuration missing' });
  }

  const cognito = getCognitoClient();

  if (session && newPassword) {
    try {
      const respondCommand = new RespondToAuthChallengeCommand({
        ClientId: clientId,
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        Session: session,
        ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
      });
      const respondResponse = await cognito.send(respondCommand);
      if (respondResponse.AuthenticationResult) {
        return jsonResponse(200, {
          success: true,
          tokens: {
            idToken: respondResponse.AuthenticationResult.IdToken,
            accessToken: respondResponse.AuthenticationResult.AccessToken,
            refreshToken: respondResponse.AuthenticationResult.RefreshToken,
            expiresIn: respondResponse.AuthenticationResult.ExpiresIn,
          },
          message: 'Password changed successfully. Login successful.',
        });
      }
    } catch (error: any) {
      return jsonResponse(400, { success: false, error: error.message || 'Failed to set new password', code: error.name });
    }
  }

  try {
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    const authResponse = await cognito.send(authCommand);

    if (authResponse.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return jsonResponse(200, {
        success: false,
        challenge: authResponse.ChallengeName,
        session: authResponse.Session,
        message: 'New password required. Please provide a new password.',
        requiresNewPassword: true,
      });
    }

    if (authResponse.AuthenticationResult) {
      return jsonResponse(200, {
        success: true,
        tokens: {
          idToken: authResponse.AuthenticationResult.IdToken,
          accessToken: authResponse.AuthenticationResult.AccessToken,
          refreshToken: authResponse.AuthenticationResult.RefreshToken,
          expiresIn: authResponse.AuthenticationResult.ExpiresIn,
        },
        message: 'Login successful',
      });
    }

    return jsonResponse(500, { success: false, error: 'Authentication failed - no tokens received' });
  } catch (error: any) {
    const errorMap: Record<string, { message: string; status: number }> = {
      NotAuthorizedException: { message: 'Incorrect email or password', status: 401 },
      UserNotFoundException: { message: 'User not found', status: 401 },
      UserNotConfirmedException: { message: 'User account is not confirmed', status: 403 },
      PasswordResetRequiredException: { message: 'Password reset required', status: 403 },
      TooManyRequestsException: { message: 'Too many login attempts', status: 429 },
    };
    const mapped = errorMap[error.name] || { message: error.message || 'Authentication failed', status: 401 };
    return jsonResponse(mapped.status, { success: false, error: mapped.message, code: error.name });
  }
}

async function forgotPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (body === null) return jsonResponse(400, { success: false, error: 'Invalid JSON in request body' });

  const email = (body.email || body.username)?.toLowerCase().trim();
  if (!email) return jsonResponse(400, { success: false, error: 'Email is required' });

  const clientId = process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID;
  if (!clientId) return jsonResponse(500, { success: false, error: 'Cognito configuration missing' });

  const cognito = getCognitoClient();

  try {
    await cognito.send(new ForgotPasswordCommand({ ClientId: clientId, Username: email }));
    return jsonResponse(200, { success: true, message: 'Password reset code has been sent to your email.' });
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      return jsonResponse(200, { success: true, message: 'If an account exists with this email, a password reset code has been sent.' });
    }
    if (error.name === 'LimitExceededException') {
      return jsonResponse(429, { success: false, error: 'Too many requests. Please try again later.' });
    }
    return jsonResponse(500, { success: false, error: error.message || 'Failed to initiate password reset' });
  }
}

async function confirmForgotPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (body === null) return jsonResponse(400, { success: false, error: 'Invalid JSON in request body' });

  const email = (body.email || body.username)?.toLowerCase().trim();
  const code = body.code || body.confirmationCode;
  const newPassword = body.newPassword || body.password;

  if (!email || !code || !newPassword) {
    return jsonResponse(400, { success: false, error: 'Email, code, and new password are required' });
  }

  const clientId = process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID;
  if (!clientId) return jsonResponse(500, { success: false, error: 'Cognito configuration missing' });

  const cognito = getCognitoClient();

  try {
    await cognito.send(new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }));
    return jsonResponse(200, { success: true, message: 'Password has been reset successfully.' });
  } catch (error: any) {
    const errorMap: Record<string, { message: string; status: number }> = {
      CodeMismatchException: { message: 'Invalid or expired verification code', status: 400 },
      ExpiredCodeException: { message: 'Verification code has expired', status: 400 },
      InvalidPasswordException: { message: 'Password does not meet requirements', status: 400 },
      UserNotFoundException: { message: 'User not found', status: 404 },
    };
    const mapped = errorMap[error.name] || { message: error.message || 'Failed to reset password', status: 400 };
    return jsonResponse(mapped.status, { success: false, error: mapped.message, code: error.name });
  }
}

async function resendVerificationCode(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  if (body === null) return jsonResponse(400, { success: false, error: 'Invalid JSON in request body' });

  const email = body.email?.toLowerCase().trim();
  if (!email) return jsonResponse(400, { success: false, error: 'Email is required' });

  const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
  if (!userPoolId) return jsonResponse(500, { success: false, error: 'Cognito User Pool ID not configured' });

  const cognito = getCognitoClient();

  try {
    const listUsersResponse = await cognito.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '\\"')}"`,
      Limit: 1,
    }));

    if (!listUsersResponse.Users?.length) {
      return jsonResponse(404, { success: false, error: 'User not found' });
    }

    const username = listUsersResponse.Users[0].Username || email;
    const userResponse = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username }));

    if (userResponse.UserStatus === 'CONFIRMED') {
      return jsonResponse(400, { success: false, error: 'User is already confirmed' });
    }

    await cognito.send(new AdminResetUserPasswordCommand({ UserPoolId: userPoolId, Username: username }));
    return jsonResponse(200, { success: true, message: 'A new temporary password has been sent to your email.' });
  } catch (error: any) {
    return jsonResponse(500, { success: false, error: error.message || 'Failed to resend verification code' });
  }
}

async function adminResetPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const cognitoSub = getCognitoSub(event);
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });

  const body = parseBody(event);
  if (body === null) return jsonResponse(400, { success: false, error: 'Invalid JSON in request body' });

  const email = body.email;
  if (!email) return jsonResponse(400, { success: false, error: 'Email is required' });

  const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
  if (!userPoolId) return jsonResponse(500, { success: false, error: 'Cognito User Pool ID not configured' });

  const cognito = getCognitoClient();

  try {
    const listUsersResponse = await cognito.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '\\"')}"`,
      Limit: 1,
    }));

    if (!listUsersResponse.Users?.length) {
      return jsonResponse(404, { success: false, error: 'User not found' });
    }

    const username = listUsersResponse.Users[0].Username || email;

    const generateTempPassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let password = 'Aa1!';
      for (let i = 4; i < 12; i++) password += chars[Math.floor(Math.random() * chars.length)];
      return password.split('').sort(() => Math.random() - 0.5).join('');
    };

    const tempPassword = generateTempPassword();
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: tempPassword,
      Permanent: false,
    }));

    return jsonResponse(200, {
      success: true,
      message: 'Password has been reset.',
      temporaryPassword: tempPassword,
      email: email,
    });
  } catch (error: any) {
    return jsonResponse(500, { success: false, error: error.message || 'Failed to reset password' });
  }
}

async function markEmailAsVerified(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const cognitoSub = getCognitoSub(event);
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });

  const body = parseBody(event);
  if (body === null) return jsonResponse(400, { success: false, error: 'Invalid JSON in request body' });

  const email = body.email;
  if (!email) return jsonResponse(400, { success: false, error: 'Email is required' });

  const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
  if (!userPoolId) return jsonResponse(500, { success: false, error: 'Cognito User Pool ID not configured' });

  const cognito = getCognitoClient();

  try {
    const listUsersResponse = await cognito.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '\\"')}"`,
      Limit: 1,
    }));

    if (!listUsersResponse.Users?.length) {
      return jsonResponse(404, { success: false, error: 'User not found' });
    }

    const username = listUsersResponse.Users[0].Username || email;
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
    }));

    return jsonResponse(200, { success: true, message: `Email verified successfully for ${email}` });
  } catch (error: any) {
    return jsonResponse(500, { success: false, error: error.message || 'Failed to mark email as verified' });
  }
}

async function getAllTicketOrders(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const cognitoSub = getCognitoSub(event);
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });

  let connection: mariadb.PoolConnection | null = null;
  try {
    connection = await getPool().getConnection();
    const orders = await connection.query(
      `SELECT o.*, e.name as event_name, t.name as ticket_name, t.price as ticket_price
       FROM ticket_orders o
       LEFT JOIN events e ON o.event_id = e.id
       LEFT JOIN tickets t ON o.ticket_id = t.id
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
    return jsonResponse(200, { success: true, orders });
  } catch (error: any) {
    return jsonResponse(500, { success: false, error: error.message || 'Failed to get ticket orders' });
  } finally {
    if (connection) connection.release();
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Auth handler invoked', { method: event.httpMethod, path: event.path });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: getCorsHeaders(), body: '' };
  }

  const path = event.path.replace(/^\/Prod/, '').replace(/\/$/, '') || '/';
  const method = event.httpMethod;

  try {
    // POST /auth/login
    if (method === 'POST' && path === '/auth/login') {
      return await login(event);
    }

    // POST /auth/forgot-password
    if (method === 'POST' && path === '/auth/forgot-password') {
      return await forgotPassword(event);
    }

    // POST /auth/confirm-forgot-password
    if (method === 'POST' && path === '/auth/confirm-forgot-password') {
      return await confirmForgotPassword(event);
    }

    // POST /auth/resend-verification-code
    if (method === 'POST' && path === '/auth/resend-verification-code') {
      return await resendVerificationCode(event);
    }

    // POST /admin/reset-password
    if (method === 'POST' && path === '/admin/reset-password') {
      return await adminResetPassword(event);
    }

    // POST /admin/mark-email-verified
    if (method === 'POST' && path === '/admin/mark-email-verified') {
      return await markEmailAsVerified(event);
    }

    // GET /admin/ticket-orders
    if (method === 'GET' && path === '/admin/ticket-orders') {
      return await getAllTicketOrders(event);
    }

    return jsonResponse(404, { success: false, error: `Route not found: ${method} ${path}` });
  } catch (error: any) {
    console.error('Handler error:', error);
    return jsonResponse(500, { success: false, error: error.message || 'Internal server error' });
  }
};
