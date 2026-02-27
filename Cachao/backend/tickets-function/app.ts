import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as mariadb from 'mariadb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Stripe from 'stripe';

let pool: mariadb.Pool | null = null;
let s3Client: S3Client | null = null;
let stripeClient: Stripe | null = null;

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, Accept, Origin, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function getPool(): mariadb.Pool {
  if (!pool) {
    const host = process.env.DB_HOST || 'localhost';
    const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';
    pool = mariadb.createPool({
      host,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cachao',
      connectionLimit: 10,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectTimeout: 10000,
      acquireTimeout: 15000,
    });
  }
  return pool;
}

function getS3Client(): S3Client {
  if (!s3Client) s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-west-1' });
  return s3Client;
}

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');
    stripeClient = new Stripe(secretKey, { apiVersion: '2024-11-20.acacia' });
  }
  return stripeClient;
}

function jsonResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }, body: JSON.stringify(body) };
}

function getCognitoSub(event: APIGatewayProxyEvent): string | null {
  const claims = event.requestContext?.authorizer?.claims;
  return claims?.sub || claims?.['cognito:username'] || null;
}

function parseBody(event: APIGatewayProxyEvent): any {
  const bodyString = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf-8') : event.body || '{}';
  return JSON.parse(bodyString);
}

function serializeRow(row: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') result[key] = value.toString();
    else if ((key === 'price' || key === 'discount_value') && value !== null) result[key] = parseFloat(String(value));
    else if (key === 'is_active' && typeof value === 'number') result[key] = value === 1;
    else result[key] = value;
  }
  return result;
}

async function verifyEventOwner(connection: mariadb.PoolConnection, eventId: string, cognitoSub: string | null): Promise<{ ok: boolean; error?: APIGatewayProxyResult }> {
  if (!cognitoSub) return { ok: false, error: jsonResponse(401, { success: false, error: 'Authentication required' }) };
  const rows = await connection.query('SELECT id, cognito_sub FROM events WHERE id = ?', [eventId]) as any[];
  if (!rows.length) return { ok: false, error: jsonResponse(404, { success: false, error: 'Event not found' }) };
  if (rows[0].cognito_sub !== cognitoSub) return { ok: false, error: jsonResponse(403, { success: false, error: 'No permission' }) };
  return { ok: true };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('TicketsFunction:', event.httpMethod, event.path);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { message: 'CORS preflight' });

  let connection: mariadb.PoolConnection | null = null;
  try {
    connection = await getPool().getConnection();
    const cognitoSub = getCognitoSub(event);
    const path = event.path;
    const method = event.httpMethod;
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;
    const codeId = event.pathParameters?.codeId;

    // Tickets CRUD
    if (path.match(/^\/events\/\d+\/tickets$/) && method === 'GET') return await getEventTickets(connection, eventId!);
    if (path.match(/^\/events\/\d+\/tickets$/) && method === 'POST') return await addEventTicket(event, connection, cognitoSub, eventId!);
    if (path.match(/^\/events\/\d+\/tickets\/\d+$/) && method === 'PUT') return await updateEventTicket(event, connection, cognitoSub, eventId!, ticketId!);
    if (path.match(/^\/events\/\d+\/tickets\/\d+$/) && method === 'DELETE') return await deleteEventTicket(connection, cognitoSub, eventId!, ticketId!);
    if (path.match(/^\/events\/\d+\/tickets\/\d+\/image-upload-url$/) && method === 'POST') return await generateTicketImageUploadUrl(event, connection, cognitoSub, eventId!, ticketId!);

    // Discount codes CRUD
    if (path.match(/^\/events\/\d+\/discount-codes$/) && method === 'GET') return await getEventDiscountCodes(connection, eventId!);
    if (path.match(/^\/events\/\d+\/discount-codes$/) && method === 'POST') return await addEventDiscountCode(event, connection, cognitoSub, eventId!);
    if (path.match(/^\/events\/\d+\/discount-codes\/\d+$/) && method === 'PUT') return await updateEventDiscountCode(event, connection, cognitoSub, eventId!, codeId!);
    if (path.match(/^\/events\/\d+\/discount-codes\/\d+$/) && method === 'DELETE') return await deleteEventDiscountCode(connection, cognitoSub, eventId!, codeId!);

    // Ticket orders
    if (path.match(/^\/events\/\d+\/ticket-orders$/) && method === 'GET') return await getEventTicketOrders(connection, cognitoSub, eventId!);
    if (path.match(/^\/events\/\d+\/ticket-orders\/\d+\/validate$/) && method === 'PATCH') return await updateTicketOrderValidated(event, connection, cognitoSub, eventId!);

    // Checkout
    if (path === '/tickets/checkout' && method === 'POST') return await createTicketCheckoutSession(event, connection, cognitoSub);

    return jsonResponse(404, { success: false, error: 'Route not found' });
  } catch (error: any) {
    console.error('TicketsFunction error:', error);
    return jsonResponse(500, { success: false, error: error.message || 'Internal server error' });
  } finally {
    if (connection) try { await connection.release(); } catch (e) {}
  }
};

async function getEventTickets(connection: mariadb.PoolConnection, eventId: string): Promise<APIGatewayProxyResult> {
  const tickets = await connection.query(
    'SELECT id, event_id, name, price, image_url, max_quantity, sold_quantity, is_active, created_at FROM tickets WHERE event_id = ? ORDER BY created_at DESC',
    [eventId]
  ) as any[];
  return jsonResponse(200, { success: true, tickets: tickets.map(serializeRow) });
}

async function addEventTicket(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { name, price, image_url, max_quantity } = body;
  if (!name || price === undefined) return jsonResponse(400, { success: false, error: 'Name and price are required' });

  const result = await connection.query(
    'INSERT INTO tickets (event_id, name, price, image_url, max_quantity, sold_quantity, is_active) VALUES (?, ?, ?, ?, ?, 0, TRUE)',
    [eventId, name, price, image_url || null, max_quantity || null]
  ) as any;

  return jsonResponse(201, { success: true, ticket: { id: result.insertId.toString(), event_id: eventId, name, price: parseFloat(price), image_url, max_quantity, sold_quantity: 0, is_active: true } });
}

async function updateEventTicket(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, ticketId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.price !== undefined) { updates.push('price = ?'); values.push(body.price); }
  if (body.image_url !== undefined) { updates.push('image_url = ?'); values.push(body.image_url); }
  if (body.max_quantity !== undefined) { updates.push('max_quantity = ?'); values.push(body.max_quantity); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }

  if (updates.length) {
    updates.push('updated_at = NOW()');
    values.push(ticketId, eventId);
    await connection.query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`, values);
  }

  const rows = await connection.query('SELECT * FROM tickets WHERE id = ?', [ticketId]) as any[];
  return jsonResponse(200, { success: true, ticket: serializeRow(rows[0]) });
}

async function deleteEventTicket(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, ticketId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;
  await connection.query('DELETE FROM tickets WHERE id = ? AND event_id = ?', [ticketId, eventId]);
  return jsonResponse(200, { success: true, message: 'Ticket deleted' });
}

async function generateTicketImageUploadUrl(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, ticketId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { filename, mime_type } = body;
  if (!filename) return jsonResponse(400, { success: false, error: 'filename is required' });

  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) return jsonResponse(500, { success: false, error: 'S3 bucket not configured' });

  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const s3Key = `events/${eventId}/tickets/${ticketId}/${Date.now()}-${sanitizedFilename}`;
  const s3 = getS3Client();
  const presignedUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucketName, Key: s3Key, ContentType: mime_type || 'image/jpeg' }), { expiresIn: 3600 });
  const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

  return jsonResponse(200, { success: true, upload_url: presignedUrl, s3_key: s3Key, s3_url: s3Url });
}

async function getEventDiscountCodes(connection: mariadb.PoolConnection, eventId: string): Promise<APIGatewayProxyResult> {
  const codes = await connection.query(
    'SELECT id, event_id, code, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active FROM discount_codes WHERE event_id = ? ORDER BY created_at DESC',
    [eventId]
  ) as any[];
  return jsonResponse(200, { success: true, discount_codes: codes.map(serializeRow) });
}

async function addEventDiscountCode(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { code, discount_type, discount_value, max_uses, valid_from, valid_until } = body;
  if (!code || !discount_type || discount_value === undefined) return jsonResponse(400, { success: false, error: 'code, discount_type, discount_value required' });
  if (discount_type !== 'percentage' && discount_type !== 'fixed') return jsonResponse(400, { success: false, error: 'discount_type must be percentage or fixed' });

  const result = await connection.query(
    'INSERT INTO discount_codes (event_id, code, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active) VALUES (?, ?, ?, ?, ?, 0, ?, ?, TRUE)',
    [eventId, code.toUpperCase(), discount_type, discount_value, max_uses || null, valid_from || null, valid_until || null]
  ) as any;

  return jsonResponse(201, { success: true, discount_code: { id: result.insertId.toString(), event_id: eventId, code: code.toUpperCase(), discount_type, discount_value: parseFloat(discount_value), max_uses, used_count: 0, valid_from, valid_until, is_active: true } });
}

async function updateEventDiscountCode(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, codeId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const updates: string[] = [];
  const values: any[] = [];

  if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.toUpperCase()); }
  if (body.discount_type !== undefined) { updates.push('discount_type = ?'); values.push(body.discount_type); }
  if (body.discount_value !== undefined) { updates.push('discount_value = ?'); values.push(body.discount_value); }
  if (body.max_uses !== undefined) { updates.push('max_uses = ?'); values.push(body.max_uses); }
  if (body.valid_from !== undefined) { updates.push('valid_from = ?'); values.push(body.valid_from); }
  if (body.valid_until !== undefined) { updates.push('valid_until = ?'); values.push(body.valid_until); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }

  if (updates.length) {
    updates.push('updated_at = NOW()');
    values.push(codeId, eventId);
    await connection.query(`UPDATE discount_codes SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`, values);
  }

  const rows = await connection.query('SELECT * FROM discount_codes WHERE id = ?', [codeId]) as any[];
  return jsonResponse(200, { success: true, discount_code: serializeRow(rows[0]) });
}

async function deleteEventDiscountCode(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, codeId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;
  await connection.query('DELETE FROM discount_codes WHERE id = ? AND event_id = ?', [codeId, eventId]);
  return jsonResponse(200, { success: true, message: 'Discount code deleted' });
}

async function getEventTicketOrders(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const orders = await connection.query(
    `SELECT tord.*, t.name as ticket_name FROM ticket_orders tord 
     LEFT JOIN tickets t ON tord.ticket_id = t.id 
     WHERE tord.event_id = ? ORDER BY tord.created_at DESC`,
    [eventId]
  ) as any[];

  return jsonResponse(200, { success: true, orders: orders.map(serializeRow) });
}

async function updateTicketOrderValidated(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const orderId = event.pathParameters?.orderId;
  const body = parseBody(event);
  const { validated } = body;

  await connection.query('UPDATE ticket_orders SET validated = ?, updated_at = NOW() WHERE id = ? AND event_id = ?', [validated ? 1 : 0, orderId, eventId]);
  const rows = await connection.query('SELECT * FROM ticket_orders WHERE id = ?', [orderId]) as any[];
  return jsonResponse(200, { success: true, order: serializeRow(rows[0]) });
}

async function createTicketCheckoutSession(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const { event_id, ticket_id, quantity, discount_code, success_url, cancel_url } = body;

  if (!event_id || !ticket_id || !quantity) return jsonResponse(400, { success: false, error: 'event_id, ticket_id, quantity required' });

  const tickets = await connection.query('SELECT * FROM tickets WHERE id = ? AND event_id = ?', [ticket_id, event_id]) as any[];
  if (!tickets.length) return jsonResponse(404, { success: false, error: 'Ticket not found' });
  
  const ticket = tickets[0];
  if (!ticket.is_active) return jsonResponse(400, { success: false, error: 'Ticket not available' });
  if (ticket.max_quantity && ticket.sold_quantity + quantity > ticket.max_quantity) {
    return jsonResponse(400, { success: false, error: 'Not enough tickets available' });
  }

  let unitPrice = parseFloat(ticket.price);
  let discountAmount = 0;

  if (discount_code) {
    const codes = await connection.query(
      'SELECT * FROM discount_codes WHERE event_id = ? AND code = ? AND is_active = 1',
      [event_id, discount_code.toUpperCase()]
    ) as any[];

    if (codes.length) {
      const dc = codes[0];
      if (dc.discount_type === 'percentage') discountAmount = unitPrice * (parseFloat(dc.discount_value) / 100);
      else discountAmount = parseFloat(dc.discount_value);
    }
  }

  const finalPrice = Math.max(0, unitPrice - discountAmount);
  const totalAmount = finalPrice * quantity;

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: ticket.name },
        unit_amount: Math.round(finalPrice * 100),
      },
      quantity,
    }],
    mode: 'payment',
    success_url: success_url || 'https://cachao.io/checkout/success',
    cancel_url: cancel_url || 'https://cachao.io/checkout/cancel',
    metadata: { event_id: String(event_id), ticket_id: String(ticket_id), quantity: String(quantity), cognito_sub: cognitoSub || '' },
  });

  const claims = event.requestContext?.authorizer?.claims;
  const email = claims?.email || null;

  await connection.query(
    `INSERT INTO ticket_orders (event_id, ticket_id, cognito_sub, email, quantity, unit_price, discount_amount, total_amount, status, stripe_checkout_session_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
    [event_id, ticket_id, cognitoSub, email, quantity, unitPrice, discountAmount * quantity, totalAmount, session.id]
  );

  return jsonResponse(200, { success: true, checkout_url: session.url, session_id: session.id });
}
