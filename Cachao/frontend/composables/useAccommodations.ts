interface Accommodation {
  id: string;
  event_id: string;
  accommodation_type: 'hotel' | 'airbnb' | 'apartment' | 'other';
  name: string;
  address: string | null;
  room_number: string | null;
  board_type: 'none' | 'breakfast' | 'half_board' | 'full_board' | 'all_inclusive';
  check_in_date: string | null;
  check_out_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  assigned_staff_ids?: string[];
  assigned_staff_names?: string[];
}

interface AccommodationsResponse {
  success: boolean;
  accommodations?: Accommodation[];
  error?: string;
}

interface AddAccommodationData {
  accommodation_type?: 'hotel' | 'airbnb' | 'apartment' | 'other';
  name: string;
  address?: string;
  room_number?: string;
  board_type?: 'none' | 'breakfast' | 'half_board' | 'full_board' | 'all_inclusive';
  check_in_date?: string;
  check_out_date?: string;
  notes?: string;
}

export const useAccommodations = () => {
  const config = useRuntimeConfig();
  
  const getApiUrl = (endpoint: string) => {
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    return `${baseUrl}${basePath}${endpoint}`;
  };

  /**
   * Fetch accommodations for an event
   */
  const fetchEventAccommodations = async (eventId: string): Promise<AccommodationsResponse> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl(`/events/${eventId}/accommodations`);
      console.log('Fetching accommodations from:', url);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<AccommodationsResponse>(url, {
        method: 'GET',
        headers,
        server: false,
        timeout: 15000,
        retry: 1,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching accommodations:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to fetch accommodations';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Fetch accommodations for a specific staff member
   */
  const fetchStaffAccommodations = async (eventId: string, staffId: string): Promise<AccommodationsResponse> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl(`/events/${eventId}/staff/${staffId}/accommodations`);
      console.log('Fetching staff accommodations from:', url);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await $fetch<AccommodationsResponse>(url, {
        method: 'GET',
        headers,
        server: false,
        timeout: 15000,
        retry: 1,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching staff accommodations:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to fetch accommodations';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Add accommodation to an event
   */
  const addEventAccommodation = async (
    eventId: string,
    accommodationData: AddAccommodationData
  ): Promise<{ success: boolean; accommodation?: Accommodation; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required. Please log in again.',
        };
      }

      // Ensure token is a string
      const tokenString = typeof token === 'string' ? token : String(token);
      
      // Validate token looks like a JWT (has 3 parts separated by dots)
      if (!tokenString.includes('.')) {
        console.error('Invalid token format - not a JWT');
        return {
          success: false,
          error: 'Invalid authentication token. Please log in again.',
        };
      }

      const url = getApiUrl(`/events/${eventId}/accommodations`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenString}`,
      };
      
      const response = await $fetch<{ success: boolean; accommodation?: Accommodation; error?: string }>(url, {
        method: 'POST',
        headers,
        body: accommodationData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error adding accommodation:', error);
      
      // Check for authentication errors
      if (error.status === 401 || error.statusCode === 401 || 
          error.message?.includes('Authorization') || 
          error.message?.includes('Unauthorized') ||
          error.data?.error?.includes('Authorization')) {
        return {
          success: false,
          error: 'Your session has expired. Please log out and log back in.',
        };
      }
      
      const errorMessage = error.data?.message || error.data?.error || error.message || 'Failed to add accommodation';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Update accommodation
   */
  const updateEventAccommodation = async (
    eventId: string,
    accommodationId: string,
    accommodationData: Partial<AddAccommodationData>
  ): Promise<{ success: boolean; accommodation?: Accommodation; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/events/${eventId}/accommodations/${accommodationId}`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        // Ensure token is a string and properly formatted
        const tokenString = typeof token === 'string' ? token.trim() : String(token).trim();
        // Validate it looks like a JWT (has 3 parts separated by dots)
        if (tokenString.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${tokenString}`;
        } else {
          console.error('Invalid token format for update request:', tokenString.substring(0, 50));
          return {
            success: false,
            error: 'Invalid authentication token format',
          };
        }
      }
      
      const response = await $fetch<{ success: boolean; accommodation?: Accommodation; error?: string }>(url, {
        method: 'PUT',
        headers,
        body: accommodationData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating accommodation:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to update accommodation';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Delete accommodation
   */
  const deleteEventAccommodation = async (
    eventId: string,
    accommodationId: string
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

      const url = getApiUrl(`/events/${eventId}/accommodations/${accommodationId}`);
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
      console.error('Error deleting accommodation:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to delete accommodation';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Assign accommodation to staff
   */
  const assignAccommodationToStaff = async (
    eventId: string,
    accommodationId: string,
    staffId: string,
    assignmentDetails?: {
      room_number?: string;
      board_type?: 'none' | 'breakfast' | 'half_board' | 'full_board' | 'all_inclusive';
      check_in_date?: string;
      check_out_date?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; accommodation?: Accommodation; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/events/${eventId}/accommodations/${accommodationId}/assign`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        // Ensure token is a string and properly formatted
        const tokenString = typeof token === 'string' ? token.trim() : String(token).trim();
        // Validate it looks like a JWT (has 3 parts separated by dots)
        if (tokenString.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${tokenString}`;
        } else {
          console.error('Invalid token format for assign request:', tokenString.substring(0, 50));
          return {
            success: false,
            error: 'Invalid authentication token format',
          };
        }
      }
      
      const body: any = { staff_id: staffId };
      if (assignmentDetails) {
        if (assignmentDetails.room_number !== undefined) {
          body.room_number = assignmentDetails.room_number || null;
        }
        if (assignmentDetails.board_type !== undefined) {
          body.board_type = assignmentDetails.board_type;
        }
        if (assignmentDetails.check_in_date !== undefined) {
          body.check_in_date = assignmentDetails.check_in_date || null;
        }
        if (assignmentDetails.check_out_date !== undefined) {
          body.check_out_date = assignmentDetails.check_out_date || null;
        }
        if (assignmentDetails.notes !== undefined) {
          body.notes = assignmentDetails.notes || null;
        }
      }
      
      const response = await $fetch<{ success: boolean; accommodation?: Accommodation; error?: string }>(url, {
        method: 'POST',
        headers,
        body,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error assigning accommodation:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to assign accommodation';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Unassign accommodation from staff
   */
  const unassignAccommodationFromStaff = async (
    eventId: string,
    accommodationId: string,
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

      const url = getApiUrl(`/events/${eventId}/accommodations/${accommodationId}/assign/${staffId}`);
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
      console.error('Error unassigning accommodation:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to unassign accommodation';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  return {
    fetchEventAccommodations,
    fetchStaffAccommodations,
    addEventAccommodation,
    updateEventAccommodation,
    deleteEventAccommodation,
    assignAccommodationToStaff,
    unassignAccommodationFromStaff,
  };
};

