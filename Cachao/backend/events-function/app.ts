import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as mariadb from 'mariadb';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, ListUsersCommand, AdminGetUserCommand, AdminUpdateUserAttributesCommand, AdminResetUserPasswordCommand, AdminSetUserPasswordCommand, InitiateAuthCommand, RespondToAuthChallengeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';
import busboy from 'busboy';
import axios from 'axios';
import Stripe from 'stripe';

let pool: mariadb.Pool | null = null;
let s3Client: S3Client | null = null;
let cognitoClient: CognitoIdentityProviderClient | null = null;
let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2024-11-20.acacia',
    });
  }
  return stripeClient;
}

/**
 * Get CORS headers for all responses
 */
function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, Accept, Origin, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400', // 24 hours for Safari compatibility
  };
}

/**
 * Initialize MariaDB connection pool
 * For local development, uses localhost; for AWS, uses RDS endpoint
 */
/**
 * Ensure videos table exists (using the actual RDS schema)
 * The actual schema has: cognito_sub, title, video_url, description, thumbnail_url, duration_seconds
 */
async function ensureVideosTable(connection: mariadb.PoolConnection): Promise<void> {
  // Table already exists in RDS with different schema, so we just verify it
  try {
    await connection.query('SELECT 1 FROM videos LIMIT 1');
    console.log('Videos table exists');
  } catch (error) {
    console.error('Error checking videos table:', error);
    // Table might not exist, but we'll handle it in the insert/update logic
  }
}

function getPool(): mariadb.Pool {
  if (!pool) {
    // When running locally with sam local, use localhost
    // In AWS, use the RDS endpoint from environment variables
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306');
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'cachao';

    console.log(`Connecting to database: ${user}@${host}:${port}/${database}`);

    // For local development, disable SSL and allow insecure connections
    // For RDS (AWS), enable SSL for secure connections
    const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';
    
    pool = mariadb.createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 20,
      ssl: isLocal ? false : { rejectUnauthorized: false }, // Enable SSL for RDS
      allowPublicKeyRetrieval: isLocal,
      connectTimeout: 10000,
      acquireTimeout: 15000,
      idleTimeout: 300000, // 5 minutes
      minimumIdle: 2,
    });
  }
  return pool;
}

/**
 * Initialize S3 client
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-west-1',
    });
  }
  return s3Client;
}

function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    // No VPC endpoint needed - Cognito works directly via internet
    // Lambda functions can access Cognito without VPC configuration
    cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
    });
  }
  return cognitoClient;
}

let lambdaClient: LambdaClient | null = null;

/**
 * Initialize Lambda client
 */
function getLambdaClient(): LambdaClient {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'eu-west-1',
    });
  }
  return lambdaClient;
}

/**
 * Generate presigned URL for thumbnail upload
 */
async function generateThumbnailUploadUrl(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection | null,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const videoId = body.video_id;
    const filename = body.filename;

    if (!videoId || !filename) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'video_id and filename are required',
        }),
      };
    }

    // Verify video exists and user owns it
    if (connection && cognitoSub) {
      const videoCheck = await connection.query(
        'SELECT id, cognito_sub FROM videos WHERE id = ?',
        [videoId]
      );

      if (!Array.isArray(videoCheck) || videoCheck.length === 0) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Video not found',
          }),
        };
      }

      const video = videoCheck[0] as any;
      if (video.cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to upload thumbnails for this video',
          }),
        };
      }
    }

    // Generate S3 key for thumbnail (in thumbnails folder)
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `thumbnails/${sanitizedFilename}`;

    // Create presigned URL for thumbnail upload
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: 'image/jpeg',
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        upload_url: presignedUrl,
        s3_key: s3Key,
        s3_url: s3Url,
        expires_in: 3600,
      }),
    };
  } catch (error: any) {
    console.error('Error generating thumbnail upload URL:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate thumbnail upload URL',
      }),
    };
  }
}

/**
 * Update video thumbnail URL in database
 */
async function updateVideoThumbnail(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection | null,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!connection) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Database connection not available',
        }),
      };
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const videoId = body.video_id;
    const thumbnailUrl = body.thumbnail_url;

    if (!videoId || !thumbnailUrl) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'video_id and thumbnail_url are required',
        }),
      };
    }

    // Verify video exists and user owns it
    if (cognitoSub) {
      const videoCheck = await connection.query(
        'SELECT id, cognito_sub FROM videos WHERE id = ?',
        [videoId]
      );

      if (!Array.isArray(videoCheck) || videoCheck.length === 0) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Video not found',
          }),
        };
      }

      const video = videoCheck[0] as any;
      if (video.cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to update this video',
          }),
        };
      }
    }

    // Update thumbnail URL
    await connection.query(
      'UPDATE videos SET thumbnail_url = ?, updated_at = NOW() WHERE id = ?',
      [thumbnailUrl, videoId]
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Thumbnail URL updated successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error updating video thumbnail:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update thumbnail URL',
      }),
    };
  }
}

/**
 * Trigger thumbnail generation asynchronously
 */
async function triggerThumbnailGeneration(videoId: string, s3Key: string): Promise<void> {
  try {
    const lambda = getLambdaClient();
    const functionName = process.env.THUMBNAIL_FUNCTION_NAME;
    
    if (!functionName) {
      console.error('❌ THUMBNAIL_FUNCTION_NAME environment variable is not set');
      return;
    }
    
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Asynchronous invocation
      Payload: JSON.stringify({
        video_id: videoId,
        s3_key: s3Key,
      }),
    });

    const response = await lambda.send(command);
    console.log(`✅ Triggered thumbnail generation for video ${videoId}, response status: ${response.StatusCode}`);
  } catch (error) {
    console.error('❌ Failed to trigger thumbnail generation:', error);
    // Don't throw - thumbnail generation is not critical for upload success
  }
}

/**
 * Parse multipart/form-data from API Gateway event using busboy
 */
function parseMultipartFormData(event: APIGatewayProxyEvent): Promise<{ files: Array<{ fieldname: string; filename: string; content: Buffer; mimetype: string }>; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const files: Array<{ fieldname: string; filename: string; content: Buffer; mimetype: string }> = [];
    const fields: Record<string, string> = {};

    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      reject(new Error('Content-Type must be multipart/form-data'));
      return;
    }

    // Get the body as a buffer
    const body = event.isBase64Encoded 
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf-8');

    // Create busboy instance
    const bb = busboy({ headers: { 'content-type': contentType } });

    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      console.log(`File [${name}]: filename=${filename}, encoding=${encoding}, mimeType=${mimeType}`);
      
      const chunks: Buffer[] = [];
      
      file.on('data', (data: Buffer) => {
        chunks.push(data);
      });

      file.on('end', () => {
        const fileContent = Buffer.concat(chunks);
        files.push({
          fieldname: name,
          filename: filename || 'unknown',
          content: fileContent,
          mimetype: mimeType || 'application/octet-stream',
        });
      });
    });

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('error', (err) => {
      reject(err);
    });

    bb.on('finish', () => {
      resolve({ files, fields });
    });

    // Write the body to busboy
    bb.write(body);
    bb.end();
  });
}

/**
 * Generate presigned URL for direct S3 upload
 */
async function generatePresignedUrl(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection | null,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  console.log('🔍 generatePresignedUrl called:', {
    hasConnection: !!connection,
    connectionType: connection ? typeof connection : 'null',
    cognitoSub: cognitoSub || 'null',
    path: event.path,
  });
  
  try {
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        // Handle base64 encoded body from API Gateway
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e, 'Body:', event.body?.substring(0, 100));
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
            details: e instanceof Error ? e.message : String(e),
          }),
        };
      }
    }

    const filename = body.filename;
    const eventId = body.event_id ? parseInt(body.event_id) : null;
    const albumId = body.album_id ? parseInt(body.album_id) : null;
    const mimeType = body.mime_type || 'video/mp4';
    const fileSize = body.file_size ? parseInt(body.file_size) : null; // Optional file size in bytes

    if (!filename) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'filename is required',
        }),
      };
    }

    if (!eventId || !albumId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'event_id and album_id are required',
        }),
      };
    }

    // Generate unique S3 key
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `videos/${timestamp}-${sanitizedFilename}`;

    // For files larger than 100MB, use longer expiration (4 hours)
    // For files larger than 500MB, recommend multipart upload
    const isLargeFile = fileSize && fileSize > 100 * 1024 * 1024; // 100MB
    const isVeryLargeFile = fileSize && fileSize > 500 * 1024 * 1024; // 500MB
    const expiresIn = isLargeFile ? 14400 : 3600; // 4 hours for large files, 1 hour for others

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: mimeType,
      Metadata: {
        originalFilename: filename,
        eventId: eventId ? eventId.toString() : '',
      },
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn });

    // Get S3 URL
    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

    // Try to create a pending record in the database (optional - don't fail if DB is unavailable)
    // Note: Using the actual RDS schema: cognito_sub, title, video_url, etc.
    let videoId: string | null = null;
    if (connection) {
      try {
        // Use the actual cognito_sub from the authenticated user, or 'system' as fallback
        const userSub = cognitoSub || 'system';
        const title = filename.replace(/\.[^/.]+$/, ''); // Remove extension for title
        
        // eventId and albumId are already validated above, so we can proceed with insert
        console.log('🔍 Attempting to create video record:', {
          userSub,
          eventId,
          albumId,
          title,
          s3Url,
          connectionAvailable: !!connection,
        });
        
        // Verify album exists and user owns it
        const albumCheck = await connection.query(
          'SELECT id, cognito_sub FROM albums WHERE id = ? AND event_id = ?',
          [albumId, eventId]
        );
        
        console.log('🔍 Album check result:', {
          albumId,
          eventId,
          albumIdType: typeof albumId,
          eventIdType: typeof eventId,
          checkResult: Array.isArray(albumCheck) ? albumCheck.length : 'not array',
          checkData: albumCheck,
        });
        
        if (!Array.isArray(albumCheck) || albumCheck.length === 0) {
          console.error(`❌ Album ${albumId} does not exist for event ${eventId}`);
          throw new Error(`Album ${albumId} does not exist for event ${eventId}`);
        }
        
        const album = albumCheck[0] as any;
        if (album.cognito_sub !== cognitoSub) {
          console.error(`❌ User ${cognitoSub} does not own album ${albumId} (owned by ${album.cognito_sub})`);
          throw new Error('You do not have permission to upload to this album');
        }
        
        console.log(`✅ Album ${albumId} verified for event ${eventId} and owned by user ${cognitoSub}`);
        
        const result = await connection.query(
          `INSERT INTO videos (cognito_sub, event_id, album_id, title, video_url, created_at) 
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [userSub, eventId, albumId, title, s3Url]
        );
        videoId = (result as any).insertId?.toString() || null;
        console.log(`✅ Created video record with ID: ${videoId} for event ${eventId}, album ${albumId}`);
      } catch (dbError: any) {
        console.error('❌ Could not create database record:', dbError);
        console.error('   Error details:', {
          message: dbError.message,
          code: dbError.code,
          sqlState: dbError.sqlState,
          eventId,
          albumId,
          cognitoSub,
        });
        // Continue without database record - it can be created later when confirming upload
      }
    } else {
      console.warn('⚠️  No database connection available for presigned URL generation');
      console.warn('   This means the video record will NOT be created until confirm endpoint is called');
    }

    const response = {
      success: true,
      video_id: videoId,
      upload_url: presignedUrl,
      s3_key: s3Key,
      s3_url: s3Url,
      expires_in: expiresIn,
      use_multipart: isVeryLargeFile || false,
      recommendation: isVeryLargeFile 
        ? 'For files larger than 500MB, consider using multipart upload endpoint: /videos/multipart/init'
        : null,
    };

    console.log('📤 Returning presigned URL response:', {
      success: response.success,
      video_id: response.video_id,
      s3_key: response.s3_key,
      hasUploadUrl: !!response.upload_url,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('❌ Error generating presigned URL:', error);
    console.error('   Error stack:', error instanceof Error ? error.stack : String(error));
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
}

/**
 * Initiate multipart upload for large files
 */
async function initiateMultipartUpload(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection | null,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const filename = body.filename;
    const eventId = body.event_id ? parseInt(body.event_id) : null;
    const albumId = body.album_id ? parseInt(body.album_id) : null;
    const mimeType = body.mime_type || 'video/mp4';
    const fileSize = body.file_size ? parseInt(body.file_size) : null;

    if (!filename || !fileSize || !eventId || !albumId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'filename, event_id, album_id, and file_size are required',
        }),
      };
    }

    // Generate unique S3 key
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `videos/${timestamp}-${sanitizedFilename}`;
    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

    // Initiate multipart upload
    const createMultipartCommand = new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: mimeType,
      Metadata: {
        originalFilename: filename,
        eventId: eventId ? eventId.toString() : '',
      },
    });

    const multipartUpload = await s3.send(createMultipartCommand);
    const uploadId = multipartUpload.UploadId;

    if (!uploadId) {
      throw new Error('Failed to create multipart upload');
    }

    // Calculate number of parts (each part max 5GB, but we'll use 100MB chunks for better performance)
    const partSize = 100 * 1024 * 1024; // 100MB per part
    const totalParts = Math.ceil(fileSize / partSize);
    const partUrls: Array<{ partNumber: number; upload_url: string }> = [];

    // Generate presigned URLs for each part
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const uploadPartCommand = new UploadPartCommand({
        Bucket: bucketName,
        Key: s3Key,
        PartNumber: partNumber,
        UploadId: uploadId,
      });

      const partUrl = await getSignedUrl(s3, uploadPartCommand, { expiresIn: 3600 });
      partUrls.push({
        partNumber,
        upload_url: partUrl,
      });
    }

    // Create database record
    let videoId: string | null = null;
    if (connection) {
      try {
        // Verify album exists and user owns it
        if (!cognitoSub) {
          throw new Error('Authentication required to upload videos');
        }
        
        const albumCheck = await connection.query(
          'SELECT id, cognito_sub FROM albums WHERE id = ? AND event_id = ?',
          [albumId, eventId]
        );
        
        if (!Array.isArray(albumCheck) || albumCheck.length === 0) {
          throw new Error(`Album ${albumId} does not exist for event ${eventId}`);
        }
        
        const album = albumCheck[0] as any;
        if (album.cognito_sub !== cognitoSub) {
          throw new Error('You do not have permission to upload to this album');
        }
        
        const userSub = cognitoSub;
        const title = filename.replace(/\.[^/.]+$/, '');
        
        const result = await connection.query(
          `INSERT INTO videos (cognito_sub, event_id, album_id, title, video_url, created_at) 
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [userSub, eventId, albumId, title, s3Url]
        );
        videoId = (result as any).insertId?.toString() || null;
        console.log(`✅ Created video record with ID: ${videoId} for event ${eventId}, album ${albumId} (owned by ${cognitoSub})`);
      } catch (dbError: any) {
        console.error('❌ Could not create database record:', dbError);
        throw dbError; // Re-throw to return error response
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        video_id: videoId,
        upload_id: uploadId,
        s3_key: s3Key,
        s3_url: s3Url,
        total_parts: totalParts,
        part_size: partSize,
        parts: partUrls,
        expires_in: 3600,
      }),
    };
  } catch (error) {
    console.error('Error initiating multipart upload:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
}

/**
 * Complete multipart upload
 */
async function completeMultipartUpload(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection | null
): Promise<APIGatewayProxyResult> {
  try {
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const uploadId = body.upload_id;
    const s3Key = body.s3_key;
    const parts = body.parts; // Array of {PartNumber, ETag}

    if (!uploadId || !s3Key || !parts || !Array.isArray(parts)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'upload_id, s3_key, and parts array are required',
        }),
      };
    }

    // Complete multipart upload
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: s3Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p: any) => ({
          PartNumber: p.PartNumber,
          ETag: p.ETag,
        })),
      },
    });

    const result = await s3.send(completeCommand);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        s3_key: s3Key,
        s3_url: result.Location,
        etag: result.ETag,
      }),
    };
  } catch (error) {
    console.error('Error completing multipart upload:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
}

/**
 * Confirm video upload and update database entry
 * Creates the database record if it doesn't exist
 */
async function confirmVideoUpload(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection | null,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  console.log('🔍 confirmVideoUpload called:', {
    hasConnection: !!connection,
    cognitoSub: cognitoSub || 'null',
    path: event.path,
    method: event.httpMethod,
    hasBody: !!event.body,
    requestContext: event.requestContext ? {
      hasAuthorizer: !!event.requestContext.authorizer,
      hasClaims: !!event.requestContext.authorizer?.claims,
      claimsKeys: event.requestContext.authorizer?.claims ? Object.keys(event.requestContext.authorizer.claims) : null,
    } : null,
  });
  
  try {
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        // Handle base64 encoded body from API Gateway
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e, 'Body:', event.body?.substring(0, 100));
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
            details: e instanceof Error ? e.message : String(e),
          }),
        };
      }
    }

    const videoId = body.video_id;
    const s3Key = body.s3_key;
    const eventId = body.event_id ? parseInt(body.event_id) : null;
    const albumId = body.album_id ? parseInt(body.album_id) : null;

    if (!s3Key) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 's3_key is required',
        }),
      };
    }

    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;
    
    let video: any = null;
    
    // If video_id is provided, try to get it from database first (fast path)
    if (videoId && connection) {
      try {
        const rows = await connection.query(
          'SELECT * FROM videos WHERE id = ?',
          [videoId]
        );
        video = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        
        // If video found, update file_size asynchronously (don't wait)
        if (video) {
          // Fire and forget S3 HeadObject to update file size
          s3.send(new HeadObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
          })).then((headResponse) => {
            const fileSize = headResponse.ContentLength || 0;
            if (fileSize > 0) {
              connection?.query(
                `UPDATE videos SET file_size = ?, updated_at = NOW() WHERE id = ?`,
                [fileSize, videoId]
              ).catch(err => console.warn('Failed to update file size:', err));
            }
          }).catch(err => console.warn('S3 HeadObject failed:', err));
          
          // Return immediately with existing video record
          const serialized: any = {};
          for (const [key, value] of Object.entries(video)) {
            if (typeof value === 'bigint') {
              serialized[key] = value.toString();
            } else {
              serialized[key] = value;
            }
          }
          
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: true,
              video: serialized,
            }),
          };
        }
      } catch (dbError) {
        console.warn('Database query failed:', dbError);
      }
    }

    // Verify file exists in S3 and get its size and metadata (only if video not found)
    // Use a timeout to prevent hanging
    let fileSize = 0;
    let metadata: Record<string, string> = {};
    let contentType = 'video/mp4';
    let filename = s3Key.split('/').pop() || 'unknown';
    let metadataEventId: number | null = null;
    
    try {
      const headCmd = new HeadObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });
      
      // Add timeout to HeadObject operation
      const headPromise = s3.send(headCmd);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('S3 HeadObject timeout')), 5000)
      );
      
      const headResponse = await Promise.race([headPromise, timeoutPromise]) as any;
      fileSize = headResponse.ContentLength || 0;
      metadata = headResponse.Metadata || {};
      contentType = headResponse.ContentType || 'video/mp4';
      filename = metadata.originalFilename || s3Key.split('/').pop() || 'unknown';
      metadataEventId = metadata.eventId ? parseInt(metadata.eventId) : null;
    } catch (s3Error: any) {
      // If S3 check fails, continue with defaults - file might still be uploading
      console.warn('S3 HeadObject failed (file may still be uploading):', s3Error.message || s3Error);
      // Use defaults - we'll update later if needed
    }
    
    const finalEventId = eventId || metadataEventId;

    // Ensure we have a connection - it's critical for database operations
    if (!connection) {
      console.error('❌ No database connection available in confirmVideoUpload');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Database connection not available',
        }),
      };
    }
    
    try {
      if (videoId) {
        // Try to update existing record
        await connection.query(
          `UPDATE videos SET file_size = ?, updated_at = NOW() WHERE id = ?`,
          [fileSize, videoId]
        );

        // Get updated video record
        const rows = await connection.query(
          'SELECT * FROM videos WHERE id = ?',
          [videoId]
        );
        video = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      }

      // If no video found, try to find by video_url (which contains s3_key info)
      if (!video) {
        const rows = await connection.query(
          'SELECT * FROM videos WHERE video_url LIKE ?',
          [`%${s3Key}%`]
        );
        video = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      }

      // If still no video, create a new record using the actual RDS schema
      if (!video) {
            const userSub = cognitoSub || 'system';
            const title = filename.replace(/\.[^/.]+$/, '');
            
            // Get album_id from request body (should be provided in confirm request)
            const albumId = body.album_id ? parseInt(body.album_id) : null;
            
            console.log('🔍 Attempting to create video record:', {
              s3Key,
              videoId,
              eventId: finalEventId,
              albumId,
              bodyAlbumId: body.album_id,
              userSub,
            });
            
            if (!albumId) {
              console.error('❌ Cannot create video record: album_id is required', { body, eventId: finalEventId });
              return {
                statusCode: 400,
                headers: {
                  'Content-Type': 'application/json',
                  ...getCorsHeaders(),
                },
                body: JSON.stringify({
                  success: false,
                  error: 'album_id is required to create video record',
                }),
              };
            }

            if (!finalEventId) {
              console.error('❌ Cannot create video record: event_id is required', { body, albumId });
              return {
                statusCode: 400,
                headers: {
                  'Content-Type': 'application/json',
                  ...getCorsHeaders(),
                },
                body: JSON.stringify({
                  success: false,
                  error: 'event_id is required to create video record',
                }),
              };
            }

            // Verify album exists and user owns it
            if (!cognitoSub) {
              return {
                statusCode: 401,
                headers: {
                  'Content-Type': 'application/json',
                  ...getCorsHeaders(),
                },
                body: JSON.stringify({
                  success: false,
                  error: 'Authentication required to create video record',
                }),
              };
            }

            const albumCheck = await connection.query(
              'SELECT id, cognito_sub FROM albums WHERE id = ? AND event_id = ?',
              [albumId, finalEventId]
            );

            if (!Array.isArray(albumCheck) || albumCheck.length === 0) {
              return {
                statusCode: 404,
                headers: {
                  'Content-Type': 'application/json',
                  ...getCorsHeaders(),
                },
                body: JSON.stringify({
                  success: false,
                  error: `Album ${albumId} does not exist for event ${finalEventId}`,
                }),
              };
            }

            const album = albumCheck[0] as any;
            if (album.cognito_sub !== cognitoSub) {
              return {
                statusCode: 403,
                headers: {
                  'Content-Type': 'application/json',
                  ...getCorsHeaders(),
                },
                body: JSON.stringify({
                  success: false,
                  error: 'You do not have permission to upload to this album',
                }),
              };
            }

        try {
          const result = await connection.query(
            `INSERT INTO videos (cognito_sub, event_id, album_id, title, video_url, description, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [userSub, finalEventId, albumId, title, s3Url, `Uploaded file: ${filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`]
          );
          const insertId = (result as any).insertId;
          
          // Get the newly created record
          const newRows = await connection.query(
            'SELECT * FROM videos WHERE id = ?',
            [insertId]
          );
          video = Array.isArray(newRows) && newRows.length > 0 ? newRows[0] : null;
          console.log(`✅ Created new video record with ID: ${insertId} for event ${finalEventId}, album ${albumId}`);
          
          // Trigger thumbnail generation asynchronously
          if (insertId && s3Key) {
            triggerThumbnailGeneration(insertId.toString(), s3Key).catch(err => {
              console.error('Failed to trigger thumbnail generation:', err);
            });
          }
        } catch (insertError: any) {
          console.error('❌ Failed to insert video record:', insertError);
          console.error('   Insert details:', {
            userSub,
            finalEventId,
            albumId,
            title,
            s3Url,
            error: insertError.message,
            code: insertError.code,
            sqlState: insertError.sqlState,
          });
          throw insertError; // Re-throw to be caught by outer try-catch
        }
      } else {
        // Update description with file size info if needed
        const description = video.description || '';
        if (!description.includes('MB') && fileSize > 0) {
          await connection.query(
            `UPDATE videos SET description = ?, updated_at = NOW() WHERE id = ?`,
            [`${description} [Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB]`.trim(), video.id]
          );
        }
      }
    } catch (dbError: any) {
      console.error('❌ Database error in confirmVideoUpload:', dbError);
      console.error('   Error details:', {
        message: dbError.message,
        code: dbError.code,
        sqlState: dbError.sqlState,
        s3Key,
        videoId,
        eventId: finalEventId,
        albumId: body.album_id,
      });
      // Return error response instead of continuing silently
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Database error: ' + (dbError.message || 'Unknown error'),
          details: dbError.code || dbError.sqlState || 'No additional details',
        }),
      };
    }

    // If we have a video record, return it
    if (video) {
      // Serialize BigInt values
      const serialized: any = {};
      for (const [key, value] of Object.entries(video)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          video: serialized,
        }),
      };
    }

    // If no video record was created/updated, return error
    if (!video) {
      console.error('❌ No video record found or created after confirmVideoUpload');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Failed to create or update video record in database',
          details: {
            s3_key: s3Key,
            video_id: videoId || 'not provided',
            event_id: finalEventId,
            album_id: body.album_id || 'not provided',
            has_connection: !!connection,
          },
        }),
      };
    }

    // This should never be reached if video exists, but keep as fallback
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: 'Unexpected error: No video record available',
      }),
    };
  } catch (error) {
    console.error('Error confirming video upload:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
}

/**
 * Upload video files to S3 and create database entries
 */
async function uploadVideos(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }

    console.log('Content-Type:', event.headers['content-type'] || event.headers['Content-Type']);
    console.log('isBase64Encoded:', event.isBase64Encoded);
    console.log('Body length:', event.body?.length || 0);

    const { files, fields } = await parseMultipartFormData(event);
  
  // Filter only video files
  const videoFiles = files.filter(file => 
    file.mimetype.startsWith('video/') || 
    /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(file.filename)
  );

  if (videoFiles.length === 0) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: 'No video files found in the request',
      }),
    };
  }

  const eventId = fields.event_id ? parseInt(fields.event_id) : null;
  const uploadedVideos = [];

  // Upload each video file to S3
  for (const file of videoFiles) {
    try {
      // Generate unique S3 key
      const timestamp = Date.now();
      const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const s3Key = `videos/${timestamp}-${sanitizedFilename}`;

      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: file.content,
        ContentType: file.mimetype,
        Metadata: {
          originalFilename: file.filename,
        },
      });

      await s3.send(uploadCommand);

      // Get S3 URL
      const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

      // Insert into database
      const result = await connection.query(
        `INSERT INTO videos (event_id, filename, s3_key, s3_url, mime_type, file_size, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          eventId,
          file.filename,
          s3Key,
          s3Url,
          file.mimetype,
          file.content.length,
        ]
      );

      const insertId = (result as any).insertId;

      uploadedVideos.push({
        id: insertId.toString(),
        event_id: eventId,
        filename: file.filename,
        s3_key: s3Key,
        s3_url: s3Url,
        mime_type: file.mimetype,
        file_size: file.content.length,
      });
    } catch (error) {
      console.error(`Error uploading file ${file.filename}:`, error);
      // Continue with other files even if one fails
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
    body: JSON.stringify({
      success: true,
      count: uploadedVideos.length,
      videos: uploadedVideos,
    }),
  };
  } catch (error) {
    console.error('Error in uploadVideos:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined,
      }),
    };
  }
}

/**
 * Extract Cognito user ID (sub) from the request context
 */
function getCognitoSub(event: APIGatewayProxyEvent): string | null {
  // When using Cognito authorizer, user info is in requestContext.authorizer.claims
  const claims = event.requestContext?.authorizer?.claims;
  
  // Log for debugging
  if (event.path?.includes('/videos/confirm')) {
    console.log('🔍 getCognitoSub for /videos/confirm:', {
      hasRequestContext: !!event.requestContext,
      hasAuthorizer: !!event.requestContext?.authorizer,
      hasClaims: !!claims,
      claimsKeys: claims ? Object.keys(claims) : null,
      sub: claims?.sub || null,
      identity: event.requestContext?.identity ? Object.keys(event.requestContext.identity) : null,
    });
  }
  
  if (claims?.sub) {
    return claims.sub;
  }
  
  // Fallback: try to get from requestContext.identity
  const identity = event.requestContext?.identity;
  if (identity?.cognitoIdentityId) {
    return identity.cognitoIdentityId;
  }
  
  // Fallback: manually decode JWT token from Authorization header
  // This is needed for routes with Auth: NONE (like /events/{id}/{proxy+})
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7); // Remove "Bearer " prefix
      const parts = token.split('.');
      if (parts.length === 3) {
        // Decode JWT payload (second part)
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        const sub = payload.sub || null;
        if (sub) {
          console.log('✅ Decoded cognito_sub from JWT token:', sub);
          return sub;
        }
      }
    } catch (decodeError: any) {
      console.error('Error decoding JWT token:', decodeError);
      // Continue - will return null
    }
  }
  
  return null;
}

/**
 * Delete video(s) - only if user owns them
 */
async function deleteVideos(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '{}';
    const body = JSON.parse(bodyString);
    const { video_ids } = body;

    if (!video_ids || !Array.isArray(video_ids) || video_ids.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'video_ids array is required',
        }),
      };
    }

    // Convert video_ids to integers
    const videoIds = video_ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));

    if (videoIds.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid video IDs',
        }),
      };
    }

    // Verify ownership and get video records
    // Get video_url BEFORE it gets replaced with presigned URLs (we need the original S3 URL)
    const placeholders = videoIds.map(() => '?').join(',');
    const videos = await connection.query(
      `SELECT id, video_url, cognito_sub FROM videos WHERE id IN (${placeholders})`,
      videoIds
    );
    
    console.log(`Found ${Array.isArray(videos) ? videos.length : 0} videos to check for deletion`);
    if (Array.isArray(videos) && videos.length > 0) {
      console.log('Sample video_url from database:', videos[0].video_url);
    }

    if (!Array.isArray(videos) || videos.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Videos not found',
        }),
      };
    }

    // Filter to only videos owned by the user
    const userVideos = videos.filter((video: any) => video.cognito_sub === cognitoSub);

    if (userVideos.length === 0) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to delete these videos',
        }),
      };
    }

    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    const deletedVideoIds: string[] = [];
    const errors: Array<{ video_id: string; error: string }> = [];

    // Helper function to extract S3 key from video_url (handles presigned URLs too)
    const extractS3Key = (videoUrl: string): string | null => {
      if (!videoUrl) return null;
      
      // If it's a presigned URL, extract the key from the path
      // Presigned URLs look like: https://bucket.s3.region.amazonaws.com/key?X-Amz-Algorithm=...
      if (videoUrl.includes('?X-Amz-')) {
        const urlParts = videoUrl.split('?')[0];
        const match = urlParts.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                     urlParts.match(/https?:\/\/[^\/]+\/(.+)$/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }
      
      // Handle s3:// format
      if (videoUrl.startsWith('s3://')) {
        const match = videoUrl.match(/s3:\/\/[^\/]+\/(.+)$/);
        if (match) {
          return match[1];
        }
      }
      
      // Handle regular S3 URLs
      if (videoUrl.includes('.s3.') || videoUrl.includes('amazonaws.com')) {
        const match = videoUrl.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                     videoUrl.match(/https?:\/\/[^\/]+\/(.+)$/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }
      
      // If it's already just a key (starts with videos/)
      if (videoUrl.startsWith('videos/')) {
        return videoUrl;
      }
      
      return null;
    };

    // Delete from database first (fast), then queue S3 deletions asynchronously (fire-and-forget)
    for (const video of userVideos) {
      try {
        // Extract S3 key BEFORE deleting from database (in case we need the video_url)
        let s3Key: string | null = null;
        if (bucketName && video.video_url) {
          s3Key = extractS3Key(video.video_url);
          if (!s3Key) {
            console.warn(`Could not extract S3 key from video_url for video ${video.id}: ${video.video_url}`);
          }
        }
        
        // Delete from database first
        await connection.query('DELETE FROM videos WHERE id = ?', [video.id]);
        deletedVideoIds.push(video.id.toString());
        console.log(`Deleted video ${video.id} from database`);
        
        // Queue S3 deletion asynchronously (fire-and-forget - don't wait for it)
        if (bucketName && s3Key) {
          // Start S3 deletion but don't await it - fully asynchronous
          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
          });
          
          s3.send(deleteCommand)
            .then(() => {
              console.log(`✅ Successfully deleted S3 object: ${s3Key}`);
            })
            .catch((s3Error: any) => {
              console.error(`❌ Failed to delete S3 object ${s3Key}:`, s3Error);
              console.error(`   Error details:`, s3Error.message || s3Error);
              // Log but don't fail the operation - S3 cleanup can happen later
            });
          // Don't await - let it run in the background
          console.log(`Queued S3 deletion for key: ${s3Key}`);
        } else {
          if (!s3Key) {
            console.warn(`No S3 key extracted for video ${video.id}, skipping S3 deletion`);
          }
        }
      } catch (error: any) {
        console.error(`Error deleting video ${video.id}:`, error);
        errors.push({
          video_id: video.id.toString(),
          error: error.message || 'Failed to delete video',
        });
      }
    }

    // Return immediately - S3 deletions are running in the background

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        deleted_count: deletedVideoIds.length,
        deleted_ids: deletedVideoIds,
        errors: errors.length > 0 ? errors : undefined,
      }),
    };
  } catch (error: any) {
    console.error('Error deleting videos:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete videos',
      }),
    };
  }
}

/**
 * Get albums for an event
 */
async function getEventAlbums(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    const pathMatch = event.path?.match(/^\/events\/(\d+)\/albums$/);
    if (!pathMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    const eventId = parseInt(pathMatch[1]);
    const albums = await connection.query(
      'SELECT * FROM albums WHERE event_id = ? ORDER BY album_date DESC, name ASC',
      [eventId]
    );

    const serialized = Array.isArray(albums)
      ? albums.map((album: any) => {
          const result: any = {};
          for (const [key, value] of Object.entries(album)) {
            if (typeof value === 'bigint') {
              result[key] = value.toString();
            } else {
              result[key] = value;
            }
          }
          return result;
        })
      : [];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        albums: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching albums:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch albums',
      }),
    };
  }
}

/**
 * Create a new album for an event
 */
async function createEventAlbum(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const pathMatch = event.path?.match(/^\/events\/(\d+)\/albums$/);
    if (!pathMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    const eventId = parseInt(pathMatch[1]);
    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '{}';
    const body = JSON.parse(bodyString);
    const { name, album_date } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Album name is required',
        }),
      };
    }

    const albumName = name.trim();

    // Parse and validate date if provided
    let albumDate: string | null = null;
    if (album_date) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(album_date)) {
        albumDate = album_date;
      } else {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid date format. Use YYYY-MM-DD',
          }),
        };
      }
    }

    // Check if album with same name and date already exists for this event
    const existing = await connection.query(
      'SELECT * FROM albums WHERE event_id = ? AND name = ? AND (album_date = ? OR (album_date IS NULL AND ? IS NULL))',
      [eventId, albumName, albumDate, albumDate]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      // Return existing album
      const album = existing[0];
      const serialized: any = {};
      for (const [key, value] of Object.entries(album as any)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          album: serialized,
          message: 'Album already exists',
        }),
      };
    }

    // Verify user is authenticated
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required to create albums',
        }),
      };
    }

    // Create new album with cognito_sub and date
    const result = await connection.query(
      'INSERT INTO albums (event_id, name, album_date, cognito_sub, created_at) VALUES (?, ?, ?, ?, NOW())',
      [eventId, albumName, albumDate, cognitoSub]
    );

    const albumId = (result as any).insertId?.toString();
    const [newAlbum] = await connection.query(
      'SELECT * FROM albums WHERE id = ?',
      [albumId]
    );

    const serialized: any = {};
    if (newAlbum) {
      for (const [key, value] of Object.entries(newAlbum as any)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        album: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error creating album:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to create album',
      }),
    };
  }
}

/**
 * Update video category
 */
async function updateVideoCategory(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const pathMatch = event.path?.match(/^\/videos\/(\d+)$/);
    if (!pathMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid video ID',
        }),
      };
    }

    const videoId = parseInt(pathMatch[1]);
    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '{}';
    const body = JSON.parse(bodyString);
    const { category } = body;

    // Validate category
    const validCategories = ['shows', 'social', 'workshops', 'demos'];
    if (category !== null && category !== undefined && !validCategories.includes(category)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: `Invalid category. Must be one of: ${validCategories.join(', ')} or null`,
        }),
      };
    }

    // Verify user owns the video
    const [video] = await connection.query(
      'SELECT id, cognito_sub FROM videos WHERE id = ?',
      [videoId]
    ) as any[];

    if (!video || video.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Video not found',
        }),
      };
    }

    if (video.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to update this video',
        }),
      };
    }

    // Update category
    await connection.query(
      'UPDATE videos SET category = ?, updated_at = NOW() WHERE id = ?',
      [category || null, videoId]
    );

    // Get updated video
    const [updatedVideo] = await connection.query(
      'SELECT * FROM videos WHERE id = ?',
      [videoId]
    ) as any[];

    const serialized: any = {};
    if (updatedVideo) {
      for (const [key, value] of Object.entries(updatedVideo as any)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        video: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating video category:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update video category',
      }),
    };
  }
}

/**
 * Get user profile
 */
async function getUserProfile(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Get or create user profile
    let [user] = await connection.query(
      'SELECT * FROM users WHERE cognito_sub = ?',
      [cognitoSub]
    ) as any[];

    if (!user) {
      // Try to get user's email from Cognito claims for default name
      const claims = event.requestContext?.authorizer?.claims;
      const email = claims?.email || claims?.username || null;
      const defaultName = email ? email.split('@')[0] : null;
      
      console.log(`Creating new user profile for cognito_sub: ${cognitoSub}, default name: ${defaultName}`);
      
      // Create default user profile
      await connection.query(
        'INSERT INTO users (cognito_sub, name, created_at) VALUES (?, ?, NOW())',
        [cognitoSub, defaultName]
      );
      [user] = await connection.query(
        'SELECT * FROM users WHERE cognito_sub = ?',
        [cognitoSub]
      ) as any[];
      
      console.log(`✅ Created user profile:`, { cognito_sub: user?.cognito_sub, name: user?.name });
    } else {
      console.log(`✅ Found existing user profile:`, { cognito_sub: user.cognito_sub, name: user.name });
    }

    const serialized: any = {};
    if (user) {
      for (const [key, value] of Object.entries(user as any)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    // Generate presigned URL for photo if it exists
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    if (serialized.photo_url && bucketName) {
      try {
        let s3Key = serialized.photo_url;
        // Remove query parameters first (in case it's already a presigned URL)
        s3Key = s3Key.split('?')[0];
        
        if (s3Key.startsWith('s3://')) {
          const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
          if (match) {
            s3Key = decodeURIComponent(match[1]);
          }
        } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
          const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                       s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
          if (match) {
            s3Key = decodeURIComponent(match[1]);
          }
        } else if (s3Key.startsWith('users/')) {
          // Already a key path, use as-is
          s3Key = s3Key;
        }

        const getObjectCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
        });
        
        const presignedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });
        serialized.photo_url = presignedUrl;
      } catch (urlError) {
        console.error('Error generating presigned URL for profile photo:', urlError);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        profile: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error getting user profile:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to get user profile',
      }),
    };
  }
}

/**
 * Update user profile
 */
async function updateUserProfile(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '{}';
    const body = JSON.parse(bodyString);
    const { name, photo_url } = body;

    // Ensure user exists
    let [user] = await connection.query(
      'SELECT * FROM users WHERE cognito_sub = ?',
      [cognitoSub]
    ) as any[];

    if (!user) {
      // Create user profile
      await connection.query(
        'INSERT INTO users (cognito_sub, name, photo_url, created_at) VALUES (?, ?, ?, NOW())',
        [cognitoSub, name || null, photo_url || null]
      );
    } else {
      // Update user profile
      await connection.query(
        'UPDATE users SET name = ?, photo_url = ?, updated_at = NOW() WHERE cognito_sub = ?',
        [name !== undefined ? name : user.name, photo_url !== undefined ? photo_url : user.photo_url, cognitoSub]
      );
    }

    // Get updated profile
    [user] = await connection.query(
      'SELECT * FROM users WHERE cognito_sub = ?',
      [cognitoSub]
    ) as any[];

    const serialized: any = {};
    if (user) {
      for (const [key, value] of Object.entries(user as any)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    // Generate presigned URL for photo if it exists
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    if (serialized.photo_url && bucketName) {
      try {
        let s3Key = serialized.photo_url;
        // Remove query parameters first (in case it's already a presigned URL)
        s3Key = s3Key.split('?')[0];
        
        if (s3Key.startsWith('s3://')) {
          const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
          if (match) {
            s3Key = decodeURIComponent(match[1]);
          }
        } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
          const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                       s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
          if (match) {
            s3Key = decodeURIComponent(match[1]);
          }
        } else if (s3Key.startsWith('users/')) {
          // Already a key path, use as-is
          s3Key = s3Key;
        }

        const getObjectCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
        });
        
        const presignedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });
        serialized.photo_url = presignedUrl;
      } catch (urlError) {
        console.error('Error generating presigned URL for profile photo:', urlError);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        profile: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating user profile:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update user profile',
      }),
    };
  }
}

/**
 * Get public profile by nickname
 */
async function getPublicProfile(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  nickname: string
): Promise<APIGatewayProxyResult> {
  try {
    const [user] = await connection.query(
      `SELECT nickname, name, photo_url, cover_photo_url, bio, location, 
              dance_styles, followers_count, following_count 
       FROM users WHERE nickname = ?`,
      [nickname.toLowerCase()]
    ) as any[];

    if (!user) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    // Generate presigned URLs for photos
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    const profile: any = { ...user };
    
    // Parse dance_styles if it's a string
    if (typeof profile.dance_styles === 'string') {
      try {
        profile.dance_styles = JSON.parse(profile.dance_styles);
      } catch {
        profile.dance_styles = [];
      }
    }
    
    // Generate presigned URL for profile photo
    if (profile.photo_url && bucketName) {
      try {
        let s3Key = profile.photo_url.split('?')[0];
        if (s3Key.includes('amazonaws.com')) {
          const match = s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
          if (match) s3Key = decodeURIComponent(match[1]);
        }
        const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
        profile.photo_url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
      } catch (e) {
        console.error('Error generating presigned URL for photo:', e);
      }
    }
    
    // Generate presigned URL for cover photo
    if (profile.cover_photo_url && bucketName) {
      try {
        let s3Key = profile.cover_photo_url.split('?')[0];
        if (s3Key.includes('amazonaws.com')) {
          const match = s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
          if (match) s3Key = decodeURIComponent(match[1]);
        }
        const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
        profile.cover_photo_url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
      } catch (e) {
        console.error('Error generating presigned URL for cover photo:', e);
      }
    }

    // Get user's groups (placeholder - will be implemented when groups table exists)
    profile.groups = [];
    
    // Get user's schools (placeholder - will be implemented when schools table exists)
    profile.schools = [];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: true, profile }),
    };
  } catch (error: any) {
    console.error('Error getting public profile:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: false, error: error.message || 'Failed to get profile' }),
    };
  }
}

/**
 * Check if nickname is available
 */
async function checkNicknameAvailability(
  connection: mariadb.PoolConnection,
  nickname: string
): Promise<APIGatewayProxyResult> {
  try {
    const cleanNickname = nickname.toLowerCase().trim();
    
    // Validate format
    const validPattern = /^[a-zA-Z0-9_]{3,30}$/;
    if (!validPattern.test(cleanNickname)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: true, available: false, reason: 'Invalid format' }),
      };
    }
    
    // Check reserved words
    const reserved = ['admin', 'api', 'www', 'support', 'help', 'cachao', 'system', 'null', 'undefined'];
    if (reserved.includes(cleanNickname)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: true, available: false, reason: 'Reserved' }),
      };
    }

    const [existing] = await connection.query(
      'SELECT nickname FROM users WHERE nickname = ?',
      [cleanNickname]
    ) as any[];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: true, available: !existing }),
    };
  } catch (error: any) {
    console.error('Error checking nickname:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
}

/**
 * Update user nickname
 */
async function updateUserNickname(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Authentication required' }),
      };
    }

    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '{}';
    const { nickname } = JSON.parse(bodyString);
    
    if (!nickname) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Nickname is required' }),
      };
    }

    const cleanNickname = nickname.toLowerCase().trim();
    
    // Validate format
    const validPattern = /^[a-zA-Z0-9_]{3,30}$/;
    if (!validPattern.test(cleanNickname)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Invalid nickname format. Use 3-30 characters: letters, numbers, underscores only.' }),
      };
    }

    // Check if nickname is taken by another user
    const [existing] = await connection.query(
      'SELECT cognito_sub FROM users WHERE nickname = ? AND cognito_sub != ?',
      [cleanNickname, cognitoSub]
    ) as any[];

    if (existing) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Nickname is already taken' }),
      };
    }

    // Update nickname
    await connection.query(
      'UPDATE users SET nickname = ?, updated_at = NOW() WHERE cognito_sub = ?',
      [cleanNickname, cognitoSub]
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: true, nickname: cleanNickname }),
    };
  } catch (error: any) {
    console.error('Error updating nickname:', error);
    // Handle duplicate key error
    if (error.code === 'ER_DUP_ENTRY') {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Nickname is already taken' }),
      };
    }
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
}

/**
 * Get public user videos by nickname
 */
async function getPublicUserVideos(
  connection: mariadb.PoolConnection,
  nickname: string
): Promise<APIGatewayProxyResult> {
  try {
    // First get the user by nickname
    const [user] = await connection.query(
      'SELECT cognito_sub FROM users WHERE nickname = ?',
      [nickname.toLowerCase()]
    ) as any[];

    if (!user) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    // Get user's public videos
    const videos = await connection.query(
      `SELECT v.id, v.title, v.video_url, v.thumbnail_url, v.category, 
              v.event_id, e.name as event_name, v.created_at
       FROM videos v
       LEFT JOIN events e ON v.event_id = e.id
       WHERE v.cognito_sub = ?
       ORDER BY v.created_at DESC
       LIMIT 50`,
      [user.cognito_sub]
    ) as any[];

    // Generate presigned URLs for videos
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    const videosWithUrls = await Promise.all(videos.map(async (video: any) => {
      const result = { ...video };
      
      if (video.video_url && bucketName) {
        try {
          let s3Key = video.video_url.split('?')[0];
          if (s3Key.includes('amazonaws.com')) {
            const match = s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
            if (match) s3Key = decodeURIComponent(match[1]);
          }
          const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
          result.video_url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
        } catch (e) {
          console.error('Error generating presigned URL for video:', e);
        }
      }
      
      if (video.thumbnail_url && bucketName) {
        try {
          let s3Key = video.thumbnail_url.split('?')[0];
          if (s3Key.includes('amazonaws.com')) {
            const match = s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
            if (match) s3Key = decodeURIComponent(match[1]);
          }
          const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
          result.thumbnail_url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
        } catch (e) {
          console.error('Error generating presigned URL for thumbnail:', e);
        }
      }
      
      return result;
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: true, videos: videosWithUrls }),
    };
  } catch (error: any) {
    console.error('Error getting public user videos:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
}

/**
 * Generate presigned URL for profile photo upload
 */
async function generateProfilePhotoUploadUrl(
  event: APIGatewayProxyEvent,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body || '{}';
    const body = JSON.parse(bodyString);
    const { filename, file_size, mime_type } = body;

    if (!filename || !file_size) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Filename and file_size are required',
        }),
      };
    }

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
          error: 'S3 bucket not configured',
        }),
      };
    }

    // Sanitize filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const s3Key = `users/${cognitoSub}/photos/${timestamp}-${sanitizedFilename}`;

    // Generate presigned URL (1 hour expiration)
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: mime_type || 'image/jpeg',
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        upload_url: presignedUrl,
        s3_key: s3Key,
        s3_url: s3Url,
        expires_in: 3600,
      }),
    };
  } catch (error: any) {
    console.error('Error generating profile photo upload URL:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate profile photo upload URL',
      }),
    };
  }
}

/**
 * Get user's events (both owned and where they work as staff/artist)
 */
async function getUserEvents(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Get user's email from Cognito claims
    const claims = event.requestContext?.authorizer?.claims;
    let userEmail = claims?.email || null;
    
    // If no claims from authorizer, try to decode from JWT token
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
        } catch (decodeError: any) {
          console.error('Error decoding JWT token for email:', decodeError);
        }
      }
    }

    // Get events owned by user
    const ownedEvents = await connection.query(
      'SELECT *, "owner" as user_role FROM events WHERE cognito_sub = ?',
      [cognitoSub]
    ) as any[];

    // Get events where user is staff/artist (by email)
    // Note: event_staff table uses email for matching, cognito_sub column may not exist
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
      
      console.log(`Found ${staffEvents.length} events where user is staff/artist (by email)`);
    } else {
      console.warn('No user email available, cannot find events where user is staff/artist');
    }
    
    // Also check if cognito_sub column exists in event_staff table (for future compatibility)
    // If it exists, also search by cognito_sub to catch any staff records that might have it
    try {
      const columnCheck = await connection.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'event_staff'
          AND COLUMN_NAME = 'cognito_sub'
      `) as any[];
      
      const hasCognitoSubColumn = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;
      
      if (hasCognitoSubColumn && cognitoSub) {
        // If cognito_sub column exists, also search by it
        // Exclude events already found by email to avoid duplicates
        const existingEventIds = staffEvents.map((e: any) => e.id);
        const cognitoSubQuery = existingEventIds.length > 0
          ? `SELECT DISTINCT e.*, es.role as user_role
             FROM events e
             INNER JOIN event_staff es ON e.id = es.event_id
             WHERE es.cognito_sub = ?
               AND e.cognito_sub != ?
               AND e.id NOT IN (${existingEventIds.join(',')})
             ORDER BY e.start_date DESC`
          : `SELECT DISTINCT e.*, es.role as user_role
             FROM events e
             INNER JOIN event_staff es ON e.id = es.event_id
             WHERE es.cognito_sub = ?
               AND e.cognito_sub != ?
             ORDER BY e.start_date DESC`;
        
        const cognitoSubEvents = await connection.query(
          cognitoSubQuery,
          [cognitoSub, cognitoSub]
        ) as any[];
        
        console.log(`Found ${cognitoSubEvents.length} additional events where user is staff/artist (by cognito_sub)`);
        
        // Merge with email-based results
        staffEvents = [...staffEvents, ...cognitoSubEvents];
      }
    } catch (colError) {
      console.warn('Error checking for cognito_sub column in event_staff:', colError);
      // Continue without cognito_sub matching
    }

    // Combine and deduplicate events (prefer owned events if duplicate)
    const eventMap = new Map();
    
    // Add owned events first
    ownedEvents.forEach((evt: any) => {
      eventMap.set(evt.id, evt);
    });
    
    // Add staff events (won't overwrite owned events)
    staffEvents.forEach((evt: any) => {
      if (!eventMap.has(evt.id)) {
        eventMap.set(evt.id, evt);
      }
    });

    // Convert to array and sort by start_date
    const events = Array.from(eventMap.values()).sort((a: any, b: any) => {
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return dateB - dateA; // Descending order
    });

    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;

    const serializedEvents = await Promise.all(events.map(async (row: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
      
      // Generate presigned URL for event image if it exists
      if (serialized.image_url && bucketName) {
        try {
          let s3Key = serialized.image_url;
          if (s3Key.startsWith('s3://')) {
            const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
            if (match) {
              s3Key = match[1];
            }
          } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
            const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                         s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
            if (match) {
              s3Key = match[1];
            }
          }
          
          const getObjectCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
          });
          
          const presignedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });
          serialized.image_url = presignedUrl;
        } catch (urlError) {
          console.error('Error generating presigned URL for event image:', urlError);
        }
      }
      
      return serialized;
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        count: serializedEvents.length,
        events: serializedEvents,
      }),
    };
  } catch (error: any) {
    console.error('Error getting user events:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to get user events',
      }),
    };
  }
}

/**
 * Update an event - only if user owns it
 */
async function updateEvent(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const eventIdMatch = event.pathParameters?.id;
    if (!eventIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    if (isNaN(eventId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    // Verify ownership
    const existingEvents = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!Array.isArray(existingEvents) || existingEvents.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event not found',
        }),
      };
    }

    const existingEvent = existingEvents[0];

    // Strict ownership check: must have cognito_sub and it must match
    if (!existingEvent.cognito_sub || existingEvent.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to update this event',
        }),
      };
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { name, description, start_date, end_date, image_url } = body;

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description || null);
    }
    if (start_date !== undefined) {
      updates.push('start_date = ?');
      values.push(start_date);
    }
    if (end_date !== undefined) {
      updates.push('end_date = ?');
      values.push(end_date || null);
    }
    if (image_url !== undefined) {
      let cleanImageUrl = image_url;
      
      // If it's a presigned URL, extract just the S3 path
      if (image_url && (image_url.includes('X-Amz-') || image_url.includes('?'))) {
        // Remove query parameters (presigned URL signature)
        cleanImageUrl = image_url.split('?')[0];
      }
      
      // Validate image_url length (VARCHAR(500))
      if (cleanImageUrl && cleanImageUrl.length > 500) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Image URL is too long (max 500 characters)',
          }),
        };
      }
      updates.push('image_url = ?');
      values.push(cleanImageUrl || null);
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'No fields to update',
        }),
      };
    }

    updates.push('updated_at = NOW()');
    values.push(eventId);

    await connection.query(
      `UPDATE events SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch updated event
    const updatedEvents = await connection.query(
      'SELECT * FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    const serialized: any = {};
    if (Array.isArray(updatedEvents) && updatedEvents.length > 0) {
      const updatedEvent = updatedEvents[0];
      for (const [key, value] of Object.entries(updatedEvent)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        event: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating event:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update event',
      }),
    };
  }
}

/**
 * Delete an event - only if user owns it
 */
async function deleteEvent(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const eventIdMatch = event.pathParameters?.id;
    if (!eventIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    if (isNaN(eventId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    // Verify ownership
    const existingEvents = await connection.query(
      'SELECT cognito_sub, image_url FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!Array.isArray(existingEvents) || existingEvents.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event not found',
        }),
      };
    }

    const existingEvent = existingEvents[0];

    // Strict ownership check: must have cognito_sub and it must match
    if (!existingEvent.cognito_sub || existingEvent.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to delete this event',
        }),
      };
    }

    // Delete event image from S3 if it exists
    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    if (existingEvent.image_url && bucketName) {
      try {
        let s3Key = existingEvent.image_url;
        if (s3Key.startsWith('s3://')) {
          const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
          if (match) {
            s3Key = match[1];
          }
        } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
          const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                       s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
          if (match) {
            s3Key = match[1];
          }
        }

        if (s3Key && s3Key !== existingEvent.image_url) {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
          });
          
          // Delete asynchronously (fire-and-forget)
          s3.send(deleteCommand)
            .then(() => {
              console.log(`✅ Successfully deleted event image from S3: ${s3Key}`);
            })
            .catch((s3Error: any) => {
              console.error(`❌ Failed to delete event image from S3 ${s3Key}:`, s3Error);
            });
        }
      } catch (s3Error) {
        console.error('Error deleting event image from S3:', s3Error);
        // Continue with database deletion even if S3 deletion fails
      }
    }

    // Delete from database
    await connection.query('DELETE FROM events WHERE id = ?', [eventId]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Event deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error deleting event:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete event',
      }),
    };
  }
}

/**
 * Get event staff (staff and artists)
 */
async function getEventStaff(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    // Try to get event ID from pathParameters first
    let eventIdMatch = event.pathParameters?.id;
    
    // If not in pathParameters, extract from path
    if (!eventIdMatch && event.path) {
      const pathMatch = event.path.match(/^\/events\/(\d+)\/staff$/);
      if (pathMatch && pathMatch[1]) {
        eventIdMatch = pathMatch[1];
      }
    }
    
    if (!eventIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    if (isNaN(eventId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    // Check if we should filter by is_public (for public views)
    const queryParams = event.queryStringParameters || {};
    const publicOnly = queryParams.public === 'true';
    
    // Use SELECT * to automatically include all columns (including image_url and is_public if they exist)
    let query = 'SELECT * FROM event_staff WHERE event_id = ?';
    const queryValues: any[] = [eventId];
    
    // If publicOnly is true, filter to only show artists with is_public = true
    if (publicOnly) {
      // Check if is_public column exists
      try {
        const columnCheck = await connection.query(`
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_staff'
            AND COLUMN_NAME = 'is_public'
        `) as any[];
        
        const hasIsPublicColumn = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;
        
        if (hasIsPublicColumn) {
          query += ' AND role = ? AND is_public = ?';
          queryValues.push('artist', 1);
        } else {
          // If column doesn't exist, return empty array for public view
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: true,
              count: 0,
              staff: [],
            }),
          };
        }
      } catch (colError) {
        console.warn('Error checking for is_public column:', colError);
        // If we can't check, return empty for safety
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: true,
            count: 0,
            staff: [],
          }),
        };
      }
    }
    
    query += ' ORDER BY role, name';
    
    const staff = await connection.query(query, queryValues) as any[];

    // Fetch subcategories for each artist
    const serialized = Array.isArray(staff) 
      ? await Promise.all(staff.map(async (row: any) => {
          const serialized: any = {};
          for (const [key, value] of Object.entries(row)) {
            if (typeof value === 'bigint') {
              serialized[key] = value.toString();
            } else if (key === 'is_public' && (value === 0 || value === 1 || value === '0' || value === '1')) {
              // Convert TINYINT(1) boolean to JavaScript boolean
              serialized[key] = value === 1 || value === '1' || value === true;
            } else {
              serialized[key] = value;
            }
          }
          
          // If this is an artist, fetch their subcategories
          if (serialized.role === 'artist') {
            try {
              const subcategories = await connection.query(
                `SELECT sc.name, sc.display_name 
                 FROM event_staff_subcategories ess
                 INNER JOIN artist_subcategories sc ON ess.subcategory_id = sc.id
                 WHERE ess.staff_id = ?`,
                [serialized.id]
              ) as any[];
              
              serialized.subcategories = Array.isArray(subcategories) 
                ? subcategories.map((sc: any) => sc.name)
                : [];
            } catch (subcatError) {
              console.error('Error fetching subcategories:', subcatError);
              serialized.subcategories = [];
            }
          } else {
            serialized.subcategories = [];
          }
          
          return serialized;
        }))
      : [];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        count: serialized.length,
        staff: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error getting event staff:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to get event staff',
      }),
    };
  }
}

/**
 * Get artist profile with their public events
 */
async function getArtistProfile(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    // Get artist ID from path
    const artistIdMatch = event.pathParameters?.id;
    
    if (!artistIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Artist ID is required',
        }),
      };
    }

    const artistId = parseInt(artistIdMatch);
    if (isNaN(artistId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid artist ID',
        }),
      };
    }

    // Get artist info
    const artistRecords = await connection.query(
      'SELECT * FROM event_staff WHERE id = ? AND role = ?',
      [artistId, 'artist']
    ) as any[];

    if (!Array.isArray(artistRecords) || artistRecords.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Artist not found',
        }),
      };
    }

    const artist = artistRecords[0];

    // Serialize artist
    const serializedArtist: any = {};
    for (const [key, value] of Object.entries(artist)) {
      if (typeof value === 'bigint') {
        serializedArtist[key] = value.toString();
      } else if (key === 'is_public' && (value === 0 || value === 1 || value === '0' || value === '1')) {
        serializedArtist[key] = value === 1 || value === '1' || value === true;
      } else {
        serializedArtist[key] = value;
      }
    }

    // Get subcategories
    try {
      const subcategories = await connection.query(
        `SELECT sc.name, sc.display_name 
         FROM event_staff_subcategories ess
         INNER JOIN artist_subcategories sc ON ess.subcategory_id = sc.id
         WHERE ess.staff_id = ?`,
        [artistId]
      ) as any[];
      
      serializedArtist.subcategories = Array.isArray(subcategories) 
        ? subcategories.map((sc: any) => sc.name)
        : [];
    } catch (subcatError) {
      console.error('Error fetching subcategories:', subcatError);
      serializedArtist.subcategories = [];
    }

    // Get all public events where this artist participates
    // First check if is_public column exists
    let hasIsPublicColumn = false;
    try {
      const columnCheck = await connection.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'event_staff'
          AND COLUMN_NAME = 'is_public'
      `) as any[];
      hasIsPublicColumn = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;
    } catch (e) {
      console.warn('Error checking for is_public column:', e);
    }

    // Match by email if available, or by name as fallback
    let publicEventsQuery = `
      SELECT DISTINCT e.*
      FROM events e
      INNER JOIN event_staff es ON e.id = es.event_id
      WHERE es.role = 'artist'
    `;
    
    if (hasIsPublicColumn) {
      publicEventsQuery += ' AND es.is_public = 1';
    }
    
    const eventParams: any[] = [];
    
    if (artist.email) {
      publicEventsQuery += ' AND es.email = ?';
      eventParams.push(artist.email);
    } else if (artist.name) {
      publicEventsQuery += ' AND es.name = ?';
      eventParams.push(artist.name);
    } else {
      // If no email or name, only return events for this specific artist ID
      publicEventsQuery += ' AND es.id = ?';
      eventParams.push(artistId);
    }
    
    publicEventsQuery += ' ORDER BY e.start_date DESC';

    const publicEvents = await connection.query(publicEventsQuery, eventParams) as any[];

    // Serialize events
    const serializedEvents = await Promise.all((Array.isArray(publicEvents) ? publicEvents : []).map(async (row: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
      
      // Generate presigned URL for event image if it exists
      if (serialized.image_url && process.env.S3_BUCKET_NAME) {
        try {
          const s3 = getS3Client();
          let imageS3Key = serialized.image_url;
          imageS3Key = imageS3Key.split('?')[0];
          
          if (imageS3Key.startsWith('s3://')) {
            const match = imageS3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
            if (match) {
              imageS3Key = decodeURIComponent(match[1]);
            }
          } else if (imageS3Key.includes('.s3.') || imageS3Key.includes('amazonaws.com')) {
            const match = imageS3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                         imageS3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
            if (match) {
              imageS3Key = decodeURIComponent(match[1]);
            }
          }
          
          if (imageS3Key && imageS3Key.trim() !== '') {
            const getImageCommand = new GetObjectCommand({
              Bucket: process.env.S3_BUCKET_NAME,
              Key: imageS3Key,
            });
            
            const imagePresignedUrl = await getSignedUrl(s3, getImageCommand, { expiresIn: 3600 });
            serialized.image_url = imagePresignedUrl;
          }
        } catch (imageError) {
          console.error('Error generating presigned URL for event image:', imageError);
        }
      }
      
      return serialized;
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        artist: serializedArtist,
        events: serializedEvents,
      }),
    };
  } catch (error: any) {
    console.error('Error getting artist profile:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to get artist profile',
      }),
    };
  }
}

/**
 * Add staff/artist to event
 */
async function addEventStaff(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Try to get event ID from pathParameters first
    let eventIdMatch = event.pathParameters?.id;
    
    // If not in pathParameters, extract from path
    if (!eventIdMatch && event.path) {
      const pathMatch = event.path.match(/^\/events\/(\d+)\/staff$/);
      if (pathMatch && pathMatch[1]) {
        eventIdMatch = pathMatch[1];
      }
    }
    
    if (!eventIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    if (isNaN(eventId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    // Verify event ownership
    const existingEvents = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!Array.isArray(existingEvents) || existingEvents.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event not found',
        }),
      };
    }

    const existingEvent = existingEvents[0];
    // Strict ownership check: must have cognito_sub and it must match
    if (!existingEvent.cognito_sub || existingEvent.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage staff for this event',
        }),
      };
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { name, role, email, phone, notes, subcategories, image_url, is_public } = body;

    if (!name || !role) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Name and role are required',
        }),
      };
    }

    if (role !== 'staff' && role !== 'artist') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Role must be either "staff" or "artist"',
        }),
      };
    }

    // If email is provided, create or find Cognito user
    let staffCognitoSub: string | null = null;
    
    if (email) {
      try {
        const cognito = getCognitoClient();
        const userPoolId = process.env.USER_POOL_ID || process.env.COGNITO_USER_POOL_ID;
        
        if (userPoolId) {
          // Check if user already exists in Cognito
          // Normalize email to lowercase for case-insensitive comparison
          // Escape email for filter - Cognito filter requires proper escaping
          const normalizedEmail = email.toLowerCase().trim();
          const escapedEmail = normalizedEmail.replace(/"/g, '\\"');
          const listUsersCommand = new ListUsersCommand({
            UserPoolId: userPoolId,
            Filter: `email = "${escapedEmail}"`,
            Limit: 1,
          });
          
          let listUsersResponse;
          try {
            listUsersResponse = await cognito.send(listUsersCommand);
          } catch (listError: any) {
            console.error('❌ Error listing Cognito users:', listError);
            console.error('Error details:', {
              message: listError.message,
              code: listError.code,
              name: listError.name,
              userPoolId: userPoolId,
              email: email,
            });
            // Continue - assume user doesn't exist and try to create
            listUsersResponse = { Users: [] };
          }
          
          if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
            // User exists, get the sub
            const user = listUsersResponse.Users[0];
            staffCognitoSub = user.Attributes?.find((attr: any) => attr.Name === 'sub')?.Value || null;
            console.log(`User with email ${email} already exists in Cognito: ${staffCognitoSub}`);
            
            // Ensure user record exists in database
            if (staffCognitoSub) {
              try {
                await connection.query(
                  'INSERT INTO users (cognito_sub, name, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE name = ?',
                  [staffCognitoSub, name, name]
                );
                console.log(`User record in database verified/created: ${staffCognitoSub}`);
              } catch (dbError: any) {
                console.error('Error ensuring user record in database:', dbError);
                // Continue anyway
              }
            }
          } else {
            // User doesn't exist, create it
            // Normalize email to lowercase for consistency
            const normalizedEmailForCreation = email.toLowerCase().trim();
            console.log(`Creating new Cognito user for staff/artist: ${normalizedEmailForCreation}`);
            
            // Generate a temporary password
            const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
            
            // Create user with email delivery
            // Set email_verified to true for admin-created users since we trust the admin
            // This prevents the issue where users need to verify email on first sign-in
            const createUserCommand = new AdminCreateUserCommand({
              UserPoolId: userPoolId,
              Username: normalizedEmailForCreation,
              UserAttributes: [
                { Name: 'email', Value: normalizedEmailForCreation },
                { Name: 'email_verified', Value: 'true' }, // Admin-created users are trusted
                { Name: 'name', Value: name },
              ],
              TemporaryPassword: tempPassword,
              // DesiredDeliveryMediums: EMAIL tells Cognito to send via email
              DesiredDeliveryMediums: ['EMAIL'],
            });
            
            let createUserResponse;
            try {
              createUserResponse = await cognito.send(createUserCommand);
              staffCognitoSub = createUserResponse.User?.Attributes?.find((attr: any) => attr.Name === 'sub')?.Value || null;
              
              if (staffCognitoSub) {
                console.log(`✅ Created new Cognito user: ${staffCognitoSub}`);
                console.log(`📧 Welcome email with temporary password should be sent to: ${email}`);
                console.log(`📋 User status: ${createUserResponse.User?.UserStatus || 'unknown'}`);
                console.log(`📋 User enabled: ${createUserResponse.User?.Enabled || 'unknown'}`);
                console.log(`ℹ️  User can sign in with temporary password and will be prompted to set a new password`);
              } else {
                console.warn('❌ Failed to create Cognito user - no cognito_sub returned');
              }
            } catch (createError: any) {
              console.error('❌ Error creating Cognito user:', createError);
              console.error('Error details:', {
                message: createError.message,
                code: createError.code,
                name: createError.name,
                statusCode: createError.$metadata?.httpStatusCode,
                requestId: createError.$metadata?.requestId,
                userPoolId: userPoolId,
                email: email,
                username: email,
              });
              // Log the full error for debugging
              if (createError.$response) {
                console.error('Full error response:', JSON.stringify(createError.$response, null, 2));
              }
              // Continue - we'll create staff without Cognito account
              staffCognitoSub = null;
            }
            
            if (staffCognitoSub) {
              
              // Create user record in database
              try {
                await connection.query(
                  'INSERT INTO users (cognito_sub, name, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE name = ?',
                  [staffCognitoSub, name, name]
                );
                console.log(`Created user record in database: ${staffCognitoSub}`);
              } catch (dbError: any) {
                console.error('Error creating user record in database:', dbError);
                // Continue anyway - user exists in Cognito
              }
            } else {
              console.warn('Failed to create Cognito user - no cognito_sub returned');
            }
          }
        }
      } catch (cognitoError: any) {
        console.error('Error creating/finding Cognito user for staff:', cognitoError);
        // Continue with staff creation even if Cognito user creation fails
        // Staff will be created without cognito_sub
      }
    }

    // Add the staff member (with cognito_sub if available)
    // Check if is_public and image_url columns exist (using same pattern as other checks in codebase)
    let hasIsPublicColumn = false;
    let hasImageUrlColumn = false;
    try {
      const isPublicCheck = await connection.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'event_staff'
          AND COLUMN_NAME = 'is_public'
      `) as any[];
      hasIsPublicColumn = Array.isArray(isPublicCheck) && isPublicCheck.length > 0 && (isPublicCheck[0] as any).count > 0;
    } catch (e) {
      console.warn('Error checking for is_public column:', e);
    }
    
    try {
      const imageUrlCheck = await connection.query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'event_staff'
          AND COLUMN_NAME = 'image_url'
      `) as any[];
      hasImageUrlColumn = Array.isArray(imageUrlCheck) && imageUrlCheck.length > 0 && (imageUrlCheck[0] as any).count > 0;
    } catch (e) {
      console.warn('Error checking for image_url column:', e);
    }

    let result;
    const columns: string[] = ['event_id', 'name', 'role'];
    const values: any[] = [eventId, name, role];
    
    if (hasIsPublicColumn) {
      columns.push('is_public');
      values.push(is_public === true || is_public === 'true' ? 1 : 0);
    }
    
    columns.push('email', 'phone', 'notes');
    values.push(email || null, phone || null, notes || null);
    
    if (hasImageUrlColumn) {
      columns.push('image_url');
      values.push(image_url || null);
    }
    
    columns.push('created_at');
    const placeholders = columns.map((col) => col === 'created_at' ? 'NOW()' : '?').join(', ');
    
    result = await connection.query(
      `INSERT INTO event_staff (${columns.join(', ')}) 
       VALUES (${placeholders})`,
      values
    );

    const staffId = (result as any).insertId?.toString();
    
    if (!staffId) {
      throw new Error('Failed to create staff member - no insert ID returned');
    }

    // If this is an artist and subcategories are provided, add them
    if (role === 'artist' && Array.isArray(subcategories) && subcategories.length > 0) {
      try {
        // Get subcategory IDs for the provided subcategory names
        const subcategoryNames = subcategories.filter((sc: string) => 
          ['dj', 'media', 'teacher', 'performer'].includes(sc.toLowerCase())
        );
        
        if (subcategoryNames.length > 0) {
          // Create placeholders for IN clause
          const placeholders = subcategoryNames.map(() => '?').join(',');
          const subcategoryRecords = await connection.query(
            `SELECT id FROM artist_subcategories WHERE name IN (${placeholders})`,
            subcategoryNames
          ) as any[];
          
          if (Array.isArray(subcategoryRecords) && subcategoryRecords.length > 0) {
            // Insert subcategory associations
            for (const subcatRecord of subcategoryRecords) {
              try {
                await connection.query(
                  'INSERT INTO event_staff_subcategories (staff_id, subcategory_id, created_at) VALUES (?, ?, NOW())',
                  [staffId, subcatRecord.id]
                );
              } catch (insertError: any) {
                // Ignore duplicate key errors
                if (insertError.code !== 'ER_DUP_ENTRY') {
                  console.error('Error inserting subcategory:', insertError);
                }
              }
            }
          }
        }
      } catch (subcatError) {
        console.error('Error adding subcategories:', subcatError);
        // Continue - subcategories are optional
      }
    }

    // Fetch the created staff member with subcategories
    const [createdStaff] = await connection.query(
      'SELECT * FROM event_staff WHERE id = ?',
      [staffId]
    ) as any[];

    const serialized: any = {};
    if (createdStaff) {
      for (const [key, value] of Object.entries(createdStaff)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else if (key === 'is_public' && (value === 0 || value === 1 || value === '0' || value === '1')) {
          // Convert TINYINT(1) boolean to JavaScript boolean
          serialized[key] = value === 1 || value === '1' || value === true;
        } else {
          serialized[key] = value;
        }
      }
      
      // Fetch subcategories if this is an artist
      if (createdStaff.role === 'artist') {
        try {
          const subcategories = await connection.query(
            `SELECT sc.name 
             FROM event_staff_subcategories ess
             INNER JOIN artist_subcategories sc ON ess.subcategory_id = sc.id
             WHERE ess.staff_id = ?`,
            [staffId]
          ) as any[];
          
          serialized.subcategories = Array.isArray(subcategories) 
            ? subcategories.map((sc: any) => sc.name)
            : [];
        } catch (subcatError) {
          console.error('Error fetching subcategories:', subcatError);
          serialized.subcategories = [];
        }
      } else {
        serialized.subcategories = [];
      }
    }

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        staff: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error adding event staff:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to add event staff',
      }),
    };
  }
}

/**
 * Update staff/artist information
 */
async function updateEventStaff(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Try to get IDs from pathParameters first
    let eventIdMatch = event.pathParameters?.id;
    let staffIdMatch = event.pathParameters?.staffId;
    
    // If not in pathParameters, extract from path
    if ((!eventIdMatch || !staffIdMatch) && event.path) {
      const pathMatch = event.path.match(/^\/events\/(\d+)\/staff\/(\d+)$/);
      if (pathMatch && pathMatch[1] && pathMatch[2]) {
        eventIdMatch = eventIdMatch || pathMatch[1];
        staffIdMatch = staffIdMatch || pathMatch[2];
      }
    }
    
    if (!eventIdMatch || !staffIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Staff ID are required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    const staffId = parseInt(staffIdMatch);
    
    if (isNaN(eventId) || isNaN(staffId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID or staff ID',
        }),
      };
    }

    // Ensure staffId is a number for database queries
    const staffIdNum = Number(staffId);
    if (isNaN(staffIdNum)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid staff ID format',
        }),
      };
    }

    // Verify event ownership
    const existingEvents = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!Array.isArray(existingEvents) || existingEvents.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event not found',
        }),
      };
    }

    const existingEvent = existingEvents[0];
    // Strict ownership check: must have cognito_sub and it must match
    if (!existingEvent.cognito_sub || existingEvent.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage staff for this event',
        }),
      };
    }

    // Verify staff belongs to event
    const staffRecords = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staffIdNum, eventId]
    ) as any[];

    if (!Array.isArray(staffRecords) || staffRecords.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found',
        }),
      };
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { name, role, email: rawEmail, phone, notes, subcategories, image_url, is_public } = body;
    // Normalize email to lowercase for case-insensitive comparison
    const email = rawEmail ? rawEmail.toLowerCase().trim() : null;

    if (!name || !role) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Name and role are required',
        }),
      };
    }

    if (role !== 'staff' && role !== 'artist') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Role must be either "staff" or "artist"',
        }),
      };
    }

    // Get current staff member to check if email is being added/changed
    const [currentStaff] = await connection.query(
      'SELECT email FROM event_staff WHERE id = ? AND event_id = ?',
      [staffIdNum, eventId]
    ) as any[];
    
    const currentEmail = currentStaff?.email ? currentStaff.email.toLowerCase().trim() : null;
    const newEmail = email;
    const emailChanged = newEmail && newEmail !== currentEmail;
    
    // If email is being added or changed, create/find Cognito user
    let staffCognitoSub: string | null = null;
    if (emailChanged && newEmail) {
      try {
        const cognito = getCognitoClient();
        const userPoolId = process.env.USER_POOL_ID || process.env.COGNITO_USER_POOL_ID;
        
        if (userPoolId) {
          // Check if user already exists in Cognito
          // Normalize email to lowercase for case-insensitive comparison
          const normalizedNewEmail = newEmail.toLowerCase().trim();
          const escapedEmail = normalizedNewEmail.replace(/"/g, '\\"');
          const listUsersCommand = new ListUsersCommand({
            UserPoolId: userPoolId,
            Filter: `email = "${escapedEmail}"`,
            Limit: 1,
          });
          
          let listUsersResponse;
          try {
            listUsersResponse = await cognito.send(listUsersCommand);
          } catch (listError: any) {
            console.error('❌ Error listing Cognito users:', listError);
            console.error('Error details:', {
              message: listError.message,
              code: listError.code,
              name: listError.name,
              userPoolId: userPoolId,
              email: newEmail,
            });
            // Continue - assume user doesn't exist and try to create
            listUsersResponse = { Users: [] };
          }
          
          if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
            // User exists, get their cognito_sub
            const existingUser = listUsersResponse.Users[0];
            staffCognitoSub = existingUser.Attributes?.find((attr: any) => attr.Name === 'sub')?.Value || null;
            console.log(`Found existing Cognito user for email ${newEmail}: ${staffCognitoSub}`);
          } else {
            // User doesn't exist, create new one
            // Normalize email to lowercase for consistency
            const normalizedNewEmailForCreation = normalizedNewEmail;
            console.log(`Creating new Cognito user for email: ${normalizedNewEmailForCreation}`);
            
            // Generate a temporary password
            const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
            
            // Create user with email delivery
            // Set email_verified to true for admin-created users since we trust the admin
            // This prevents the issue where users need to verify email on first sign-in
            const createUserCommand = new AdminCreateUserCommand({
              UserPoolId: userPoolId,
              Username: normalizedNewEmailForCreation,
              UserAttributes: [
                { Name: 'email', Value: normalizedNewEmailForCreation },
                { Name: 'email_verified', Value: 'true' }, // Admin-created users are trusted
                { Name: 'name', Value: name },
              ],
              TemporaryPassword: tempPassword,
              // DesiredDeliveryMediums: EMAIL tells Cognito to send via email
              DesiredDeliveryMediums: ['EMAIL'],
            });
            
            let createUserResponse;
            try {
              createUserResponse = await cognito.send(createUserCommand);
              staffCognitoSub = createUserResponse.User?.Attributes?.find((attr: any) => attr.Name === 'sub')?.Value || null;
              
              if (staffCognitoSub) {
                console.log(`✅ Created new Cognito user: ${staffCognitoSub}`);
                console.log(`📧 Welcome email with temporary password should be sent to: ${newEmail}`);
                console.log(`📋 User status: ${createUserResponse.User?.UserStatus || 'unknown'}`);
                console.log(`📋 User enabled: ${createUserResponse.User?.Enabled || 'unknown'}`);
                console.log(`ℹ️  User can sign in with temporary password and will be prompted to set a new password`);
              } else {
                console.warn('❌ Failed to create Cognito user - no cognito_sub returned');
              }
            } catch (createError: any) {
              console.error('❌ Error creating Cognito user:', createError);
              console.error('Error details:', {
                message: createError.message,
                code: createError.code,
                name: createError.name,
                statusCode: createError.$metadata?.httpStatusCode,
                requestId: createError.$metadata?.requestId,
                userPoolId: userPoolId,
                email: newEmail,
                username: newEmail,
              });
              // Log the full error for debugging
              if (createError.$response) {
                console.error('Full error response:', JSON.stringify(createError.$response, null, 2));
              }
              // Continue - we'll create staff without Cognito account
              staffCognitoSub = null;
            }
            
            if (staffCognitoSub) {
              
              // Create user record in database
              try {
                await connection.query(
                  'INSERT INTO users (cognito_sub, name, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE name = ?',
                  [staffCognitoSub, name, name]
                );
                console.log(`Created user record in database: ${staffCognitoSub}`);
              } catch (dbError: any) {
                console.error('Error creating user record in database:', dbError);
                // Continue anyway - user exists in Cognito
              }
            } else {
              console.warn('Failed to create Cognito user - no cognito_sub returned');
            }
          }
        }
      } catch (cognitoError: any) {
        console.error('Error creating/finding Cognito user for staff update:', cognitoError);
        // Continue with staff update even if Cognito user creation fails
        // Staff will be updated without cognito_sub
      }
    }

    // Update staff member
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    
    updateFields.push('name = ?');
    updateValues.push(name);
    updateFields.push('role = ?');
    updateValues.push(role);
    updateFields.push('email = ?');
    updateValues.push(email || null);
    updateFields.push('phone = ?');
    updateValues.push(phone || null);
    updateFields.push('notes = ?');
    updateValues.push(notes || null);
    
    // Handle is_public if provided
    if (body.is_public !== undefined) {
      try {
        const columnCheck = await connection.query(`
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_staff'
            AND COLUMN_NAME = 'is_public'
        `) as any[];
        
        const hasIsPublicColumn = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;
        
        if (hasIsPublicColumn) {
          updateFields.push('is_public = ?');
          updateValues.push(is_public === true || is_public === 'true' || is_public === 1 ? 1 : 0);
        }
      } catch (colError) {
        console.warn('Error checking for is_public column:', colError);
      }
    }
    
    // Only try to update image_url if it's provided and the column exists
    // We'll check if the column exists first, or just try and catch the error
    if (body.image_url !== undefined) {
      try {
        // Check if image_url column exists
        const columnCheck = await connection.query(`
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_staff'
            AND COLUMN_NAME = 'image_url'
        `) as any[];
        
        const hasImageUrlColumn = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;
        
        if (hasImageUrlColumn) {
          updateFields.push('image_url = ?');
          updateValues.push(image_url || null);
        } else {
          console.warn('image_url column does not exist in event_staff table, skipping image_url update');
        }
      } catch (colError) {
        console.warn('Error checking for image_url column, skipping image_url update:', colError);
        // Continue without image_url
      }
    }
    
    updateFields.push('updated_at = NOW()');
    updateValues.push(staffIdNum, eventId);
    
    await connection.query(
      `UPDATE event_staff 
       SET ${updateFields.join(', ')}
       WHERE id = ? AND event_id = ?`,
      updateValues
    );

    // Update subcategories if this is an artist
    if (role === 'artist') {
      try {
        // Check if subcategories tables exist
        const tablesCheck = await connection.query(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME IN ('artist_subcategories', 'event_staff_subcategories')
        `) as any[];
        
        const hasSubcategoryTables = Array.isArray(tablesCheck) && tablesCheck.length === 2;
        
        if (!hasSubcategoryTables) {
          console.warn('Subcategory tables do not exist, skipping subcategory updates');
        } else {
          // Remove existing subcategories
          await connection.query(
            'DELETE FROM event_staff_subcategories WHERE staff_id = ?',
            [staffIdNum]
          );
          
          // Add new subcategories if provided
          if (subcategories !== undefined && subcategories !== null && Array.isArray(subcategories) && subcategories.length > 0) {
            const subcategoryNames = subcategories
              .filter((sc: any) => sc && typeof sc === 'string')
              .map((sc: string) => sc.toLowerCase())
              .filter((sc: string) => ['dj', 'media', 'teacher', 'performer'].includes(sc));
            
            if (subcategoryNames.length > 0) {
              // Create placeholders for IN clause
              const placeholders = subcategoryNames.map(() => '?').join(',');
              const subcategoryRecords = await connection.query(
                `SELECT id FROM artist_subcategories WHERE name IN (${placeholders})`,
                subcategoryNames
              ) as any[];
              
              if (Array.isArray(subcategoryRecords) && subcategoryRecords.length > 0) {
                // Insert subcategory associations
                for (const subcatRecord of subcategoryRecords) {
                  try {
                    await connection.query(
                      'INSERT INTO event_staff_subcategories (staff_id, subcategory_id, created_at) VALUES (?, ?, NOW())',
                      [staffIdNum, subcatRecord.id]
                    );
                  } catch (insertError: any) {
                    // Ignore duplicate key errors
                    if (insertError.code !== 'ER_DUP_ENTRY') {
                      console.error('Error inserting subcategory:', insertError);
                      throw insertError; // Re-throw if it's not a duplicate
                    }
                  }
                }
              }
            }
          }
        }
      } catch (subcatError: any) {
        console.error('Error updating subcategories:', subcatError);
        console.error('Subcategory error details:', {
          message: subcatError.message,
          code: subcatError.code,
          sql: subcatError.sql,
          stack: subcatError.stack
        });
        // Continue - subcategories are optional, but log the error
      }
    } else {
      // If changing from artist to staff, remove all subcategories
      try {
        // Check if table exists first
        const tableCheck = await connection.query(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'event_staff_subcategories'
        `) as any[];
        
        if (Array.isArray(tableCheck) && tableCheck.length > 0) {
          await connection.query(
            'DELETE FROM event_staff_subcategories WHERE staff_id = ?',
            [staffIdNum]
          );
        }
      } catch (subcatError: any) {
        console.error('Error removing subcategories:', subcatError);
        // Continue - this is optional cleanup
      }
    }

    // Fetch the updated staff member with subcategories
    const [updatedStaff] = await connection.query(
      'SELECT * FROM event_staff WHERE id = ?',
      [staffIdNum]
    ) as any[];

    const serialized: any = {};
    if (updatedStaff) {
      for (const [key, value] of Object.entries(updatedStaff)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else if (key === 'is_public' && (value === 0 || value === 1 || value === '0' || value === '1')) {
          // Convert TINYINT(1) boolean to JavaScript boolean
          serialized[key] = value === 1 || value === '1' || value === true;
        } else {
          serialized[key] = value;
        }
      }
      
      // Fetch subcategories if this is an artist
      if (updatedStaff.role === 'artist') {
        try {
          // Check if tables exist first
          const tablesCheck = await connection.query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME IN ('artist_subcategories', 'event_staff_subcategories')
          `) as any[];
          
          const hasSubcategoryTables = Array.isArray(tablesCheck) && tablesCheck.length === 2;
          
          if (hasSubcategoryTables) {
            const subcategories = await connection.query(
              `SELECT sc.name 
               FROM event_staff_subcategories ess
               INNER JOIN artist_subcategories sc ON ess.subcategory_id = sc.id
               WHERE ess.staff_id = ?`,
              [staffIdNum]
            ) as any[];
            
            serialized.subcategories = Array.isArray(subcategories) 
              ? subcategories.map((sc: any) => sc.name)
              : [];
          } else {
            console.warn('Subcategory tables do not exist, returning empty subcategories');
            serialized.subcategories = [];
          }
        } catch (subcatError) {
          console.error('Error fetching subcategories:', subcatError);
          serialized.subcategories = [];
        }
      } else {
        serialized.subcategories = [];
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        staff: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating event staff:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update event staff',
      }),
    };
  }
}

/**
 * Resend verification code for a user (works for admin-created users)
 */
async function resendVerificationCode(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const rawEmail = body.email;
    if (!rawEmail) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email is required',
        }),
      };
    }
    // Normalize email to lowercase for case-insensitive comparison
    const email = rawEmail.toLowerCase().trim();

    const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
    if (!userPoolId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Cognito User Pool ID not configured',
        }),
      };
    }

    const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-west-1' });

    // Normalize email to lowercase for case-insensitive comparison
    const normalizedEmail = email.toLowerCase().trim();
    const escapedEmail = normalizedEmail.replace(/"/g, '\\"');
    
    // Check if user exists
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${escapedEmail}"`,
      Limit: 1,
    });

    const listUsersResponse = await cognito.send(listUsersCommand);

    if (!listUsersResponse.Users || listUsersResponse.Users.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'User not found',
        }),
      };
    }

    const user = listUsersResponse.Users[0];
    const username = user.Username || email;

    // Get user details to check status
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    });

    const getUserResponse = await cognito.send(getUserCommand);
    const emailVerified = getUserResponse.UserAttributes?.find(attr => attr.Name === 'email_verified')?.Value === 'true';
    const userStatus = getUserResponse.UserStatus;

    // If user is confirmed (not in FORCE_CHANGE_PASSWORD status), no need to resend
    // FORCE_CHANGE_PASSWORD means they need to set a password, so we should allow reset
    if (userStatus === 'CONFIRMED') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'User is already confirmed and can sign in normally',
        }),
      };
    }

    // For admin-created users, Cognito doesn't have a direct API to resend verification codes.
    // However, we can use AdminResetUserPassword which will send a temporary password via email.
    // Alternatively, we can trigger the forgot password flow which sends a code.
    // The best approach is to use AdminResetUserPassword which sends an email with a temporary password.
    
    try {
      console.log(`Attempting to reset password for user: ${username}`);
      const resetPasswordCommand = new AdminResetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        // This will send an email with a temporary password
      });

      const resetResponse = await cognito.send(resetPasswordCommand);
      console.log('Password reset command successful:', JSON.stringify(resetResponse, null, 2));

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'A new temporary password has been sent to your email. Use it to sign in, then you will be prompted to set a new password.',
        }),
      };
    } catch (resetError: any) {
      console.error('Error resetting password:', resetError);
      console.error('Error details:', {
        name: resetError.name,
        message: resetError.message,
        code: resetError.code,
        stack: resetError.stack,
      });
      
      // Return the actual error so the frontend can display it
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: resetError.message || 'Failed to reset password. Please check Cognito email configuration.',
          details: resetError.code || 'Unknown error',
        }),
      };
    }
  } catch (error: any) {
    console.error('Error resending verification code:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to resend verification code',
      }),
    };
  }
}

/**
 * Forgot password endpoint - Initiates password reset flow
 */
async function forgotPassword(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const email = body.email || body.username;
    if (!email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email is required',
        }),
      };
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID;

    if (!userPoolId || !clientId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Cognito configuration missing',
        }),
      };
    }

    const cognito = getCognitoClient();

    // Normalize email to lowercase for case-insensitive comparison
    const normalizedEmail = email.toLowerCase().trim();
    
    // First, check if user exists and their status
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: normalizedEmail,
      });
      
      const userResponse = await cognito.send(getUserCommand);
      const userStatus = userResponse.UserStatus;
      const emailVerified = userResponse.UserAttributes?.find(attr => attr.Name === 'email_verified')?.Value === 'true';
      
      console.log(`User status: ${userStatus}, email_verified: ${emailVerified}`);
      
      // If user is in FORCE_CHANGE_PASSWORD, they need to use the temporary password first
      if (userStatus === 'FORCE_CHANGE_PASSWORD') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Your account requires a password change. Please sign in with your temporary password first, then you can use forgot password.',
            userStatus: userStatus,
          }),
        };
      }
      
      // If email is not verified, suggest verifying it first
      if (!emailVerified) {
        console.log(`Email not verified for user: ${email}`);
        // Still try to send, but log the issue
      }
    } catch (getUserError: any) {
      // If user doesn't exist, we'll let ForgotPassword handle it
      // (it will return UserNotFoundException which we handle below)
      console.log('Could not get user info (might not exist):', getUserError.name);
    }

    // Initiate forgot password flow (use normalized email)
    const forgotPasswordCommand = new ForgotPasswordCommand({
      ClientId: clientId,
      Username: normalizedEmail,
    });

    try {
      await cognito.send(forgotPasswordCommand);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'Password reset code has been sent to your email. Please check your inbox and spam folder. If you don\'t receive it within a few minutes, the email may not be verified or there may be email delivery issues.',
        }),
      };
    } catch (forgotError: any) {
      console.error('Forgot password error:', forgotError);
      console.error('Error details:', {
        name: forgotError.name,
        message: forgotError.message,
        code: forgotError.code,
      });
      
      // Handle specific Cognito errors
      let errorMessage = 'Failed to initiate password reset';
      let statusCode = 500;

      if (forgotError.name === 'UserNotFoundException') {
        // Don't reveal if user exists or not for security
        errorMessage = 'If an account exists with this email, a password reset code has been sent.';
        statusCode = 200; // Return success to prevent user enumeration
      } else if (forgotError.name === 'LimitExceededException' || forgotError.name === 'TooManyRequestsException') {
        errorMessage = 'Too many requests. Please try again later.';
        statusCode = 429;
      } else if (forgotError.name === 'InvalidParameterException') {
        errorMessage = 'Invalid email address';
        statusCode = 400;
      } else if (forgotError.name === 'InvalidEmailRoleAccessPolicyException') {
        errorMessage = 'Email delivery is not configured properly. Please contact support.';
        statusCode = 500;
      } else {
        errorMessage = forgotError.message || 'Failed to initiate password reset';
      }

      return {
        statusCode: statusCode,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: statusCode === 200,
          message: errorMessage,
          error: statusCode !== 200 ? errorMessage : undefined,
          code: statusCode !== 200 ? forgotError.name : undefined,
        }),
      };
    }
  } catch (error: any) {
    console.error('Forgot password endpoint error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
}

/**
 * Confirm forgot password endpoint - Confirms password reset with code
 */
async function confirmForgotPassword(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const email = body.email || body.username;
    const code = body.code || body.confirmationCode;
    const newPassword = body.newPassword || body.password;

    if (!email || !code || !newPassword) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email, code, and new password are required',
        }),
      };
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID;

    if (!userPoolId || !clientId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Cognito configuration missing',
        }),
      };
    }

    const cognito = getCognitoClient();

    // Confirm password reset (use normalized email)
    const confirmForgotPasswordCommand = new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email, // Already normalized above
      ConfirmationCode: code,
      Password: newPassword,
    });

    try {
      await cognito.send(confirmForgotPasswordCommand);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'Password has been reset successfully. You can now sign in with your new password.',
        }),
      };
    } catch (confirmError: any) {
      console.error('Confirm forgot password error:', confirmError);
      
      // Handle specific Cognito errors
      let errorMessage = 'Failed to reset password';
      let statusCode = 400;

      if (confirmError.name === 'CodeMismatchException') {
        errorMessage = 'Invalid or expired verification code';
      } else if (confirmError.name === 'ExpiredCodeException') {
        errorMessage = 'Verification code has expired. Please request a new one.';
      } else if (confirmError.name === 'InvalidPasswordException') {
        errorMessage = 'Password does not meet requirements';
      } else if (confirmError.name === 'UserNotFoundException') {
        errorMessage = 'User not found';
        statusCode = 404;
      } else if (confirmError.name === 'LimitExceededException' || confirmError.name === 'TooManyRequestsException') {
        errorMessage = 'Too many requests. Please try again later.';
        statusCode = 429;
      } else {
        errorMessage = confirmError.message || 'Failed to reset password';
      }

      return {
        statusCode: statusCode,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          code: confirmError.name,
        }),
      };
    }
  } catch (error: any) {
    console.error('Confirm forgot password endpoint error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
}

/**
 * Login endpoint - Authenticate user and return tokens
 */
async function login(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const email = (body.email || body.username)?.toLowerCase().trim();
    const password = body.password;
    const newPassword = body.newPassword; // For handling NEW_PASSWORD_REQUIRED challenge
    const session = body.session; // For responding to challenges

    if (!email || !password) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email and password are required',
        }),
      };
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID;

    if (!userPoolId || !clientId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Cognito configuration missing',
        }),
      };
    }

    const cognito = getCognitoClient();

    // If we have a session and newPassword, respond to NEW_PASSWORD_REQUIRED challenge
    if (session && newPassword) {
      try {
        const respondCommand = new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: 'NEW_PASSWORD_REQUIRED',
          Session: session,
          ChallengeResponses: {
            USERNAME: email,
            NEW_PASSWORD: newPassword,
          },
        });

        const respondResponse = await cognito.send(respondCommand);

        if (respondResponse.AuthenticationResult) {
          const tokens = {
            idToken: respondResponse.AuthenticationResult.IdToken,
            accessToken: respondResponse.AuthenticationResult.AccessToken,
            refreshToken: respondResponse.AuthenticationResult.RefreshToken,
            expiresIn: respondResponse.AuthenticationResult.ExpiresIn,
            tokenType: respondResponse.AuthenticationResult.TokenType,
          };

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: true,
              tokens: tokens,
              message: 'Password changed successfully. Login successful.',
            }),
          };
        }
      } catch (respondError: any) {
        console.error('Error responding to challenge:', respondError);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: respondError.message || 'Failed to set new password',
            code: respondError.name,
          }),
        };
      }
    }

    // Initiate authentication using USER_PASSWORD_AUTH flow
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    try {
      const authResponse = await cognito.send(authCommand);

      // Check if authentication requires additional challenges
      if (authResponse.ChallengeName) {
        // Handle NEW_PASSWORD_REQUIRED challenge (for users with temporary passwords)
        if (authResponse.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              challenge: authResponse.ChallengeName,
              session: authResponse.Session,
              message: 'New password required. Please provide a new password.',
              requiresNewPassword: true,
            }),
          };
        }
        
        // Other challenges (like MFA, etc.)
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            challenge: authResponse.ChallengeName,
            session: authResponse.Session,
            message: 'Additional authentication step required',
          }),
        };
      }

      // Authentication successful
      if (authResponse.AuthenticationResult) {
        const tokens = {
          idToken: authResponse.AuthenticationResult.IdToken,
          accessToken: authResponse.AuthenticationResult.AccessToken,
          refreshToken: authResponse.AuthenticationResult.RefreshToken,
          expiresIn: authResponse.AuthenticationResult.ExpiresIn,
          tokenType: authResponse.AuthenticationResult.TokenType,
        };

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: true,
            tokens: tokens,
            message: 'Login successful',
          }),
        };
      }

      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication failed - no tokens received',
        }),
      };
    } catch (authError: any) {
      console.error('Authentication error:', authError);
      
      // Handle specific Cognito errors
      let errorMessage = 'Authentication failed';
      let statusCode = 401;

      if (authError.name === 'NotAuthorizedException') {
        errorMessage = 'Incorrect email or password';
      } else if (authError.name === 'UserNotFoundException') {
        errorMessage = 'User not found';
      } else if (authError.name === 'UserNotConfirmedException') {
        errorMessage = 'User account is not confirmed. Please verify your email.';
        statusCode = 403;
      } else if (authError.name === 'PasswordResetRequiredException') {
        errorMessage = 'Password reset required. Please reset your password.';
        statusCode = 403;
      } else if (authError.name === 'TooManyRequestsException') {
        errorMessage = 'Too many login attempts. Please try again later.';
        statusCode = 429;
      } else {
        errorMessage = authError.message || 'Authentication failed';
      }

      return {
        statusCode: statusCode,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          code: authError.name,
        }),
      };
    }
  } catch (error: any) {
    console.error('Login endpoint error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
}

/**
 * Admin endpoint to reset user password
 * Returns temporary password since email delivery may not work
 */
async function adminResetPassword(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const email = body.email;
    if (!email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email is required',
        }),
      };
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
    if (!userPoolId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Cognito User Pool ID not configured',
        }),
      };
    }

    const cognito = getCognitoClient();

    // Find user by email
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '\\"')}"`,
      Limit: 1,
    });

    let listUsersResponse;
    try {
      listUsersResponse = await cognito.send(listUsersCommand);
    } catch (listError: any) {
      console.error('Error listing users:', listError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Failed to find user',
        }),
      };
    }

    if (!listUsersResponse.Users || listUsersResponse.Users.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'User not found',
        }),
      };
    }

    const user = listUsersResponse.Users[0];
    const username = user.Username || email;

    // Generate a temporary password that meets requirements
    // Requirements: 8+ chars, uppercase, lowercase, number, symbol
    const generateTempPassword = () => {
      const length = 12;
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lowercase = 'abcdefghijklmnopqrstuvwxyz';
      const numbers = '0123456789';
      const symbols = '!@#$%^&*';
      const all = uppercase + lowercase + numbers + symbols;
      
      let password = '';
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
      password += numbers[Math.floor(Math.random() * numbers.length)];
      password += symbols[Math.floor(Math.random() * symbols.length)];
      
      for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
      }
      
      // Shuffle
      return password.split('').sort(() => Math.random() - 0.5).join('');
    };

    const tempPassword = generateTempPassword();

    // Reset user password with temporary password
    try {
      const resetPasswordCommand = new AdminResetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        // Don't set MessageAction - this will use the default email delivery
        // But since email may not work, we'll return the password in the response
      });

      // Use AdminSetUserPassword to set a specific temporary password
      // This allows us to return the password in the response since email delivery may not work
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: tempPassword,
        Permanent: false, // User must change on next sign in
      });

      await cognito.send(setPasswordCommand);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'Password has been reset. Share this temporary password with the user.',
          temporaryPassword: tempPassword,
          email: email,
          instructions: 'User should sign in with this temporary password, then they will be prompted to set a new password.',
        }),
      };
    } catch (resetError: any) {
      console.error('Error resetting password:', resetError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: resetError.message || 'Failed to reset password',
          code: resetError.name,
        }),
      };
    }
  } catch (error: any) {
    console.error('Admin reset password error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
}

/**
 * Admin endpoint to mark a user's email as verified
 * This fixes the issue where admin-created users need email verification
 */
async function markEmailAsVerified(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const email = body.email;
    if (!email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email is required',
        }),
      };
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;
    if (!userPoolId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Cognito User Pool ID not configured',
        }),
      };
    }

    const cognito = getCognitoClient();

    // Find user by email
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '\\"')}"`,
      Limit: 1,
    });

    let listUsersResponse;
    try {
      listUsersResponse = await cognito.send(listUsersCommand);
    } catch (listError: any) {
      console.error('Error listing users:', listError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Failed to find user',
        }),
      };
    }

    if (!listUsersResponse.Users || listUsersResponse.Users.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'User not found',
        }),
      };
    }

    const user = listUsersResponse.Users[0];
    const username = user.Username || email;

    // Update user attributes to mark email as verified
    try {
      const updateUserCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'email_verified', Value: 'true' },
        ],
      });

      await cognito.send(updateUserCommand);
      console.log(`✅ Marked email as verified for user: ${username} (${email})`);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: `Email verified successfully for ${email}. User can now sign in without email verification.`,
        }),
      };
    } catch (updateError: any) {
      console.error('Error updating user attributes:', updateError);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: updateError.message || 'Failed to mark email as verified',
        }),
      };
    }
  } catch (error: any) {
    console.error('Error marking email as verified:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to mark email as verified',
      }),
    };
  }
}

/**
 * Get tickets for an event
 */
async function getEventTickets(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const tickets = await connection.query(
      `SELECT id, event_id, name, price, image_url, max_quantity, sold_quantity, is_active, created_at, updated_at
       FROM tickets
       WHERE event_id = ?
       ORDER BY created_at DESC`,
      [eventId]
    ) as any[];

    const serialized = tickets.map((ticket: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(ticket)) {
        if (typeof value === 'bigint') {
          result[key] = value.toString();
        } else if (key === 'price' && value !== null) {
          result[key] = parseFloat(value.toString());
        } else if (key === 'is_active' && typeof value === 'number') {
          result[key] = value === 1;
        } else {
          result[key] = value;
        }
      }
      return result;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        tickets: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching tickets:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch tickets',
      }),
    };
  }
}

/**
 * Add ticket to event
 */
async function addEventTicket(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Event not found',
          }),
        };
      }

      if (!eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to add tickets to this event',
          }),
        };
      }
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { name, price, image_url, max_quantity } = body;

    if (!name || price === undefined) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Name and price are required',
        }),
      };
    }

    const result = await connection.query(
      `INSERT INTO tickets (event_id, name, price, image_url, max_quantity, sold_quantity, is_active)
       VALUES (?, ?, ?, ?, ?, 0, TRUE)`,
      [eventId, name, price, image_url || null, max_quantity || null]
    ) as any;

    const ticketId = result.insertId;

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        ticket: {
          id: ticketId.toString(),
          event_id: eventId,
          name,
          price: parseFloat(price),
          image_url: image_url || null,
          max_quantity: max_quantity || null,
          sold_quantity: 0,
          is_active: true,
        },
      }),
    };
  } catch (error: any) {
    console.error('Error adding ticket:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to add ticket',
      }),
    };
  }
}

/**
 * Update ticket
 */
async function updateEventTicket(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;
    
    if (!eventId || !ticketId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Ticket ID are required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to update tickets for this event',
          }),
        };
      }
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { name, price, image_url, max_quantity, is_active } = body;

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (price !== undefined) {
      updates.push('price = ?');
      values.push(price);
    }
    if (image_url !== undefined) {
      updates.push('image_url = ?');
      values.push(image_url);
    }
    if (max_quantity !== undefined) {
      updates.push('max_quantity = ?');
      values.push(max_quantity);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'No fields to update',
        }),
      };
    }

    values.push(ticketId, eventId);

    await connection.query(
      `UPDATE tickets SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`,
      values
    );

    // Fetch updated ticket
    const updatedTicket = await connection.query(
      `SELECT id, event_id, name, price, image_url, max_quantity, sold_quantity, is_active, created_at, updated_at
       FROM tickets WHERE id = ? AND event_id = ?`,
      [ticketId, eventId]
    ) as any[];

    if (updatedTicket.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket not found',
        }),
      };
    }

    const ticket = updatedTicket[0];
    const serialized: any = {};
    for (const [key, value] of Object.entries(ticket)) {
      if (typeof value === 'bigint') {
        serialized[key] = value.toString();
      } else if (key === 'price' && value !== null) {
        serialized[key] = parseFloat(value.toString());
      } else if (key === 'is_active' && typeof value === 'number') {
        serialized[key] = value === 1;
      } else {
        serialized[key] = value;
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        ticket: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating ticket:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update ticket',
      }),
    };
  }
}

/**
 * Delete ticket from event
 */
async function deleteEventTicket(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;
    
    if (!eventId || !ticketId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Ticket ID are required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to delete tickets from this event',
          }),
        };
      }
    }

    await connection.query(
      'DELETE FROM tickets WHERE id = ? AND event_id = ?',
      [ticketId, eventId]
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Ticket deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error deleting ticket:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete ticket',
      }),
    };
  }
}

/**
 * Get discount codes for an event
 */
async function getEventDiscountCodes(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const codes = await connection.query(
      `SELECT id, event_id, code, discount_type, discount_value, max_uses, used_count, 
              valid_from, valid_until, is_active, created_at, updated_at
       FROM discount_codes
       WHERE event_id = ?
       ORDER BY created_at DESC`,
      [eventId]
    ) as any[];

    const serialized = codes.map((code: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(code)) {
        if (typeof value === 'bigint') {
          result[key] = value.toString();
        } else if (key === 'discount_value' && value !== null) {
          result[key] = parseFloat(value.toString());
        } else if (key === 'is_active' && typeof value === 'number') {
          result[key] = value === 1;
        } else {
          result[key] = value;
        }
      }
      return result;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        discount_codes: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching discount codes:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch discount codes',
      }),
    };
  }
}

/**
 * Add discount code to event
 */
async function addEventDiscountCode(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to add discount codes to this event',
          }),
        };
      }
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { code, discount_type, discount_value, max_uses, valid_from, valid_until } = body;

    if (!code || !discount_type || discount_value === undefined) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Code, discount_type, and discount_value are required',
        }),
      };
    }

    if (discount_type !== 'percentage' && discount_type !== 'fixed') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'discount_type must be "percentage" or "fixed"',
        }),
      };
    }

    const result = await connection.query(
      `INSERT INTO discount_codes (event_id, code, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, TRUE)`,
      [eventId, code.toUpperCase(), discount_type, discount_value, max_uses || null, valid_from || null, valid_until || null]
    ) as any;

    const codeId = result.insertId;

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        discount_code: {
          id: codeId.toString(),
          event_id: eventId,
          code: code.toUpperCase(),
          discount_type,
          discount_value: parseFloat(discount_value),
          max_uses: max_uses || null,
          used_count: 0,
          valid_from: valid_from || null,
          valid_until: valid_until || null,
          is_active: true,
        },
      }),
    };
  } catch (error: any) {
    console.error('Error adding discount code:', error);
    if (error.message?.includes('unique_event_code')) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'A discount code with this name already exists for this event',
        }),
      };
    }
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to add discount code',
      }),
    };
  }
}

/**
 * Update discount code
 */
async function updateEventDiscountCode(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const codeId = event.pathParameters?.codeId;
    
    if (!eventId || !codeId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Code ID are required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to update discount codes for this event',
          }),
        };
      }
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { code: codeValue, discount_type, discount_value, max_uses, valid_from, valid_until, is_active } = body;

    const updates: string[] = [];
    const values: any[] = [];

    if (codeValue !== undefined) {
      updates.push('code = ?');
      values.push(codeValue.toUpperCase());
    }
    if (discount_type !== undefined) {
      updates.push('discount_type = ?');
      values.push(discount_type);
    }
    if (discount_value !== undefined) {
      updates.push('discount_value = ?');
      values.push(discount_value);
    }
    if (max_uses !== undefined) {
      updates.push('max_uses = ?');
      values.push(max_uses);
    }
    if (valid_from !== undefined) {
      updates.push('valid_from = ?');
      values.push(valid_from);
    }
    if (valid_until !== undefined) {
      updates.push('valid_until = ?');
      values.push(valid_until);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'No fields to update',
        }),
      };
    }

    values.push(codeId, eventId);

    await connection.query(
      `UPDATE discount_codes SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`,
      values
    );

    // Fetch updated code
    const updatedCode = await connection.query(
      `SELECT id, event_id, code, discount_type, discount_value, max_uses, used_count, 
              valid_from, valid_until, is_active, created_at, updated_at
       FROM discount_codes WHERE id = ? AND event_id = ?`,
      [codeId, eventId]
    ) as any[];

    if (updatedCode.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Discount code not found',
        }),
      };
    }

    const discountCode = updatedCode[0];
    const serialized: any = {};
    for (const [key, value] of Object.entries(discountCode)) {
      if (typeof value === 'bigint') {
        serialized[key] = value.toString();
      } else if (key === 'discount_value' && value !== null) {
        serialized[key] = parseFloat(value.toString());
      } else if (key === 'is_active' && typeof value === 'number') {
        serialized[key] = value === 1;
      } else {
        serialized[key] = value;
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        discount_code: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating discount code:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update discount code',
      }),
    };
  }
}

/**
 * Delete discount code from event
 */
async function deleteEventDiscountCode(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const codeId = event.pathParameters?.codeId;
    
    if (!eventId || !codeId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Code ID are required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to delete discount codes from this event',
          }),
        };
      }
    }

    await connection.query(
      'DELETE FROM discount_codes WHERE id = ? AND event_id = ?',
      [codeId, eventId]
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Discount code deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error deleting discount code:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete discount code',
      }),
    };
  }
}

/**
 * Get ticket discounts
 */
async function getTicketDiscounts(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;
    
    if (!eventId || !ticketId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Ticket ID are required',
        }),
      };
    }

    // Verify ticket belongs to event
    const ticketCheck = await connection.query(
      'SELECT id FROM tickets WHERE id = ? AND event_id = ?',
      [ticketId, eventId]
    ) as any[];

    if (ticketCheck.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket not found',
        }),
      };
    }

    const discounts = await connection.query(
      `SELECT id, ticket_id, discount_type, discount_value, valid_until, is_active, created_at, updated_at
       FROM ticket_discounts
       WHERE ticket_id = ?
       ORDER BY valid_until ASC`,
      [ticketId]
    ) as any[];

    const serialized = discounts.map((discount: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(discount)) {
        if (typeof value === 'bigint') {
          result[key] = value.toString();
        } else if (key === 'discount_value' && value !== null) {
          result[key] = parseFloat(value.toString());
        } else if (key === 'is_active' && typeof value === 'number') {
          result[key] = value === 1;
        } else {
          result[key] = value;
        }
      }
      return result;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        discounts: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching ticket discounts:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch ticket discounts',
      }),
    };
  }
}

/**
 * Add ticket discount
 */
async function addTicketDiscount(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;
    
    if (!eventId || !ticketId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Ticket ID are required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to add discounts to tickets for this event',
          }),
        };
      }
    }

    // Verify ticket belongs to event
    const ticketCheck = await connection.query(
      'SELECT id FROM tickets WHERE id = ? AND event_id = ?',
      [ticketId, eventId]
    ) as any[];

    if (ticketCheck.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket not found',
        }),
      };
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { discount_type, discount_value, valid_until } = body;

    if (!discount_type || discount_value === undefined || !valid_until) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'discount_type, discount_value, and valid_until are required',
        }),
      };
    }

    if (discount_type !== 'percentage' && discount_type !== 'fixed') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'discount_type must be "percentage" or "fixed"',
        }),
      };
    }

    if (discount_type === 'percentage' && (discount_value < 0 || discount_value > 100)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Percentage discount must be between 0 and 100',
        }),
      };
    }

    const result = await connection.query(
      `INSERT INTO ticket_discounts (ticket_id, discount_type, discount_value, valid_until, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [ticketId, discount_type, discount_value, valid_until]
    ) as any;

    const discountId = result.insertId;

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        discount: {
          id: discountId.toString(),
          ticket_id: ticketId,
          discount_type,
          discount_value: parseFloat(discount_value),
          valid_until,
          is_active: true,
        },
      }),
    };
  } catch (error: any) {
    console.error('Error adding ticket discount:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to add ticket discount',
      }),
    };
  }
}

/**
 * Update ticket discount
 */
async function updateTicketDiscount(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;
    const discountId = event.pathParameters?.discountId;
    
    if (!eventId || !ticketId || !discountId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID, Ticket ID, and Discount ID are required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to update discounts for this event',
          }),
        };
      }
    }

    // Verify ticket belongs to event
    const ticketCheck = await connection.query(
      'SELECT id FROM tickets WHERE id = ? AND event_id = ?',
      [ticketId, eventId]
    ) as any[];

    if (ticketCheck.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket not found',
        }),
      };
    }

    // Verify discount belongs to ticket
    const discountCheck = await connection.query(
      'SELECT id FROM ticket_discounts WHERE id = ? AND ticket_id = ?',
      [discountId, ticketId]
    ) as any[];

    if (discountCheck.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Discount not found',
        }),
      };
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { discount_type, discount_value, valid_until, is_active } = body;

    const updates: string[] = [];
    const values: any[] = [];

    if (discount_type !== undefined) {
      if (discount_type !== 'percentage' && discount_type !== 'fixed') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'discount_type must be "percentage" or "fixed"',
          }),
        };
      }
      updates.push('discount_type = ?');
      values.push(discount_type);
    }

    if (discount_value !== undefined) {
      if (discount_type === 'percentage' && (discount_value < 0 || discount_value > 100)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Percentage discount must be between 0 and 100',
          }),
        };
      }
      updates.push('discount_value = ?');
      values.push(discount_value);
    }

    if (valid_until !== undefined) {
      updates.push('valid_until = ?');
      values.push(valid_until);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'No fields to update',
        }),
      };
    }

    values.push(discountId, ticketId);

    await connection.query(
      `UPDATE ticket_discounts SET ${updates.join(', ')} WHERE id = ? AND ticket_id = ?`,
      values
    );

    // Fetch updated discount
    const updatedDiscount = await connection.query(
      `SELECT id, ticket_id, discount_type, discount_value, valid_until, is_active, created_at, updated_at
       FROM ticket_discounts WHERE id = ? AND ticket_id = ?`,
      [discountId, ticketId]
    ) as any[];

    if (updatedDiscount.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Discount not found',
        }),
      };
    }

    const discount = updatedDiscount[0];
    const serialized: any = {};
    for (const [key, value] of Object.entries(discount)) {
      if (typeof value === 'bigint') {
        serialized[key] = value.toString();
      } else if (key === 'discount_value' && value !== null) {
        serialized[key] = parseFloat(value.toString());
      } else if (key === 'is_active' && typeof value === 'number') {
        serialized[key] = value === 1;
      } else {
        serialized[key] = value;
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        discount: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating ticket discount:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update ticket discount',
      }),
    };
  }
}

/**
 * Calculate ticket price with discounts
 * NOTE: This function has been moved to StripePaymentFunction
 * Keeping it here temporarily for reference, but it's not used
 */
async function calculateTicketPrice_DEPRECATED(
  connection: mariadb.PoolConnection,
  ticketId: string,
  quantity: number,
  discountCode?: string
): Promise<{
  unitPrice: number;
  discountAmount: number;
  totalAmount: number;
  discountCodeId?: string;
  appliedDiscount?: { type: string; value: number };
}> {
  // Get ticket base price
  const tickets = await connection.query(
    'SELECT id, price FROM tickets WHERE id = ?',
    [ticketId]
  ) as any[];

  if (tickets.length === 0) {
    throw new Error('Ticket not found');
  }

  const basePrice = parseFloat(tickets[0].price);
  let unitPrice = basePrice;
  let discountAmount = 0;
  let discountCodeId: string | undefined;
  let appliedDiscount: { type: string; value: number } | undefined;

  // Apply date-based discount if available
  const today = new Date().toISOString().split('T')[0];
  const dateDiscounts = await connection.query(
    `SELECT discount_type, discount_value 
     FROM ticket_discounts 
     WHERE ticket_id = ? AND valid_until >= ? AND is_active = TRUE
     ORDER BY valid_until ASC
     LIMIT 1`,
    [ticketId, today]
  ) as any[];

  if (dateDiscounts.length > 0) {
    const discount = dateDiscounts[0];
    if (discount.discount_type === 'percentage') {
      const discountValue = parseFloat(discount.discount_value);
      discountAmount = (basePrice * discountValue) / 100;
      appliedDiscount = { type: 'date_percentage', value: discountValue };
    } else {
      discountAmount = parseFloat(discount.discount_value);
      appliedDiscount = { type: 'date_fixed', value: discountAmount };
    }
    unitPrice = Math.max(0, basePrice - discountAmount);
  }

  // Apply discount code if provided
  if (discountCode) {
    const eventId = (await connection.query(
      'SELECT event_id FROM tickets WHERE id = ?',
      [ticketId]
    ) as any[])[0]?.event_id;

    if (eventId) {
      const codes = await connection.query(
        `SELECT id, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active
         FROM discount_codes
         WHERE event_id = ? AND code = ? AND is_active = TRUE`,
        [eventId, discountCode.toUpperCase()]
      ) as any[];

      if (codes.length > 0) {
        const code = codes[0];
        const now = new Date();
        const validFrom = code.valid_from ? new Date(code.valid_from) : null;
        const validUntil = code.valid_until ? new Date(code.valid_until) : null;

        if (
          (!validFrom || validFrom <= now) &&
          (!validUntil || validUntil >= now) &&
          (!code.max_uses || code.used_count < code.max_uses)
        ) {
          discountCodeId = code.id.toString();
          let codeDiscount = 0;

          if (code.discount_type === 'percentage') {
            const discountValue = parseFloat(code.discount_value);
            codeDiscount = (unitPrice * discountValue) / 100;
            appliedDiscount = { type: 'code_percentage', value: discountValue };
          } else {
            codeDiscount = parseFloat(code.discount_value);
            appliedDiscount = { type: 'code_fixed', value: codeDiscount };
          }

          // Discount code overrides date discount
          discountAmount = codeDiscount;
          unitPrice = Math.max(0, basePrice - discountAmount);
        }
      }
    }
  }

  const totalAmount = unitPrice * quantity;

  return {
    unitPrice,
    discountAmount,
    totalAmount,
    discountCodeId,
    appliedDiscount,
  };
}

/**
 * Create Stripe checkout session for ticket purchase
 */
async function createTicketCheckoutSession(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;

    if (!eventId || !ticketId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Ticket ID are required',
        }),
      };
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { quantity = 1, email, discount_code } = body;

    if (!email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Email is required',
        }),
      };
    }

    if (quantity < 1) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Quantity must be at least 1',
        }),
      };
    }

    // Verify ticket exists and is available
    const tickets = await connection.query(
      `SELECT id, name, price, max_quantity, sold_quantity, is_active, event_id
       FROM tickets
       WHERE id = ? AND event_id = ?`,
      [ticketId, eventId]
    ) as any[];

    if (tickets.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket not found',
        }),
      };
    }

    const ticket = tickets[0];

    if (!ticket.is_active) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket is not available for purchase',
        }),
      };
    }

    if (ticket.max_quantity && ticket.sold_quantity + quantity > ticket.max_quantity) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: `Only ${ticket.max_quantity - ticket.sold_quantity} tickets available`,
        }),
      };
    }

    // Calculate price with discounts
    const priceCalculation = await calculateTicketPrice(
      connection,
      ticketId,
      quantity,
      discount_code
    );

    // Get user ID if logged in
    let userId: string | null = null;
    if (cognitoSub) {
      const users = await connection.query(
        'SELECT id FROM users WHERE cognito_sub = ?',
        [cognitoSub]
      ) as any[];
      if (users.length > 0) {
        userId = users[0].id.toString();
      }
    }

    // Create order record
    const orderResult = await connection.query(
      `INSERT INTO ticket_orders 
       (event_id, ticket_id, user_id, cognito_sub, email, quantity, unit_price, discount_amount, discount_code_id, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        eventId,
        ticketId,
        userId,
        cognitoSub,
        email,
        quantity,
        priceCalculation.unitPrice,
        priceCalculation.discountAmount,
        priceCalculation.discountCodeId || null,
        priceCalculation.totalAmount,
      ]
    ) as any;

    const orderId = orderResult.insertId;

    // Get event details for checkout
    const events = await connection.query(
      'SELECT id, name FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    const eventName = events.length > 0 ? events[0].name : 'Event';

    // Create Stripe checkout session
    const stripe = getStripeClient();
    // Get frontend URL from request origin or use default
    const origin = event.headers.origin || event.headers.Origin || '';
    const baseUrl = origin || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${ticket.name} - ${eventName}`,
              description: `Ticket for ${eventName}`,
            },
            unit_amount: Math.round(priceCalculation.unitPrice * 100), // Convert to cents
          },
          quantity: quantity,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/events/${eventId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/events/${eventId}?payment=cancelled`,
      customer_email: email,
      metadata: {
        order_id: orderId.toString(),
        event_id: eventId,
        ticket_id: ticketId,
      },
    });

    // Update order with checkout session ID
    await connection.query(
      'UPDATE ticket_orders SET stripe_checkout_session_id = ? WHERE id = ?',
      [session.id, orderId]
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        checkout_url: session.url,
        session_id: session.id,
      }),
    };
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to create checkout session',
      }),
    };
  }
}

/**
 * Handle Stripe webhook events
 */
async function handleStripeWebhook(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Webhook secret not configured',
        }),
      };
    }

    const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    if (!sig) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Missing stripe-signature header',
        }),
      };
    }

    let stripeEvent: Stripe.Event;
    try {
      const body = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf-8')
        : event.body || '';
      stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: `Webhook Error: ${err.message}`,
        }),
      };
    }

    // Handle the event
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;

      if (orderId) {
        // Update order status
        await connection.query(
          `UPDATE ticket_orders 
           SET status = 'paid', stripe_payment_intent_id = ?
           WHERE id = ?`,
          [session.payment_intent as string, orderId]
        );

        // Update ticket sold_quantity
        const orders = await connection.query(
          'SELECT ticket_id, quantity FROM ticket_orders WHERE id = ?',
          [orderId]
        ) as any[];

        if (orders.length > 0) {
          const order = orders[0];
          await connection.query(
            'UPDATE tickets SET sold_quantity = sold_quantity + ? WHERE id = ?',
            [order.quantity, order.ticket_id]
          );
        }

        // Update discount code used count if applicable
        const orderDetails = await connection.query(
          'SELECT discount_code_id FROM ticket_orders WHERE id = ?',
          [orderId]
        ) as any[];

        if (orderDetails.length > 0 && orderDetails[0].discount_code_id) {
          await connection.query(
            'UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?',
            [orderDetails[0].discount_code_id]
          );
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({ received: true }),
    };
  } catch (error: any) {
    console.error('Error handling webhook:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to handle webhook',
      }),
    };
  }
}

/**
 * Delete ticket discount
 */
async function deleteTicketDiscount(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    const ticketId = event.pathParameters?.ticketId;
    const discountId = event.pathParameters?.discountId;
    
    if (!eventId || !ticketId || !discountId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID, Ticket ID, and Discount ID are required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to delete discounts for this event',
          }),
        };
      }
    }

    // Verify ticket belongs to event
    const ticketCheck = await connection.query(
      'SELECT id FROM tickets WHERE id = ? AND event_id = ?',
      [ticketId, eventId]
    ) as any[];

    if (ticketCheck.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Ticket not found',
        }),
      };
    }

    await connection.query(
      'DELETE FROM ticket_discounts WHERE id = ? AND ticket_id = ?',
      [discountId, ticketId]
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Discount deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error deleting ticket discount:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete ticket discount',
      }),
    };
  }
}

/**
 * Generate presigned URL for ticket image upload
 */
async function generateTicketImageUploadUrl(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection | null,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    // Verify user owns the event
    if (cognitoSub && connection) {
      const eventCheck = await connection.query(
        'SELECT id, cognito_sub FROM events WHERE id = ?',
        [eventId]
      ) as any[];

      if (eventCheck.length === 0 || !eventCheck[0].cognito_sub || eventCheck[0].cognito_sub !== cognitoSub) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'You do not have permission to upload ticket images for this event',
          }),
        };
      }
    }

    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const filename = body.filename || `ticket-${Date.now()}.jpg`;
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
          error: 'S3 bucket not configured',
        }),
      };
    }

    const s3 = getS3Client();

    // Generate S3 key for ticket image (in tickets folder)
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `tickets/${eventId}/${sanitizedFilename}`;

    // Create presigned URL for ticket image upload
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: 'image/jpeg',
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        upload_url: presignedUrl,
        s3_key: s3Key,
        s3_url: s3Url,
        expires_in: 3600,
      }),
    };
  } catch (error: any) {
    console.error('Error generating ticket image upload URL:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate upload URL',
      }),
    };
  }
}

/**
 * Delete staff/artist from event
 */
async function deleteEventStaff(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Try to get IDs from pathParameters first
    let eventIdMatch = event.pathParameters?.id;
    let staffIdMatch = event.pathParameters?.staffId;
    
    // If not in pathParameters, extract from path
    if ((!eventIdMatch || !staffIdMatch) && event.path) {
      const pathMatch = event.path.match(/^\/events\/(\d+)\/staff\/(\d+)$/);
      if (pathMatch && pathMatch[1] && pathMatch[2]) {
        eventIdMatch = eventIdMatch || pathMatch[1];
        staffIdMatch = staffIdMatch || pathMatch[2];
      }
    }
    
    if (!eventIdMatch || !staffIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Staff ID are required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    const staffId = parseInt(staffIdMatch);
    
    if (isNaN(eventId) || isNaN(staffId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID or staff ID',
        }),
      };
    }

    // Verify event ownership
    const existingEvents = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!Array.isArray(existingEvents) || existingEvents.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event not found',
        }),
      };
    }

    const existingEvent = existingEvents[0];
    // Strict ownership check: must have cognito_sub and it must match
    if (!existingEvent.cognito_sub || existingEvent.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage staff for this event',
        }),
      };
    }

    // Verify staff belongs to event
    const staffRecords = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staffId, eventId]
    ) as any[];

    if (!Array.isArray(staffRecords) || staffRecords.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found',
        }),
      };
    }

    // Delete staff member
    await connection.query('DELETE FROM event_staff WHERE id = ? AND event_id = ?', [staffId, eventId]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Staff member deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error deleting event staff:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete event staff',
      }),
    };
  }
}

/**
 * Lookup flight information from external API
 * Uses AviationStack API (primary) with fallback options
 */
async function lookupFlightInfo(flightNumber: string, date?: string): Promise<any> {
  try {
    // Parse flight number (e.g., "AA123" -> airline "AA", number "123")
    const match = flightNumber.match(/^([A-Z]{2,3})(\d+)$/);
    if (!match) {
      console.warn(`Invalid flight number format: ${flightNumber}`);
      return null;
    }

    const airlineCode = match[1];
    const flightNum = match[2];

    // Try AviationStack API first (if API key is configured)
    const aviationStackKey = process.env.AVIATIONSTACK_API_KEY;
    if (aviationStackKey) {
      try {
        const apiUrl = 'https://api.aviationstack.com/v1/flights';
        const params: any = {
          access_key: aviationStackKey,
          flight_iata: flightNumber,
          limit: 1,
        };

        if (date) {
          params.flight_date = date;
        }

        const response = await axios.get(apiUrl, { params, timeout: 10000 });
        
        if (response.data && response.data.data && response.data.data.length > 0) {
          const flight = response.data.data[0];
          console.log('Flight info retrieved from AviationStack:', flightNumber);
          return {
            airline_code: flight.airline?.iata || airlineCode,
            departure_airport_code: flight.departure?.iata,
            departure_airport_name: flight.departure?.airport,
            departure_city: flight.departure?.city,
            departure_date: flight.departure?.scheduled ? flight.departure.scheduled.split('T')[0] : null,
            departure_time: flight.departure?.scheduled ? flight.departure.scheduled.split('T')[1]?.substring(0, 5) : null,
            arrival_airport_code: flight.arrival?.iata,
            arrival_airport_name: flight.arrival?.airport,
            arrival_city: flight.arrival?.city,
            arrival_date: flight.arrival?.scheduled ? flight.arrival.scheduled.split('T')[0] : null,
            arrival_time: flight.arrival?.scheduled ? flight.arrival.scheduled.split('T')[1]?.substring(0, 5) : null,
            aircraft_type: flight.aircraft?.iata,
            status: flight.flight?.status,
          };
        }
      } catch (aviationError: any) {
        console.warn('AviationStack API error:', aviationError.message || aviationError);
        // Continue to fallback options
      }
    } else {
      console.warn('AVIATIONSTACK_API_KEY not set, trying alternative APIs');
    }

    // Fallback: Try AirLabs API (free tier available)
    const airLabsKey = process.env.AIRLABS_API_KEY;
    if (airLabsKey) {
      try {
        const apiUrl = 'https://airlabs.co/api/v9/flight';
        const params: any = {
          api_key: airLabsKey,
          flight_iata: flightNumber,
        };

        if (date) {
          params.date = date;
        }

        const response = await axios.get(apiUrl, { params, timeout: 10000 });
        
        if (response.data && response.data.response) {
          const flight = response.data.response;
          console.log('Flight info retrieved from AirLabs:', flightNumber);
          return {
            airline_code: flight.airline_iata || airlineCode,
            departure_airport_code: flight.dep_iata,
            departure_airport_name: flight.dep_name,
            departure_city: flight.dep_city,
            departure_date: flight.dep_time ? flight.dep_time.split('T')[0] : null,
            departure_time: flight.dep_time ? flight.dep_time.split('T')[1]?.substring(0, 5) : null,
            arrival_airport_code: flight.arr_iata,
            arrival_airport_name: flight.arr_name,
            arrival_city: flight.arr_city,
            arrival_date: flight.arr_time ? flight.arr_time.split('T')[0] : null,
            arrival_time: flight.arr_time ? flight.arr_time.split('T')[1]?.substring(0, 5) : null,
            aircraft_type: flight.aircraft_iata,
            status: flight.status,
          };
        }
      } catch (airLabsError: any) {
        console.warn('AirLabs API error:', airLabsError.message || airLabsError);
      }
    }

    // If no API keys are configured, return null (user can enter details manually)
    // Note: We cannot use Google's flight data because:
    // 1. Google doesn't provide a public API for flight information
    // 2. Scraping Google violates their Terms of Service
    // 3. Third-party services that scrape Google are paid (not free)
    // The free alternatives (AviationStack, AirLabs) work just as well!
    console.warn('No flight API keys configured. To enable automatic flight lookup, set AVIATIONSTACK_API_KEY or AIRLABS_API_KEY environment variable.');
    return null;
  } catch (error: any) {
    console.error('Error looking up flight info:', error.message || error);
    return null;
  }
}

/**
 * Get flights for an event (aggregates all staff flights)
 */
async function getEventFlights(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id || (event.path?.match(/\/events\/(\d+)\/flights/) || [])[1];
    
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    // Get all flights for all staff members in this event
    const flights = await connection.query(
      `SELECT f.* FROM flights f
       INNER JOIN event_staff es ON f.staff_id = es.id
       WHERE es.event_id = ?
       ORDER BY f.departure_date, f.departure_time`,
      [eventId]
    ) as any[];

    // Serialize bigint values
    const serialized = flights.map((flight: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(flight)) {
        if (typeof value === 'bigint') {
          result[key] = value.toString();
        } else {
          result[key] = value;
        }
      }
      return result;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        count: serialized.length,
        flights: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching event flights:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch flights',
      }),
    };
  }
}

/**
 * Add flight to an event (requires staff_id in body)
 */
async function addEventFlight(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const eventId = event.pathParameters?.id || (event.path?.match(/\/events\/(\d+)\/flights/) || [])[1];
    
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage flights for this event',
        }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { staff_id, ...flightData } = body;

    if (!staff_id) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'staff_id is required',
        }),
      };
    }

    // Verify staff member belongs to the event
    const [staffMember] = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staff_id, eventId]
    ) as any[];

    if (!staffMember) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found for this event',
        }),
      };
    }

    // Use the addStaffFlight logic but with staff_id from body
    const modifiedEvent = {
      ...event,
      pathParameters: {
        ...event.pathParameters,
        id: eventId,
        staffId: staff_id.toString(),
      },
    };

    return await addStaffFlight(modifiedEvent, connection, cognitoSub);
  } catch (error: any) {
    console.error('Error adding event flight:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to add flight',
      }),
    };
  }
}

/**
 * Delete flight from an event
 */
async function deleteEventFlight(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const eventId = event.pathParameters?.id || (event.path?.match(/\/events\/(\d+)\/flights\/(\d+)/) || [])[1];
    const flightId = event.pathParameters?.flightId || (event.path?.match(/\/events\/(\d+)\/flights\/(\d+)/) || [])[2];
    
    if (!eventId || !flightId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Flight ID are required',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage flights for this event',
        }),
      };
    }

    // Get flight to find staff_id
    const [flight] = await connection.query(
      'SELECT staff_id FROM flights WHERE id = ?',
      [flightId]
    ) as any[];

    if (!flight) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Flight not found',
        }),
      };
    }

    // Verify staff member belongs to the event
    const [staffMember] = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [flight.staff_id, eventId]
    ) as any[];

    if (!staffMember) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Flight does not belong to this event',
        }),
      };
    }

    // Use the deleteStaffFlight logic
    const modifiedEvent = {
      ...event,
      pathParameters: {
        ...event.pathParameters,
        id: eventId,
        staffId: flight.staff_id.toString(),
        flightId: flightId,
      },
    };

    return await deleteStaffFlight(modifiedEvent, connection, cognitoSub);
  } catch (error: any) {
    console.error('Error deleting event flight:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete flight',
      }),
    };
  }
}

/**
 * Get flights for a staff member/artist
 */
async function getStaffFlights(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    // Extract eventId and staffId from path
    // Path format: /events/:id/staff/:staffId/flights
    let eventIdMatch: string | undefined;
    let staffIdMatch: string | undefined;
    
    if (event.pathParameters) {
      eventIdMatch = event.pathParameters.id;
      staffIdMatch = event.pathParameters.staffId;
    }
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if ((!eventIdMatch || !staffIdMatch) && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/^\/events\/(\d+)\/staff\/(\d+)\/flights$/);
      if (pathMatch && pathMatch[1] && pathMatch[2]) {
        eventIdMatch = eventIdMatch || pathMatch[1];
        staffIdMatch = staffIdMatch || pathMatch[2];
      }
    }
    
    if (!eventIdMatch || !staffIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Staff ID are required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    const staffId = parseInt(staffIdMatch);
    
    if (isNaN(eventId) || isNaN(staffId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID or staff ID',
        }),
      };
    }

    // Verify staff member belongs to the event
    const staffMembers = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staffId, eventId]
    ) as any[];

    if (!Array.isArray(staffMembers) || staffMembers.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found for this event',
        }),
      };
    }

    const flights = await connection.query(
      'SELECT * FROM flights WHERE staff_id = ? ORDER BY departure_date, departure_time',
      [staffId]
    ) as any[];

    // Serialize bigint values
    const serialized = flights.map((flight: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(flight)) {
        if (typeof value === 'bigint') {
          result[key] = value.toString();
        } else {
          result[key] = value;
        }
      }
      return result;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        count: serialized.length,
        flights: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching staff flights:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch flights',
      }),
    };
  }
}

/**
 * Add flight to a staff member/artist
 */
async function addStaffFlight(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Extract eventId and staffId from path
    // Path format: /events/:id/staff/:staffId/flights
    let eventIdMatch: string | undefined;
    let staffIdMatch: string | undefined;
    
    if (event.pathParameters) {
      eventIdMatch = event.pathParameters.id;
      staffIdMatch = event.pathParameters.staffId;
    }
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if ((!eventIdMatch || !staffIdMatch) && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/^\/events\/(\d+)\/staff\/(\d+)\/flights$/);
      if (pathMatch && pathMatch[1] && pathMatch[2]) {
        eventIdMatch = eventIdMatch || pathMatch[1];
        staffIdMatch = staffIdMatch || pathMatch[2];
      }
    }
    
    if (!eventIdMatch || !staffIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Staff ID are required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    const staffId = parseInt(staffIdMatch);
    
    if (isNaN(eventId) || isNaN(staffId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID or staff ID',
        }),
      };
    }

    // Verify event ownership
    const existingEvents = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!Array.isArray(existingEvents) || existingEvents.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event not found',
        }),
      };
    }

    const existingEvent = existingEvents[0];
    // Strict ownership check: must have cognito_sub and it must match
    if (!existingEvent.cognito_sub || existingEvent.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage flights for this event',
        }),
      };
    }

    // Verify staff member belongs to the event
    const staffMembers = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staffId, eventId]
    ) as any[];

    if (!Array.isArray(staffMembers) || staffMembers.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found for this event',
        }),
      };
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    const { flight_number, flight_type, departure_date } = body;

    if (!flight_number || !flight_type) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Flight number and flight type are required',
        }),
      };
    }

    if (flight_type !== 'departure' && flight_type !== 'return') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Flight type must be either "departure" or "return"',
        }),
      };
    }

    // Parse airline code from flight number (e.g., "AA123" -> "AA")
    const match = flight_number.match(/^([A-Z]{2,3})(\d+)$/);
    if (!match) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid flight number format. Expected format: AA123',
        }),
      };
    }

    const airlineCode = match[1];

    // Lookup flight information from API
    let flightInfo: any = null;
    if (departure_date) {
      flightInfo = await lookupFlightInfo(flight_number, departure_date);
    } else {
      flightInfo = await lookupFlightInfo(flight_number);
    }

    // Use API data if available, otherwise use provided data
    const flightData = {
      airline_code: airlineCode,
      departure_airport_code: body.departure_airport_code || flightInfo?.departure_airport_code || null,
      departure_airport_name: body.departure_airport_name || flightInfo?.departure_airport_name || null,
      departure_city: body.departure_city || flightInfo?.departure_city || null,
      departure_date: body.departure_date || flightInfo?.departure_date || null,
      departure_time: body.departure_time || flightInfo?.departure_time || null,
      arrival_airport_code: body.arrival_airport_code || flightInfo?.arrival_airport_code || null,
      arrival_airport_name: body.arrival_airport_name || flightInfo?.arrival_airport_name || null,
      arrival_city: body.arrival_city || flightInfo?.arrival_city || null,
      arrival_date: body.arrival_date || flightInfo?.arrival_date || null,
      arrival_time: body.arrival_time || flightInfo?.arrival_time || null,
      aircraft_type: body.aircraft_type || flightInfo?.aircraft_type || null,
      status: body.status || flightInfo?.status || null,
    };

    console.log('Inserting flight with data:', {
      staffId,
      flight_number,
      airline_code: flightData.airline_code,
      flight_type,
      departure_date: flightData.departure_date,
    });

    const result = await connection.query(
      `INSERT INTO flights (event_id, staff_id, flight_number, airline_code, flight_type, 
       departure_airport_code, departure_airport_name, departure_city, departure_date, departure_time,
       arrival_airport_code, arrival_airport_name, arrival_city, arrival_date, arrival_time,
       aircraft_type, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        eventId,
        staffId,
        flight_number,
        flightData.airline_code,
        flight_type,
        flightData.departure_airport_code,
        flightData.departure_airport_name,
        flightData.departure_city,
        flightData.departure_date,
        flightData.departure_time,
        flightData.arrival_airport_code,
        flightData.arrival_airport_name,
        flightData.arrival_city,
        flightData.arrival_date,
        flightData.arrival_time,
        flightData.aircraft_type,
        flightData.status,
      ]
    );

    const flightId = (result as any).insertId?.toString();

    // Fetch the created flight
    const [createdFlight] = await connection.query(
      'SELECT * FROM flights WHERE id = ?',
      [flightId]
    ) as any[];

    const serialized: any = {};
    if (createdFlight) {
      for (const [key, value] of Object.entries(createdFlight)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        flight: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error adding staff flight:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sql: error.sql,
      stack: error.stack,
    });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to add flight',
        details: error.code ? `SQL Error ${error.code}: ${error.sqlState || ''}` : undefined,
      }),
    };
  }
}

/**
 * Update flight for a staff member/artist
 */
async function updateStaffFlight(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Extract eventId, staffId, and flightId from path
    let eventIdMatch: string | undefined;
    let staffIdMatch: string | undefined;
    let flightIdMatch: string | undefined;
    
    if (event.pathParameters) {
      eventIdMatch = event.pathParameters.id;
      staffIdMatch = event.pathParameters.staffId;
      flightIdMatch = event.pathParameters.flightId;
    }
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if ((!eventIdMatch || !staffIdMatch || !flightIdMatch) && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/^\/events\/(\d+)\/staff\/(\d+)\/flights\/(\d+)$/);
      if (pathMatch && pathMatch[1] && pathMatch[2] && pathMatch[3]) {
        eventIdMatch = eventIdMatch || pathMatch[1];
        staffIdMatch = staffIdMatch || pathMatch[2];
        flightIdMatch = flightIdMatch || pathMatch[3];
      }
    }
    
    if (!eventIdMatch || !staffIdMatch || !flightIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID, Staff ID, and Flight ID are required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    const staffId = parseInt(staffIdMatch);
    const flightId = parseInt(flightIdMatch);
    
    if (isNaN(eventId) || isNaN(staffId) || isNaN(flightId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID, staff ID, or flight ID',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage flights for this event',
        }),
      };
    }

    // Verify flight belongs to staff member and event
    const [existingFlight] = await connection.query(
      `SELECT f.* FROM flights f
       INNER JOIN event_staff es ON f.staff_id = es.id
       WHERE f.id = ? AND f.staff_id = ? AND es.event_id = ?`,
      [flightId, staffId, eventId]
    ) as any[];

    if (!existingFlight) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Flight not found',
        }),
      };
    }

    // Parse request body
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }

    // Extract flight data from body
    const flight_number = body.flight_number?.toUpperCase().trim() || existingFlight.flight_number;
    const flight_type = body.flight_type || existingFlight.flight_type;
    const airlineCode = flight_number.match(/^([A-Z]{2,3})/)?.[1] || existingFlight.airline_code;

    // Build update query dynamically based on provided fields
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (body.flight_number !== undefined) {
      updateFields.push('flight_number = ?');
      updateValues.push(flight_number);
    }
    if (body.flight_type !== undefined) {
      updateFields.push('flight_type = ?');
      updateValues.push(flight_type);
    }
    if (body.airline_code !== undefined || body.flight_number !== undefined) {
      updateFields.push('airline_code = ?');
      updateValues.push(airlineCode);
    }
    if (body.departure_airport_code !== undefined) {
      updateFields.push('departure_airport_code = ?');
      updateValues.push(body.departure_airport_code || null);
    }
    if (body.departure_airport_name !== undefined) {
      updateFields.push('departure_airport_name = ?');
      updateValues.push(body.departure_airport_name || null);
    }
    if (body.departure_city !== undefined) {
      updateFields.push('departure_city = ?');
      updateValues.push(body.departure_city || null);
    }
    if (body.departure_date !== undefined) {
      updateFields.push('departure_date = ?');
      updateValues.push(body.departure_date || null);
    }
    if (body.departure_time !== undefined) {
      updateFields.push('departure_time = ?');
      updateValues.push(body.departure_time || null);
    }
    if (body.arrival_airport_code !== undefined) {
      updateFields.push('arrival_airport_code = ?');
      updateValues.push(body.arrival_airport_code || null);
    }
    if (body.arrival_airport_name !== undefined) {
      updateFields.push('arrival_airport_name = ?');
      updateValues.push(body.arrival_airport_name || null);
    }
    if (body.arrival_city !== undefined) {
      updateFields.push('arrival_city = ?');
      updateValues.push(body.arrival_city || null);
    }
    if (body.arrival_date !== undefined) {
      updateFields.push('arrival_date = ?');
      updateValues.push(body.arrival_date || null);
    }
    if (body.arrival_time !== undefined) {
      updateFields.push('arrival_time = ?');
      updateValues.push(body.arrival_time || null);
    }
    if (body.aircraft_type !== undefined) {
      updateFields.push('aircraft_type = ?');
      updateValues.push(body.aircraft_type || null);
    }
    if (body.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(body.status || null);
    }

    if (updateFields.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'No fields to update',
        }),
      };
    }

    // Add updated_at timestamp
    updateFields.push('updated_at = NOW()');
    updateValues.push(flightId);

    // Execute update
    await connection.query(
      `UPDATE flights SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Fetch the updated flight
    const [updatedFlight] = await connection.query(
      'SELECT * FROM flights WHERE id = ?',
      [flightId]
    ) as any[];

    const serialized: any = {};
    if (updatedFlight) {
      for (const [key, value] of Object.entries(updatedFlight)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        flight: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating staff flight:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update flight',
      }),
    };
  }
}

/**
 * Delete flight from a staff member/artist
 */
async function deleteStaffFlight(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Extract eventId, staffId, and flightId from path
    // Path format: /events/:id/staff/:staffId/flights/:flightId
    let eventIdMatch: string | undefined;
    let staffIdMatch: string | undefined;
    let flightIdMatch: string | undefined;
    
    if (event.pathParameters) {
      eventIdMatch = event.pathParameters.id;
      staffIdMatch = event.pathParameters.staffId;
      flightIdMatch = event.pathParameters.flightId;
    }
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if ((!eventIdMatch || !staffIdMatch || !flightIdMatch) && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/^\/events\/(\d+)\/staff\/(\d+)\/flights\/(\d+)$/);
      if (pathMatch && pathMatch[1] && pathMatch[2] && pathMatch[3]) {
        eventIdMatch = eventIdMatch || pathMatch[1];
        staffIdMatch = staffIdMatch || pathMatch[2];
        flightIdMatch = flightIdMatch || pathMatch[3];
      }
    }
    
    if (!eventIdMatch || !staffIdMatch || !flightIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID, Staff ID, and Flight ID are required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    const staffId = parseInt(staffIdMatch);
    const flightId = parseInt(flightIdMatch);
    
    if (isNaN(eventId) || isNaN(staffId) || isNaN(flightId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID, staff ID, or flight ID',
        }),
      };
    }

    // Verify event ownership
    const existingEvents = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!Array.isArray(existingEvents) || existingEvents.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event not found',
        }),
      };
    }

    const existingEvent = existingEvents[0];
    // Strict ownership check: must have cognito_sub and it must match
    if (!existingEvent.cognito_sub || existingEvent.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage flights for this event',
        }),
      };
    }

    // Verify staff member belongs to the event
    const staffMembers = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staffId, eventId]
    ) as any[];

    if (!Array.isArray(staffMembers) || staffMembers.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found for this event',
        }),
      };
    }

    // Verify flight belongs to staff member
    const flightRecords = await connection.query(
      'SELECT id FROM flights WHERE id = ? AND staff_id = ?',
      [flightId, staffId]
    ) as any[];

    if (!Array.isArray(flightRecords) || flightRecords.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Flight not found for this staff member',
        }),
      };
    }

    await connection.query('DELETE FROM flights WHERE id = ? AND staff_id = ?', [flightId, staffId]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Flight deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error deleting staff flight:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete flight',
      }),
    };
  }
}

/**
 * Get accommodations for an event
 */
async function getEventAccommodations(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    let eventId = event.pathParameters?.id;
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if (!eventId && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/\/events\/(\d+)\/accommodations/);
      if (pathMatch) {
        eventId = pathMatch[1];
      }
    }
    
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const accommodations = await connection.query(
      `SELECT a.*, 
       GROUP_CONCAT(DISTINCT es.id ORDER BY es.id SEPARATOR ',') as assigned_staff_ids,
       GROUP_CONCAT(DISTINCT es.name ORDER BY es.id SEPARATOR ',') as assigned_staff_names
       FROM accommodations a
       LEFT JOIN accommodation_assignments aa ON a.id = aa.accommodation_id
       LEFT JOIN event_staff es ON aa.staff_id = es.id
       WHERE a.event_id = ?
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [eventId]
    ) as any[];

    const serialized = accommodations.map((acc: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(acc)) {
        if (typeof value === 'bigint') {
          result[key] = value.toString();
        } else {
          result[key] = value;
        }
      }
      // Parse assigned staff IDs and names
      if (result.assigned_staff_ids) {
        result.assigned_staff_ids = result.assigned_staff_ids.split(',').filter((id: string) => id);
        result.assigned_staff_names = result.assigned_staff_names ? result.assigned_staff_names.split(',') : [];
      } else {
        result.assigned_staff_ids = [];
        result.assigned_staff_names = [];
      }
      return result;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        accommodations: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching accommodations:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch accommodations',
      }),
    };
  }
}

/**
 * Add accommodation to an event
 */
async function addEventAccommodation(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    let eventId = event.pathParameters?.id;
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if (!eventId && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/\/events\/(\d+)\/accommodations/);
      if (pathMatch) {
        eventId = pathMatch[1];
      }
    }
    
    if (!eventId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    // Parse eventId as integer for database
    const eventIdInt = parseInt(eventId);
    if (isNaN(eventIdInt)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventIdInt]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage accommodations for this event',
        }),
      };
    }

    // Parse request body (handle base64 encoding from API Gateway)
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e, 'Body:', event.body?.substring(0, 100));
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
            details: e instanceof Error ? e.message : String(e),
          }),
        };
      }
    }
    
    const {
      accommodation_type = 'hotel',
      name,
      address,
      notes,
    } = body;

    if (!name) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Accommodation name is required',
        }),
      };
    }

    const result = await connection.query(
      `INSERT INTO accommodations (event_id, accommodation_type, name, address, notes, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [eventIdInt, accommodation_type, name, address || null, notes || null]
    );

    const accommodationId = (result as any).insertId?.toString();

    const [createdAccommodation] = await connection.query(
      'SELECT * FROM accommodations WHERE id = ?',
      [accommodationId]
    ) as any[];

    const serialized: any = {};
    if (createdAccommodation) {
      for (const [key, value] of Object.entries(createdAccommodation)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        accommodation: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error adding accommodation:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to add accommodation',
      }),
    };
  }
}

/**
 * Update accommodation
 */
async function updateEventAccommodation(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Extract eventId and accommodationId from path
    let eventIdMatch: string | undefined;
    let accommodationIdMatch: string | undefined;
    
    if (event.pathParameters) {
      eventIdMatch = event.pathParameters.id;
      accommodationIdMatch = event.pathParameters.accommodationId;
    }
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if ((!eventIdMatch || !accommodationIdMatch) && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/^\/events\/(\d+)\/accommodations\/(\d+)$/);
      if (pathMatch && pathMatch[1] && pathMatch[2]) {
        eventIdMatch = eventIdMatch || pathMatch[1];
        accommodationIdMatch = accommodationIdMatch || pathMatch[2];
      }
    }

    if (!eventIdMatch || !accommodationIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Accommodation ID are required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    const accommodationId = parseInt(accommodationIdMatch);

    if (isNaN(eventId) || isNaN(accommodationId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID or accommodation ID',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage accommodations for this event',
        }),
      };
    }

    // Verify accommodation belongs to event
    const [accommodationRow] = await connection.query(
      'SELECT id FROM accommodations WHERE id = ? AND event_id = ?',
      [accommodationId, eventId]
    ) as any[];

    if (!accommodationRow) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Accommodation not found',
        }),
      };
    }

    // Parse request body (handle base64 encoding from API Gateway)
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
        };
      }
    }
    const {
      accommodation_type,
      name,
      address,
      notes,
    } = body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (accommodation_type !== undefined) {
      updateFields.push('accommodation_type = ?');
      updateValues.push(accommodation_type);
    }
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address || null);
    }
    if (notes !== undefined) {
      updateFields.push('notes = ?');
      updateValues.push(notes || null);
    }

    if (updateFields.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'No fields to update',
        }),
      };
    }

    if (updateFields.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'No fields to update',
        }),
      };
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(accommodationId);

    await connection.query(
      `UPDATE accommodations SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const [updatedAccommodation] = await connection.query(
      'SELECT * FROM accommodations WHERE id = ?',
      [accommodationId]
    ) as any[];

    const serialized: any = {};
    if (updatedAccommodation) {
      for (const [key, value] of Object.entries(updatedAccommodation)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        accommodation: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error updating accommodation:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to update accommodation',
      }),
    };
  }
}

/**
 * Delete accommodation
 */
async function deleteEventAccommodation(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const eventId = event.pathParameters?.id || (event.path?.match(/\/events\/(\d+)\/accommodations\/(\d+)/) || [])[1];
    const accommodationId = event.pathParameters?.accommodationId || (event.path?.match(/\/events\/(\d+)\/accommodations\/(\d+)/) || [])[2];

    if (!eventId || !accommodationId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Accommodation ID are required',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage accommodations for this event',
        }),
      };
    }

    // Verify accommodation belongs to event
    const [accommodationRow] = await connection.query(
      'SELECT id FROM accommodations WHERE id = ? AND event_id = ?',
      [accommodationId, eventId]
    ) as any[];

    if (!accommodationRow) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Accommodation not found',
        }),
      };
    }

    await connection.query('DELETE FROM accommodations WHERE id = ? AND event_id = ?', [accommodationId, eventId]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Accommodation deleted successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error deleting accommodation:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete accommodation',
      }),
    };
  }
}

/**
 * Assign accommodation to staff
 */
async function assignAccommodationToStaff(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    let eventId = event.pathParameters?.id;
    let accommodationId = event.pathParameters?.accommodationId;
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if ((!eventId || !accommodationId) && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/\/events\/(\d+)\/accommodations\/(\d+)\/assign/);
      if (pathMatch) {
        eventId = eventId || pathMatch[1];
        accommodationId = accommodationId || pathMatch[2];
      }
    }

    if (!eventId || !accommodationId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Accommodation ID are required',
        }),
      };
    }

    // Parse IDs as integers for database
    const eventIdInt = parseInt(eventId);
    const accommodationIdInt = parseInt(accommodationId);
    
    if (isNaN(eventIdInt) || isNaN(accommodationIdInt)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID or accommodation ID',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventIdInt]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage accommodations for this event',
        }),
      };
    }

    // Parse request body (handle base64 encoding from API Gateway)
    let body: any = {};
    if (event.body) {
      try {
        const bodyString = event.isBase64Encoded 
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        body = JSON.parse(bodyString);
      } catch (e) {
        console.error('Error parsing body:', e, 'Body:', event.body?.substring(0, 100));
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
            details: e instanceof Error ? e.message : String(e),
          }),
        };
      }
    }
    
    const { 
      staff_id,
      room_number,
      board_type = 'none',
      check_in_date,
      check_out_date,
      notes,
    } = body;

    if (!staff_id) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff ID is required',
        }),
      };
    }

    // Parse staff_id as integer
    const staffIdInt = parseInt(staff_id);
    if (isNaN(staffIdInt)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid staff ID',
        }),
      };
    }

    // Verify accommodation belongs to event
    const [accommodationRow] = await connection.query(
      'SELECT id FROM accommodations WHERE id = ? AND event_id = ?',
      [accommodationIdInt, eventIdInt]
    ) as any[];

    if (!accommodationRow) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Accommodation not found',
        }),
      };
    }

    // Verify staff belongs to event
    const [staffRow] = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staffIdInt, eventIdInt]
    ) as any[];

    if (!staffRow) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found',
        }),
      };
    }

    // Check if the exact same assignment already exists - if so, update it
    // Otherwise, create a new assignment (allowing multiple accommodations per person)
    const existing = await connection.query(
      'SELECT id FROM accommodation_assignments WHERE accommodation_id = ? AND staff_id = ?',
      [accommodationIdInt, staffIdInt]
    ) as any[];

    if (Array.isArray(existing) && existing.length > 0) {
      // Update existing assignment (same accommodation + staff combination)
      await connection.query(
        `UPDATE accommodation_assignments 
         SET room_number = ?, board_type = ?, check_in_date = ?, check_out_date = ?, notes = ?, updated_at = NOW()
         WHERE accommodation_id = ? AND staff_id = ?`,
        [room_number || null, board_type, check_in_date || null, check_out_date || null, notes || null, accommodationIdInt, staffIdInt]
      );
      
      // Fetch updated assignment with accommodation details
      const [updatedAssignment] = await connection.query(
        `SELECT a.*, 
         aa.room_number, 
         aa.board_type, 
         aa.check_in_date, 
         aa.check_out_date, 
         aa.notes as assignment_notes
         FROM accommodations a
         INNER JOIN accommodation_assignments aa ON a.id = aa.accommodation_id
         WHERE aa.accommodation_id = ? AND aa.staff_id = ?`,
        [accommodationIdInt, staffIdInt]
      ) as any[];
      
      const serialized: any = {};
      if (updatedAssignment) {
        for (const [key, value] of Object.entries(updatedAssignment)) {
          if (typeof value === 'bigint') {
            serialized[key] = value.toString();
          } else {
            serialized[key] = value;
          }
        }
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'Accommodation assignment updated successfully',
          accommodation: serialized,
        }),
      };
    } else {
      // Create new assignment (allows multiple accommodations per person)
      const result = await connection.query(
        `INSERT INTO accommodation_assignments (accommodation_id, staff_id, room_number, board_type, check_in_date, check_out_date, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [accommodationIdInt, staffIdInt, room_number || null, board_type, check_in_date || null, check_out_date || null, notes || null]
      ) as any;
      
      const assignmentId = result.insertId;
      
      // Fetch created assignment with accommodation details
      const [createdAssignment] = await connection.query(
        `SELECT a.*, 
         aa.id as assignment_id,
         aa.room_number, 
         aa.board_type, 
         aa.check_in_date, 
         aa.check_out_date, 
         aa.notes as assignment_notes
         FROM accommodations a
         INNER JOIN accommodation_assignments aa ON a.id = aa.accommodation_id
         WHERE aa.id = ?`,
        [assignmentId]
      ) as any[];
      
      const serialized: any = {};
      if (createdAssignment) {
        for (const [key, value] of Object.entries(createdAssignment)) {
          if (typeof value === 'bigint') {
            serialized[key] = value.toString();
          } else {
            serialized[key] = value;
          }
        }
      }
      
      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          message: 'Accommodation assigned successfully',
          accommodation: serialized,
        }),
      };
    }
  } catch (error: any) {
    console.error('Error assigning accommodation:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to assign accommodation',
      }),
    };
  }
}

/**
 * Unassign accommodation from staff
 */
async function unassignAccommodationFromStaff(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const eventId = event.pathParameters?.id || (event.path?.match(/\/events\/(\d+)\/accommodations\/(\d+)\/assign\/(\d+)/) || [])[1];
    const accommodationId = event.pathParameters?.accommodationId || (event.path?.match(/\/events\/(\d+)\/accommodations\/(\d+)\/assign\/(\d+)/) || [])[2];
    const staffId = event.pathParameters?.staffId || (event.path?.match(/\/events\/(\d+)\/accommodations\/(\d+)\/assign\/(\d+)/) || [])[3];

    if (!eventId || !accommodationId || !staffId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID, Accommodation ID, and Staff ID are required',
        }),
      };
    }

    // Verify event ownership
    const [eventRow] = await connection.query(
      'SELECT cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];

    if (!eventRow || eventRow.cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You do not have permission to manage accommodations for this event',
        }),
      };
    }

    await connection.query(
      'DELETE FROM accommodation_assignments WHERE accommodation_id = ? AND staff_id = ?',
      [accommodationId, staffId]
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        message: 'Accommodation unassigned successfully',
      }),
    };
  } catch (error: any) {
    console.error('Error unassigning accommodation:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to unassign accommodation',
      }),
    };
  }
}

/**
 * Get accommodations for a specific staff member
 */
async function getStaffAccommodations(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    let eventId = event.pathParameters?.id;
    let staffId = event.pathParameters?.staffId;
    
    // If not in pathParameters, extract from path (normalize /Prod prefix first)
    if ((!eventId || !staffId) && event.path) {
      let normalizedPath = event.path;
      if (normalizedPath.startsWith('/Prod')) {
        normalizedPath = normalizedPath.substring(5);
      }
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      const pathMatch = normalizedPath.match(/\/events\/(\d+)\/staff\/(\d+)\/accommodations/);
      if (pathMatch) {
        eventId = eventId || pathMatch[1];
        staffId = staffId || pathMatch[2];
      }
    }

    if (!eventId || !staffId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID and Staff ID are required',
        }),
      };
    }

    // Verify staff belongs to event
    const [staffRow] = await connection.query(
      'SELECT id FROM event_staff WHERE id = ? AND event_id = ?',
      [staffId, eventId]
    ) as any[];

    if (!staffRow) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Staff member not found',
        }),
      };
    }

    const accommodations = await connection.query(
      `SELECT a.*, 
       aa.room_number, 
       aa.board_type, 
       aa.check_in_date, 
       aa.check_out_date, 
       aa.notes as assignment_notes
       FROM accommodations a
       INNER JOIN accommodation_assignments aa ON a.id = aa.accommodation_id
       WHERE aa.staff_id = ? AND a.event_id = ?
       ORDER BY aa.check_in_date, a.name`,
      [staffId, eventId]
    ) as any[];

    const serialized = accommodations.map((acc: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(acc)) {
        if (typeof value === 'bigint') {
          result[key] = value.toString();
        } else {
          result[key] = value;
        }
      }
      return result;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        accommodations: serialized,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching staff accommodations:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch accommodations',
      }),
    };
  }
}

/**
 * Get user's ticket orders
 */
async function getUserTickets(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Get user's email from Cognito claims as fallback
    const claims = event.requestContext?.authorizer?.claims;
    const userEmail = claims?.email || claims?.username || null;
    
    console.log('Fetching tickets for user:', { cognitoSub, userEmail });

    // Get ticket orders for this user - search by cognito_sub OR email (case-insensitive for profile matching)
    let orders: any[];
    if (userEmail) {
      // Search by both cognito_sub and email to catch all tickets (LOWER so profile matches regardless of casing)
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
      // Fallback to cognito_sub only if no email available
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
    
    console.log(`Found ${orders.length} ticket orders for user`);

    // Serialize BigInt values
    const serializedOrders = orders.map((order: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(order)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else if (value && typeof value === 'object' && value.constructor === Date) {
          serialized[key] = value.toISOString();
        } else {
          serialized[key] = value;
        }
      }
      return serialized;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        orders: serializedOrders,
        count: serializedOrders.length,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching user tickets:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch ticket orders',
      }),
    };
  }
}

/**
 * Get ticket orders for an event (paginated, searchable) - event owner only
 */
async function getEventTicketOrders(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Authentication required' }),
      };
    }

    const eventId = event.pathParameters?.id;
    if (!eventId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Event ID is required' }),
      };
    }

    // Verify event owner
    const eventRows = await connection.query(
      'SELECT id, cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];
    if (eventRows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Event not found' }),
      };
    }
    if (!eventRows[0].cognito_sub || eventRows[0].cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Not allowed to list ticket orders for this event' }),
      };
    }

    const queryParams = event.queryStringParameters || {};
    const page = Math.max(1, parseInt(queryParams.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const search = (queryParams.search || '').trim();
    const statusFilter = queryParams.status || ''; // '' = all, 'paid', 'pending', etc.
    const validatedFilter = queryParams.validated || ''; // '' = all, 'yes', 'no'

    // Build WHERE: event_id and optional filters
    const conditions: string[] = ['tord.event_id = ?'];
    const params: any[] = [eventId];

    if (search) {
      conditions.push('(tord.email LIKE ? OR CAST(tord.id AS CHAR) LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }
    if (statusFilter) {
      conditions.push('tord.status = ?');
      params.push(statusFilter);
    }
    if (validatedFilter === 'yes') {
      conditions.push('tord.validated_at IS NOT NULL');
    } else if (validatedFilter === 'no') {
      conditions.push('tord.validated_at IS NULL');
    }

    const whereClause = conditions.join(' AND ');

    // Count total (check if validated_at column exists by selecting it; if error, use count without it)
    let total = 0;
    try {
      const countResult = await connection.query(
        `SELECT COUNT(*) as total FROM ticket_orders tord WHERE ${whereClause}`,
        params
      ) as any[];
      total = Number(countResult[0]?.total || 0);
    } catch (countErr: any) {
      console.error('Count query error (validated_at may be missing):', countErr);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({
          success: false,
          error: 'Failed to count orders. Run migration: POST /admin/migrate-add-ticket-validated',
        }),
      };
    }

    // Select with validated_at (column added by migration)
    let orders: any[];
    try {
      orders = await connection.query(
        `SELECT 
          tord.id,
          tord.event_id,
          tord.ticket_id,
          tord.email,
          tord.quantity,
          tord.unit_price,
          tord.discount_amount,
          tord.total_amount,
          tord.status,
          tord.validated_at,
          tord.created_at,
          t.name as ticket_name
        FROM ticket_orders tord
        INNER JOIN tickets t ON tord.ticket_id = t.id
        WHERE ${whereClause}
        ORDER BY tord.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ) as any[];
    } catch (selectErr: any) {
      const isMissingColumn =
        selectErr?.errno === 1054 ||
        selectErr?.code === 'ER_BAD_FIELD_ERROR' ||
        (typeof selectErr?.message === 'string' && selectErr.message.includes('validated_at'));
      if (isMissingColumn) {
        return {
          statusCode: 503,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
          body: JSON.stringify({
            success: false,
            error: 'Ticket validation is not set up. Run the migration: POST /admin/migrate-add-ticket-validated',
          }),
        };
      }
      throw selectErr;
    }

    const serialized = orders.map((row: any) => {
      const out: any = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'bigint') out[k] = v.toString();
        else if (v && typeof v === 'object' && (v as Date).constructor === Date) out[k] = (v as Date).toISOString();
        else out[k] = v;
      }
      return out;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({
        success: true,
        orders: serialized,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      }),
    };
  } catch (err: any) {
    console.error('getEventTicketOrders error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: false, error: err?.message || 'Failed to fetch ticket orders' }),
    };
  }
}

/**
 * Mark a ticket order as validated (event owner only)
 */
async function updateTicketOrderValidated(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Authentication required' }),
      };
    }

    const eventId = event.pathParameters?.id;
    const orderId = event.pathParameters?.orderId;
    if (!eventId || !orderId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Event ID and order ID are required' }),
      };
    }

    // Verify event owner
    const eventRows = await connection.query(
      'SELECT id, cognito_sub FROM events WHERE id = ?',
      [eventId]
    ) as any[];
    if (eventRows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Event not found' }),
      };
    }
    if (!eventRows[0].cognito_sub || eventRows[0].cognito_sub !== cognitoSub) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Not allowed to update this event\'s orders' }),
      };
    }

    const body = event.body ? JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body
    ) : {};
    const validated = body.validated !== false; // default true

    // Only paid orders can be validated
    const orderRows = await connection.query(
      'SELECT id, status FROM ticket_orders WHERE id = ? AND event_id = ?',
      [orderId, eventId]
    ) as any[];
    if (orderRows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Order not found' }),
      };
    }
    if (orderRows[0].status !== 'paid') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Only paid orders can be validated' }),
      };
    }

    // Update validated_at (if column missing, migration needed)
    if (validated) {
      await connection.query(
        'UPDATE ticket_orders SET validated_at = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?',
        [orderId, eventId]
      );
    } else {
      await connection.query(
        'UPDATE ticket_orders SET validated_at = NULL WHERE id = ? AND event_id = ?',
        [orderId, eventId]
      );
    }

    const check = await connection.query(
      'SELECT id, validated_at FROM ticket_orders WHERE id = ? AND event_id = ?',
      [orderId, eventId]
    ) as any[];
    if (check.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
        body: JSON.stringify({ success: false, error: 'Order not found' }),
      };
    }

    const row = check[0];
    const idVal = typeof row.id === 'bigint' ? row.id.toString() : row.id;
    const serialized: any = { id: idVal, validated: !!row.validated_at };
    if (row.validated_at) serialized.validated_at = (row.validated_at as Date).toISOString();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: true, order: serialized }),
    };
  } catch (err: any) {
    console.error('updateTicketOrderValidated error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
      body: JSON.stringify({ success: false, error: err?.message || 'Failed to update order' }),
    };
  }
}

/**
 * Get user's videos
 */
async function getUserVideos(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    // Check if album_id column exists in videos table
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

    const s3 = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;

    const serializedVideos = await Promise.all(videos.map(async (video: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(video)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }
      
      // Generate presigned URL for video if it exists
      if (serialized.video_url && bucketName) {
        try {
          let s3Key = serialized.video_url;
          // Remove query parameters
          s3Key = s3Key.split('?')[0];
          
          if (s3Key.startsWith('s3://')) {
            const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
            if (match) {
              s3Key = decodeURIComponent(match[1]);
            }
          } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
            const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                         s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
            if (match) {
              s3Key = decodeURIComponent(match[1]);
            }
          } else if (s3Key.startsWith('videos/') || s3Key.startsWith('thumbnails/')) {
            s3Key = s3Key;
          }
          
          const getObjectCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
          });
          
          const presignedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });
          serialized.video_url = presignedUrl;
        } catch (urlError) {
          console.error('Error generating presigned URL for video:', urlError, 'Original URL:', serialized.video_url);
        }
      }
      
      // Generate presigned URL for thumbnail if it exists
      if (serialized.thumbnail_url && bucketName) {
        try {
          let thumbnailS3Key = serialized.thumbnail_url;
          thumbnailS3Key = thumbnailS3Key.split('?')[0];
          
          if (thumbnailS3Key.startsWith('s3://')) {
            const match = thumbnailS3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
            if (match) {
              thumbnailS3Key = decodeURIComponent(match[1]);
            }
          } else if (thumbnailS3Key.includes('.s3.') || thumbnailS3Key.includes('amazonaws.com')) {
            const match = thumbnailS3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                         thumbnailS3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
            if (match) {
              thumbnailS3Key = decodeURIComponent(match[1]);
            }
          } else if (thumbnailS3Key.startsWith('videos/') || thumbnailS3Key.startsWith('users/') || thumbnailS3Key.startsWith('thumbnails/')) {
            // Already a key path (including thumbnails folder)
            thumbnailS3Key = thumbnailS3Key;
          }
          
          if (thumbnailS3Key && thumbnailS3Key.trim() !== '') {
            const getThumbnailCommand = new GetObjectCommand({
              Bucket: bucketName,
              Key: thumbnailS3Key,
            });
            
            const thumbnailPresignedUrl = await getSignedUrl(s3, getThumbnailCommand, { expiresIn: 3600 });
            serialized.thumbnail_url = thumbnailPresignedUrl;
          }
        } catch (thumbnailError) {
          console.error('Error generating presigned URL for thumbnail:', thumbnailError);
        }
      }
      
      return serialized;
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        count: serializedVideos.length,
        videos: serializedVideos,
      }),
    };
  } catch (error: any) {
    console.error('Error getting user videos:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to get user videos',
      }),
    };
  }
}

/**
 * Get all ticket orders (admin/debugging endpoint)
 */
async function getAllTicketOrders(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection
): Promise<APIGatewayProxyResult> {
  try {
    // Get all ticket orders with event and ticket details
    const orders = await connection.query(
      `SELECT 
        tord.id,
        tord.event_id,
        e.name as event_name,
        tord.ticket_id,
        t.name as ticket_name,
        tord.cognito_sub,
        tord.email,
        tord.quantity,
        tord.unit_price,
        tord.discount_amount,
        tord.total_amount,
        tord.status,
        tord.stripe_checkout_session_id,
        tord.created_at,
        tord.updated_at
      FROM ticket_orders tord
      LEFT JOIN events e ON tord.event_id = e.id
      LEFT JOIN tickets t ON tord.ticket_id = t.id
      ORDER BY tord.created_at DESC`
    ) as any[];

    // Serialize BigInt and Date values
    const serializedOrders = orders.map((order: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(order)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else if (value && typeof value === 'object' && value.constructor === Date) {
          serialized[key] = value.toISOString();
        } else {
          serialized[key] = value;
        }
      }
      return serialized;
    });

    // Get summary statistics
    const summary = await connection.query(
      `SELECT 
        status,
        COUNT(*) as count,
        SUM(quantity) as total_tickets,
        SUM(total_amount) as total_revenue
      FROM ticket_orders
      GROUP BY status`
    ) as any[];

    const serializedSummary = summary.map((row: any) => {
      const serialized: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else if (typeof value === 'number') {
          serialized[key] = value;
        } else {
          serialized[key] = value;
        }
      }
      return serialized;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        orders: serializedOrders,
        summary: serializedSummary,
        count: serializedOrders.length,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching all ticket orders:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch ticket orders',
      }),
    };
  }
}

/**
 * Get current user's staff/artist info for an event
 */
async function getMyEventInfo(
  event: APIGatewayProxyEvent,
  connection: mariadb.PoolConnection,
  cognitoSub: string | null
): Promise<APIGatewayProxyResult> {
  // Helper function to recursively serialize BigInt values and handle Date objects
  const serializeBigInt = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    if (Array.isArray(obj)) {
      return obj.map(serializeBigInt);
    }
    if (typeof obj === 'object') {
      // Handle plain objects
      if (obj.constructor === Object || Object.getPrototypeOf(obj) === null) {
        const serialized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          serialized[key] = serializeBigInt(value);
        }
        return serialized;
      }
      // For other object types, try to convert to string or return as-is
      if (typeof obj.toString === 'function') {
        return obj.toString();
      }
    }
    return obj;
  };

  try {
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
        }),
      };
    }

    const eventIdMatch = event.pathParameters?.id;
    if (!eventIdMatch) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Event ID is required',
        }),
      };
    }

    const eventId = parseInt(eventIdMatch);
    if (isNaN(eventId)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid event ID',
        }),
      };
    }

    // Get user's email from Cognito claims
    let claims = event.requestContext?.authorizer?.claims;
    let userEmail = claims?.email || null;
    
    // If no claims from authorizer, try to decode from JWT token
    if (!userEmail) {
      const authHeader = event.headers.Authorization || event.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            userEmail = payload.email || null;
            // Also set claims object for consistency
            if (!claims) {
              claims = payload;
            }
          }
        } catch (decodeError: any) {
          console.error('Error decoding JWT token for email:', decodeError);
        }
      }
    }
    
    console.log('getMyEventInfo - User email from claims:', userEmail);
    console.log('getMyEventInfo - Event ID:', eventId);
    try {
      console.log('getMyEventInfo - Claims:', JSON.stringify(serializeBigInt(claims), null, 2));
    } catch (e) {
      console.log('getMyEventInfo - Claims (serialization failed):', claims);
    }
    
    if (!userEmail) {
      console.log('getMyEventInfo - No user email found');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'User email not found',
        }),
      };
    }

    // Find staff/artist record by email (case-insensitive) or cognito_sub
    const normalizedEmail = userEmail.toLowerCase().trim();
    console.log('getMyEventInfo - Normalized email:', normalizedEmail);
    console.log('getMyEventInfo - Cognito sub:', cognitoSub);
    console.log('getMyEventInfo - Querying event_staff for event_id:', eventId);
    
    // First try to match by email
    let staffRecords = await connection.query(
      'SELECT * FROM event_staff WHERE event_id = ? AND LOWER(TRIM(email)) = ?',
      [eventId, normalizedEmail]
    ) as any[];
    
    console.log('getMyEventInfo - Found staff records by email:', staffRecords.length);
    
    // If no match by email and we have cognito_sub, try matching by cognito_sub
    if (staffRecords.length === 0 && cognitoSub) {
      // Check if cognito_sub column exists
      try {
        const columnCheck = await connection.query(`
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_staff'
            AND COLUMN_NAME = 'cognito_sub'
        `) as any[];
        
        const hasCognitoSubColumn = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;
        
        if (hasCognitoSubColumn) {
          console.log('getMyEventInfo - Trying to match by cognito_sub:', cognitoSub);
          staffRecords = await connection.query(
            'SELECT * FROM event_staff WHERE event_id = ? AND cognito_sub = ?',
            [eventId, cognitoSub]
          ) as any[];
          console.log('getMyEventInfo - Found staff records by cognito_sub:', staffRecords.length);
        }
      } catch (colError) {
        console.warn('getMyEventInfo - Error checking for cognito_sub column:', colError);
      }
    }
    
    if (staffRecords.length > 0) {
      // Serialize before logging to avoid BigInt issues
      const logStaff = serializeBigInt(staffRecords[0]);
      console.log('getMyEventInfo - Staff record:', JSON.stringify(logStaff, null, 2));
    } else {
      // Debug: Let's see what emails exist for this event
      const allStaff = await connection.query(
        'SELECT id, name, email, role FROM event_staff WHERE event_id = ?',
        [eventId]
      ) as any[];
      const logAllStaff = serializeBigInt(allStaff);
      console.log('getMyEventInfo - All staff for this event:', JSON.stringify(logAllStaff, null, 2));
    }

    if (!Array.isArray(staffRecords) || staffRecords.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: false,
          error: 'You are not registered as staff or artist for this event',
        }),
      };
    }

    const staffMember = staffRecords[0];

    // Convert staff ID to string/number for use in queries (handle BigInt) - do this BEFORE serialization
    const staffId = typeof staffMember.id === 'bigint' ? Number(staffMember.id) : staffMember.id;

    // Serialize staff member using recursive function, then handle special cases
    let serializedStaff: any = serializeBigInt(staffMember);
    
    // Handle is_public boolean conversion
    if ('is_public' in serializedStaff) {
      const isPublic = serializedStaff.is_public;
      if (isPublic === 0 || isPublic === 1 || isPublic === '0' || isPublic === '1') {
        serializedStaff.is_public = isPublic === 1 || isPublic === '1' || isPublic === true;
      }
    }

    // Get subcategories if artist
    if (staffMember.role === 'artist') {
      try {
        const subcategories = await connection.query(
          `SELECT sc.name, sc.display_name 
           FROM event_staff_subcategories ess
           INNER JOIN artist_subcategories sc ON ess.subcategory_id = sc.id
           WHERE ess.staff_id = ?`,
          [staffId]
        ) as any[];
        
        // Serialize subcategories using recursive function, then extract names
        const serializedSubcategories = serializeBigInt(subcategories);
        serializedStaff.subcategories = Array.isArray(serializedSubcategories) 
          ? serializedSubcategories.map((sc: any) => sc.name)
          : [];
      } catch (subcatError) {
        console.error('Error fetching subcategories:', subcatError);
        serializedStaff.subcategories = [];
      }
    }

    // Get flights for this staff member
    let flights: any[] = [];
    try {
      console.log('getMyEventInfo - Fetching flights for staff_id:', staffId);
      const flightsRaw = await connection.query(
        'SELECT * FROM flights WHERE staff_id = ? ORDER BY departure_date, departure_time',
        [staffId]
      ) as any[];
      
      console.log('getMyEventInfo - Found flights:', flightsRaw.length);
      if (flightsRaw.length > 0) {
        console.log('getMyEventInfo - First flight:', JSON.stringify(serializeBigInt(flightsRaw[0]), null, 2));
      }
      
      // Use recursive serialization to handle all BigInt values and nested objects
      flights = serializeBigInt(flightsRaw);
    } catch (flightError) {
      console.error('Error fetching flights:', flightError);
    }

    // Get accommodations for this staff member
    let accommodations: any[] = [];
    try {
      console.log('getMyEventInfo - Fetching accommodations for staff_id:', staffId);
      const accommodationsRaw = await connection.query(
        `SELECT a.*, 
         aa.room_number, 
         aa.board_type, 
         aa.check_in_date, 
         aa.check_out_date, 
         aa.notes as assignment_notes
         FROM accommodations a
         INNER JOIN accommodation_assignments aa ON a.id = aa.accommodation_id
         WHERE aa.staff_id = ? AND a.event_id = ?
         ORDER BY aa.check_in_date, a.name`,
        [staffId, eventId]
      ) as any[];
      
      console.log('getMyEventInfo - Found accommodations:', accommodationsRaw.length);
      if (accommodationsRaw.length > 0) {
        console.log('getMyEventInfo - First accommodation:', JSON.stringify(serializeBigInt(accommodationsRaw[0]), null, 2));
      }
      
      // Use recursive serialization to handle all BigInt values and nested objects
      accommodations = serializeBigInt(accommodationsRaw);
    } catch (accError) {
      console.error('Error fetching accommodations:', accError);
    }


    const responseData = {
      success: true,
      staff: serializedStaff,
      flights,
      accommodations,
    };
    
    console.log('getMyEventInfo - Final response:', {
      hasStaff: !!responseData.staff,
      flightsCount: responseData.flights?.length || 0,
      accommodationsCount: responseData.accommodations?.length || 0,
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify(serializeBigInt(responseData)),
    };
  } catch (error: any) {
    console.error('Error getting my event info:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to get event info',
      }),
    };
  }
}

/**
 * Lambda handler to route requests
 */
export const lambdaHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Lambda handler invoked', {
    method: event.httpMethod,
    path: event.path,
    requestId: context.requestId,
  });
  
  // Handle CORS preflight (OPTIONS) requests - Safari requires this to be handled early
  if (event.httpMethod === 'OPTIONS') {
    const corsHeaders = getCorsHeaders();
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain',
      },
      body: '',
    };
  }

  // Health check endpoint (no DB required)
  if (event.path === '/health' || event.path === '/Prod/health') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        function: 'EventsFunction',
      }),
    };
  }

  // Normalize path - remove /Prod prefix if present
  let path = event.path || '';
  if (path.startsWith('/Prod')) {
    path = path.substring(5);
  }
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  console.log('Normalized path:', path);
  
  // Extract Cognito user ID
  const cognitoSub = getCognitoSub(event);

  let connection: mariadb.PoolConnection | null = null;

  try {
    // Always try to get database connection (needed for most endpoints including upload-url)
    try {
      const dbPool = getPool();
      console.log('Getting database connection from pool...');
      connection = await dbPool.getConnection();
      console.log('✅ Database connection acquired successfully');
      // Ensure videos table exists
      try {
        await ensureVideosTable(connection);
      } catch (tableError) {
        console.warn('Warning: Could not ensure videos table:', tableError);
        // Continue - table might already exist
      }
    } catch (dbError: any) {
      console.error('❌ Failed to acquire database connection:', dbError);
      console.error('Database error details:', {
        message: dbError?.message,
        code: dbError?.code,
        errno: dbError?.errno,
        sqlState: dbError?.sqlState,
        stack: dbError?.stack,
      });
      // Continue - some endpoints can work without DB
      connection = null;
    }

    // Route to presigned URL generation (needs DB connection to create video record)
    if (path.includes('/videos/upload-url') && event.httpMethod === 'POST') {
      // Always try to get connection for this endpoint (needed to create video record)
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
          console.log('✅ Database connection acquired for upload-url endpoint');
        } catch (dbError) {
          console.error('❌ Database connection failed for upload-url:', dbError);
          // Continue without connection - presigned URL can still be generated
          connection = null;
        }
      }
      const result = await generatePresignedUrl(event, connection, cognitoSub);
      return result;
    }

    // Route to initiate multipart upload
    if (path.includes('/videos/multipart/init') && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.warn('Database connection failed:', dbError);
          connection = null; // Ensure it's null if failed
        }
      }
      const result = await initiateMultipartUpload(event, connection, cognitoSub);
      return result;
    }

    // Route to complete multipart upload
    if (path.includes('/videos/multipart/complete') && event.httpMethod === 'POST') {
      const result = await completeMultipartUpload(event, connection);
      return result;
    }

    // Route to confirm video upload
    if (path.includes('/videos/confirm') && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
          console.log('✅ Database connection acquired for confirm endpoint');
        } catch (dbError) {
          console.error('❌ Database connection failed for confirm:', dbError);
          connection = null; // Ensure it's null if failed
        }
      }
      const result = await confirmVideoUpload(event, connection, cognitoSub);
      // Don't release connection here - it's managed in the finally block at the end of lambdaHandler
      return result;
    }

    // Route to generate thumbnail upload URL
    if (path.includes('/videos/thumbnail-upload-url') && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('❌ Database connection failed for thumbnail upload URL:', dbError);
          connection = null;
        }
      }
      return await generateThumbnailUploadUrl(event, connection, cognitoSub);
    }

    // Route to update video thumbnail URL
    if (path.includes('/videos/update-thumbnail') && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('❌ Database connection failed for update thumbnail:', dbError);
          connection = null;
        }
      }
      return await updateVideoThumbnail(event, connection, cognitoSub);
    }

    // Route to video upload handler (legacy multipart upload)
    if (path.includes('/videos') && event.httpMethod === 'POST') {
      if (!connection) {
        const dbPool = getPool();
        connection = await dbPool.getConnection();
        await ensureVideosTable(connection);
      }
      const result = await uploadVideos(event, connection);
      return result;
    }

    // PATCH /videos/:id - Update video category
    const videoUpdateMatch = path.match(/^\/videos\/(\d+)$/);
    if (videoUpdateMatch && event.httpMethod === 'PATCH') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await updateVideoCategory(event, connection, cognitoSub);
    }

    // DELETE /videos - Delete videos (only if user owns them)
    if (path === '/videos' && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await deleteVideos(event, connection, cognitoSub);
    }

    // GET /artists/:id - Get artist profile with public events
    const artistProfileMatch = path.match(/^\/artists\/(\d+)$/);
    if (artistProfileMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await getArtistProfile(event, connection);
    }

    // GET /events/:id/my-info - Get current user's staff/artist info for event
    // This endpoint allows staff/artists to view their own event information
    console.log('🔍 Checking my-info route - path:', path, 'method:', event.httpMethod, 'normalized path:', path);
    const myInfoMatch = path.match(/^\/events\/(\d+)\/my-info$/);
    console.log('🔍 my-info match result:', myInfoMatch, 'regex test:', /^\/events\/(\d+)\/my-info$/.test(path));
    if (myInfoMatch && event.httpMethod === 'GET') {
      console.log('✅ my-info route matched! Event ID:', myInfoMatch[1]);
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      console.log('Routing to getMyEventInfo endpoint');
      return await getMyEventInfo(event, connection, cognitoSub);
    }

    // GET /events/:id/staff - Get staff for a specific event
    const staffMatch = path.match(/^\/events\/(\d+)\/staff$/);
    if (staffMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await getEventStaff(event, connection);
    }

    // POST /events/:id/staff - Add staff/artist to event
    if (staffMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await addEventStaff(event, connection, cognitoSub);
    }

    // PUT /events/:id/staff/:staffId - Update staff/artist information
    const updateStaffMatch = path.match(/^\/events\/(\d+)\/staff\/(\d+)$/);
    if (updateStaffMatch && event.httpMethod === 'PUT') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await updateEventStaff(event, connection, cognitoSub);
    }

    // DELETE /events/:id/staff/:staffId - Delete staff/artist from event
    const deleteStaffMatch = path.match(/^\/events\/(\d+)\/staff\/(\d+)$/);
    if (deleteStaffMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      // Extract staffId from path
      const staffIdMatch = deleteStaffMatch[2];
      if (staffIdMatch) {
        // Add staffId to pathParameters for the handler
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.staffId = staffIdMatch;
      }
      return await deleteEventStaff(event, connection, cognitoSub);
    }

    // GET /events/:id/tickets - Get tickets for event
    const ticketsMatch = path.match(/^\/events\/(\d+)\/tickets$/);
    if (ticketsMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = ticketsMatch[1];
      return await getEventTickets(event, connection);
    }

    // POST /events/:id/tickets - Add ticket to event
    if (ticketsMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = ticketsMatch[1];
      return await addEventTicket(event, connection, cognitoSub);
    }

    // PUT /events/:id/tickets/:ticketId - Update ticket
    const updateTicketMatch = path.match(/^\/events\/(\d+)\/tickets\/(\d+)$/);
    if (updateTicketMatch && event.httpMethod === 'PUT') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = updateTicketMatch[1];
      event.pathParameters.ticketId = updateTicketMatch[2];
      return await updateEventTicket(event, connection, cognitoSub);
    }

    // DELETE /events/:id/tickets/:ticketId - Delete ticket
    const deleteTicketMatch = path.match(/^\/events\/(\d+)\/tickets\/(\d+)$/);
    if (deleteTicketMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = deleteTicketMatch[1];
      event.pathParameters.ticketId = deleteTicketMatch[2];
      return await deleteEventTicket(event, connection, cognitoSub);
    }

    // GET /events/:id/discount-codes - Get discount codes for event
    const discountCodesMatch = path.match(/^\/events\/(\d+)\/discount-codes$/);
    if (discountCodesMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = discountCodesMatch[1];
      return await getEventDiscountCodes(event, connection);
    }

    // POST /events/:id/discount-codes - Add discount code to event
    if (discountCodesMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = discountCodesMatch[1];
      return await addEventDiscountCode(event, connection, cognitoSub);
    }

    // PUT /events/:id/discount-codes/:codeId - Update discount code
    const updateDiscountCodeMatch = path.match(/^\/events\/(\d+)\/discount-codes\/(\d+)$/);
    if (updateDiscountCodeMatch && event.httpMethod === 'PUT') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = updateDiscountCodeMatch[1];
      event.pathParameters.codeId = updateDiscountCodeMatch[2];
      return await updateEventDiscountCode(event, connection, cognitoSub);
    }

    // GET /events/:id/ticket-orders - List ticket orders for event (owner only, paginated, searchable)
    const ticketOrdersMatch = path.match(/^\/events\/(\d+)\/ticket-orders$/);
    if (ticketOrdersMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
            body: JSON.stringify({ success: false, error: 'Database connection not available' }),
          };
        }
      }
      if (!event.pathParameters) event.pathParameters = {};
      event.pathParameters.id = ticketOrdersMatch[1];
      return await getEventTicketOrders(event, connection, cognitoSub);
    }

    // PATCH /events/:id/ticket-orders/:orderId/validate - Mark ticket order as validated (owner only)
    const validateOrderMatch = path.match(/^\/events\/(\d+)\/ticket-orders\/(\d+)\/validate$/);
    if (validateOrderMatch && (event.httpMethod === 'PATCH' || event.httpMethod === 'POST')) {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
            body: JSON.stringify({ success: false, error: 'Database connection not available' }),
          };
        }
      }
      if (!event.pathParameters) event.pathParameters = {};
      event.pathParameters.id = validateOrderMatch[1];
      event.pathParameters.orderId = validateOrderMatch[2];
      return await updateTicketOrderValidated(event, connection, cognitoSub);
    }

    // DELETE /events/:id/discount-codes/:codeId - Delete discount code
    const deleteDiscountCodeMatch = path.match(/^\/events\/(\d+)\/discount-codes\/(\d+)$/);
    if (deleteDiscountCodeMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = deleteDiscountCodeMatch[1];
      event.pathParameters.codeId = deleteDiscountCodeMatch[2];
      return await deleteEventDiscountCode(event, connection, cognitoSub);
    }

    // POST /events/:id/tickets/upload-image-url - Generate presigned URL for ticket image
    const ticketImageUploadMatch = path.match(/^\/events\/(\d+)\/tickets\/upload-image-url$/);
    if (ticketImageUploadMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          connection = null;
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = ticketImageUploadMatch[1];
      return await generateTicketImageUploadUrl(event, connection, cognitoSub);
    }

    // GET /events/:id/tickets/:ticketId/discounts - Get discounts for a ticket
    const ticketDiscountsMatch = path.match(/^\/events\/(\d+)\/tickets\/(\d+)\/discounts$/);
    if (ticketDiscountsMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = ticketDiscountsMatch[1];
      event.pathParameters.ticketId = ticketDiscountsMatch[2];
      return await getTicketDiscounts(event, connection);
    }

    // POST /events/:id/tickets/:ticketId/discounts - Add discount to ticket
    if (ticketDiscountsMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = ticketDiscountsMatch[1];
      event.pathParameters.ticketId = ticketDiscountsMatch[2];
      return await addTicketDiscount(event, connection, cognitoSub);
    }

    // PUT /events/:id/tickets/:ticketId/discounts/:discountId - Update ticket discount
    const updateTicketDiscountMatch = path.match(/^\/events\/(\d+)\/tickets\/(\d+)\/discounts\/(\d+)$/);
    if (updateTicketDiscountMatch && event.httpMethod === 'PUT') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = updateTicketDiscountMatch[1];
      event.pathParameters.ticketId = updateTicketDiscountMatch[2];
      event.pathParameters.discountId = updateTicketDiscountMatch[3];
      return await updateTicketDiscount(event, connection, cognitoSub);
    }

    // DELETE /events/:id/tickets/:ticketId/discounts/:discountId - Delete ticket discount
    const deleteTicketDiscountMatch = path.match(/^\/events\/(\d+)\/tickets\/(\d+)\/discounts\/(\d+)$/);
    if (deleteTicketDiscountMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      if (!event.pathParameters) {
        event.pathParameters = {};
      }
      event.pathParameters.id = deleteTicketDiscountMatch[1];
      event.pathParameters.ticketId = deleteTicketDiscountMatch[2];
      event.pathParameters.discountId = deleteTicketDiscountMatch[3];
      return await deleteTicketDiscount(event, connection, cognitoSub);
    }

    // GET /events/:id/flights - Get flights for event
    const flightsMatch = path.match(/^\/events\/(\d+)\/flights$/);
    if (flightsMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await getEventFlights(event, connection);
    }

    // POST /events/:id/flights - Add flight to event
    if (flightsMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await addEventFlight(event, connection, cognitoSub);
    }

    // DELETE /events/:id/flights/:flightId - Delete flight from event
    const deleteFlightMatch = path.match(/^\/events\/(\d+)\/flights\/(\d+)$/);
    if (deleteFlightMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      // Extract flightId from path
      const flightIdMatch = deleteFlightMatch[2];
      if (flightIdMatch) {
        // Add flightId to pathParameters for the handler
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.flightId = flightIdMatch;
      }
      return await deleteEventFlight(event, connection, cognitoSub);
    }

    // GET /events/:id/staff/:staffId/flights - Get flights for a staff member
    const staffFlightsMatch = path.match(/^\/events\/(\d+)\/staff\/(\d+)\/flights$/);
    if (staffFlightsMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const eventIdMatch = staffFlightsMatch[1];
      const staffIdMatch = staffFlightsMatch[2];
      if (eventIdMatch && staffIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.id = eventIdMatch;
        event.pathParameters.staffId = staffIdMatch;
      }
      return await getStaffFlights(event, connection);
    }

    // POST /events/:id/staff/:staffId/flights - Add flight to a staff member
    if (staffFlightsMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const eventIdMatch = staffFlightsMatch[1];
      const staffIdMatch = staffFlightsMatch[2];
      if (eventIdMatch && staffIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.id = eventIdMatch;
        event.pathParameters.staffId = staffIdMatch;
      }
      return await addStaffFlight(event, connection, cognitoSub);
    }

    // PUT /events/:id/staff/:staffId/flights/:flightId - Update flight for a staff member
    const updateStaffFlightMatch = path.match(/^\/events\/(\d+)\/staff\/(\d+)\/flights\/(\d+)$/);
    if (updateStaffFlightMatch && (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH')) {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const eventIdMatch = updateStaffFlightMatch[1];
      const staffIdMatch = updateStaffFlightMatch[2];
      const flightIdMatch = updateStaffFlightMatch[3];
      if (eventIdMatch && staffIdMatch && flightIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.id = eventIdMatch;
        event.pathParameters.staffId = staffIdMatch;
        event.pathParameters.flightId = flightIdMatch;
      }
      return await updateStaffFlight(event, connection, cognitoSub);
    }

    // DELETE /events/:id/staff/:staffId/flights/:flightId - Delete flight from a staff member
    const deleteStaffFlightMatch = path.match(/^\/events\/(\d+)\/staff\/(\d+)\/flights\/(\d+)$/);
    if (deleteStaffFlightMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const eventIdMatch = deleteStaffFlightMatch[1];
      const staffIdMatch = deleteStaffFlightMatch[2];
      const flightIdMatch = deleteStaffFlightMatch[3];
      if (eventIdMatch && staffIdMatch && flightIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.id = eventIdMatch;
        event.pathParameters.staffId = staffIdMatch;
        event.pathParameters.flightId = flightIdMatch;
      }
      return await deleteStaffFlight(event, connection, cognitoSub);
    }

    // GET /events/:id/accommodations - Get accommodations for event
    const accommodationsMatch = path.match(/^\/events\/(\d+)\/accommodations$/);
    if (accommodationsMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await getEventAccommodations(event, connection);
    }

    // POST /events/:id/accommodations - Add accommodation to event
    if (accommodationsMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await addEventAccommodation(event, connection, cognitoSub);
    }

    // PUT /events/:id/accommodations/:accommodationId - Update accommodation
    const updateAccommodationMatch = path.match(/^\/events\/(\d+)\/accommodations\/(\d+)$/);
    if (updateAccommodationMatch && event.httpMethod === 'PUT') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const accommodationIdMatch = updateAccommodationMatch[2];
      if (accommodationIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.accommodationId = accommodationIdMatch;
      }
      return await updateEventAccommodation(event, connection, cognitoSub);
    }

    // DELETE /events/:id/accommodations/:accommodationId - Delete accommodation
    const deleteAccommodationMatch = path.match(/^\/events\/(\d+)\/accommodations\/(\d+)$/);
    if (deleteAccommodationMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const accommodationIdMatch = deleteAccommodationMatch[2];
      if (accommodationIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.accommodationId = accommodationIdMatch;
      }
      return await deleteEventAccommodation(event, connection, cognitoSub);
    }

    // POST /events/:id/accommodations/:accommodationId/assign - Assign accommodation to staff
    const assignAccommodationMatch = path.match(/^\/events\/(\d+)\/accommodations\/(\d+)\/assign$/);
    if (assignAccommodationMatch && event.httpMethod === 'POST') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const accommodationIdMatch = assignAccommodationMatch[2];
      if (accommodationIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.accommodationId = accommodationIdMatch;
      }
      return await assignAccommodationToStaff(event, connection, cognitoSub);
    }

    // DELETE /events/:id/accommodations/:accommodationId/assign/:staffId - Unassign accommodation from staff
    const unassignAccommodationMatch = path.match(/^\/events\/(\d+)\/accommodations\/(\d+)\/assign\/(\d+)$/);
    if (unassignAccommodationMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const accommodationIdMatch = unassignAccommodationMatch[2];
      const staffIdMatch = unassignAccommodationMatch[3];
      if (accommodationIdMatch && staffIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.accommodationId = accommodationIdMatch;
        event.pathParameters.staffId = staffIdMatch;
      }
      return await unassignAccommodationFromStaff(event, connection, cognitoSub);
    }

    // GET /events/:id/staff/:staffId/accommodations - Get accommodations for a staff member
    const staffAccommodationsMatch = path.match(/^\/events\/(\d+)\/staff\/(\d+)\/accommodations$/);
    if (staffAccommodationsMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      const staffIdMatch = staffAccommodationsMatch[2];
      if (staffIdMatch) {
        if (!event.pathParameters) {
          event.pathParameters = {};
        }
        event.pathParameters.staffId = staffIdMatch;
      }
      return await getStaffAccommodations(event, connection);
    }

    // GET /events/:id/albums - Get albums for a specific event
    const albumsMatch = path.match(/^\/events\/(\d+)\/albums$/);
    if (albumsMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          console.log('Database connection established for GET /events/:id/albums');
        } catch (dbError: any) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
              details: dbError?.message || 'Unknown database error',
            }),
          };
        }
      }
      
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      
      try {
        return await getEventAlbums(event, connection);
      } catch (albumsError: any) {
        console.error('Error fetching albums:', albumsError);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Failed to fetch albums',
            details: albumsError?.message || 'Unknown error',
          }),
        };
      }
    }

    // POST /events/:id/albums - Create a new album for an event
    if (albumsMatch && event.httpMethod === 'POST') {
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      return await createEventAlbum(event, connection, cognitoSub);
    }

    // GET /events/:id/videos - Get videos for a specific event
    const videosMatch = path.match(/^\/events\/(\d+)\/videos$/);
    if (videosMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          console.log('Database connection established for GET /events/:id/videos');
        } catch (dbError: any) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
              details: dbError?.message || 'Unknown database error',
            }),
          };
        }
      }
      
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      
      const eventId = parseInt(videosMatch[1]);
      
      // Check if album_id column exists by trying to query it
      let videoRows;
      try {
        // First check if the column exists
        const columnCheck = await connection.query(`
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'videos'
            AND COLUMN_NAME = 'album_id'
        `);
        const hasAlbumId = Array.isArray(columnCheck) && columnCheck.length > 0 && (columnCheck[0] as any).count > 0;
        
        if (hasAlbumId) {
          videoRows = await connection.query(
            `SELECT v.*, a.name as album_name 
             FROM videos v 
             LEFT JOIN albums a ON v.album_id = a.id 
             WHERE v.event_id = ? 
             ORDER BY COALESCE(a.name, '') ASC, v.created_at DESC`,
            [eventId]
          );
        } else {
          // Fallback: column doesn't exist yet
          console.warn('album_id column not found, using fallback query');
          videoRows = await connection.query(
            'SELECT * FROM videos WHERE event_id = ? ORDER BY created_at DESC',
            [eventId]
          );
          // Add null album_name and album_id to each video
          if (Array.isArray(videoRows)) {
            videoRows = videoRows.map((row: any) => ({
              ...row,
              album_id: null,
              album_name: null,
            }));
          }
        }
      } catch (error: any) {
        console.error('Error fetching videos:', error);
        // Fallback to simple query if anything fails
        videoRows = await connection.query(
          'SELECT * FROM videos WHERE event_id = ? ORDER BY created_at DESC',
          [eventId]
        );
        // Add null album_name and album_id to each video
        if (Array.isArray(videoRows)) {
          videoRows = videoRows.map((row: any) => ({
            ...row,
            album_id: row.album_id || null,
            album_name: null,
          }));
        }
      }

      const s3 = getS3Client();
      const bucketName = process.env.S3_BUCKET_NAME;

      const serializedVideos = Array.isArray(videoRows) 
        ? (await Promise.all(videoRows.map(async (row: any) => {
            const serialized: any = {};
            for (const [key, value] of Object.entries(row)) {
              if (typeof value === 'bigint') {
                serialized[key] = value.toString();
              } else {
                serialized[key] = value;
              }
            }
            
            // Generate presigned URL for video viewing (valid for 1 hour)
            if (serialized.video_url && bucketName) {
              try {
                // Extract S3 key from video_url
                // video_url can be:
                // 1. Full URL: https://bucket.s3.region.amazonaws.com/videos/key
                // 2. Presigned URL: https://bucket.s3.region.amazonaws.com/videos/key?X-Amz-...
                // 3. S3 URI: s3://bucket/videos/key
                // 4. Just the key: videos/timestamp-filename.mp4
                let s3Key = serialized.video_url;
                
                // Remove query parameters first (for presigned URLs)
                if (s3Key.includes('?')) {
                  s3Key = s3Key.split('?')[0];
                }
                
                // Try to extract key from full URL
                if (s3Key.startsWith('s3://')) {
                  // s3://bucket/key format
                  const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
                  if (match) {
                    s3Key = match[1];
                  }
                } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
                  // https://bucket.s3.region.amazonaws.com/key format
                  const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                               s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
                  if (match) {
                    s3Key = decodeURIComponent(match[1]); // Decode URL-encoded characters
                  }
                }
                // If it starts with 'videos/', it's already a key
                
                // Validate that we have a proper S3 key
                if (!s3Key || s3Key.trim() === '') {
                  console.warn('Empty or invalid S3 key extracted from video_url:', serialized.video_url, 'Video ID:', serialized.id);
                  return serialized; // Return video without presigned URL rather than filtering it out
                }
                
                // Generate presigned URL for viewing
                const getObjectCommand = new GetObjectCommand({
                  Bucket: bucketName,
                  Key: s3Key,
                });
                
                const presignedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });
                serialized.video_url = presignedUrl;
                
                // Return the video with presigned URL
                return serialized;
              } catch (urlError) {
                console.error('Error generating presigned URL for video:', urlError, 'Original URL:', serialized.video_url, 'Video ID:', serialized.id);
                // Return video with original URL instead of filtering it out
                // This way videos are still shown even if presigned URL generation fails
                return serialized;
              }
            } else {
              // No video_url or bucketName, but still return the video
              console.warn('Video missing video_url or bucketName, returning without presigned URL:', serialized.id);
              return serialized;
            }
          }))).filter((video: any) => video !== null)
        : [];

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          count: serializedVideos.length,
          videos: serializedVideos,
        }),
      };
    }

    // GET /events/:id - Get a single event by ID
    const eventMatch = path.match(/^\/events\/(\d+)$/);
    if (eventMatch && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          console.log('Database connection established for GET /events/:id');
        } catch (dbError: any) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
              details: dbError?.message || 'Unknown database error',
            }),
          };
        }
      }
      
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      
      const eventId = parseInt(eventMatch[1]);
      let rows;
      try {
        rows = await connection.query(
          'SELECT * FROM events WHERE id = ?',
          [eventId]
        );
        console.log(`Retrieved event ${eventId} from database`);
      } catch (queryError: any) {
        console.error('Error querying event:', queryError);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Failed to fetch event',
            details: queryError?.message || 'Unknown query error',
          }),
        };
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Event not found',
          }),
        };
      }

      const row = rows[0];
      const serialized: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          serialized[key] = value.toString();
        } else {
          serialized[key] = value;
        }
      }

      // Add owner name from users table (who created the event)
      if (serialized.cognito_sub) {
        try {
          const ownerRows = await connection.query(
            'SELECT name FROM users WHERE cognito_sub = ?',
            [serialized.cognito_sub]
          ) as any[];
          if (ownerRows.length > 0 && ownerRows[0].name) {
            serialized.owner_name = ownerRows[0].name;
          }
        } catch (_) {
          // users table may not exist or column may differ; leave owner_name unset
        }
      }

      // Generate presigned URL for event image if it exists
      if (serialized.image_url) {
        const s3 = getS3Client();
        const bucketName = process.env.S3_BUCKET_NAME;
        
        if (bucketName) {
          try {
            // Extract S3 key from image_url
            let s3Key = serialized.image_url;
            if (s3Key.startsWith('s3://')) {
              const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
              if (match) {
                s3Key = match[1];
              }
            } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
              const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                           s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
              if (match) {
                s3Key = match[1];
              }
            }
            
            // Generate presigned URL for viewing (valid for 1 hour)
            const getObjectCommand = new GetObjectCommand({
              Bucket: bucketName,
              Key: s3Key,
            });
            
            const presignedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });
            serialized.image_url = presignedUrl;
          } catch (urlError) {
            console.error('Error generating presigned URL for event image:', urlError, 'Original URL:', serialized.image_url);
            // Keep original URL if presigned URL generation fails
          }
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(),
        },
        body: JSON.stringify({
          success: true,
          event: serialized,
        }),
      };
    }

    // POST /events - Create new event
    if (path === '/events' && event.httpMethod === 'POST') {
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }

      try {
        let body: any = {};
        if (event.body) {
          try {
            const bodyString = event.isBase64Encoded 
              ? Buffer.from(event.body, 'base64').toString('utf-8')
              : event.body;
            body = JSON.parse(bodyString);
          } catch (e) {
            console.error('Error parsing body:', e);
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(),
              },
              body: JSON.stringify({
                success: false,
                error: 'Invalid JSON in request body',
              }),
            };
          }
        }

        const { name, description, start_date, end_date, image_url: rawImageUrl } = body;

        if (!name || !start_date) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Name and start_date are required',
            }),
          };
        }

        // Clean image_url (remove presigned URL query params if present)
        let image_url = rawImageUrl;
        if (rawImageUrl && (rawImageUrl.includes('X-Amz-') || rawImageUrl.includes('?'))) {
          image_url = rawImageUrl.split('?')[0];
        }

        // Validate image_url length (VARCHAR(500))
        if (image_url && image_url.length > 500) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Image URL is too long (max 500 characters)',
            }),
          };
        }

        console.log('Creating event with data:', { name, start_date, end_date, image_url: image_url ? `${image_url.substring(0, 50)}...` : null });

        // Verify user is authenticated
        if (!cognitoSub) {
          return {
            statusCode: 401,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Authentication required to create events',
            }),
          };
        }

        const result = await connection.query(
          `INSERT INTO events (name, description, start_date, end_date, image_url, cognito_sub, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [name, description || null, start_date, end_date || null, image_url || null, cognitoSub]
        );

        const eventId = (result as any).insertId?.toString();

        // Fetch the created event
        const [createdEvent] = await connection.query(
          'SELECT * FROM events WHERE id = ?',
          [eventId]
        );

        const serialized: any = {};
        if (createdEvent) {
          for (const [key, value] of Object.entries(createdEvent as any)) {
            if (typeof value === 'bigint') {
              serialized[key] = value.toString();
            } else {
              serialized[key] = value;
            }
          }
        }

        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: true,
            event: serialized,
          }),
        };
      } catch (error: any) {
        console.error('Error creating event:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: error.message || 'Failed to create event',
          }),
        };
      }
    }

    // PATCH /events/{id} - Update event
    const eventUpdateMatch = path.match(/^\/events\/(\d+)$/);
    if (eventUpdateMatch && event.httpMethod === 'PATCH') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await updateEvent(event, connection, cognitoSub);
    }

    // DELETE /events/{id} - Delete event
    const eventDeleteMatch = path.match(/^\/events\/(\d+)$/);
    if (eventDeleteMatch && event.httpMethod === 'DELETE') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
        } catch (dbError) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await deleteEvent(event, connection, cognitoSub);
    }

    // POST /events/image-upload-url - Generate presigned URL for event image
    if (path === '/events/image-upload-url' && event.httpMethod === 'POST') {
      try {
        let body: any = {};
        if (event.body) {
          try {
            const bodyString = event.isBase64Encoded 
              ? Buffer.from(event.body, 'base64').toString('utf-8')
              : event.body;
            body = JSON.parse(bodyString);
          } catch (e) {
            console.error('Error parsing body:', e, 'Body:', event.body?.substring(0, 100));
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(),
              },
              body: JSON.stringify({
                success: false,
                error: 'Invalid JSON in request body',
              }),
            };
          }
        }
        
        const { filename, file_size, mime_type } = body;

        if (!filename || !file_size) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Filename and file_size are required',
            }),
          };
        }

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
              error: 'S3 bucket not configured',
            }),
          };
        }

        // Sanitize filename
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const timestamp = Date.now();
        const s3Key = `events/images/${timestamp}-${sanitizedFilename}`;

        // Generate presigned URL (1 hour expiration)
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          ContentType: mime_type || 'image/jpeg',
        });

        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: true,
            upload_url: presignedUrl,
            s3_key: s3Key,
            s3_url: s3Url,
            expires_in: 3600,
          }),
        };
      } catch (error: any) {
        console.error('Error generating image upload URL:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: error.message || 'Failed to generate upload URL',
          }),
        };
      }
    }

    // POST /events/staff/image-upload-url - Generate presigned URL for staff image
    if (path === '/events/staff/image-upload-url' && event.httpMethod === 'POST') {
      try {
        let body: any = {};
        if (event.body) {
          try {
            const bodyString = event.isBase64Encoded 
              ? Buffer.from(event.body, 'base64').toString('utf-8')
              : event.body;
            body = JSON.parse(bodyString);
          } catch (e) {
            console.error('Error parsing body:', e, 'Body:', event.body?.substring(0, 100));
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                ...getCorsHeaders(),
              },
              body: JSON.stringify({
                success: false,
                error: 'Invalid JSON in request body',
              }),
            };
          }
        }
        
        const { filename, file_size, mime_type } = body;

        if (!filename || !file_size) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Filename and file_size are required',
            }),
          };
        }

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
              error: 'S3 bucket not configured',
            }),
          };
        }

        // Sanitize filename
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const timestamp = Date.now();
        const s3Key = `staff/images/${timestamp}-${sanitizedFilename}`;

        // Generate presigned URL (1 hour expiration)
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          ContentType: mime_type || 'image/jpeg',
        });

        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: true,
            upload_url: presignedUrl,
            s3_key: s3Key,
            s3_url: s3Url,
            expires_in: 3600,
          }),
        };
      } catch (error: any) {
        console.error('Error generating staff image upload URL:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: error.message || 'Failed to generate upload URL',
          }),
        };
      }
    }

    // GET /user/profile - Get user profile
    if (path === '/user/profile' && event.httpMethod === 'GET') {
      console.log('🔍 GET /user/profile - cognitoSub:', cognitoSub, 'connection:', !!connection);
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          await ensureVideosTable(connection);
          console.log('✅ Database connection acquired for /user/profile');
        } catch (dbError) {
          console.error('❌ Failed to acquire database connection:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
            }),
          };
        }
      }
      return await getUserProfile(event, connection, cognitoSub);
    }

    // PATCH /user/profile - Update user profile
    if (path === '/user/profile' && event.httpMethod === 'PATCH') {
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      return await updateUserProfile(event, connection, cognitoSub);
    }

    // POST /user/profile-photo-upload-url - Generate presigned URL for profile photo
    if (path === '/user/profile-photo-upload-url' && event.httpMethod === 'POST') {
      return await generateProfilePhotoUploadUrl(event, cognitoSub);
    }

    // PATCH /user/nickname - Update user nickname
    if (path === '/user/nickname' && event.httpMethod === 'PATCH') {
      if (!connection) {
        const dbPool = getPool();
        connection = await dbPool.getConnection();
      }
      return await updateUserNickname(event, connection, cognitoSub);
    }

    // Handle /users/* routes (public endpoints via proxy)
    if (path.startsWith('/users/') && event.httpMethod === 'GET') {
      if (!connection) {
        const dbPool = getPool();
        connection = await dbPool.getConnection();
      }
      
      // GET /users/check-nickname/:nickname - Check nickname availability
      const checkNicknameMatch = path.match(/^\/users\/check-nickname\/([^\/]+)$/);
      if (checkNicknameMatch) {
        const nickname = decodeURIComponent(checkNicknameMatch[1]);
        return await checkNicknameAvailability(connection, nickname);
      }

      // GET /users/:nickname/videos - Get public user videos
      const publicVideosMatch = path.match(/^\/users\/([^\/]+)\/videos$/);
      if (publicVideosMatch) {
        const nickname = decodeURIComponent(publicVideosMatch[1]);
        return await getPublicUserVideos(connection, nickname);
      }

      // GET /users/:nickname - Get public profile (must be last, catches remaining)
      const publicProfileMatch = path.match(/^\/users\/([^\/]+)$/);
      if (publicProfileMatch) {
        const nickname = decodeURIComponent(publicProfileMatch[1]);
        return await getPublicProfile(event, connection, nickname);
      }
    }

    // GET /user/events - Get user's events
    if (path === '/user/events' && event.httpMethod === 'GET') {
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      return await getUserEvents(event, connection, cognitoSub);
    }

    // GET /user/videos - Get user's videos
    if (path === '/user/videos' && event.httpMethod === 'GET') {
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      return await getUserVideos(event, connection, cognitoSub);
    }

    // GET /user/tickets - Get user's ticket orders
    if (path === '/user/tickets' && event.httpMethod === 'GET') {
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      return await getUserTickets(event, connection, cognitoSub);
    }

    // GET /admin/ticket-orders - Get all ticket orders (admin only - for debugging)
    if (path === '/admin/ticket-orders' && event.httpMethod === 'GET') {
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      return await getAllTicketOrders(event, connection);
    }

    // Default: GET /events handler - Get all events
    if (path === '/events' && event.httpMethod === 'GET') {
      if (!connection) {
        try {
          const dbPool = getPool();
          connection = await dbPool.getConnection();
          console.log('Database connection established for GET /events');
        } catch (dbError: any) {
          console.error('Database connection failed:', dbError);
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(),
            },
            body: JSON.stringify({
              success: false,
              error: 'Database connection not available',
              details: dbError?.message || 'Unknown database error',
            }),
          };
        }
      }
      
      if (!connection) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Database connection not available',
          }),
        };
      }
      
      // Query all events from the events table
      let rows;
      try {
        rows = await connection.query('SELECT * FROM events ORDER BY start_date DESC');
        console.log(`Retrieved ${Array.isArray(rows) ? rows.length : 0} events from database`);
      } catch (queryError: any) {
        console.error('Error querying events:', queryError);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Failed to fetch events',
            details: queryError?.message || 'Unknown query error',
          }),
        };
      }

      const s3 = getS3Client();
      const bucketName = process.env.S3_BUCKET_NAME;

    // Convert BigInt values to strings for JSON serialization and generate presigned URLs for images
    const serializedRows = Array.isArray(rows) 
      ? await Promise.all(rows.map(async (row: any) => {
          const serialized: any = {};
          for (const [key, value] of Object.entries(row)) {
            if (typeof value === 'bigint') {
              serialized[key] = value.toString();
            } else {
              serialized[key] = value;
            }
          }
          
          // Generate presigned URL for event image if it exists
          if (serialized.image_url && bucketName) {
            try {
              // Extract S3 key from image_url
              let s3Key = serialized.image_url;
              if (s3Key.startsWith('s3://')) {
                const match = s3Key.match(/s3:\/\/[^\/]+\/(.+)$/);
                if (match) {
                  s3Key = match[1];
                }
              } else if (s3Key.includes('.s3.') || s3Key.includes('amazonaws.com')) {
                const match = s3Key.match(/https?:\/\/[^\/]+\.s3[^\/]*\/(.+)$/) ||
                             s3Key.match(/https?:\/\/[^\/]+\/(.+)$/);
                if (match) {
                  s3Key = match[1];
                }
              }
              
              // Generate presigned URL for viewing (valid for 1 hour)
              const getObjectCommand = new GetObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
              });
              
              const presignedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });
              serialized.image_url = presignedUrl;
            } catch (urlError) {
              console.error('Error generating presigned URL for event image:', urlError, 'Original URL:', serialized.image_url);
              // Keep original URL if presigned URL generation fails
            }
          }
          
          return serialized;
        }))
      : [];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
          ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: true,
        count: serializedRows.length,
        events: serializedRows,
        }),
      };
    }

    // Route to login
    if (path === '/auth/login' && event.httpMethod === 'POST') {
      return await login(event);
    }

    // Route to forgot password
    if (path === '/auth/forgot-password' && event.httpMethod === 'POST') {
      return await forgotPassword(event);
    }

    // Route to confirm forgot password
    if (path === '/auth/confirm-forgot-password' && event.httpMethod === 'POST') {
      return await confirmForgotPassword(event);
    }

    // Route to resend verification code
    if (path === '/auth/resend-verification-code' && event.httpMethod === 'POST') {
      return await resendVerificationCode(event);
    }

    // Admin route to mark email as verified
    if (path === '/admin/mark-email-verified' && event.httpMethod === 'POST') {
      return await markEmailAsVerified(event, connection, cognitoSub);
    }

    // Admin route to reset user password
    if (path === '/admin/reset-password' && event.httpMethod === 'POST') {
      return await adminResetPassword(event, connection, cognitoSub);
    }

    // 404 for unknown routes
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: 'Not found',
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
