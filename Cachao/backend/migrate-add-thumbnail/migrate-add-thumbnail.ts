import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';

let pool: mariadb.Pool | null = null;

function getPool(): mariadb.Pool {
  if (!pool) {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306');
    const user = process.env.DB_USER || 'admin';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'cachao';

    console.log(`Connecting to database: ${user}@${host}:${port}/${database}`);

    const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';

    pool = mariadb.createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 1, // Only one connection needed for migration
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
      allowPublicKeyRetrieval: isLocal,
      connectTimeout: 10000,
    });
  }
  return pool;
}

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain',
        ...getCorsHeaders(),
      },
      body: 'OK',
    };
  }

  let connection: mariadb.PoolConnection | null = null;
  try {
    connection = await getPool().getConnection();

    // Check if thumbnail_url column exists
    const checkColumnQuery = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'videos'
        AND COLUMN_NAME = 'thumbnail_url'
    `;

    const result = await connection.query(checkColumnQuery);
    const count = Array.isArray(result) && result.length > 0 ? (result[0] as any).count : 0;

    if (count === 0) {
      // Add thumbnail_url column
      await connection.query(`
        ALTER TABLE videos
        ADD COLUMN thumbnail_url VARCHAR(500) NULL
      `);
      console.log('Column thumbnail_url added successfully');

      // Add index for better query performance
      await connection.query(`
        ALTER TABLE videos
        ADD INDEX idx_thumbnail_url (thumbnail_url)
      `);
      console.log('Index idx_thumbnail_url added successfully');
    } else {
      console.log('Column thumbnail_url already exists');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Thumbnail URL column migration executed successfully',
      }),
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        message: 'Migration failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
};





