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
      connectionLimit: 1,
      ssl: isLocal ? false : { rejectUnauthorized: false },
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

    // Check if tickets table exists
    const checkTicketsTable = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tickets'
    `;

    const ticketsTableResult = await connection.query(checkTicketsTable) as any[];
    const ticketsTableExists = Array.isArray(ticketsTableResult) && ticketsTableResult.length > 0 && Number(ticketsTableResult[0]?.count || 0) > 0;

    if (!ticketsTableExists) {
      // Create tickets table
      await connection.query(`
        CREATE TABLE tickets (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          event_id BIGINT UNSIGNED NOT NULL,
          name VARCHAR(255) NOT NULL,
          price DECIMAL(10, 2) NOT NULL,
          image_url VARCHAR(500) NULL,
          max_quantity INT NULL,
          sold_quantity INT DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
          INDEX idx_event_id (event_id),
          INDEX idx_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Tickets table created successfully');
    } else {
      console.log('ℹ️  Tickets table already exists');
    }

    // Check if discount_codes table exists
    const checkDiscountCodesTable = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'discount_codes'
    `;

    const discountCodesTableResult = await connection.query(checkDiscountCodesTable) as any[];
    const discountCodesTableExists = Array.isArray(discountCodesTableResult) && discountCodesTableResult.length > 0 && Number(discountCodesTableResult[0]?.count || 0) > 0;

    if (!discountCodesTableExists) {
      // Create discount_codes table
      await connection.query(`
        CREATE TABLE discount_codes (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          event_id BIGINT UNSIGNED NOT NULL,
          code VARCHAR(50) NOT NULL,
          discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
          discount_value DECIMAL(10, 2) NOT NULL,
          max_uses INT NULL,
          used_count INT DEFAULT 0,
          valid_from TIMESTAMP NULL,
          valid_until TIMESTAMP NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
          UNIQUE KEY unique_event_code (event_id, code),
          INDEX idx_event_id (event_id),
          INDEX idx_code (code),
          INDEX idx_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Discount codes table created successfully');
    } else {
      console.log('ℹ️  Discount codes table already exists');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Tickets and discount codes tables migration executed successfully',
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

