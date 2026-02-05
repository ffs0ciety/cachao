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
      port: parseInt(process.env.DB_PORT || '3306'),
      connectionLimit: 5,
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
      allowPublicKeyRetrieval: isLocal,
    });

    connection = await pool.getConnection();

    // Check if artist_subcategories table already exists
    const artistSubcategoriesTable = await connection.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'artist_subcategories'
    `) as any[];

    if (Array.isArray(artistSubcategoriesTable) && artistSubcategoriesTable.length === 0) {
      // Create artist_subcategories table
      await connection.query(`
        CREATE TABLE artist_subcategories (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(50) NOT NULL UNIQUE,
          display_name VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_name (name)
        )
      `);
      console.log('Created artist_subcategories table successfully');

      // Insert default subcategories
      await connection.query(`
        INSERT INTO artist_subcategories (name, display_name) VALUES
        ('dj', 'DJ'),
        ('media', 'Media'),
        ('teacher', 'Teacher'),
        ('performer', 'Performer')
      `);
      console.log('Inserted default artist subcategories');
    } else {
      console.log('artist_subcategories table already exists');
    }

    // Check if event_staff_subcategories table already exists
    const junctionTable = await connection.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'event_staff_subcategories'
    `) as any[];

    if (Array.isArray(junctionTable) && junctionTable.length === 0) {
      // Create junction table for event_staff and artist_subcategories
      await connection.query(`
        CREATE TABLE event_staff_subcategories (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          staff_id BIGINT UNSIGNED NOT NULL,
          subcategory_id BIGINT UNSIGNED NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY unique_staff_subcategory (staff_id, subcategory_id),
          INDEX idx_staff_id (staff_id),
          INDEX idx_subcategory_id (subcategory_id),
          FOREIGN KEY (staff_id) REFERENCES event_staff(id) ON DELETE CASCADE,
          FOREIGN KEY (subcategory_id) REFERENCES artist_subcategories(id) ON DELETE CASCADE
        )
      `);
      console.log('Created event_staff_subcategories junction table successfully');
    } else {
      console.log('event_staff_subcategories table already exists');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully created artist subcategories tables',
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



