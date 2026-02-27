import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as mariadb from 'mariadb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let pool: mariadb.Pool | null = null;
let s3Client: S3Client | null = null;

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
    const port = parseInt(process.env.DB_PORT || '3306');
    const user = process.env.DB_USER || 'root';
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
      connectionLimit: 10,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      allowPublicKeyRetrieval: isLocal,
      connectTimeout: 10000,
      acquireTimeout: 15000,
      idleTimeout: 300000,
      minimumIdle: 2,
    });
  }
  return pool;
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-west-1',
    });
  }
  return s3Client;
}

function jsonResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
    body: JSON.stringify(body),
  };
}

function getCognitoSub(event: APIGatewayProxyEvent): string | null {
  const claims = event.requestContext?.authorizer?.claims;
  return claims?.sub || claims?.['cognito:username'] || null;
}

function parseBody(event: APIGatewayProxyEvent): any {
  const bodyString = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf-8')
    : event.body || '{}';
  return JSON.parse(bodyString);
}

function serializeBigInt(row: any): any {
  const serialized: any = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      serialized[key] = value.toString();
    } else if (value && typeof value === 'object' && value.constructor === Date) {
      serialized[key] = (value as Date).toISOString();
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}

async function generatePresignedUrlForS3Key(s3Key: string, bucketName: string): Promise<string | null> {
  try {
    let key = s3Key.split('?')[0];
    
    if (key.startsWith('s3://')) {
      const match = key.match(/s3:\/\/[^\/]+\/(.+)$/);
      if (match) key = decodeURIComponent(match[1]);
    } else if (key.includes('.s3.') || key.includes('amazonaws.com')) {
      const match = key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                   key.match(/https?:\/\/[^\/]+\/(.+)$/);
      if (match) key = decodeURIComponent(match[1]);
    }
    
    const s3 = getS3Client();
    const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key });
    return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return null;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('UserProfileFunction invoked:', event.httpMethod, event.path);
  
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, { message: 'CORS preflight' });
  }

  let connection: mariadb.PoolConnection | null = null;

  try {
    const pool = getPool();
    connection = await pool.getConnection();
    const cognitoSub = getCognitoSub(event);
    const path = event.path;
    const method = event.httpMethod;

    // Route handling
    if (path === '/user/profile' && method === 'GET') {
      return await getUserProfile(event, connection, cognitoSub);
    }
    if (path === '/user/profile' && method === 'PATCH') {
      return await updateUserProfile(event, connection, cognitoSub);
    }
    if (path === '/user/profile-photo-upload-url' && method === 'POST') {
      return await generateProfilePhotoUploadUrl(event, cognitoSub);
    }
    if (path === '/user/events' && method === 'GET') {
      return await getUserEvents(event, connection, cognitoSub);
    }
    if (path === '/user/tickets' && method === 'GET') {
      return await getUserTickets(event, connection, cognitoSub);
    }
    if (path === '/user/videos' && method === 'GET') {
      return await getUserVideos(event, connection, cognitoSub);
    }

    return jsonResponse(404, { success: false, error: 'Route not found' });
  } catch (error: any) {
    console.error('UserProfileFunction error:', error);
    return jsonResponse(500, { success: false, error: error.message || 'Internal server error' });
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error('Error releasing connection:', e); }
    }
  }
};

async function getUserProfile(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) {
    return jsonResponse(401, { success: false, error: 'Authentication required' });
  }

  let [user] = await connection.query(
    'SELECT * FROM users WHERE cognito_sub = ?',
    [cognitoSub]
  ) as any[];

  if (!user) {
    const claims = event.requestContext?.authorizer?.claims;
    const email = claims?.email || claims?.username || null;
    const defaultName = email ? email.split('@')[0] : null;
    
    console.log(`Creating new user profile for cognito_sub: ${cognitoSub}, default name: ${defaultName}`);
    
    await connection.query(
      'INSERT INTO users (cognito_sub, name, created_at) VALUES (?, ?, NOW())',
      [cognitoSub, defaultName]
    );
    [user] = await connection.query(
      'SELECT * FROM users WHERE cognito_sub = ?',
      [cognitoSub]
    ) as any[];
  }

  const serialized = serializeBigInt(user);
  const bucketName = process.env.S3_BUCKET_NAME;
  
  if (serialized.photo_url && bucketName) {
    const presignedUrl = await generatePresignedUrlForS3Key(serialized.photo_url, bucketName);
    if (presignedUrl) serialized.photo_url = presignedUrl;
  }

  return jsonResponse(200, { success: true, profile: serialized });
}

async function updateUserProfile(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) {
    return jsonResponse(401, { success: false, error: 'Authentication required' });
  }

  const body = parseBody(event);
  const { name, photo_url } = body;

  let [user] = await connection.query(
    'SELECT * FROM users WHERE cognito_sub = ?',
    [cognitoSub]
  ) as any[];

  if (!user) {
    await connection.query(
      'INSERT INTO users (cognito_sub, name, photo_url, created_at) VALUES (?, ?, ?, NOW())',
      [cognitoSub, name || null, photo_url || null]
    );
  } else {
    await connection.query(
      'UPDATE users SET name = ?, photo_url = ?, updated_at = NOW() WHERE cognito_sub = ?',
      [name !== undefined ? name : user.name, photo_url !== undefined ? photo_url : user.photo_url, cognitoSub]
    );
  }

  [user] = await connection.query(
    'SELECT * FROM users WHERE cognito_sub = ?',
    [cognitoSub]
  ) as any[];

  const serialized = serializeBigInt(user);
  const bucketName = process.env.S3_BUCKET_NAME;
  
  if (serialized.photo_url && bucketName) {
    const presignedUrl = await generatePresignedUrlForS3Key(serialized.photo_url, bucketName);
    if (presignedUrl) serialized.photo_url = presignedUrl;
  }

  return jsonResponse(200, { success: true, profile: serialized });
}

async function generateProfilePhotoUploadUrl(
  event: APIGatewayProxyEvent,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) {
    return jsonResponse(401, { success: false, error: 'Authentication required' });
  }

  const body = parseBody(event);
  const { filename, file_size, mime_type } = body;

  if (!filename || !file_size) {
    return jsonResponse(400, { success: false, error: 'Filename and file_size are required' });
  }

  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    return jsonResponse(500, { success: false, error: 'S3 bucket not configured' });
  }

  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const s3Key = `users/${cognitoSub}/photos/${timestamp}-${sanitizedFilename}`;

  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    ContentType: mime_type || 'image/jpeg',
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

  return jsonResponse(200, {
    success: true,
    upload_url: presignedUrl,
    s3_key: s3Key,
    s3_url: s3Url,
    expires_in: 3600,
  });
}

async function getUserEvents(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) {
    return jsonResponse(401, { success: false, error: 'Authentication required' });
  }

  const claims = event.requestContext?.authorizer?.claims;
  let userEmail = claims?.email || null;
  
  if (!userEmail) {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          userEmail = payload.email || null;
        }
      } catch (e) {
        console.error('Error decoding JWT token for email:', e);
      }
    }
  }

  const ownedEvents = await connection.query(
    'SELECT *, "owner" as user_role FROM events WHERE cognito_sub = ?',
    [cognitoSub]
  ) as any[];

  let staffEvents: any[] = [];
  if (userEmail) {
    const normalizedEmail = userEmail.toLowerCase().trim();
    staffEvents = await connection.query(
      `SELECT DISTINCT e.*, es.role as user_role
       FROM events e
       INNER JOIN event_staff es ON e.id = es.event_id
       WHERE LOWER(TRIM(es.email)) = ?
         AND e.cognito_sub != ?
       ORDER BY e.start_date DESC`,
      [normalizedEmail, cognitoSub]
    ) as any[];
  }

  const eventMap = new Map();
  ownedEvents.forEach((evt: any) => eventMap.set(evt.id, evt));
  staffEvents.forEach((evt: any) => {
    if (!eventMap.has(evt.id)) eventMap.set(evt.id, evt);
  });

  const events = Array.from(eventMap.values()).sort((a: any, b: any) => {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });

  const bucketName = process.env.S3_BUCKET_NAME;
  const serializedEvents = await Promise.all(events.map(async (row: any) => {
    const serialized = serializeBigInt(row);
    if (serialized.image_url && bucketName) {
      const presignedUrl = await generatePresignedUrlForS3Key(serialized.image_url, bucketName);
      if (presignedUrl) serialized.image_url = presignedUrl;
    }
    return serialized;
  }));

  return jsonResponse(200, { success: true, count: serializedEvents.length, events: serializedEvents });
}

async function getUserTickets(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) {
    return jsonResponse(401, { success: false, error: 'Authentication required' });
  }

  const claims = event.requestContext?.authorizer?.claims;
  const userEmail = claims?.email || claims?.username || null;
  
  console.log('Fetching tickets for user:', { cognitoSub, userEmail });

  let orders: any[];
  if (userEmail) {
    orders = await connection.query(
      `SELECT 
        tord.*,
        e.name as event_name,
        e.start_date as event_start_date,
        e.end_date as event_end_date,
        t.name as ticket_name,
        t.price as ticket_price,
        t.image_url as ticket_image_url
      FROM ticket_orders tord
      INNER JOIN events e ON tord.event_id = e.id
      INNER JOIN tickets t ON tord.ticket_id = t.id
      WHERE tord.cognito_sub = ? OR (tord.email IS NOT NULL AND LOWER(TRIM(tord.email)) = LOWER(TRIM(?)))
      ORDER BY tord.created_at DESC`,
      [cognitoSub, userEmail]
    ) as any[];
  } else {
    orders = await connection.query(
      `SELECT 
        tord.*,
        e.name as event_name,
        e.start_date as event_start_date,
        e.end_date as event_end_date,
        t.name as ticket_name,
        t.price as ticket_price,
        t.image_url as ticket_image_url
      FROM ticket_orders tord
      INNER JOIN events e ON tord.event_id = e.id
      INNER JOIN tickets t ON tord.ticket_id = t.id
      WHERE tord.cognito_sub = ?
      ORDER BY tord.created_at DESC`,
      [cognitoSub]
    ) as any[];
  }

  const serializedOrders = orders.map((order: any) => serializeBigInt(order));

  return jsonResponse(200, { success: true, orders: serializedOrders, count: serializedOrders.length });
}

async function getUserVideos(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) {
    return jsonResponse(401, { success: false, error: 'Authentication required' });
  }

  const columnCheck = await connection.query(`
    SELECT COUNT(*) as count FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = 'videos' AND column_name = 'album_id'
  `);
  const hasAlbumId = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;

  let videos: any[];
  if (hasAlbumId) {
    videos = await connection.query(
      `SELECT v.*, e.name as event_name, a.name as album_name 
       FROM videos v 
       LEFT JOIN events e ON v.event_id = e.id 
       LEFT JOIN albums a ON v.album_id = a.id 
       WHERE v.cognito_sub = ? 
       ORDER BY v.created_at DESC`,
      [cognitoSub]
    ) as any[];
  } else {
    videos = await connection.query(
      `SELECT v.*, e.name as event_name 
       FROM videos v 
       LEFT JOIN events e ON v.event_id = e.id 
       WHERE v.cognito_sub = ? 
       ORDER BY v.created_at DESC`,
      [cognitoSub]
    ) as any[];
  }

  const bucketName = process.env.S3_BUCKET_NAME;
  const serializedVideos = await Promise.all(videos.map(async (video: any) => {
    const serialized = serializeBigInt(video);
    
    if (serialized.video_url && bucketName) {
      const presignedUrl = await generatePresignedUrlForS3Key(serialized.video_url, bucketName);
      if (presignedUrl) serialized.video_url = presignedUrl;
    }
    
    if (serialized.thumbnail_url && bucketName) {
      const presignedUrl = await generatePresignedUrlForS3Key(serialized.thumbnail_url, bucketName);
      if (presignedUrl) serialized.thumbnail_url = presignedUrl;
    }
    
    return serialized;
  }));

  return jsonResponse(200, { success: true, count: serializedVideos.length, videos: serializedVideos });
}
