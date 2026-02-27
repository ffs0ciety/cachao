import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as mariadb from 'mariadb';
import axios from 'axios';

let pool: mariadb.Pool | null = null;

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
    else if (value instanceof Date) result[key] = value.toISOString();
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
  console.log('StaffFunction:', event.httpMethod, event.path);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { message: 'CORS preflight' });

  let connection: mariadb.PoolConnection | null = null;
  try {
    connection = await getPool().getConnection();
    const cognitoSub = getCognitoSub(event);
    const path = event.path;
    const method = event.httpMethod;
    const eventId = event.pathParameters?.id;
    const staffId = event.pathParameters?.staffId;
    const flightId = event.pathParameters?.flightId;
    const accommodationId = event.pathParameters?.accommodationId;

    // Staff CRUD
    if (path.match(/^\/events\/\d+\/staff$/) && method === 'GET') return await getEventStaff(connection, eventId!);
    if (path.match(/^\/events\/\d+\/staff$/) && method === 'POST') return await addEventStaff(event, connection, cognitoSub, eventId!);
    if (path.match(/^\/events\/\d+\/staff\/\d+$/) && method === 'PUT') return await updateEventStaff(event, connection, cognitoSub, eventId!, staffId!);
    if (path.match(/^\/events\/\d+\/staff\/\d+$/) && method === 'DELETE') return await deleteEventStaff(connection, cognitoSub, eventId!, staffId!);

    // Artist profile
    if (path.match(/^\/artists\/\d+$/) && method === 'GET') return await getArtistProfile(connection, event.pathParameters?.id!);

    // Staff flights
    if (path.match(/^\/events\/\d+\/staff\/\d+\/flights$/) && method === 'GET') return await getStaffFlights(connection, eventId!, staffId!);
    if (path.match(/^\/events\/\d+\/staff\/\d+\/flights$/) && method === 'POST') return await addStaffFlight(event, connection, cognitoSub, eventId!, staffId!);
    if (path.match(/^\/events\/\d+\/staff\/\d+\/flights\/\d+$/) && method === 'PUT') return await updateStaffFlight(event, connection, cognitoSub, eventId!, staffId!, flightId!);
    if (path.match(/^\/events\/\d+\/staff\/\d+\/flights\/\d+$/) && method === 'DELETE') return await deleteStaffFlight(connection, cognitoSub, eventId!, staffId!, flightId!);

    // Event flights
    if (path.match(/^\/events\/\d+\/flights$/) && method === 'GET') return await getEventFlights(connection, eventId!);
    if (path.match(/^\/events\/\d+\/flights$/) && method === 'POST') return await addEventFlight(event, connection, cognitoSub, eventId!);
    if (path.match(/^\/events\/\d+\/flights\/\d+$/) && method === 'DELETE') return await deleteEventFlight(connection, cognitoSub, eventId!, flightId!);

    // Accommodations
    if (path.match(/^\/events\/\d+\/accommodations$/) && method === 'GET') return await getEventAccommodations(connection, eventId!);
    if (path.match(/^\/events\/\d+\/accommodations$/) && method === 'POST') return await addEventAccommodation(event, connection, cognitoSub, eventId!);
    if (path.match(/^\/events\/\d+\/accommodations\/\d+$/) && method === 'PUT') return await updateEventAccommodation(event, connection, cognitoSub, eventId!, accommodationId!);
    if (path.match(/^\/events\/\d+\/accommodations\/\d+$/) && method === 'DELETE') return await deleteEventAccommodation(connection, cognitoSub, eventId!, accommodationId!);
    if (path.match(/^\/events\/\d+\/accommodations\/\d+\/assign$/) && method === 'POST') return await assignAccommodationToStaff(event, connection, cognitoSub, eventId!, accommodationId!);
    if (path.match(/^\/events\/\d+\/accommodations\/\d+\/assign\/\d+$/) && method === 'DELETE') return await unassignAccommodationFromStaff(connection, cognitoSub, eventId!, accommodationId!, staffId!);
    if (path.match(/^\/events\/\d+\/staff\/\d+\/accommodations$/) && method === 'GET') return await getStaffAccommodations(connection, eventId!, staffId!);

    return jsonResponse(404, { success: false, error: 'Route not found' });
  } catch (error: any) {
    console.error('StaffFunction error:', error);
    return jsonResponse(500, { success: false, error: error.message || 'Internal server error' });
  } finally {
    if (connection) try { await connection.release(); } catch (e) {}
  }
};

async function getEventStaff(connection: mariadb.PoolConnection, eventId: string): Promise<APIGatewayProxyResult> {
  const staff = await connection.query(
    'SELECT * FROM event_staff WHERE event_id = ? ORDER BY role, name',
    [eventId]
  ) as any[];
  return jsonResponse(200, { success: true, staff: staff.map(serializeRow) });
}

async function addEventStaff(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { name, email, role, image_url, bio, instagram_url, tiktok_url, youtube_url, website_url, country, city, partner_name, partner_id, styles } = body;

  if (!name || !email || !role) return jsonResponse(400, { success: false, error: 'name, email, and role are required' });

  const result = await connection.query(
    `INSERT INTO event_staff (event_id, name, email, role, image_url, bio, instagram_url, tiktok_url, youtube_url, website_url, country, city, partner_name, partner_id, styles, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, name, email, role, image_url || null, bio || null, instagram_url || null, tiktok_url || null, youtube_url || null, website_url || null, country || null, city || null, partner_name || null, partner_id || null, styles ? JSON.stringify(styles) : null]
  ) as any;

  const rows = await connection.query('SELECT * FROM event_staff WHERE id = ?', [result.insertId]) as any[];
  return jsonResponse(201, { success: true, staff: serializeRow(rows[0]) });
}

async function updateEventStaff(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, staffId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['name', 'email', 'role', 'image_url', 'bio', 'instagram_url', 'tiktok_url', 'youtube_url', 'website_url', 'country', 'city', 'partner_name', 'partner_id'];
  for (const field of fields) {
    if (body[field] !== undefined) { updates.push(`${field} = ?`); values.push(body[field]); }
  }
  if (body.styles !== undefined) { updates.push('styles = ?'); values.push(JSON.stringify(body.styles)); }

  if (updates.length) {
    updates.push('updated_at = NOW()');
    values.push(staffId, eventId);
    await connection.query(`UPDATE event_staff SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`, values);
  }

  const rows = await connection.query('SELECT * FROM event_staff WHERE id = ?', [staffId]) as any[];
  return jsonResponse(200, { success: true, staff: serializeRow(rows[0]) });
}

async function deleteEventStaff(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, staffId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;
  await connection.query('DELETE FROM event_staff WHERE id = ? AND event_id = ?', [staffId, eventId]);
  return jsonResponse(200, { success: true, message: 'Staff member deleted' });
}

async function getArtistProfile(connection: mariadb.PoolConnection, artistId: string): Promise<APIGatewayProxyResult> {
  const rows = await connection.query('SELECT * FROM event_staff WHERE id = ?', [artistId]) as any[];
  if (!rows.length) return jsonResponse(404, { success: false, error: 'Artist not found' });
  return jsonResponse(200, { success: true, artist: serializeRow(rows[0]) });
}

async function getStaffFlights(connection: mariadb.PoolConnection, eventId: string, staffId: string): Promise<APIGatewayProxyResult> {
  const flights = await connection.query(
    'SELECT * FROM staff_flights WHERE event_id = ? AND staff_id = ? ORDER BY departure_datetime',
    [eventId, staffId]
  ) as any[];
  return jsonResponse(200, { success: true, flights: flights.map(serializeRow) });
}

async function addStaffFlight(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, staffId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, flight_type, notes } = body;

  if (!flight_number) return jsonResponse(400, { success: false, error: 'flight_number is required' });

  const result = await connection.query(
    `INSERT INTO staff_flights (event_id, staff_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, flight_type, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, staffId, flight_number, departure_airport || null, arrival_airport || null, departure_datetime || null, arrival_datetime || null, airline || null, flight_type || 'arrival', notes || null]
  ) as any;

  const rows = await connection.query('SELECT * FROM staff_flights WHERE id = ?', [result.insertId]) as any[];
  return jsonResponse(201, { success: true, flight: serializeRow(rows[0]) });
}

async function updateStaffFlight(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, staffId: string, flightId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['flight_number', 'departure_airport', 'arrival_airport', 'departure_datetime', 'arrival_datetime', 'airline', 'flight_type', 'notes'];
  for (const field of fields) {
    if (body[field] !== undefined) { updates.push(`${field} = ?`); values.push(body[field]); }
  }

  if (updates.length) {
    updates.push('updated_at = NOW()');
    values.push(flightId, eventId, staffId);
    await connection.query(`UPDATE staff_flights SET ${updates.join(', ')} WHERE id = ? AND event_id = ? AND staff_id = ?`, values);
  }

  const rows = await connection.query('SELECT * FROM staff_flights WHERE id = ?', [flightId]) as any[];
  return jsonResponse(200, { success: true, flight: serializeRow(rows[0]) });
}

async function deleteStaffFlight(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, staffId: string, flightId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;
  await connection.query('DELETE FROM staff_flights WHERE id = ? AND event_id = ? AND staff_id = ?', [flightId, eventId, staffId]);
  return jsonResponse(200, { success: true, message: 'Flight deleted' });
}

async function getEventFlights(connection: mariadb.PoolConnection, eventId: string): Promise<APIGatewayProxyResult> {
  const flights = await connection.query(
    `SELECT sf.*, es.name as staff_name, es.role as staff_role 
     FROM staff_flights sf 
     LEFT JOIN event_staff es ON sf.staff_id = es.id 
     WHERE sf.event_id = ? 
     ORDER BY sf.departure_datetime`,
    [eventId]
  ) as any[];
  return jsonResponse(200, { success: true, flights: flights.map(serializeRow) });
}

async function addEventFlight(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { staff_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, flight_type, notes } = body;

  if (!staff_id || !flight_number) return jsonResponse(400, { success: false, error: 'staff_id and flight_number required' });

  const result = await connection.query(
    `INSERT INTO staff_flights (event_id, staff_id, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime, airline, flight_type, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, staff_id, flight_number, departure_airport || null, arrival_airport || null, departure_datetime || null, arrival_datetime || null, airline || null, flight_type || 'arrival', notes || null]
  ) as any;

  const rows = await connection.query('SELECT * FROM staff_flights WHERE id = ?', [result.insertId]) as any[];
  return jsonResponse(201, { success: true, flight: serializeRow(rows[0]) });
}

async function deleteEventFlight(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, flightId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;
  await connection.query('DELETE FROM staff_flights WHERE id = ? AND event_id = ?', [flightId, eventId]);
  return jsonResponse(200, { success: true, message: 'Flight deleted' });
}

async function getEventAccommodations(connection: mariadb.PoolConnection, eventId: string): Promise<APIGatewayProxyResult> {
  const accommodations = await connection.query(
    'SELECT * FROM event_accommodations WHERE event_id = ? ORDER BY name',
    [eventId]
  ) as any[];

  for (const acc of accommodations) {
    const assignments = await connection.query(
      `SELECT sa.*, es.name as staff_name, es.role as staff_role 
       FROM staff_accommodations sa 
       LEFT JOIN event_staff es ON sa.staff_id = es.id 
       WHERE sa.accommodation_id = ?`,
      [acc.id]
    ) as any[];
    acc.assignments = assignments.map(serializeRow);
  }

  return jsonResponse(200, { success: true, accommodations: accommodations.map(serializeRow) });
}

async function addEventAccommodation(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { name, address, check_in_date, check_out_date, room_type, max_guests, notes, booking_reference, cost_per_night } = body;

  if (!name) return jsonResponse(400, { success: false, error: 'name is required' });

  const result = await connection.query(
    `INSERT INTO event_accommodations (event_id, name, address, check_in_date, check_out_date, room_type, max_guests, notes, booking_reference, cost_per_night, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, name, address || null, check_in_date || null, check_out_date || null, room_type || null, max_guests || null, notes || null, booking_reference || null, cost_per_night || null]
  ) as any;

  const rows = await connection.query('SELECT * FROM event_accommodations WHERE id = ?', [result.insertId]) as any[];
  return jsonResponse(201, { success: true, accommodation: serializeRow(rows[0]) });
}

async function updateEventAccommodation(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, accommodationId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['name', 'address', 'check_in_date', 'check_out_date', 'room_type', 'max_guests', 'notes', 'booking_reference', 'cost_per_night'];
  for (const field of fields) {
    if (body[field] !== undefined) { updates.push(`${field} = ?`); values.push(body[field]); }
  }

  if (updates.length) {
    updates.push('updated_at = NOW()');
    values.push(accommodationId, eventId);
    await connection.query(`UPDATE event_accommodations SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`, values);
  }

  const rows = await connection.query('SELECT * FROM event_accommodations WHERE id = ?', [accommodationId]) as any[];
  return jsonResponse(200, { success: true, accommodation: serializeRow(rows[0]) });
}

async function deleteEventAccommodation(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, accommodationId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;
  await connection.query('DELETE FROM staff_accommodations WHERE accommodation_id = ?', [accommodationId]);
  await connection.query('DELETE FROM event_accommodations WHERE id = ? AND event_id = ?', [accommodationId, eventId]);
  return jsonResponse(200, { success: true, message: 'Accommodation deleted' });
}

async function assignAccommodationToStaff(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, accommodationId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;

  const body = parseBody(event);
  const { staff_id, check_in_date, check_out_date, notes } = body;

  if (!staff_id) return jsonResponse(400, { success: false, error: 'staff_id is required' });

  const existing = await connection.query(
    'SELECT * FROM staff_accommodations WHERE accommodation_id = ? AND staff_id = ?',
    [accommodationId, staff_id]
  ) as any[];

  if (existing.length) return jsonResponse(400, { success: false, error: 'Staff already assigned to this accommodation' });

  await connection.query(
    `INSERT INTO staff_accommodations (accommodation_id, staff_id, check_in_date, check_out_date, notes, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [accommodationId, staff_id, check_in_date || null, check_out_date || null, notes || null]
  );

  return jsonResponse(201, { success: true, message: 'Staff assigned to accommodation' });
}

async function unassignAccommodationFromStaff(connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: string, accommodationId: string, staffId: string): Promise<APIGatewayProxyResult> {
  const verify = await verifyEventOwner(connection, eventId, cognitoSub);
  if (!verify.ok) return verify.error!;
  await connection.query('DELETE FROM staff_accommodations WHERE accommodation_id = ? AND staff_id = ?', [accommodationId, staffId]);
  return jsonResponse(200, { success: true, message: 'Staff unassigned from accommodation' });
}

async function getStaffAccommodations(connection: mariadb.PoolConnection, eventId: string, staffId: string): Promise<APIGatewayProxyResult> {
  const accommodations = await connection.query(
    `SELECT ea.*, sa.check_in_date as assigned_check_in, sa.check_out_date as assigned_check_out, sa.notes as assignment_notes
     FROM event_accommodations ea
     INNER JOIN staff_accommodations sa ON ea.id = sa.accommodation_id
     WHERE ea.event_id = ? AND sa.staff_id = ?`,
    [eventId, staffId]
  ) as any[];
  return jsonResponse(200, { success: true, accommodations: accommodations.map(serializeRow) });
}
