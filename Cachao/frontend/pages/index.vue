<template>
  <div class="min-h-screen bg-white">
    <div class="container mx-auto px-4 py-12">

      <!-- Hero Section -->
      <div class="text-center mb-16">
        <h1 class="text-5xl font-semibold text-gray-900 mb-4">Events</h1>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover and join amazing events
        </p>
      </div>

      <div v-if="loading" class="text-center py-16">
        <p class="text-gray-500">Loading events...</p>
      </div>

      <div v-else-if="error" class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 max-w-2xl mx-auto">
        <p class="font-semibold">Error:</p>
        <p>{{ error }}</p>
      </div>

      <div v-else-if="events.length === 0" class="text-center py-16">
        <p class="text-gray-500 text-lg">No events found.</p>
      </div>

      <div v-else class="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto">
        <NuxtLink
          v-for="event in events"
          :key="event.id"
          :to="`/events/${event.id}`"
          class="group bg-white rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-100"
        >
          <!-- Event Image -->
          <div class="w-full h-64 overflow-hidden bg-gray-100 relative">
            <div v-if="!imageLoaded[event.id]" class="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center z-10">
              <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <img
              v-if="event.image_url"
              :src="event.image_url"
              :alt="event.name"
              class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              :class="{ 'opacity-0': !imageLoaded[event.id], 'opacity-100': imageLoaded[event.id] }"
              @load="imageLoaded[event.id] = true"
              @error="imageLoaded[event.id] = true"
            />
            <div v-else class="absolute inset-0 bg-gray-100 flex items-center justify-center">
              <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          
          <div class="p-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-3 group-hover:text-primary transition-colors">{{ event.name }}</h2>
            
            <p v-if="event.description" class="text-gray-600 mb-4 line-clamp-2 text-sm leading-relaxed">
              {{ event.description }}
            </p>

            <div class="space-y-1.5 text-sm text-gray-500">
              <div class="flex items-center">
                <span class="font-medium mr-2">Start:</span>
                <span>{{ formatDate(event.start_date) }}</span>
              </div>
              <div v-if="event.end_date" class="flex items-center">
                <span class="font-medium mr-2">End:</span>
                <span>{{ formatDate(event.end_date) }}</span>
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Event {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

const { fetchEvents } = useEvents();
const { checkAuth } = useAuth();

const events = ref<Event[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const imageLoaded = ref<Record<string, boolean>>({});

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



onMounted(async () => {
  // Only fetch on client-side to avoid SSR issues
  if (process.client) {
    loading.value = true;
    error.value = null;
    
    // Check authentication status in background
    checkAuth().catch(err => {
      console.warn('Auth check failed (non-critical):', err);
    });
    
    // Fetch events immediately
    try {
      console.log('Starting to fetch events...');
      const response = await fetchEvents();
      console.log('Events response received:', response);
      
      if (response.success) {
        events.value = response.events;
        console.log('Events loaded:', events.value.length);
      } else {
        error.value = response.error || 'Failed to fetch events';
        console.error('Events fetch failed:', response.error);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      error.value = err.message || err.toString() || 'An unexpected error occurred';
    } finally {
      loading.value = false;
      console.log('Loading complete');
    }
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

