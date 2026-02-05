<template>
  <div class="min-h-screen bg-white py-12">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-4xl font-semibold text-gray-900 mb-2">Event Management</h1>
        <p class="text-lg text-gray-600">Create, edit, and manage your events</p>
      </div>

      <!-- Tab Navigation -->
      <div v-if="!loading && !error" class="border-b border-gray-200 mb-8">
        <nav class="flex space-x-8 overflow-x-auto" aria-label="Tabs">
          <button
            @click="activeTab = 'events'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
              activeTab === 'events'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            My Events
          </button>
        </nav>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-16">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-primary"></div>
        <p class="mt-4 text-gray-500">Loading events...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-6 mb-6">
        <p class="font-medium">{{ error }}</p>
        <NuxtLink
          v-if="error.includes('sign in')"
          to="/"
          class="mt-3 inline-block text-primary hover:text-primary-600 font-medium"
        >
          Go to home →
        </NuxtLink>
      </div>

      <!-- Events Tab Content -->
      <div v-else-if="activeTab === 'events'" class="space-y-8">
        <!-- Actions bar -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <NuxtLink
            to="/events/new"
            class="inline-flex items-center px-5 py-2.5 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Create Event
          </NuxtLink>
          <NuxtLink
            to="/"
            class="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors text-sm font-medium"
          >
            Browse all events
          </NuxtLink>
        </div>

        <!-- Events List Card -->
        <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div v-if="events.length === 0" class="text-center py-16 px-6">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p class="text-gray-600 mb-2">You haven't created any events yet.</p>
            <p class="text-sm text-gray-500 mb-6">Create your first event to start managing tickets, staff, and more.</p>
            <NuxtLink
              to="/events/new"
              class="inline-flex items-center px-5 py-2.5 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors"
            >
              Create your first event
            </NuxtLink>
          </div>

          <div v-else class="divide-y divide-gray-100">
            <div
              v-for="event in events"
              :key="event.id"
              class="p-6 hover:bg-gray-50/50 transition-colors"
            >
              <div class="flex flex-col sm:flex-row gap-6">
                <!-- Event Image -->
                <div class="flex-shrink-0">
                  <div class="w-full sm:w-36 h-36 overflow-hidden bg-gray-100 rounded-xl">
                    <img
                      v-if="event.image_url"
                      :src="event.image_url"
                      :alt="event.name"
                      class="w-full h-full object-cover"
                      @error="handleImageError($event)"
                    />
                    <div v-else class="w-full h-full flex items-center justify-center">
                      <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <!-- Event Details -->
                <div class="flex-1 min-w-0">
                  <h2 class="text-xl font-semibold text-gray-900 mb-1 truncate">{{ event.name }}</h2>
                  <p v-if="event.description" class="text-gray-600 text-sm line-clamp-2 mb-3">{{ event.description }}</p>
                  <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 mb-4">
                    <span>Start: {{ formatDate(event.start_date) }}</span>
                    <span v-if="event.end_date">End: {{ formatDate(event.end_date) }}</span>
                  </div>

                  <!-- Action Buttons -->
                  <div class="flex flex-wrap gap-2">
                    <NuxtLink
                      :to="`/events/${event.id}`"
                      class="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      View
                    </NuxtLink>
                    <NuxtLink
                      :to="`/events/edit/${event.id}`"
                      class="inline-flex items-center px-4 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors"
                    >
                      Edit
                    </NuxtLink>
                    <button
                      type="button"
                      @click="confirmDelete(event)"
                      class="inline-flex items-center px-4 py-2 bg-red-50 text-red-600 rounded-full text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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

const { fetchEvents, deleteEvent } = useEvents();
const { isAuthenticated, checkAuth } = useAuth();
const router = useRouter();

const events = ref<Event[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const activeTab = ref<'events'>('events');

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const handleImageError = (e: Event) => {
  (e.target as HTMLImageElement).style.display = 'none';
};

const confirmDelete = (event: Event) => {
  if (confirm(`Are you sure you want to delete "${event.name}"? This action cannot be undone.`)) {
    handleDelete(event);
  }
};

const handleDelete = async (event: Event) => {
  try {
    const result = await deleteEvent(event.id);
    if (result.success) {
      events.value = events.value.filter(e => e.id !== event.id);
    } else {
      alert(result.error || 'Failed to delete event');
    }
  } catch (err: any) {
    console.error('Error deleting event:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

onMounted(async () => {
  if (process.client) {
    await checkAuth();
    if (!isAuthenticated.value) {
      error.value = 'Please sign in to manage events';
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await fetchEvents();
      if (response.success) {
        events.value = response.events;
      } else {
        error.value = response.error || 'Failed to fetch events';
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      error.value = err.message || 'An unexpected error occurred';
    } finally {
      loading.value = false;
    }
  }
});
</script>
