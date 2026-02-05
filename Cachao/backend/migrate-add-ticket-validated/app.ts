import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';

function getPool() {
  const host = process.env.DB_HOST;
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  if (!host || !user || !password || !database) {
    throw new Error('Missing DB_HOST, DB_USER, DB_PASSWORD, or DB_NAME');
  }
  return mariadb.createPool({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 2,
  });
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
  };
}

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain', ...getCorsHeaders() },
      body: 'OK',
    };
  }

  let connection: mariadb.PoolConnection | null = null;
  try {
    const pool = getPool();
    connection = await pool.getConnection();

    const dbName = process.env.DB_NAME || 'cachao';
    const checkColumn = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'ticket_orders'
        AND COLUMN_NAME = 'validated_at'
    `;
    const result = await connection.query(checkColumn, [dbName]) as any[];
    const exists = Array.isArray(result) && result.length > 0 && Number(result[0]?.count || 0) > 0;

    if (!exists) {
      await connection.query(`
        ALTER TABLE ticket_orders
        ADD COLUMN validated_at TIMESTAMP NULL DEFAULT NULL AFTER status
      `);
      console.log('✅ Added validated_at to ticket_orders');
    } else {
      console.log('ℹ️  validated_at column already exists on ticket_orders');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({
        success: true,
        message: 'ticket_orders.validated_at migration completed',
      }),
    };
  } catch (err: any) {
    console.error('Migration failed:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({
        success: false,
        message: 'Migration failed',
        error: err?.message || String(err),
      }),
    };
  } finally {
    if (connection) connection.release();
  }
};
