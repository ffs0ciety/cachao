import { PostConfirmationTriggerHandler } from 'aws-lambda';
import mariadb from 'mariadb';

let pool: mariadb.Pool | null = null;

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
      connectionLimit: 5,
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
      allowPublicKeyRetrieval: isLocal,
      connectTimeout: 10000,
    });
  }
  return pool;
}

/**
 * PostConfirmation Lambda Trigger
 * This is automatically called by Cognito after a user confirms their email
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('PostConfirmation trigger called:', JSON.stringify(event, null, 2));

  // Only process sign-up confirmations, not password resets
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    console.log('Not a sign-up confirmation, skipping');
    return event;
  }

  const cognitoSub = event.request.userAttributes.sub;
  const email = event.request.userAttributes.email;
  const name = event.request.userAttributes.name || email?.split('@')[0] || 'User';

  if (!cognitoSub) {
    console.error('No cognito_sub found in event');
    return event;
  }

  let connection: mariadb.PoolConnection | null = null;

  try {
    const dbPool = getPool();
    connection = await dbPool.getConnection();

    // Create user record in database
    await connection.query(
      'INSERT INTO users (cognito_sub, name, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE name = ?',
      [cognitoSub, name, name]
    );

    console.log(`✅ Created user record in database: ${cognitoSub} (${email})`);
  } catch (error: any) {
    console.error('❌ Error creating user record in database:', error);
    // Don't fail the confirmation - user is already in Cognito
    // Just log the error
  } finally {
    if (connection) {
      await connection.release();
    }
  }

  return event;
};




