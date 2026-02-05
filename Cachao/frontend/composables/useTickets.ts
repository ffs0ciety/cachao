interface Ticket {
  id: string;
  event_id: string;
  name: string;
  price: number;
  image_url: string | null;
  max_quantity: number | null;
  sold_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DiscountCode {
  id: string;
  event_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TicketsResponse {
  success: boolean;
  tickets: Ticket[];
  error?: string;
}

interface DiscountCodesResponse {
  success: boolean;
  discount_codes: DiscountCode[];
  error?: string;
}

interface TicketDiscount {
  id: string;
  ticket_id: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  valid_until: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TicketDiscountsResponse {
  success: boolean;
  discounts: TicketDiscount[];
  error?: string;
}

export const useTickets = () => {
  const config = useRuntimeConfig();
  
  const getApiUrl = (endpoint: string) => {
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    return `${baseUrl}${basePath}${endpoint}`;
  };

  const fetchTickets = async (eventId: string): Promise<TicketsResponse> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const response = await $fetch<TicketsResponse>(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching tickets:', error);
      return {
        success: false,
        tickets: [],
        error: error.message || 'Failed to fetch tickets',
      };
    }
  };

  const addTicket = async (eventId: string, ticketData: {
    name: string;
    price: number;
    image_url?: string | null;
    max_quantity?: number | null;
  }): Promise<{ success: boolean; ticket?: Ticket; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; ticket?: Ticket; error?: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: ticketData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error adding ticket:', error);
      return {
        success: false,
        error: error.message || 'Failed to add ticket',
      };
    }
  };

  const updateTicket = async (
    eventId: string,
    ticketId: string,
    ticketData: {
      name?: string;
      price?: number;
      image_url?: string | null;
      max_quantity?: number | null;
      is_active?: boolean;
    }
  ): Promise<{ success: boolean; ticket?: Ticket; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/${ticketId}`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; ticket?: Ticket; error?: string }>(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: ticketData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating ticket:', error);
      return {
        success: false,
        error: error.message || 'Failed to update ticket',
      };
    }
  };

  const deleteTicket = async (
    eventId: string,
    ticketId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/${ticketId}`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; error?: string }>(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error deleting ticket:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete ticket',
      };
    }
  };

  const generateTicketImageUploadUrl = async (
    eventId: string,
    filename: string
  ): Promise<{ success: boolean; upload_url?: string; s3_url?: string; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/upload-image-url`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; upload_url?: string; s3_url?: string; error?: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: { filename },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error generating ticket image upload URL:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate upload URL',
      };
    }
  };

  const fetchDiscountCodes = async (eventId: string): Promise<DiscountCodesResponse> => {
    try {
      const url = getApiUrl(`/events/${eventId}/discount-codes`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const response = await $fetch<DiscountCodesResponse>(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching discount codes:', error);
      return {
        success: false,
        discount_codes: [],
        error: error.message || 'Failed to fetch discount codes',
      };
    }
  };

  const addDiscountCode = async (eventId: string, codeData: {
    code: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    max_uses?: number | null;
    valid_from?: string | null;
    valid_until?: string | null;
  }): Promise<{ success: boolean; discount_code?: DiscountCode; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/discount-codes`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; discount_code?: DiscountCode; error?: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: codeData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error adding discount code:', error);
      return {
        success: false,
        error: error.message || 'Failed to add discount code',
      };
    }
  };

  const updateDiscountCode = async (
    eventId: string,
    codeId: string,
    codeData: {
      code?: string;
      discount_type?: 'percentage' | 'fixed';
      discount_value?: number;
      max_uses?: number | null;
      valid_from?: string | null;
      valid_until?: string | null;
      is_active?: boolean;
    }
  ): Promise<{ success: boolean; discount_code?: DiscountCode; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/discount-codes/${codeId}`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; discount_code?: DiscountCode; error?: string }>(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: codeData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating discount code:', error);
      return {
        success: false,
        error: error.message || 'Failed to update discount code',
      };
    }
  };

  const deleteDiscountCode = async (
    eventId: string,
    codeId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/discount-codes/${codeId}`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; error?: string }>(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error deleting discount code:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete discount code',
      };
    }
  };

  const fetchTicketDiscounts = async (eventId: string, ticketId: string): Promise<TicketDiscountsResponse> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/${ticketId}/discounts`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const response = await $fetch<TicketDiscountsResponse>(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching ticket discounts:', error);
      return {
        success: false,
        discounts: [],
        error: error.message || 'Failed to fetch ticket discounts',
      };
    }
  };

  const addTicketDiscount = async (
    eventId: string,
    ticketId: string,
    discountData: {
      discount_type: 'percentage' | 'fixed';
      discount_value: number;
      valid_until: string;
    }
  ): Promise<{ success: boolean; discount?: TicketDiscount; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/${ticketId}/discounts`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; discount?: TicketDiscount; error?: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: discountData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error adding ticket discount:', error);
      return {
        success: false,
        error: error.message || 'Failed to add ticket discount',
      };
    }
  };

  const updateTicketDiscount = async (
    eventId: string,
    ticketId: string,
    discountId: string,
    discountData: {
      discount_type?: 'percentage' | 'fixed';
      discount_value?: number;
      valid_until?: string;
      is_active?: boolean;
    }
  ): Promise<{ success: boolean; discount?: TicketDiscount; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/${ticketId}/discounts/${discountId}`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; discount?: TicketDiscount; error?: string }>(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: discountData,
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error updating ticket discount:', error);
      return {
        success: false,
        error: error.message || 'Failed to update ticket discount',
      };
    }
  };

  const deleteTicketDiscount = async (
    eventId: string,
    ticketId: string,
    discountId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/${ticketId}/discounts/${discountId}`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; error?: string }>(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error deleting ticket discount:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete ticket discount',
      };
    }
  };

  const createTicketCheckout = async (
    eventId: string,
    ticketId: string,
    data: {
      quantity: number;
      email: string;
      discount_code?: string;
    }
  ): Promise<{ success: boolean; checkout_url?: string; session_id?: string; error?: string }> => {
    try {
      const url = getApiUrl(`/events/${eventId}/tickets/${ticketId}/checkout`);
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      
      // Build HTTP request format for debugging (matching testingapis.http format)
      const bodyJson = JSON.stringify(data, null, 2);
      const httpRequest = `POST ${url} HTTP/1.1
content-type: application/json
${token ? `Authorization: Bearer ${token}` : ''}
Origin: ${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}

${bodyJson}

###`;
      
      console.log('=== FULL HTTP REQUEST ===');
      console.log(httpRequest);
      console.log('=== REQUEST DETAILS ===');
      console.log('URL:', url);
      console.log('Method: POST');
      console.log('Headers:', headers);
      console.log('Body:', data);
      console.log('========================');
      
      const response = await $fetch<{ success: boolean; checkout_url?: string; session_id?: string; error?: string }>(url, {
        method: 'POST',
        headers,
        body: data,
        server: false,
      });

      console.log('Checkout response received:', response);
      return response;
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        data: error.data,
        response: error.response,
      });
      
      // If it's a network/CORS error, provide a more helpful message
      if (error.message?.includes('CORS') || error.message?.includes('Network') || error.status === 0) {
        return {
          success: false,
          error: 'Network error. Please check your connection and try again.',
        };
      }
      
      return {
        success: false,
        error: error.data?.error || error.message || 'Failed to create checkout session',
      };
    }
  };

  const fetchUserTickets = async (): Promise<{ success: boolean; orders?: any[]; count?: number; error?: string }> => {
    try {
      const url = getApiUrl('/user/tickets');
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      
      if (!token) {
        return { success: false, error: 'Authentication required' };
      }

      const response = await $fetch<{ success: boolean; orders?: any[]; count?: number; error?: string }>(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        server: false,
      });

      return response;
    } catch (error: any) {
      console.error('Error fetching user tickets:', error);
      return {
        success: false,
        error: error.data?.error || error.message || 'Failed to fetch ticket orders',
      };
    }
  };

  /** List ticket orders for an event (owner only). Params: page, limit, search, status, validated */
  const fetchEventTicketOrders = async (
    eventId: string,
    params: { page?: number; limit?: number; search?: string; status?: string; validated?: string } = {}
  ): Promise<{
    success: boolean;
    orders?: any[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    error?: string;
  }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      if (!token) return { success: false, error: 'Authentication required' };

      const q = new URLSearchParams();
      if (params.page != null) q.set('page', String(params.page));
      if (params.limit != null) q.set('limit', String(params.limit));
      if (params.search) q.set('search', params.search);
      if (params.status) q.set('status', params.status);
      if (params.validated) q.set('validated', params.validated);

      const url = getApiUrl(`/events/${eventId}/ticket-orders?${q.toString()}`);
      const response = await $fetch<{
        success: boolean;
        orders?: any[];
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
        error?: string;
      }>(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        server: false,
      });
      return response;
    } catch (error: any) {
      console.error('Error fetching event ticket orders:', error);
      return {
        success: false,
        error: error.data?.error || error.message || 'Failed to fetch ticket orders',
      };
    }
  };

  /** Mark a ticket order as validated (or unvalidate). Owner only. */
  const markTicketOrderValidated = async (
    eventId: string,
    orderId: string,
    validated: boolean = true
  ): Promise<{ success: boolean; order?: { id: string; validated: boolean; validated_at?: string }; error?: string }> => {
    try {
      const { getAuthToken } = useAuth();
      const token = await getAuthToken();
      if (!token) return { success: false, error: 'Authentication required' };

      const url = getApiUrl(`/events/${eventId}/ticket-orders/${orderId}/validate`);
      const response = await $fetch<{
        success: boolean;
        order?: { id: string; validated: boolean; validated_at?: string };
        error?: string;
      }>(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: { validated },
        server: false,
      });
      return response;
    } catch (error: any) {
      console.error('Error marking ticket order validated:', error);
      const data = error?.data;
      const msg =
        (typeof data === 'object' && data?.error && typeof data.error === 'string' ? data.error : null) ||
        error?.message ||
        'Failed to update order';
      return { success: false, error: msg };
    }
  };

  return {
    fetchTickets,
    addTicket,
    updateTicket,
    deleteTicket,
    generateTicketImageUploadUrl,
    fetchDiscountCodes,
    addDiscountCode,
    updateDiscountCode,
    deleteDiscountCode,
    fetchTicketDiscounts,
    addTicketDiscount,
    updateTicketDiscount,
    deleteTicketDiscount,
    createTicketCheckout,
    fetchUserTickets,
    fetchEventTicketOrders,
    markTicketOrderValidated,
  };
};

