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

    // Create flights table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS flights (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          event_id BIGINT UNSIGNED NOT NULL,
          flight_number VARCHAR(20) NOT NULL,
          airline_code VARCHAR(10) NOT NULL,
          flight_type ENUM('departure', 'return') NOT NULL DEFAULT 'departure',
          departure_airport_code VARCHAR(10) NULL,
          departure_airport_name VARCHAR(200) NULL,
          departure_city VARCHAR(100) NULL,
          departure_date DATE NULL,
          departure_time TIME NULL,
          arrival_airport_code VARCHAR(10) NULL,
          arrival_airport_name VARCHAR(200) NULL,
          arrival_city VARCHAR(100) NULL,
          arrival_date DATE NULL,
          arrival_time TIME NULL,
          aircraft_type VARCHAR(50) NULL,
          status VARCHAR(50) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_event_id (event_id),
          INDEX idx_flight_type (flight_type),
          INDEX idx_departure_date (departure_date),
          FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);

    console.log('Flights table created successfully!');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully created flights table',
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

