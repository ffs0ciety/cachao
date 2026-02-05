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

    // Add date column to albums table if it doesn't exist
    try {
      await connection.query(`
        ALTER TABLE albums 
        ADD COLUMN IF NOT EXISTS album_date DATE NULL AFTER name
      `);
      console.log('Added album_date column to albums table');
    } catch (error: any) {
      // MariaDB doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
      // Check if column already exists
      const columns = await connection.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'albums' 
          AND COLUMN_NAME = 'album_date'
      `);
      
      if (Array.isArray(columns) && columns.length === 0) {
        // Column doesn't exist, add it
        await connection.query(`
          ALTER TABLE albums 
          ADD COLUMN album_date DATE NULL AFTER name
        `);
        console.log('Added album_date column to albums table');
      } else {
        console.log('album_date column already exists');
      }
    }

    // Drop old unique constraint if it exists
    try {
      await connection.query(`
        ALTER TABLE albums 
        DROP INDEX IF EXISTS unique_event_album_name
      `);
      console.log('Dropped old unique constraint');
    } catch (error: any) {
      // Index might not exist, that's okay
      console.log('Old unique constraint does not exist or could not be dropped');
    }

    // Add new unique constraint that includes date
    try {
      await connection.query(`
        ALTER TABLE albums 
        ADD UNIQUE KEY unique_event_album_name_date (event_id, name, album_date)
      `);
      console.log('Added new unique constraint with date');
    } catch (error: any) {
      // Constraint might already exist
      if (error.message?.includes('Duplicate key name')) {
        console.log('Unique constraint already exists');
      } else {
        throw error;
      }
    }

    // Add index on date for faster queries
    try {
      await connection.query(`
        ALTER TABLE albums 
        ADD INDEX IF NOT EXISTS idx_album_date (album_date)
      `);
      console.log('Added index on album_date');
    } catch (error: any) {
      // MariaDB doesn't support IF NOT EXISTS for ADD INDEX
      // Check if index already exists
      const indexes = await connection.query(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'albums' 
          AND INDEX_NAME = 'idx_album_date'
      `);
      
      if (Array.isArray(indexes) && indexes.length === 0) {
        await connection.query(`
          ALTER TABLE albums 
          ADD INDEX idx_album_date (album_date)
        `);
        console.log('Added index on album_date');
      } else {
        console.log('Index on album_date already exists');
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully added date column to albums table',
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





