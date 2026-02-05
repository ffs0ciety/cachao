interface Flight {
  id: string;
  staff_id: string;
  flight_number: string;
  airline_code: string;
  flight_type: 'departure' | 'return';
  departure_airport_code: string | null;
  departure_airport_name: string | null;
  departure_city: string | null;
  departure_date: string | null;
  departure_time: string | null;
  arrival_airport_code: string | null;
  arrival_airport_name: string | null;
  arrival_city: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  aircraft_type: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

interface FlightsResponse {
  success: boolean;
  count?: number;
  flights?: Flight[];
  error?: string;
}

interface AddFlightData {
  flight_number: string;
  flight_type: 'departure' | 'return';
  departure_date?: string;
  departure_airport_code?: string;
  departure_airport_name?: string;
  departure_city?: string;
  departure_time?: string;
  arrival_airport_code?: string;
  arrival_airport_name?: string;
  arrival_city?: string;
  arrival_date?: string;
  arrival_time?: string;
  aircraft_type?: string;
  status?: string;
}

export const useFlights = () => {
  const config = useRuntimeConfig();
  
  const getApiUrl = (endpoint: string) => {
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    return `${baseUrl}${basePath}${endpoint}`;
  };

  /**
   * Fetch flights for a specific staff member/artist
   */
  const fetchStaffFlights = async (eventId: string, staffId: string): Promise<FlightsResponse> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const url = getApiUrl(`/events/${eventId}/staff/${staffId}/flights`);
      console.log('Fetching flights from:', url);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      
      if (token) {
        // Ensure token is a valid JWT format before sending
        const tokenString = typeof token === 'string' ? token.trim() : String(token).trim();
        // JWT should have 3 parts separated by dots
        if (tokenString.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${tokenString}`;
        } else {
          console.error('Invalid token format - not a valid JWT');
          return {
            success: false,
            error: 'Invalid authentication token',
          };
        }
      }
      
      const response = await $fetch<FlightsResponse>(url, {
        method: 'GET',
        headers,
        server: false,
        timeout: 15000,
        retry: 1,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching flights:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to fetch flights';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Add flight to a staff member/artist
   */
  const addStaffFlight = async (
    eventId: string,
    staffId: string,
    flightData: AddFlightData
  ): Promise<{ success: boolean; flight?: Flight; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/events/${eventId}/staff/${staffId}/flights`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        // Ensure token is a valid JWT format before sending
        const tokenString = typeof token === 'string' ? token.trim() : String(token).trim();
        // JWT should have 3 parts separated by dots
        if (tokenString.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${tokenString}`;
        } else {
          console.error('Invalid token format - not a valid JWT');
          return {
            success: false,
            error: 'Invalid authentication token',
          };
        }
      }
      
      const response = await $fetch<{ success: boolean; flight?: Flight; error?: string }>(url, {
        method: 'POST',
        headers,
        body: flightData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error adding flight:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to add flight';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Update flight for a staff member/artist
   */
  const updateStaffFlight = async (
    eventId: string,
    staffId: string,
    flightId: string,
    flightData: Partial<AddFlightData>
  ): Promise<{ success: boolean; flight?: Flight; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const url = getApiUrl(`/events/${eventId}/staff/${staffId}/flights/${flightId}`);
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
      
      const response = await $fetch<{ success: boolean; flight?: Flight; error?: string }>(url, {
        method: 'PUT',
        headers,
        body: flightData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating flight:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to update flight';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  /**
   * Delete flight from a staff member/artist
   */
  const deleteStaffFlight = async (
    eventId: string,
    staffId: string,
    flightId: string
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

      const url = getApiUrl(`/events/${eventId}/staff/${staffId}/flights/${flightId}`);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        // Ensure token is a valid JWT format before sending
        const tokenString = typeof token === 'string' ? token.trim() : String(token).trim();
        // JWT should have 3 parts separated by dots
        if (tokenString.split('.').length === 3) {
          headers['Authorization'] = `Bearer ${tokenString}`;
        } else {
          console.error('Invalid token format - not a valid JWT');
          return {
            success: false,
            error: 'Invalid authentication token',
          };
        }
      }
      
      const response = await $fetch<{ success: boolean; error?: string }>(url, {
        method: 'DELETE',
        headers,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error deleting flight:', error);
      const errorMessage = error.data?.message || error.message || 'Failed to delete flight';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  return {
    fetchStaffFlights,
    addStaffFlight,
    updateStaffFlight,
    deleteStaffFlight,
  };
};

