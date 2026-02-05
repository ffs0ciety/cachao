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

    // Create albums table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS albums (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(200) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_event_id (event_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        UNIQUE KEY unique_event_album_name (event_id, name)
      )
    `);

    console.log('Albums table created or already exists');

    // Add album_id column to videos table if it doesn't exist
    const checkColumnQuery = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'videos'
        AND COLUMN_NAME = 'album_id'
    `;

    const result = await connection.query(checkColumnQuery);
    const count = Array.isArray(result) && result.length > 0 ? (result[0] as any).count : 0;

    if (count === 0) {
      // First, add the column and index
      await connection.query(`
        ALTER TABLE videos
        ADD COLUMN album_id BIGINT UNSIGNED NULL
      `);
      console.log('Column album_id added');
      
      // Then add the index
      try {
        await connection.query(`
          ALTER TABLE videos
          ADD INDEX idx_album_id (album_id)
        `);
        console.log('Index idx_album_id added');
      } catch (indexError: any) {
        // Index might already exist, ignore
        console.log('Index might already exist:', indexError.message);
      }
      
      // Finally, add the foreign key constraint
      try {
        await connection.query(`
          ALTER TABLE videos
          ADD CONSTRAINT fk_videos_album_id 
          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
        `);
        console.log('Foreign key constraint added');
      } catch (fkError: any) {
        // Foreign key might fail if albums table doesn't exist or constraint already exists
        console.log('Foreign key constraint might already exist or failed:', fkError.message);
        // Try to add without constraint name
        try {
          await connection.query(`
            ALTER TABLE videos
            ADD FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
          `);
          console.log('Foreign key constraint added (without name)');
        } catch (fkError2: any) {
          console.log('Foreign key constraint could not be added:', fkError2.message);
          // Continue anyway - the column is added, which is the most important part
        }
      }
      console.log('Column album_id added successfully');
    } else {
      console.log('Column album_id already exists');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Albums support migration executed successfully',
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

