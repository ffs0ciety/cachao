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
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
      allowPublicKeyRetrieval: isLocal,
    });

    connection = await pool.getConnection();

    // Check if event_staff table already exists
    const tables = await connection.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'event_staff'
    `) as any[];

    if (Array.isArray(tables) && tables.length > 0) {
      console.log('event_staff table already exists');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'event_staff table already exists',
        }),
      };
    }

    // Create event_staff table
    await connection.query(`
      CREATE TABLE event_staff (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(200) NOT NULL,
        role ENUM('staff', 'artist') NOT NULL DEFAULT 'staff',
        email VARCHAR(255) NULL,
        phone VARCHAR(50) NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_event_id (event_id),
        INDEX idx_role (role),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);
    console.log('Created event_staff table successfully');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully created event_staff table',
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

