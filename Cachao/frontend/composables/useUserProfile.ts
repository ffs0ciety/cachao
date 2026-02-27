export interface UserProfile {
  cognito_sub: string;
  name: string | null;
  nickname: string | null;
  photo_url: string | null;
  cover_photo_url: string | null;
  bio: string | null;
  location: string | null;
  dance_styles: string[] | null;
  followers_count: number;
  following_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserGroup {
  id: string;
  name: string;
  image_url: string | null;
  role: string;
}

export interface UserSchool {
  id: string;
  name: string;
  image_url: string | null;
  location: string | null;
}

export interface PublicUserProfile {
  nickname: string;
  name: string | null;
  photo_url: string | null;
  cover_photo_url: string | null;
  bio: string | null;
  location: string | null;
  dance_styles: string[] | null;
  followers_count: number;
  following_count: number;
  groups: UserGroup[];
  schools: UserSchool[];
}

export interface UserEvent {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  cognito_sub: string | null;
  user_role?: string; // 'owner', 'staff', 'artist', 'media', 'videographer', etc.
  created_at: string;
  updated_at: string;
}

export interface UserVideo {
  id: string;
  event_id: string | null;
  album_id: string | null;
  title: string;
  video_url: string;
  cognito_sub: string;
  category: string | null;
  event_name: string | null;
  album_name: string | null;
  created_at: string;
  updated_at: string;
}

function getApiUrl(endpoint: string = ''): string {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiUrl || 'https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com';
  const basePath = config.public.apiBasePath || '';
  return `${baseUrl}${basePath}${endpoint}`;
}

export const useUserProfile = () => {
  const { getAuthToken } = useAuth();

  const fetchProfile = async (): Promise<UserProfile | null> => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const url = getApiUrl('/user/profile');
      const response = await $fetch<{ success: boolean; profile: UserProfile }>(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.success && response.profile) {
        return response.profile;
      }
      // If profile doesn't exist, backend should create it automatically
      // But if it still doesn't return, throw an error
      throw new Error('Failed to fetch or create profile');
    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      // Re-throw with more context
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please sign in.');
      }
      throw error;
    }
  };

  const updateProfile = async (updates: { name?: string; photo_url?: string }): Promise<UserProfile> => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const url = getApiUrl('/user/profile');
      const response = await $fetch<{ success: boolean; profile: UserProfile }>(
        url,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        }
      );

      if (response.success) {
        return response.profile;
      }
      throw new Error('Failed to update profile');
    } catch (error: any) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  };

  const generatePhotoUploadUrl = async (filename: string, fileSize: number, mimeType: string) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const url = getApiUrl('/user/profile-photo-upload-url');
      const response = await $fetch<{
        success: boolean;
        upload_url: string;
        s3_key: string;
        s3_url: string;
        expires_in: number;
      }>(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          file_size: fileSize,
          mime_type: mimeType,
        }),
      });

      if (response.success) {
        return response;
      }
      throw new Error('Failed to generate upload URL');
    } catch (error: any) {
      console.error('Error generating photo upload URL:', error);
      throw error;
    }
  };

  const uploadPhotoToS3 = async (uploadUrl: string, file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          // Progress can be handled by caller
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  };

  const fetchUserEvents = async (): Promise<UserEvent[]> => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const url = getApiUrl('/user/events');
      const response = await $fetch<{ success: boolean; count: number; events: UserEvent[] }>(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.success) {
        return response.events;
      }
      return [];
    } catch (error: any) {
      console.error('Error fetching user events:', error);
      throw error;
    }
  };

  const fetchUserVideos = async (): Promise<UserVideo[]> => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const url = getApiUrl('/user/videos');
      const response = await $fetch<{ success: boolean; count: number; videos: UserVideo[] }>(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.success) {
        return response.videos;
      }
      return [];
    } catch (error: any) {
      console.error('Error fetching user videos:', error);
      throw error;
    }
  };

  const fetchPublicProfile = async (nickname: string): Promise<PublicUserProfile | null> => {
    try {
      const url = getApiUrl(`/users/${nickname}`);
      const response = await $fetch<{ success: boolean; profile: PublicUserProfile }>(
        url,
        { method: 'GET' }
      );

      if (response.success && response.profile) {
        return response.profile;
      }
      return null;
    } catch (error: any) {
      console.error('Error fetching public profile:', error);
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  };

  const checkNicknameAvailability = async (nickname: string): Promise<boolean> => {
    try {
      const url = getApiUrl(`/users/check-nickname/${encodeURIComponent(nickname)}`);
      const response = await $fetch<{ success: boolean; available: boolean }>(
        url,
        { method: 'GET' }
      );
      return response.available;
    } catch (error: any) {
      console.error('Error checking nickname:', error);
      return false;
    }
  };

  const updateNickname = async (nickname: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const url = getApiUrl('/user/nickname');
      const response = await $fetch<{ success: boolean; nickname: string; error?: string }>(
        url,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nickname }),
        }
      );

      return { success: response.success, error: response.error };
    } catch (error: any) {
      console.error('Error updating nickname:', error);
      return { success: false, error: error.message || 'Failed to update nickname' };
    }
  };

  const fetchPublicUserVideos = async (nickname: string): Promise<UserVideo[]> => {
    try {
      const url = getApiUrl(`/users/${nickname}/videos`);
      const response = await $fetch<{ success: boolean; videos: UserVideo[] }>(
        url,
        { method: 'GET' }
      );

      if (response.success) {
        return response.videos;
      }
      return [];
    } catch (error: any) {
      console.error('Error fetching public user videos:', error);
      return [];
    }
  };

  return {
    fetchProfile,
    updateProfile,
    generatePhotoUploadUrl,
    uploadPhotoToS3,
    fetchUserEvents,
    fetchUserVideos,
    fetchPublicProfile,
    checkNicknameAvailability,
    updateNickname,
    fetchPublicUserVideos,
  };
};

