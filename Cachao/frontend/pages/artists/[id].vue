<template>
  <div class="min-h-screen bg-elevated">
    <div class="container mx-auto px-4 py-8">
      <!-- Back button -->
      <div class="mb-6">
        <button
          @click="$router.back()"
          class="inline-flex items-center text-primary hover:text-primary-hover transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="text-center py-12">
        <p class="text-text-secondary">Loading artist profile...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="alert alert-error mb-4">
        <p class="font-bold">Error:</p>
        <p>{{ error }}</p>
      </div>

      <!-- Artist Profile -->
      <div v-else-if="artist" class="bg-surface rounded-xl shadow-md overflow-hidden mb-8">
        <!-- Artist Header -->
        <div class="bg-gradient-to-r from-purple-500 to-pink-600 p-8 text-white">
          <div class="flex items-start gap-6">
            <!-- Avatar -->
            <div class="flex-shrink-0">
              <img
                v-if="artist.image_url"
                :src="artist.image_url"
                :alt="artist.name"
                class="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
              />
              <div
                v-else
                class="w-32 h-32 rounded-full bg-surface bg-opacity-20 flex items-center justify-center text-white font-bold text-4xl border-4 border-white shadow-lg"
              >
                {{ artist.name.charAt(0).toUpperCase() }}
              </div>
            </div>
            
            <!-- Artist Info -->
            <div class="flex-1">
              <h1 class="text-4xl font-bold mb-2">{{ artist.name }}</h1>
              <div v-if="artist.subcategories && artist.subcategories.length > 0" class="flex flex-wrap gap-2 mb-4">
                <span
                  v-for="subcat in artist.subcategories"
                  :key="subcat"
                  class="px-3 py-1 bg-surface bg-opacity-20 rounded-full text-sm font-medium capitalize backdrop-blur-sm"
                >
                  {{ subcat }}
                </span>
              </div>
              <div v-if="artist.notes" class="text-white text-opacity-90 text-lg">
                {{ artist.notes }}
              </div>
            </div>
          </div>
        </div>

        <!-- Contact Info (if available) -->
        <div v-if="artist.email || artist.phone" class="p-6 border-b border-border-subtle">
          <div class="grid md:grid-cols-2 gap-4">
            <div v-if="artist.email" class="flex items-center gap-3">
              <svg class="w-5 h-5 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <a :href="`mailto:${artist.email}`" class="text-primary hover:text-primary-hover">
                {{ artist.email }}
              </a>
            </div>
            <div v-if="artist.phone" class="flex items-center gap-3">
              <svg class="w-5 h-5 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <a :href="`tel:${artist.phone}`" class="text-primary hover:text-primary-hover">
                {{ artist.phone }}
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Public Events Section -->
      <div v-if="artist" class="bg-surface rounded-xl shadow-md p-6">
        <h2 class="text-2xl font-bold text-text-primary mb-6">Upcoming Events</h2>
        
        <!-- Loading events -->
        <div v-if="eventsLoading" class="text-center py-8">
          <p class="text-text-secondary">Loading events...</p>
        </div>

        <!-- No events -->
        <div v-else-if="events.length === 0" class="text-center py-12 text-text-disabled">
          <svg class="w-16 h-16 mx-auto mb-4 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="text-lg">No upcoming events</p>
        </div>

        <!-- Events Grid -->
        <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="eventItem in events"
            :key="eventItem.id"
            :to="`/events/${eventItem.id}`"
            class="border border-border-subtle rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
          >
            <!-- Event Image -->
            <div class="w-full h-48 overflow-hidden bg-hover">
              <img
                v-if="eventItem.image_url"
                :src="eventItem.image_url"
                :alt="eventItem.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <svg class="w-16 h-16 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            
            <!-- Event Info -->
            <div class="p-4">
              <h3 class="font-semibold text-text-primary mb-2">{{ eventItem.name }}</h3>
              <p v-if="eventItem.description" class="text-sm text-text-secondary mb-3 line-clamp-2">
                {{ eventItem.description }}
              </p>
              <div class="text-xs text-text-disabled">
                <p>Start: {{ formatDate(eventItem.start_date) }}</p>
                <p v-if="eventItem.end_date">End: {{ formatDate(eventItem.end_date) }}</p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Artist {
  id: string;
  event_id: string;
  name: string;
  role: 'staff' | 'artist';
  email: string | null;
  phone: string | null;
  notes: string | null;
  image_url: string | null;
  is_public?: boolean | null;
  subcategories?: string[];
  created_at: string;
  updated_at: string;
}

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

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();

const artistId = route.params.id as string;
const artist = ref<Artist | null>(null);
const events = ref<Event[]>([]);
const loading = ref(true);
const eventsLoading = ref(true);
const error = ref<string | null>(null);

const getApiUrl = (endpoint: string) => {
  const baseUrl = config.public.apiUrl;
  const basePath = config.public.apiBasePath || '';
  return `${baseUrl}${basePath}${endpoint}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const loadArtistProfile = async () => {
  try {
    loading.value = true;
    error.value = null;
    
    const url = getApiUrl(`/artists/${artistId}`);
    const response = await $fetch<{ success: boolean; artist?: Artist; events?: Event[]; error?: string }>(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      server: false,
      timeout: 15000,
    });

    if (response.success && response.artist) {
      artist.value = response.artist;
      events.value = response.events || [];
    } else {
      error.value = response.error || 'Failed to fetch artist profile';
    }
  } catch (err: any) {
    console.error('Fetch artist profile error:', err);
    error.value = err.data?.message || err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
    eventsLoading.value = false;
  }
};

onMounted(() => {
  if (process.client) {
    loadArtistProfile();
  }
});
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>


