import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';

let pool: mariadb.Pool | null = null;

function getPool(): mariadb.Pool {
  if (!pool) {
    const host = process.env.DB_HOST;
    const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';
    pool = mariadb.createPool({
      host,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 1,
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
      allowPublicKeyRetrieval: isLocal,
    });
  }
  return pool;
}

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export const lambdaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: '',
    };
  }

  // Normalize path
  let path = event.path || '';
  if (path.startsWith('/Prod')) {
    path = path.substring(5);
  }
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  if (event.httpMethod !== 'DELETE' || path !== '/admin/delete-all-videos') {
    return {
      statusCode: 404,
      headers: getCorsHeaders(),
      body: JSON.stringify({ error: 'Not found' }),
    };
  }

  let connection: mariadb.PoolConnection | null = null;

  try {
    const dbPool = getPool();
    connection = await dbPool.getConnection();

    // Delete all videos
    const deleteResult = await connection.query('DELETE FROM videos');
    const countResult = await connection.query('SELECT COUNT(*) as count FROM videos');
    
    // Handle BigInt serialization
    const remainingCount = countResult && Array.isArray(countResult) && countResult.length > 0
      ? (typeof countResult[0].count === 'bigint' 
          ? Number(countResult[0].count) 
          : countResult[0].count)
      : 0;
    
    const deletedCount = deleteResult && (deleteResult as any).affectedRows 
      ? Number((deleteResult as any).affectedRows)
      : 0;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'All videos deleted',
        deleted_count: deletedCount,
        remaining_videos: remainingCount,
      }),
    };
  } catch (error: any) {
    console.error('Error deleting videos:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete videos',
      }),
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

