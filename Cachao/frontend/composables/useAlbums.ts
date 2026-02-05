export interface Album {
  id: string;
  event_id: string;
  name: string;
  album_date?: string | null;
  created_at: string;
  updated_at: string;
}

export const useAlbums = () => {
  const config = useRuntimeConfig();
  
  const getApiUrl = (endpoint: string) => {
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    return `${baseUrl}${basePath}${endpoint}`;
  };

  const fetchEventAlbums = async (eventId: string): Promise<Album[]> => {
    try {
      const response = await $fetch<{ success: boolean; albums: Album[] }>(
        `${getApiUrl(`/events/${eventId}/albums`)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.success) {
        return response.albums;
      }
      return [];
    } catch (error) {
      console.error('Error fetching albums:', error);
      return [];
    }
  };

  const createAlbum = async (
    eventId: string,
    name: string,
    authToken: string | null,
    albumDate?: string | null
  ): Promise<Album | null> => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await $fetch<{ success: boolean; album: Album }>(
        `${getApiUrl(`/events/${eventId}/albums`)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, album_date: albumDate || null }),
        }
      );

      if (response.success) {
        return response.album;
      }
      return null;
    } catch (error) {
      console.error('Error creating album:', error);
      return null;
    }
  };

  return {
    fetchEventAlbums,
    createAlbum,
  };
};

