import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as mariadb from 'mariadb';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-west-1' });
  }
  return s3Client;
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

function serializeBigInt(row: any): any {
  const serialized: any = {};
  for (const [key, value] of Object.entries(row)) {
    serialized[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return serialized;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('VideosFunction:', event.httpMethod, event.path);
  
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, { message: 'CORS preflight' });
  }

  let connection: mariadb.PoolConnection | null = null;
  try {
    connection = await getPool().getConnection();
    const cognitoSub = getCognitoSub(event);
    const path = event.path;
    const method = event.httpMethod;

    // Video upload endpoints
    if (path === '/videos/upload-url' && method === 'POST') {
      return await generatePresignedUrl(event, connection, cognitoSub);
    }
    if (path === '/videos/confirm' && method === 'POST') {
      return await confirmVideoUpload(event, connection, cognitoSub);
    }
    if (path === '/videos' && method === 'POST') {
      return await uploadVideos(event, connection, cognitoSub);
    }
    if (path === '/videos' && method === 'DELETE') {
      return await deleteVideos(event, connection, cognitoSub);
    }
    if (path === '/videos/multipart/init' && method === 'POST') {
      return await initiateMultipartUpload(event, connection, cognitoSub);
    }
    if (path === '/videos/multipart/complete' && method === 'POST') {
      return await completeMultipartUpload(event, connection);
    }
    
    // Video PATCH (update category)
    const videoIdMatch = path.match(/^\/videos\/(\d+)$/);
    if (videoIdMatch && method === 'PATCH') {
      return await updateVideoCategory(event, connection, cognitoSub, videoIdMatch[1]);
    }

    // Album endpoints (under events)
    const albumsMatch = path.match(/^\/events\/(\d+)\/albums$/);
    if (albumsMatch && method === 'GET') {
      return await getEventAlbums(connection, parseInt(albumsMatch[1]));
    }
    if (albumsMatch && method === 'POST') {
      return await createEventAlbum(event, connection, cognitoSub, parseInt(albumsMatch[1]));
    }

    return jsonResponse(404, { success: false, error: 'Route not found' });
  } catch (error: any) {
    console.error('VideosFunction error:', error);
    return jsonResponse(500, { success: false, error: error.message || 'Internal server error' });
  } finally {
    if (connection) try { await connection.release(); } catch (e) {}
  }
};

async function generatePresignedUrl(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const { filename, event_id, album_id, mime_type, file_size } = body;
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!filename) return jsonResponse(400, { success: false, error: 'filename is required' });
  if (!event_id || !album_id) return jsonResponse(400, { success: false, error: 'event_id and album_id are required' });
  if (!bucketName) return jsonResponse(500, { success: false, error: 'S3 bucket not configured' });

  const eventId = parseInt(event_id);
  const albumId = parseInt(album_id);
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const s3Key = `videos/${timestamp}-${sanitizedFilename}`;
  const isLargeFile = file_size && parseInt(file_size) > 100 * 1024 * 1024;
  const expiresIn = isLargeFile ? 14400 : 3600;

  const s3 = getS3Client();
  const command = new PutObjectCommand({ Bucket: bucketName, Key: s3Key, ContentType: mime_type || 'video/mp4' });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn });
  const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

  let videoId: string | null = null;
  if (cognitoSub) {
    const albumCheck = await connection.query('SELECT id, cognito_sub FROM albums WHERE id = ? AND event_id = ?', [albumId, eventId]) as any[];
    if (!albumCheck.length) return jsonResponse(404, { success: false, error: `Album ${albumId} not found for event ${eventId}` });
    if (albumCheck[0].cognito_sub !== cognitoSub) return jsonResponse(403, { success: false, error: 'No permission to upload to this album' });
    
    const result = await connection.query(
      'INSERT INTO videos (cognito_sub, event_id, album_id, title, video_url, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [cognitoSub, eventId, albumId, filename.replace(/\.[^/.]+$/, ''), s3Url]
    );
    videoId = (result as any).insertId?.toString();
  }

  return jsonResponse(200, { success: true, video_id: videoId, upload_url: presignedUrl, s3_key: s3Key, s3_url: s3Url, expires_in: expiresIn });
}

async function confirmVideoUpload(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const { video_id, s3_key, event_id, album_id } = body;
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!s3_key) return jsonResponse(400, { success: false, error: 's3_key is required' });
  if (!bucketName) return jsonResponse(500, { success: false, error: 'S3 bucket not configured' });

  const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3_key}`;

  if (video_id) {
    const rows = await connection.query('SELECT * FROM videos WHERE id = ?', [video_id]) as any[];
    if (rows.length) {
      return jsonResponse(200, { success: true, video: serializeBigInt(rows[0]) });
    }
  }

  const rows = await connection.query('SELECT * FROM videos WHERE video_url LIKE ?', [`%${s3_key}%`]) as any[];
  if (rows.length) {
    return jsonResponse(200, { success: true, video: serializeBigInt(rows[0]) });
  }

  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });
  if (!album_id || !event_id) return jsonResponse(400, { success: false, error: 'album_id and event_id required to create video record' });

  const albumCheck = await connection.query('SELECT id, cognito_sub FROM albums WHERE id = ? AND event_id = ?', [parseInt(album_id), parseInt(event_id)]) as any[];
  if (!albumCheck.length) return jsonResponse(404, { success: false, error: 'Album not found' });
  if (albumCheck[0].cognito_sub !== cognitoSub) return jsonResponse(403, { success: false, error: 'No permission' });

  const title = s3_key.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Untitled';
  const result = await connection.query(
    'INSERT INTO videos (cognito_sub, event_id, album_id, title, video_url, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [cognitoSub, parseInt(event_id), parseInt(album_id), title, s3Url]
  );
  
  const newRows = await connection.query('SELECT * FROM videos WHERE id = ?', [(result as any).insertId]) as any[];
  return jsonResponse(200, { success: true, video: serializeBigInt(newRows[0]) });
}

async function uploadVideos(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });
  return jsonResponse(200, { success: true, message: 'Use /videos/upload-url for presigned URL upload' });
}

async function deleteVideos(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });

  const body = parseBody(event);
  const { video_ids } = body;
  if (!video_ids || !Array.isArray(video_ids) || !video_ids.length) {
    return jsonResponse(400, { success: false, error: 'video_ids array is required' });
  }

  const videoIds = video_ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
  const placeholders = videoIds.map(() => '?').join(',');
  const videos = await connection.query(`SELECT id, video_url, cognito_sub FROM videos WHERE id IN (${placeholders})`, videoIds) as any[];
  
  const userVideos = videos.filter((v: any) => v.cognito_sub === cognitoSub);
  if (!userVideos.length) return jsonResponse(403, { success: false, error: 'No permission to delete these videos' });

  const s3 = getS3Client();
  const bucketName = process.env.S3_BUCKET_NAME;
  const deletedIds: string[] = [];

  for (const video of userVideos) {
    await connection.query('DELETE FROM videos WHERE id = ?', [video.id]);
    deletedIds.push(video.id.toString());
    
    if (bucketName && video.video_url) {
      const match = video.video_url.match(/https?:\/\/[^\/]+\/(.+?)(\?|$)/);
      if (match) {
        s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: decodeURIComponent(match[1]) })).catch(console.error);
      }
    }
  }

  return jsonResponse(200, { success: true, deleted_count: deletedIds.length, deleted_ids: deletedIds });
}

async function initiateMultipartUpload(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });

  const body = parseBody(event);
  const { filename, event_id, album_id, mime_type, file_size } = body;
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!filename || !file_size || !event_id || !album_id) {
    return jsonResponse(400, { success: false, error: 'filename, event_id, album_id, and file_size are required' });
  }
  if (!bucketName) return jsonResponse(500, { success: false, error: 'S3 bucket not configured' });

  const eventId = parseInt(event_id);
  const albumId = parseInt(album_id);
  const fileBytes = parseInt(file_size);
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const s3Key = `videos/${timestamp}-${sanitizedFilename}`;
  const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

  const albumCheck = await connection.query('SELECT id, cognito_sub FROM albums WHERE id = ? AND event_id = ?', [albumId, eventId]) as any[];
  if (!albumCheck.length) return jsonResponse(404, { success: false, error: 'Album not found' });
  if (albumCheck[0].cognito_sub !== cognitoSub) return jsonResponse(403, { success: false, error: 'No permission' });

  const s3 = getS3Client();
  const createCommand = new CreateMultipartUploadCommand({ Bucket: bucketName, Key: s3Key, ContentType: mime_type || 'video/mp4' });
  const multipartUpload = await s3.send(createCommand);
  const uploadId = multipartUpload.UploadId;

  const partSize = 100 * 1024 * 1024;
  const totalParts = Math.ceil(fileBytes / partSize);
  const partUrls: Array<{ partNumber: number; upload_url: string }> = [];

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const uploadPartCommand = new UploadPartCommand({ Bucket: bucketName, Key: s3Key, PartNumber: partNumber, UploadId: uploadId });
    const partUrl = await getSignedUrl(s3, uploadPartCommand, { expiresIn: 3600 });
    partUrls.push({ partNumber, upload_url: partUrl });
  }

  const result = await connection.query(
    'INSERT INTO videos (cognito_sub, event_id, album_id, title, video_url, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [cognitoSub, eventId, albumId, filename.replace(/\.[^/.]+$/, ''), s3Url]
  );
  const videoId = (result as any).insertId?.toString();

  return jsonResponse(200, { success: true, video_id: videoId, upload_id: uploadId, s3_key: s3Key, s3_url: s3Url, total_parts: totalParts, part_size: partSize, parts: partUrls });
}

async function completeMultipartUpload(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const { upload_id, s3_key, parts } = body;
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!upload_id || !s3_key || !parts || !Array.isArray(parts)) {
    return jsonResponse(400, { success: false, error: 'upload_id, s3_key, and parts array are required' });
  }
  if (!bucketName) return jsonResponse(500, { success: false, error: 'S3 bucket not configured' });

  const s3 = getS3Client();
  const completeCommand = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: s3_key,
    UploadId: upload_id,
    MultipartUpload: { Parts: parts.map((p: any) => ({ PartNumber: p.PartNumber, ETag: p.ETag })) },
  });

  const result = await s3.send(completeCommand);
  return jsonResponse(200, { success: true, s3_key, s3_url: result.Location, etag: result.ETag });
}

async function updateVideoCategory(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, videoId: string): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });

  const body = parseBody(event);
  const { album_id } = body;

  const rows = await connection.query('SELECT * FROM videos WHERE id = ?', [videoId]) as any[];
  if (!rows.length) return jsonResponse(404, { success: false, error: 'Video not found' });
  if (rows[0].cognito_sub !== cognitoSub) return jsonResponse(403, { success: false, error: 'No permission' });

  if (album_id !== undefined) {
    await connection.query('UPDATE videos SET album_id = ?, updated_at = NOW() WHERE id = ?', [album_id ? parseInt(album_id) : null, videoId]);
  }

  const updatedRows = await connection.query('SELECT * FROM videos WHERE id = ?', [videoId]) as any[];
  return jsonResponse(200, { success: true, video: serializeBigInt(updatedRows[0]) });
}

async function getEventAlbums(connection: mariadb.PoolConnection, eventId: number): Promise<APIGatewayProxyResult> {
  const albums = await connection.query('SELECT * FROM albums WHERE event_id = ? ORDER BY album_date DESC, name ASC', [eventId]) as any[];
  return jsonResponse(200, { success: true, albums: albums.map(serializeBigInt) });
}

async function createEventAlbum(event: APIGatewayProxyEvent, connection: mariadb.PoolConnection, cognitoSub: string | null, eventId: number): Promise<APIGatewayProxyResult> {
  if (!cognitoSub) return jsonResponse(401, { success: false, error: 'Authentication required' });

  const body = parseBody(event);
  const { name, album_date } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return jsonResponse(400, { success: false, error: 'Album name is required' });
  }

  const albumName = name.trim();
  const albumDate = album_date && /^\d{4}-\d{2}-\d{2}$/.test(album_date) ? album_date : null;

  const existing = await connection.query(
    'SELECT * FROM albums WHERE event_id = ? AND name = ? AND (album_date = ? OR (album_date IS NULL AND ? IS NULL))',
    [eventId, albumName, albumDate, albumDate]
  ) as any[];

  if (existing.length) {
    return jsonResponse(200, { success: true, album: serializeBigInt(existing[0]), message: 'Album already exists' });
  }

  const result = await connection.query(
    'INSERT INTO albums (event_id, name, album_date, cognito_sub, created_at) VALUES (?, ?, ?, ?, NOW())',
    [eventId, albumName, albumDate, cognitoSub]
  );

  const newAlbum = await connection.query('SELECT * FROM albums WHERE id = ?', [(result as any).insertId]) as any[];
  return jsonResponse(201, { success: true, album: serializeBigInt(newAlbum[0]) });
}
