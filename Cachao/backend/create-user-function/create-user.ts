import { CognitoIdentityProviderClient, AdminCreateUserCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import mariadb from 'mariadb';

function getCognitoClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'eu-west-1',
  });
}

function getPool(): mariadb.Pool {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306');
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'cachao';

  const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';

  return mariadb.createPool({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 5,
    acquireTimeout: 15000,
    idleTimeout: 300000,
    minimumIdle: 2,
    ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
    allowPublicKeyRetrieval: isLocal,
  });
}

interface CreateUserEvent {
  email: string;
  name: string;
}

export const lambdaHandler = async (
  event: CreateUserEvent | string
): Promise<void> => {
  let connection: mariadb.PoolConnection | null = null;

  try {
    // Handle both direct Lambda invocation (object) and string payload
    let payload: CreateUserEvent;
    if (typeof event === 'string') {
      payload = JSON.parse(event);
    } else {
      payload = event;
    }

    const { email, name } = payload;

    if (!email || !name) {
      console.error('Email and name are required');
      return;
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
    if (!userPoolId) {
      console.error('Cognito User Pool ID not configured');
      return;
    }

    const cognito = getCognitoClient();

    // Check if user exists by email
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 1,
    });

    const listUsersResponse = await cognito.send(listUsersCommand);

    if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
      // User exists, get the sub
      const user = listUsersResponse.Users[0];
      const userCognitoSub = user.Attributes?.find((attr: any) => attr.Name === 'sub')?.Value || null;
      console.log(`User with email ${email} already exists in Cognito: ${userCognitoSub}`);
      return;
    }

    // User doesn't exist, create it
    console.log(`Creating new Cognito user for email: ${email}`);

    // Generate a temporary password (user will need to reset it)
    const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';

    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
      ],
      TemporaryPassword: tempPassword,
      // Omit MessageAction to send default welcome email with temporary password
      DesiredDeliveryMediums: ['EMAIL'],
    });

    const createUserResponse = await cognito.send(createUserCommand);
    const userCognitoSub = createUserResponse.User?.Attributes?.find((attr: any) => attr.Name === 'sub')?.Value || null;

    if (!userCognitoSub) {
      console.error('Failed to create user - no cognito_sub returned');
      return;
    }

    console.log(`Created new Cognito user: ${userCognitoSub}`);

    // Create user record in users table
    const pool = getPool();
    connection = await pool.getConnection();

    try {
      await connection.query(
        'INSERT INTO users (cognito_sub, name, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE name = ?',
        [userCognitoSub, name, name]
      );
      console.log(`Created user record in database: ${userCognitoSub}`);
    } catch (dbError: any) {
      console.error('Error creating user record in database:', dbError);
      // Continue anyway - user exists in Cognito
    }
  } catch (error: any) {
    console.error('Error creating user:', error);
  } finally {
    if (connection) {
      await connection.release();
    }
  }
};

