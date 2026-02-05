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

    // Check if accommodations table already exists
    const [tables] = await connection.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 'accommodations'
    `, [dbName]) as any[];

    if (tables && tables.length > 0) {
      console.log('accommodations table already exists');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'accommodations table already exists',
        }),
      };
    }

    // Create accommodations table (just the place/hotel info)
    await connection.query(`
      CREATE TABLE accommodations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_id BIGINT UNSIGNED NOT NULL,
        accommodation_type ENUM('hotel', 'airbnb', 'apartment', 'other') NOT NULL DEFAULT 'hotel',
        name VARCHAR(200) NOT NULL,
        address VARCHAR(500) NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_event_id (event_id),
        INDEX idx_accommodation_type (accommodation_type),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);
    console.log('Created accommodations table successfully');

    // Create accommodation_assignments table (with person-specific details)
    await connection.query(`
      CREATE TABLE accommodation_assignments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        accommodation_id BIGINT UNSIGNED NOT NULL,
        staff_id BIGINT UNSIGNED NOT NULL,
        room_number VARCHAR(50) NULL,
        board_type ENUM('none', 'breakfast', 'half_board', 'full_board', 'all_inclusive') NULL DEFAULT 'none',
        check_in_date DATE NULL,
        check_out_date DATE NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_accommodation_staff (accommodation_id, staff_id),
        INDEX idx_accommodation_id (accommodation_id),
        INDEX idx_staff_id (staff_id),
        INDEX idx_check_in_date (check_in_date),
        FOREIGN KEY (accommodation_id) REFERENCES accommodations(id) ON DELETE CASCADE,
        FOREIGN KEY (staff_id) REFERENCES event_staff(id) ON DELETE CASCADE
      )
    `);
    console.log('Created accommodation_assignments table successfully');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully created accommodations and accommodation_assignments tables',
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

