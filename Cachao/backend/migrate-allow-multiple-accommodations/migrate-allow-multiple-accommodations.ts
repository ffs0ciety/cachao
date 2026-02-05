import mariadb from 'mariadb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };
}

export const lambdaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: '',
    };
  }

  let connection: mariadb.PoolConnection | null = null;

  try {
    // Get database credentials from environment variables
    const dbHost = process.env.DB_HOST;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME || 'cachao';

    if (!dbHost || !dbUser || !dbPassword) {
      throw new Error('Database credentials not configured');
    }

    // Create database connection
    const isLocal = dbHost === 'host.docker.internal' || dbHost === 'localhost' || dbHost === '127.0.0.1';
    const pool = mariadb.createPool({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      connectionLimit: 5,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      allowPublicKeyRetrieval: isLocal,
    });

    connection = await pool.getConnection();

    // Check if unique constraint exists
    const [constraints] = await connection.query(`
      SELECT CONSTRAINT_NAME 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'accommodation_assignments' 
      AND CONSTRAINT_NAME = 'unique_accommodation_staff'
      AND CONSTRAINT_TYPE = 'UNIQUE'
    `, [dbName]) as any[];

    if (!constraints || constraints.length === 0) {
      console.log('Migration already completed - unique constraint does not exist');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'Migration already completed - multiple accommodations per staff member already allowed',
        }),
      };
    }

    // Remove the unique constraint to allow multiple accommodations per staff member
    console.log('Removing unique constraint to allow multiple accommodations per staff member...');
    await connection.query(`
      ALTER TABLE accommodation_assignments 
      DROP INDEX unique_accommodation_staff
    `);

    console.log('Migration completed successfully! Staff members can now have multiple accommodations.');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully removed unique constraint - staff members can now have multiple accommodations',
      }),
    };
  } catch (error: any) {
    console.error('Migration error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Migration failed',
      }),
    };
  } finally {
    if (connection) {
      await connection.release();
    }
  }
};




