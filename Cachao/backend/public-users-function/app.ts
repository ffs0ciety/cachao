import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as mariadb from 'mariadb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let pool: mariadb.Pool | null = null;
let s3Client: S3Client | null = null;

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token',
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
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    
    pool = mariadb.createPool({
      host, port, user, password, database,
      connectionLimit: 5,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectTimeout: 10000,
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

function jsonResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
    body: JSON.stringify(body),
  };
}

async function generatePresignedUrl(url: string | null, bucketName: string): Promise<string | null> {
  if (!url) return null;
  try {
    const s3 = getS3Client();
    let s3Key = url.split('?')[0];
    if (s3Key.includes('amazonaws.com')) {
      const match = s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
      if (match) s3Key = decodeURIComponent(match[1]);
    }
    const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
    return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
  } catch (e) {
    console.error('Error generating presigned URL:', e);
    return url;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('PublicUsersFunction:', event.httpMethod, event.path);

  // Handle OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, { message: 'OK' });
  }

  const path = event.path.replace(/\/+$/, '') || '/';
  let connection: mariadb.PoolConnection | null = null;

  try {
    const dbPool = getPool();
    connection = await dbPool.getConnection();
    const bucketName = process.env.S3_BUCKET_NAME || '';

    // GET /users/check-nickname/:nickname
    const checkNicknameMatch = path.match(/^\/users\/check-nickname\/([^\/]+)$/);
    if (checkNicknameMatch && event.httpMethod === 'GET') {
      const nickname = decodeURIComponent(checkNicknameMatch[1]).toLowerCase().trim();
      
      const validPattern = /^[a-zA-Z0-9_]{3,30}$/;
      if (!validPattern.test(nickname)) {
        return jsonResponse(200, { success: true, available: false, reason: 'Invalid format' });
      }
      
      const reserved = ['admin', 'api', 'www', 'support', 'help', 'cachao', 'system'];
      if (reserved.includes(nickname)) {
        return jsonResponse(200, { success: true, available: false, reason: 'Reserved' });
      }

      const [existing] = await connection.query(
        'SELECT nickname FROM users WHERE nickname = ?', [nickname]
      ) as any[];

      return jsonResponse(200, { success: true, available: !existing });
    }

    // GET /users/:nickname/videos
    const publicVideosMatch = path.match(/^\/users\/([^\/]+)\/videos$/);
    if (publicVideosMatch && event.httpMethod === 'GET') {
      const nickname = decodeURIComponent(publicVideosMatch[1]).toLowerCase();
      
      const [user] = await connection.query(
        'SELECT cognito_sub FROM users WHERE nickname = ?', [nickname]
      ) as any[];

      if (!user) {
        return jsonResponse(404, { success: false, error: 'User not found' });
      }

      const videos = await connection.query(
        `SELECT v.id, v.title, v.video_url, v.thumbnail_url, v.category, 
                v.event_id, e.name as event_name, v.created_at
         FROM videos v
         LEFT JOIN events e ON v.event_id = e.id
         WHERE v.cognito_sub = ?
         ORDER BY v.created_at DESC LIMIT 50`,
        [user.cognito_sub]
      ) as any[];

      const videosWithUrls = await Promise.all(videos.map(async (video: any) => ({
        ...video,
        video_url: await generatePresignedUrl(video.video_url, bucketName),
        thumbnail_url: await generatePresignedUrl(video.thumbnail_url, bucketName),
      })));

      return jsonResponse(200, { success: true, videos: videosWithUrls });
    }

    // GET /users/:nickname - Public profile
    const publicProfileMatch = path.match(/^\/users\/([^\/]+)$/);
    if (publicProfileMatch && event.httpMethod === 'GET') {
      const nickname = decodeURIComponent(publicProfileMatch[1]).toLowerCase();
      
      const [user] = await connection.query(
        `SELECT nickname, name, photo_url, cover_photo_url, bio, location, 
                dance_styles, followers_count, following_count 
         FROM users WHERE nickname = ?`,
        [nickname]
      ) as any[];

      if (!user) {
        return jsonResponse(404, { success: false, error: 'User not found' });
      }

      const profile: any = { ...user };
      
      if (typeof profile.dance_styles === 'string') {
        try { profile.dance_styles = JSON.parse(profile.dance_styles); } 
        catch { profile.dance_styles = []; }
      }
      
      profile.photo_url = await generatePresignedUrl(profile.photo_url, bucketName);
      profile.cover_photo_url = await generatePresignedUrl(profile.cover_photo_url, bucketName);
      profile.groups = [];
      profile.schools = [];

      return jsonResponse(200, { success: true, profile });
    }

    // PATCH /user/nickname (requires auth - cognitoSub from authorizer)
    if (path === '/user/nickname' && event.httpMethod === 'PATCH') {
      const cognitoSub = event.requestContext?.authorizer?.claims?.sub;
      if (!cognitoSub) {
        return jsonResponse(401, { success: false, error: 'Authentication required' });
      }

      const bodyString = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf-8')
        : event.body || '{}';
      const { nickname } = JSON.parse(bodyString);
      
      if (!nickname) {
        return jsonResponse(400, { success: false, error: 'Nickname is required' });
      }

      const cleanNickname = nickname.toLowerCase().trim();
      const validPattern = /^[a-zA-Z0-9_]{3,30}$/;
      if (!validPattern.test(cleanNickname)) {
        return jsonResponse(400, { success: false, error: 'Invalid nickname format' });
      }

      const [existing] = await connection.query(
        'SELECT cognito_sub FROM users WHERE nickname = ? AND cognito_sub != ?',
        [cleanNickname, cognitoSub]
      ) as any[];

      if (existing) {
        return jsonResponse(409, { success: false, error: 'Nickname is already taken' });
      }

      await connection.query(
        'UPDATE users SET nickname = ?, updated_at = NOW() WHERE cognito_sub = ?',
        [cleanNickname, cognitoSub]
      );

      return jsonResponse(200, { success: true, nickname: cleanNickname });
    }

    return jsonResponse(404, { success: false, error: 'Not found' });

  } catch (error: any) {
    console.error('Error:', error);
    return jsonResponse(500, { success: false, error: error.message });
  } finally {
    if (connection) connection.release();
  }
};
