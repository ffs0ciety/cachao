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

    // Check if ticket_orders table exists
    const checkTable = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ticket_orders'
    `;

    const tableResult = await connection.query(checkTable) as any[];
    const tableExists = Array.isArray(tableResult) && tableResult.length > 0 && Number(tableResult[0]?.count || 0) > 0;

    if (!tableExists) {
      // Create ticket_orders table
      await connection.query(`
        CREATE TABLE ticket_orders (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          event_id BIGINT UNSIGNED NOT NULL,
          ticket_id BIGINT UNSIGNED NOT NULL,
          user_id BIGINT UNSIGNED NULL,
          cognito_sub VARCHAR(255) NULL,
          email VARCHAR(255) NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          unit_price DECIMAL(10, 2) NOT NULL,
          discount_amount DECIMAL(10, 2) DEFAULT 0,
          discount_code_id BIGINT UNSIGNED NULL,
          total_amount DECIMAL(10, 2) NOT NULL,
          stripe_payment_intent_id VARCHAR(255) NULL,
          stripe_checkout_session_id VARCHAR(255) NULL,
          status ENUM('pending', 'paid', 'failed', 'cancelled') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
          FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE SET NULL,
          INDEX idx_event_id (event_id),
          INDEX idx_ticket_id (ticket_id),
          INDEX idx_stripe_payment_intent_id (stripe_payment_intent_id),
          INDEX idx_stripe_checkout_session_id (stripe_checkout_session_id),
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Ticket orders table created successfully');
    } else {
      console.log('ℹ️  Ticket orders table already exists');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Ticket orders table migration executed successfully',
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

