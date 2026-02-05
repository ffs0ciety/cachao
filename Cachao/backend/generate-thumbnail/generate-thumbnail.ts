import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, unlinkSync, existsSync, readFileSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const execAsync = promisify(exec);

let pool: mariadb.Pool | null = null;
let s3Client: S3Client | null = null;

function getPool(): mariadb.Pool {
  if (!pool) {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306');
    const user = process.env.DB_USER || 'admin';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'cachao';

    const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';

    pool = mariadb.createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 5,
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
      allowPublicKeyRetrieval: isLocal,
      connectTimeout: 10000,
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

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Generate thumbnail from video using FFmpeg
 */
async function generateThumbnail(videoPath: string, thumbnailPath: string): Promise<void> {
  // Extract first frame at 1 second (or 0.1 second if video is very short)
  // Using -ss 0.1 to avoid black frames, -vframes 1 to get only one frame
  const command = `ffmpeg -i "${videoPath}" -ss 0.1 -vframes 1 -vf "scale=320:-1" "${thumbnailPath}" -y`;
  
  try {
    await execAsync(command);
    if (!existsSync(thumbnailPath)) {
      throw new Error('Thumbnail file was not created');
    }
  } catch (error: any) {
    console.error('FFmpeg error:', error);
    throw new Error(`Failed to generate thumbnail: ${error.message}`);
  }
}

export const lambdaHandler = async (
  event: APIGatewayProxyEvent | { video_id?: string; s3_key?: string; httpMethod?: string; body?: string; isBase64Encoded?: boolean }
): Promise<APIGatewayProxyResult> => {
  // Handle direct Lambda invocation (not through API Gateway)
  if (!('httpMethod' in event) || event.httpMethod === undefined) {
    // Direct invocation - event is the payload directly
    const { video_id, s3_key } = event as { video_id?: string; s3_key?: string };
    
    if (!video_id || !s3_key) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'video_id and s3_key are required',
        }),
      };
    }
    
    // Process thumbnail generation directly
    return await processThumbnailGeneration(video_id, s3_key);
  }

  // Handle API Gateway invocation
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
  const tempFiles: string[] = [];

  try {
    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '{}';
    const body = JSON.parse(bodyString);
    const { video_id, s3_key } = body;

    if (!video_id || !s3_key) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'video_id and s3_key are required',
        }),
      };
    }

    console.log(`📸 API Gateway invocation: Generating thumbnail for video ${video_id}, s3_key: ${s3_key}`);
    return await processThumbnailGeneration(video_id, s3_key);
  } catch (error: any) {
    console.error('Error in lambdaHandler (API Gateway):', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
    };
  }
}

/**
 * Process thumbnail generation (extracted for reuse)
 */
async function processThumbnailGeneration(video_id: string, s3_key: string): Promise<APIGatewayProxyResult> {
  let connection: mariadb.PoolConnection | null = null;
  const tempFiles: string[] = [];

  try {
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;

    if (!bucketName) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'S3_BUCKET_NAME not configured',
        }),
      };
    }

    // Download video from S3 to /tmp
    const videoPath = `/tmp/video_${video_id}_${Date.now()}.mp4`;
    const thumbnailPath = `/tmp/thumbnail_${video_id}_${Date.now()}.jpg`;
    tempFiles.push(videoPath, thumbnailPath);

    console.log(`Downloading video from S3: ${s3_key}`);
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3_key,
    });

    const videoObject = await s3.send(getObjectCommand);
    if (!videoObject.Body) {
      throw new Error('Video object body is empty');
    }

    // Write video to temp file
    // S3 GetObjectCommand.Body is a ReadableStream-like object
    const videoStream = createWriteStream(videoPath);
    const chunks: Buffer[] = [];
    
    // Convert S3 stream to buffer chunks
    // @ts-ignore - Body can be various stream types
    for await (const chunk of videoObject.Body) {
      chunks.push(Buffer.from(chunk));
    }
    
    // Write all chunks to file
    videoStream.write(Buffer.concat(chunks));
    videoStream.end();
    
    await new Promise((resolve, reject) => {
      videoStream.on('close', resolve);
      videoStream.on('error', reject);
    });

    console.log(`Video downloaded to ${videoPath}`);

    // Generate thumbnail
    console.log(`Generating thumbnail...`);
    await generateThumbnail(videoPath, thumbnailPath);
    console.log(`Thumbnail generated at ${thumbnailPath}`);

    // Upload thumbnail to S3 in a separate thumbnails folder
    // Extract the filename from the s3_key (e.g., videos/123-filename.mp4 -> thumbnails/123-filename.jpg)
    const filename = s3_key.split('/').pop() || 'thumbnail.jpg';
    const thumbnailFilename = filename.replace(/\.(mp4|mov|avi|mkv|webm)$/i, '.jpg');
    const thumbnailKey = `thumbnails/${thumbnailFilename}`;
    const thumbnailBuffer = readFileSync(thumbnailPath);

    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
    });

    await s3.send(putObjectCommand);
    console.log(`Thumbnail uploaded to S3: ${thumbnailKey}`);

    const thumbnailUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${thumbnailKey}`;

    // Update database with thumbnail URL
    connection = await getPool().getConnection();
    
    // Check if thumbnail_url column exists
    const columnCheck = await connection.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'videos'
        AND COLUMN_NAME = 'thumbnail_url'
    `);
    
    const hasThumbnailColumn = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;

    if (hasThumbnailColumn) {
      // Try to update by video_id first, if provided
      if (video_id) {
        try {
          const updateResult = await connection.query(
            'UPDATE videos SET thumbnail_url = ?, updated_at = NOW() WHERE id = ?',
            [thumbnailUrl, video_id]
          );
          if ((updateResult as any).affectedRows > 0) {
            console.log(`✅ Updated video ${video_id} with thumbnail URL`);
          } else {
            // If video_id didn't work, try by s3_key
            const updateByKeyResult = await connection.query(
              'UPDATE videos SET thumbnail_url = ?, updated_at = NOW() WHERE video_url LIKE ?',
              [thumbnailUrl, `%${s3_key}%`]
            );
            if ((updateByKeyResult as any).affectedRows > 0) {
              console.log(`✅ Updated video by s3_key with thumbnail URL`);
            } else {
              console.warn('⚠️  No video found to update with thumbnail URL');
            }
          }
        } catch (updateError: any) {
          console.warn(`Could not update video ${video_id}, trying by s3_key:`, updateError.message);
          // Fallback to s3_key
          try {
            const updateByKeyResult = await connection.query(
              'UPDATE videos SET thumbnail_url = ?, updated_at = NOW() WHERE video_url LIKE ?',
              [thumbnailUrl, `%${s3_key}%`]
            );
            if ((updateByKeyResult as any).affectedRows > 0) {
              console.log(`✅ Updated video by s3_key with thumbnail URL`);
            }
          } catch (keyError: any) {
            console.warn('Could not update video by s3_key:', keyError.message);
          }
        }
      } else {
        // No video_id, try by s3_key
        try {
          const updateByKeyResult = await connection.query(
            'UPDATE videos SET thumbnail_url = ?, updated_at = NOW() WHERE video_url LIKE ?',
            [thumbnailUrl, `%${s3_key}%`]
          );
          if ((updateByKeyResult as any).affectedRows > 0) {
            console.log(`✅ Updated video by s3_key with thumbnail URL`);
          } else {
            console.warn('⚠️  No video found to update with thumbnail URL');
          }
        } catch (keyError: any) {
          console.warn('Could not update video by s3_key:', keyError.message);
        }
      }
    } else {
      console.warn('⚠️  thumbnail_url column does not exist in videos table');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        thumbnail_url: thumbnailUrl,
        thumbnail_key: thumbnailKey,
      }),
    };
  } catch (error: any) {
    console.error('Error generating thumbnail:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate thumbnail',
      }),
    };
  } finally {
    // Clean up temp files
    for (const file of tempFiles) {
      try {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      } catch (err) {
        console.warn(`Failed to delete temp file ${file}:`, err);
      }
    }

    if (connection) {
      connection.release();
    }
  }
};

