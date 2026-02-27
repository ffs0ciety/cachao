<template>
  <div class="min-h-screen bg-elevated">
    <div class="container mx-auto px-4 py-8 max-w-4xl">
      <!-- Back button -->
      <div class="mb-6">
        <NuxtLink
          :to="`/events/${eventId}`"
          class="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Event
        </NuxtLink>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="text-center py-12">
        <p class="text-text-secondary">Loading your event information...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        <p class="font-bold">Error:</p>
        <p>{{ error }}</p>
      </div>

      <!-- Content -->
      <div v-else-if="staffInfo" class="space-y-6">
        <!-- Staff/Artist Info Card -->
        <div class="bg-surface rounded-lg shadow-md p-6">
          <h1 class="text-3xl font-bold text-text-primary mb-6">My Event Information</h1>
          
          <div class="grid md:grid-cols-2 gap-6">
            <div>
              <h2 class="text-xl font-semibold text-text-secondary mb-4">Personal Information</h2>
              <div class="space-y-3">
                <div>
                  <span class="text-sm font-medium text-text-disabled">Name:</span>
                  <p class="text-text-primary">{{ staffInfo.staff.name }}</p>
                </div>
                <div>
                  <span class="text-sm font-medium text-text-disabled">Role:</span>
                  <p class="text-text-primary capitalize">{{ staffInfo.staff.role }}</p>
                </div>
                <div v-if="staffInfo.staff.email">
                  <span class="text-sm font-medium text-text-disabled">Email:</span>
                  <p class="text-text-primary">{{ staffInfo.staff.email }}</p>
                </div>
                <div v-if="staffInfo.staff.phone">
                  <span class="text-sm font-medium text-text-disabled">Phone:</span>
                  <p class="text-text-primary">{{ staffInfo.staff.phone }}</p>
                </div>
                <div v-if="staffInfo.staff.notes">
                  <span class="text-sm font-medium text-text-disabled">Notes:</span>
                  <p class="text-text-primary">{{ staffInfo.staff.notes }}</p>
                </div>
                <div v-if="staffInfo.staff.subcategories && staffInfo.staff.subcategories.length > 0">
                  <span class="text-sm font-medium text-text-disabled">Categories:</span>
                  <div class="flex flex-wrap gap-2 mt-1">
                    <span
                      v-for="cat in staffInfo.staff.subcategories"
                      :key="cat"
                      class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                    >
                      {{ cat }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div v-if="staffInfo.staff.image_url" class="flex justify-center">
              <img
                :src="staffInfo.staff.image_url"
                :alt="staffInfo.staff.name"
                class="w-48 h-48 object-cover rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>

        <!-- Flights Card -->
        <div class="bg-surface rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-semibold text-text-primary mb-4">Flights</h2>
          
          <div v-if="staffInfo.flights && staffInfo.flights.length > 0" class="space-y-4">
            <div
              v-for="flight in staffInfo.flights"
              :key="flight.id"
              class="border border-border-subtle rounded-lg p-4"
            >
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h3 class="font-semibold text-text-primary">
                    {{ flight.flight_number }} ({{ flight.airline_code }})
                  </h3>
                  <p class="text-sm text-text-disabled capitalize">{{ flight.flight_type }}</p>
                </div>
                <span
                  v-if="flight.status"
                  class="px-2 py-1 bg-elevated text-text-secondary rounded text-xs"
                >
                  {{ flight.status }}
                </span>
              </div>
              
              <div class="grid md:grid-cols-2 gap-4 mt-4">
                <div v-if="flight.departure_airport_code || flight.departure_city">
                  <p class="text-sm font-medium text-text-disabled">Departure</p>
                  <p class="text-text-primary">
                    {{ flight.departure_airport_code || flight.departure_city }}
                    <span v-if="flight.departure_airport_name"> - {{ flight.departure_airport_name }}</span>
                  </p>
                  <p v-if="flight.departure_date" class="text-sm text-text-secondary">
                    {{ formatDate(flight.departure_date) }}
                    <span v-if="flight.departure_time"> at {{ flight.departure_time }}</span>
                  </p>
                </div>
                
                <div v-if="flight.arrival_airport_code || flight.arrival_city">
                  <p class="text-sm font-medium text-text-disabled">Arrival</p>
                  <p class="text-text-primary">
                    {{ flight.arrival_airport_code || flight.arrival_city }}
                    <span v-if="flight.arrival_airport_name"> - {{ flight.arrival_airport_name }}</span>
                  </p>
                  <p v-if="flight.arrival_date" class="text-sm text-text-secondary">
                    {{ formatDate(flight.arrival_date) }}
                    <span v-if="flight.arrival_time"> at {{ flight.arrival_time }}</span>
                  </p>
                </div>
              </div>
              
              <div v-if="flight.aircraft_type" class="mt-2 text-sm text-text-secondary">
                Aircraft: {{ flight.aircraft_type }}
              </div>
            </div>
          </div>
          
          <div v-else class="text-center py-8 text-text-disabled">
            <p>No flights added yet.</p>
          </div>
        </div>

        <!-- Accommodations Card -->
        <div class="bg-surface rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-semibold text-text-primary mb-4">Accommodations</h2>
          
          <div v-if="staffInfo.accommodations && staffInfo.accommodations.length > 0" class="space-y-4">
            <div
              v-for="acc in staffInfo.accommodations"
              :key="acc.id"
              class="border border-border-subtle rounded-lg p-4"
            >
              <h3 class="font-semibold text-text-primary mb-2">{{ acc.name }}</h3>
              
              <div class="grid md:grid-cols-2 gap-4">
                <div v-if="acc.address">
                  <p class="text-sm font-medium text-text-disabled">Address</p>
                  <p class="text-text-primary">{{ acc.address }}</p>
                </div>
                
                <div v-if="acc.city">
                  <p class="text-sm font-medium text-text-disabled">City</p>
                  <p class="text-text-primary">{{ acc.city }}</p>
                </div>
                
                <div v-if="acc.check_in_date">
                  <p class="text-sm font-medium text-text-disabled">Check-in</p>
                  <p class="text-text-primary">{{ formatDate(acc.check_in_date) }}</p>
                </div>
                
                <div v-if="acc.check_out_date">
                  <p class="text-sm font-medium text-text-disabled">Check-out</p>
                  <p class="text-text-primary">{{ formatDate(acc.check_out_date) }}</p>
                </div>
                
                <div v-if="acc.assignment_notes">
                  <p class="text-sm font-medium text-text-disabled">Notes</p>
                  <p class="text-text-primary">{{ acc.assignment_notes }}</p>
                </div>
              </div>
            </div>
          </div>
          
          <div v-else class="text-center py-8 text-text-disabled">
            <p>No accommodations assigned yet.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  ssr: false
});

interface StaffInfo {
  staff: {
    id: string;
    event_id: string;
    name: string;
    role: 'staff' | 'artist';
    email: string | null;
    phone: string | null;
    notes: string | null;
    image_url: string | null;
    subcategories?: string[];
  };
  flights: any[];
  accommodations: any[];
}

const route = useRoute();
const eventId = route.params.id as string;
const config = useRuntimeConfig();
const { isAuthenticated, checkAuth, getAuthToken } = useAuth();

const staffInfo = ref<StaffInfo | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const loadMyEventInfo = async () => {
  try {
    loading.value = true;
    error.value = null;
    
    if (!isAuthenticated.value) {
      error.value = 'Please sign in to view your event information';
      return;
    }
    
    const token = await getAuthToken();
    const baseUrl = config.public.apiUrl;
    const basePath = config.public.apiBasePath || '';
    const url = `${baseUrl}${basePath}/events/${eventId}/my-info`;
    
    const response = await $fetch<{ success: boolean; staff?: any; flights?: any[]; accommodations?: any[]; error?: string }>(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      server: false,
    });
    
    if (response.success && response.staff) {
      staffInfo.value = {
        staff: response.staff,
        flights: response.flights || [],
        accommodations: response.accommodations || [],
      };
    } else {
      error.value = response.error || 'Failed to load event information';
    }
  } catch (err: any) {
    console.error('Error loading my event info:', err);
    if (err.status === 404 || err.statusCode === 404) {
      error.value = 'You are not registered as staff or artist for this event';
    } else {
      error.value = err.data?.error || err.message || 'An unexpected error occurred';
    }
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  if (process.client) {
    await checkAuth();
    await loadMyEventInfo();
  }
});
</script>
