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

    // Check if staff_id column already exists
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'flights' 
      AND COLUMN_NAME = 'staff_id'
    `, [dbName]) as any[];

    if (columns && columns.length > 0) {
      console.log('Migration already completed - staff_id column exists');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'Migration already completed - flights table already linked to staff',
        }),
      };
    }

    // Step 1: Add staff_id column (nullable initially)
    console.log('Step 1: Adding staff_id column...');
    await connection.query(`
      ALTER TABLE flights 
      ADD COLUMN staff_id BIGINT UNSIGNED NULL AFTER event_id
    `);

    // Step 2: Create index on staff_id
    console.log('Step 2: Creating index on staff_id...');
    await connection.query(`
      CREATE INDEX idx_staff_id ON flights(staff_id)
    `);

    // Step 3: Note: We're not migrating existing data since the relationship is changing
    // Existing flights linked to events will need to be manually reassigned to staff members
    // For now, we'll leave event_id for backward compatibility during transition
    console.log('Step 3: Migration structure complete. Note: Existing flights need manual reassignment.');

    // Step 4: Add foreign key constraint to event_staff
    console.log('Step 4: Adding foreign key constraint...');
    try {
      await connection.query(`
        ALTER TABLE flights 
        ADD CONSTRAINT fk_flights_staff 
        FOREIGN KEY (staff_id) REFERENCES event_staff(id) ON DELETE CASCADE
      `);
    } catch (fkError: any) {
      // Foreign key might already exist or there might be data issues
      console.warn('Could not add foreign key constraint:', fkError.message);
    }

    console.log('Flights table migration completed successfully!');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully migrated flights table to link to staff/artists',
        note: 'Existing flights with event_id need to be manually reassigned to staff members',
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




