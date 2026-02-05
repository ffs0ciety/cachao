interface StaffMember {
  id: string;
  event_id: string;
  name: string;
  role: 'staff' | 'artist';
  email: string | null;
  phone: string | null;
  notes: string | null;
  image_url: string | null;
  is_public?: boolean | null;
  subcategories?: string[] | null;
  created_at: string;
  updated_at: string;
}

interface StaffResponse {
  success: boolean;
  count?: number;
  staff?: StaffMember[];
  error?: string;
}

interface AddStaffData {
  name: string;
  role: 'staff' | 'artist';
  email?: string;
  phone?: string;
  notes?: string;
  image_url?: string;
  is_public?: boolean;
  subcategories?: string[];
}

export const useStaff = () => {
  const config = useRuntimeConfig();
  
  const getApiUrl = (endpoint: string) => {
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    return `${baseUrl}${basePath}${endpoint}`;
  };

  /**
   * Fetch staff for a specific event
   */
  const fetchEventStaff = async (eventId: string, publicOnly: boolean = false): Promise<StaffResponse> => {
    try {
      let url = getApiUrl(`/events/${eventId}/staff`);
      if (publicOnly) {
        url += '?public=true';
      }
      console.log('Fetching staff from:', url);
      
      const response = await $fetch<StaffResponse>(url, {
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
      console.error('Error fetching staff:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to fetch staff';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Add staff/artist to an event
   */
  const addEventStaff = async (
    eventId: string,
    staffData: AddStaffData
  ): Promise<{ success: boolean; staff?: StaffMember; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/events/${eventId}/staff`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<{ success: boolean; staff?: StaffMember; error?: string }>(url, {
        method: 'POST',
        headers,
        body: staffData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error adding staff:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to add staff';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Update staff/artist information
   */
  const updateEventStaff = async (
    eventId: string,
    staffId: string,
    staffData: AddStaffData
  ): Promise<{ success: boolean; staff?: StaffMember; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/events/${eventId}/staff/${staffId}`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<{ success: boolean; staff?: StaffMember; error?: string }>(url, {
        method: 'PUT',
        headers,
        body: staffData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating staff:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to update staff';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Delete staff/artist from an event
   */
  const deleteEventStaff = async (
    eventId: string,
    staffId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/events/${eventId}/staff/${staffId}`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<{ success: boolean; error?: string }>(url, {
        method: 'DELETE',
        headers,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error deleting staff:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to delete staff';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Generate presigned URL for staff image upload
   */
  const generateStaffImageUploadUrl = async (
    filename: string,
    fileSize: number,
    mimeType: string = 'image/jpeg'
  ): Promise<{ success: boolean; upload_url?: string; s3_key?: string; s3_url?: string; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl('/events/staff/image-upload-url');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<{ success: boolean; upload_url?: string; s3_key?: string; s3_url?: string; error?: string }>(url, {
        method: 'POST',
        headers,
        body: {
          filename,
          file_size: fileSize,
          mime_type: mimeType,
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error generating staff image upload URL:', error);
      return {
        success: false,
        error: error.data?.message || error.message || 'Failed to generate upload URL',
      };
    }
  };

  return {
    fetchEventStaff,
    addEventStaff,
    updateEventStaff,
    deleteEventStaff,
    generateStaffImageUploadUrl,
  };
};


