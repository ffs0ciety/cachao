interface Event {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  cognito_sub: string | null;
  created_at: string;
  updated_at: string;
}

interface EventsResponse {
  success: boolean;
  count: number;
  events: Event[];
  error?: string;
}

export const useEvents = () => {
  const config = useRuntimeConfig();
  
  const getApiUrl = (endpoint: string) => {
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    return `${baseUrl}${basePath}${endpoint}`;
  };

  const fetchEvents = async (): Promise<EventsResponse> => {
    try {
      const url = getApiUrl('/events');
      console.log('Fetching events from:', url);
      
      // Use $fetch but with explicit timeout and error handling
      const response = await $fetch<EventsResponse>(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        server: false,
        timeout: 8000, // 8 second timeout
        retry: 0,
      });

      console.log('Events response received:', response);
      return response;
    } catch (error: any) {
      console.error('Error fetching events:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        data: error.data,
      });
      
      // Return a proper error response
      const errorMessage = error.data?.message || error.message || error.statusText || 'Failed to fetch events';
      return {
        success: false,
        count: 0,
        events: [],
        error: errorMessage,
      };
    }
  };

  const fetchEvent = async (eventId: string): Promise<{ success: boolean; event?: Event; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}`);
      console.log('Fetching event from:', url);
      
      const response = await $fetch<{ success: boolean; event?: Event; error?: string }>(url, {
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
      console.error('Error fetching event:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to fetch event';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const createEvent = async (eventData: {
    name: string;
    description?: string;
    start_date: string;
    end_date?: string;
    image_url?: string;
  }): Promise<{ success: boolean; event?: Event; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl('/events');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<{ success: boolean; event?: Event; error?: string }>(url, {
        method: 'POST',
        headers,
        body: eventData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error creating event:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to create event';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const generateImageUploadUrl = async (
    filename: string,
    fileSize: number,
    mimeType: string = 'image/jpeg'
  ): Promise<{ success: boolean; upload_url?: string; s3_key?: string; s3_url?: string; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl('/events/image-upload-url');
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
      console.error('Error generating image upload URL:', error);
      return {
        success: false,
        error: error.data?.message || error.message || 'Failed to generate upload URL',
      };
    }
  };

  const updateEvent = async (
    eventId: string,
    eventData: {
      name?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
      image_url?: string;
    }
  ): Promise<{ success: boolean; event?: Event; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl(`/events/${eventId}`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<{ success: boolean; event?: Event; error?: string }>(url, {
        method: 'PATCH',
        headers,
        body: eventData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating event:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to update event';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const deleteEvent = async (eventId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl(`/events/${eventId}`);
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
      console.error('Error deleting event:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to delete event';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  return {
    fetchEvents,
    fetchEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    generateImageUploadUrl,
    getApiUrl,
  };
};

