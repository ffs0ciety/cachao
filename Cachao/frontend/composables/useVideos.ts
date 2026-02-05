interface Video {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  album_name: string | null;
  duration_seconds: number | null;
  cognito_sub: string | null;
  album_id: string | null;
  category: 'shows' | 'social' | 'workshops' | 'demos' | null;
  created_at: string;
  updated_at: string;
}

interface VideosResponse {
  success: boolean;
  videos?: Video[];
  error?: string;
}

interface UploadResult {
  success: boolean;
  video_id?: string;
  s3_key?: string;
  error?: string;
}

interface DeleteVideosResult {
  success: boolean;
  deleted_count?: number;
  deleted_ids?: string[];
  error?: string;
}

interface UpdateCategoryResult {
  success: boolean;
  video?: Video;
  error?: string;
}

export const useVideos = () => {
  const config = useRuntimeConfig();
  
  const getApiUrl = (endpoint: string) => {
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    return `${baseUrl}${basePath}${endpoint}`;
  };

  /**
   * Fetch videos for a specific event
   */
  const fetchEventVideos = async (eventId: string): Promise<VideosResponse> => {
    try {
      const url = getApiUrl(`/events/${eventId}/videos`);
      console.log('Fetching videos from:', url);
      
      const response = await $fetch<VideosResponse>(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        server: false,
        timeout: 15000,
        retry: 1,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching videos:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to fetch videos';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Upload a video file to S3 and confirm in database
   */
  const uploadVideo = async (
    file: File,
    eventId?: number,
    albumId?: number,
    onProgress?: (progress: number) => void,
    abortSignal?: AbortSignal
  ): Promise<UploadResult> => {
    try {
      const { getAuthToken } = useAuth();
      
      // Step 1: Get presigned URL for upload
      onProgress?.(5);
      const token = await getAuthToken();
      if (!token) {
        return {
          success: false,
          error: 'Failed to get authentication token',
        };
      }

      const presignedUrlResponse = await $fetch<{
        success: boolean;
        upload_url?: string;
        s3_key?: string;
        video_id?: string;
        error?: string;
      }>(getApiUrl('/videos/upload-url'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: {
          filename: file.name,
          file_size: file.size,
          mime_type: file.type,
          event_id: eventId,
          album_id: albumId,
        },
        server: false,
      });

      if (!presignedUrlResponse.success || !presignedUrlResponse.upload_url) {
        return {
          success: false,
          error: presignedUrlResponse.error || 'Failed to get upload URL',
        };
      }

      // Step 2: Upload file to S3 using presigned URL
      onProgress?.(10);
      const uploadUrl = presignedUrlResponse.upload_url;
      const s3Key = presignedUrlResponse.s3_key;
      const videoId = presignedUrlResponse.video_id;

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Handle abort signal
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            xhr.abort();
            reject(new Error('Upload cancelled'));
          });
        }

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            // Upload progress: 10% to 90% (80% of total)
            const uploadProgress = 10 + (e.loaded / e.total) * 80;
            onProgress?.(uploadProgress);
          }
        });

        xhr.addEventListener('load', async () => {
          if (xhr.status === 200) {
            onProgress?.(90);
            
            // Step 3: Confirm upload in database
            try {
              // Get fresh token for confirmation
              const confirmToken = await getAuthToken();
              if (!confirmToken) {
                resolve({
                  success: false,
                  error: 'Failed to get authentication token for confirmation',
                });
                return;
              }

              const confirmResponse = await $fetch<{
                success: boolean;
                video_id?: string;
                error?: string;
              }>(getApiUrl('/videos/confirm'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${confirmToken}`,
                },
                body: {
                  video_id: videoId,
                  s3_key: s3Key,
                },
                server: false,
              });

              onProgress?.(100);

              if (confirmResponse.success) {
                resolve({
                  success: true,
                  video_id: confirmResponse.video_id || videoId,
                  s3_key: s3Key,
                });
              } else {
                // Retry once with token refresh on 403
                if (confirmResponse.error?.includes('403') || confirmResponse.error?.includes('Authentication')) {
                  try {
                    // Force token refresh
                    const refreshedToken = await getAuthToken();
                    if (refreshedToken) {
                      const retryResponse = await $fetch<{
                        success: boolean;
                        video_id?: string;
                        error?: string;
                      }>(getApiUrl('/videos/confirm'), {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${refreshedToken}`,
                        },
                        body: {
                          video_id: videoId,
                          s3_key: s3Key,
                        },
                        server: false,
                      });

                      if (retryResponse.success) {
                        resolve({
                          success: true,
                          video_id: retryResponse.video_id || videoId,
                          s3_key: s3Key,
                        });
                        return;
                      }
                    }
                  } catch (retryErr: any) {
                    console.error('Retry confirmation failed:', retryErr);
                  }
                }

                resolve({
                  success: false,
                  error: confirmResponse.error || 'Failed to confirm upload',
                });
              }
            } catch (confirmErr: any) {
              console.error('Error confirming upload:', confirmErr);
              resolve({
                success: false,
                error: confirmErr.data?.message || confirmErr.message || 'Failed to confirm upload',
              });
            }
          } else {
            resolve({
              success: false,
              error: `Upload failed with status ${xhr.status}`,
            });
          }
        });

        xhr.addEventListener('error', () => {
          resolve({
            success: false,
            error: 'Network error during upload',
          });
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    } catch (error: any) {
      console.error('Error uploading video:', error);
      return {
        success: false,
        error: error.data?.message || error.message || 'Failed to upload video',
      };
    }
  };

  /**
   * Delete one or more videos
   */
  const deleteVideos = async (videoIds: string[]): Promise<DeleteVideosResult> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl('/videos');
      const response = await $fetch<DeleteVideosResult>(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: {
          video_ids: videoIds,
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error deleting videos:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to delete videos';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Update video category
   */
  const updateVideoCategory = async (
    videoId: number,
    category: 'shows' | 'social' | 'workshops' | 'demos' | null
  ): Promise<UpdateCategoryResult> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/videos/${videoId}`);
      const response = await $fetch<UpdateCategoryResult>(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: {
          category,
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating video category:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to update video category';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  return {
    fetchEventVideos,
    uploadVideo,
    deleteVideos,
    updateVideoCategory,
  };
};
