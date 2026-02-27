<template>
  <div class="min-h-screen bg-elevated">
    <!-- TEST: This should always be visible if page renders -->
    <div class="bg-green-500 text-white p-2 text-center font-bold">
      ✅ STAFF PAGE LOADED - If you see this, the page is rendering!
    </div>
    <div class="container mx-auto px-4 py-8">
      <!-- Header -->
      <div class="mb-6">
        <NuxtLink
          :to="`/events/${eventId}`"
          class="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-4"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Event
        </NuxtLink>
        <div class="flex justify-between items-center">
          <h1 class="text-3xl font-bold text-text-primary">Manage Staff & Artists</h1>
          <button
            v-if="isEventOwner"
            @click="showAddForm = !showAddForm"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {{ showAddForm ? 'Cancel' : '+ Add Person' }}
          </button>
        </div>
      </div>

      <!-- Add Staff Form -->
      <div v-if="showAddForm && isEventOwner" class="mb-6 bg-surface rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-text-secondary mb-4">Add New Person</h2>
        <form @submit.prevent="handleAddStaff" class="space-y-4">
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label for="add-name" class="block text-sm font-medium text-text-secondary mb-2">
                Name <span class="text-red-500">*</span>
              </label>
              <input
                id="add-name"
                v-model="addFormData.name"
                type="text"
                required
                class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter name"
              />
            </div>
            <div>
              <label for="add-role" class="block text-sm font-medium text-text-secondary mb-2">
                Role <span class="text-red-500">*</span>
              </label>
              <select
                id="add-role"
                v-model="addFormData.role"
                required
                class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="staff">Staff</option>
                <option value="artist">Artist</option>
              </select>
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label for="add-email" class="block text-sm font-medium text-text-secondary mb-2">
                Email (Optional)
              </label>
              <input
                id="add-email"
                v-model="addFormData.email"
                type="email"
                class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label for="add-phone" class="block text-sm font-medium text-text-secondary mb-2">
                Phone (Optional)
              </label>
              <input
                id="add-phone"
                v-model="addFormData.phone"
                type="tel"
                class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+1 234 567 8900"
              />
            </div>
          </div>
          <div>
            <label for="add-notes" class="block text-sm font-medium text-text-secondary mb-2">
              Notes (Optional)
            </label>
            <textarea
              id="add-notes"
              v-model="addFormData.notes"
              rows="3"
              class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional information..."
            ></textarea>
          </div>
          <div v-if="addError" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>{{ addError }}</p>
          </div>
          <div class="flex gap-2">
            <button
              type="submit"
              :disabled="adding"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <span v-if="adding">Adding...</span>
              <span v-else>Add Person</span>
            </button>
            <button
              type="button"
              @click="showAddForm = false"
              class="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <p class="text-text-secondary">Loading staff...</p>
        <p class="text-sm text-text-disabled mt-2">Page is loading... (If you see this, the page rendered!)</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
        <p class="font-bold">Error:</p>
        <p>{{ error }}</p>
      </div>

      <!-- Staff List -->
      <div v-else-if="staff.length > 0" class="space-y-4">
        <div
          v-for="member in staff"
          :key="member.id"
          class="bg-surface rounded-lg shadow-md"
          style="overflow: visible;"
        >
          <!-- Staff Member Header -->
          <div 
            class="p-4 border-b border-border-subtle transition-colors"
            :class="{ 
              'bg-blue-50': editingMember && editingMember.id === member.id,
              'cursor-pointer hover:bg-elevated': isEventOwner && (!editingMember || editingMember.id !== member.id)
            }"
            @click="handleCardClick(member)"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-xl font-semibold text-text-primary">{{ member.name }}</h3>
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    :class="member.role === 'staff' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'"
                  >
                    {{ member.role === 'staff' ? 'Staff' : 'Artist' }}
                  </span>
                  <span v-if="isEventOwner && (!editingMember || editingMember.id !== member.id)" class="text-xs text-text-disabled">
                    (Click to edit)
                  </span>
                </div>
                <div class="text-sm text-text-secondary space-y-1">
                  <div v-if="member.email" class="flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {{ member.email }}
                  </div>
                  <div v-if="member.phone" class="flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {{ member.phone }}
                  </div>
                  <div v-if="member.notes" class="text-text-disabled italic mt-2">{{ member.notes }}</div>
                </div>
              </div>
              <!-- BUTTONS CONTAINER - ALWAYS VISIBLE -->
              <div class="flex gap-2 items-center flex-shrink-0" @click.stop>
                <!-- TEST BOX - MUST BE VISIBLE -->
                <div class="bg-red-600 text-white px-2 py-1 text-xs font-bold mr-2 border-2 border-black">
                  TEST
                </div>
                <!-- Edit button - ALWAYS VISIBLE -->
                <button
                  @click.stop="toggleEdit(member)"
                  type="button"
                  class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm min-w-[100px]"
                >
                  <span v-if="editingMember && editingMember.id === member.id">Cancel</span>
                  <span v-else>✏️ Edit</span>
                </button>
                <!-- Remove button - only for owners -->
                <button
                  v-if="isEventOwner"
                  @click.stop="confirmDelete(member)"
                  type="button"
                  class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm shadow-sm min-w-[80px]"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <!-- Edit Form -->
          <div v-if="editingMember && editingMember.id === member.id && isEventOwner" class="p-4 bg-elevated border-b border-border-subtle">
            <h4 class="text-lg font-semibold text-text-secondary mb-4">Edit Information</h4>
            <form @submit.prevent="handleUpdateStaff(member)" class="space-y-4">
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label :for="`edit-name-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Name <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`edit-name-${member.id}`"
                    v-model="editingMember.name"
                    type="text"
                    required
                    class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label :for="`edit-role-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Role <span class="text-red-500">*</span>
                  </label>
                  <select
                    :id="`edit-role-${member.id}`"
                    v-model="editingMember.role"
                    required
                    class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="staff">Staff</option>
                    <option value="artist">Artist</option>
                  </select>
                </div>
              </div>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label :for="`edit-email-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Email
                  </label>
                  <input
                    :id="`edit-email-${member.id}`"
                    v-model="editingMember.email"
                    type="email"
                    class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label :for="`edit-phone-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Phone
                  </label>
                  <input
                    :id="`edit-phone-${member.id}`"
                    v-model="editingMember.phone"
                    type="tel"
                    class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>
              <div>
                <label :for="`edit-notes-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                  Notes
                </label>
                <textarea
                  :id="`edit-notes-${member.id}`"
                  v-model="editingMember.notes"
                  rows="3"
                  class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional information..."
                ></textarea>
              </div>
              <div v-if="updateError" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                <p>{{ updateError }}</p>
              </div>
              <div class="flex gap-2">
                <button
                  type="submit"
                  :disabled="updating"
                  class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <span v-if="updating">Saving...</span>
                  <span v-else>Save Changes</span>
                </button>
                <button
                  type="button"
                  @click="editingMember = null"
                  class="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <!-- Flights Section -->
          <div class="p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-lg font-semibold text-text-secondary">Flights</h4>
              <button
                v-if="isEventOwner"
                @click="toggleFlightsForm(member)"
                class="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
              >
                {{ showingFlightsForm === member.id ? 'Cancel' : '+ Add Flight' }}
              </button>
            </div>

            <!-- Add Flight Form -->
            <div v-if="showingFlightsForm === member.id && isEventOwner" class="mb-4 p-4 bg-elevated rounded-lg border border-border-subtle">
              <form @submit.prevent="handleAddFlight(member)" class="space-y-4">
                <div class="grid md:grid-cols-2 gap-4">
                  <div>
                    <label :for="`flight-number-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Flight Number <span class="text-red-500">*</span>
                    </label>
                    <input
                      :id="`flight-number-${member.id}`"
                      v-model="flightFormData.flight_number"
                      type="text"
                      required
                      pattern="[A-Z]{2,3}\d+"
                      placeholder="e.g., AA123"
                      class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label :for="`flight-type-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                      Flight Type <span class="text-red-500">*</span>
                    </label>
                    <select
                      :id="`flight-type-${member.id}`"
                      v-model="flightFormData.flight_type"
                      required
                      class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="departure">Departure</option>
                      <option value="return">Return</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label :for="`departure-date-${member.id}`" class="block text-sm font-medium text-text-secondary mb-2">
                    Departure Date (optional)
                  </label>
                  <input
                    :id="`departure-date-${member.id}`"
                    v-model="flightFormData.departure_date"
                    type="date"
                    class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div v-if="addingFlight" class="text-sm text-blue-600">
                  Adding flight...
                </div>
                <div v-if="flightError" class="text-sm text-red-600">
                  {{ flightError }}
                </div>
                <div class="flex gap-2">
                  <button
                    type="submit"
                    :disabled="addingFlight"
                    class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Add Flight
                  </button>
                  <button
                    type="button"
                    @click="showingFlightsForm = null"
                    class="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            <!-- Flights List -->
            <div v-if="memberFlights[member.id]?.length > 0" class="space-y-2">
              <div
                v-for="flight in memberFlights[member.id]"
                :key="flight.id"
                class="p-3 bg-elevated rounded-lg border border-border-subtle"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <span class="font-semibold text-text-primary">{{ flight.flight_number }}</span>
                      <span
                        class="px-2 py-1 text-xs rounded-full"
                        :class="flight.flight_type === 'departure' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'"
                      >
                        {{ flight.flight_type === 'departure' ? 'Departure' : 'Return' }}
                      </span>
                    </div>
                    <div v-if="flight.departure_airport_code || flight.arrival_airport_code" class="text-sm text-text-secondary">
                      <span v-if="flight.departure_airport_code">{{ flight.departure_airport_code }}</span>
                      <span v-if="flight.departure_airport_code && flight.arrival_airport_code"> → </span>
                      <span v-if="flight.arrival_airport_code">{{ flight.arrival_airport_code }}</span>
                      <span v-if="flight.departure_date" class="ml-2 text-text-disabled">
                        ({{ formatDate(flight.departure_date) }})
                      </span>
                    </div>
                  </div>
                  <button
                    v-if="isEventOwner"
                    @click="confirmDeleteFlight(member, flight)"
                    class="ml-4 px-2 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-text-disabled italic">
              No flights added yet.
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12 bg-surface rounded-lg shadow-md">
        <p class="text-text-disabled text-lg mb-2">No staff or artists added yet.</p>
        <p v-if="isEventOwner" class="text-sm text-text-disabled">Click "+ Add Person" to get started.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Make this page client-side only to avoid SSR issues
definePageMeta({
  ssr: false
});

interface StaffMember {
  id: string;
  event_id: string;
  name: string;
  role: 'staff' | 'artist';
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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

const route = useRoute();
const eventId = route.params.id as string;

// Check if user is event owner
const { user, isAuthenticated, getCognitoSub, checkAuth } = useAuth();
const { fetchEvent } = useEvents();
const event = ref<any>(null);
const currentUserSub = ref<string | null>(null);
const isEventOwner = computed(() => {
  if (!event.value || !currentUserSub.value) {
    return false;
  }
  const result = event.value.cognito_sub === currentUserSub.value;
  return result;
});

// Load event to check ownership and staff
onMounted(async () => {
  if (process.client) {
    // Check auth first
    await checkAuth();
    
    // Get current user's cognito sub for ownership check
    if (isAuthenticated.value) {
      currentUserSub.value = await getCognitoSub();
      console.log('Loaded user sub:', currentUserSub.value);
    }
    
    try {
      const eventResponse = await fetchEvent(eventId);
      if (eventResponse.success && eventResponse.event) {
        event.value = eventResponse.event;
        
        console.log('Event ownership check:', {
          isEventOwner: isEventOwner.value,
          currentUserSub: currentUserSub.value,
          eventCognitoSub: event.value.cognito_sub,
          isAuthenticated: isAuthenticated.value,
          match: event.value.cognito_sub === currentUserSub.value
        });
        
      }
    } catch (err) {
      console.error('Error loading event:', err);
    }
    await loadStaff();
  }
});

const { fetchEventStaff, addEventStaff, updateEventStaff, deleteEventStaff } = useStaff();
const { fetchStaffFlights, addStaffFlight, deleteStaffFlight } = useFlights();

const staff = ref<StaffMember[]>([]);
const memberFlights = ref<Record<string, Flight[]>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const showAddForm = ref(false);
const adding = ref(false);
const addError = ref<string | null>(null);
const editingMember = ref<StaffMember | null>(null);
const updating = ref(false);
const updateError = ref<string | null>(null);
const showingFlightsForm = ref<string | null>(null);
const addingFlight = ref(false);
const flightError = ref<string | null>(null);

const addFormData = ref({
  name: '',
  role: 'staff' as 'staff' | 'artist',
  email: '',
  phone: '',
  notes: '',
});

const flightFormData = ref({
  flight_number: '',
  flight_type: 'departure' as 'departure' | 'return',
  departure_date: '',
});

const loadStaff = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchEventStaff(eventId);
    
    if (response.success && response.staff) {
      staff.value = response.staff;
      console.log('✅ Staff loaded:', staff.value.length, 'members');
      console.log('✅ Staff data:', staff.value);
      console.log('✅ isEventOwner:', isEventOwner.value);
      console.log('✅ isAuthenticated:', isAuthenticated.value);
      console.log('✅ currentUserSub:', currentUserSub.value);
      // Load flights for each staff member
      for (const member of staff.value) {
        await loadFlightsForMember(member.id);
      }
    } else {
      error.value = response.error || 'Failed to fetch staff';
    }
  } catch (err: any) {
    console.error('Fetch staff error:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const loadFlightsForMember = async (staffId: string) => {
  try {
    const response = await fetchStaffFlights(eventId, staffId);
    if (response.success && response.flights) {
      memberFlights.value[staffId] = response.flights;
    }
  } catch (err: any) {
    console.error('Error loading flights:', err);
    memberFlights.value[staffId] = [];
  }
};

const handleAddStaff = async () => {
  addError.value = null;
  adding.value = true;

  try {
    const staffData: any = {
      name: addFormData.value.name,
      role: addFormData.value.role,
    };

    if (addFormData.value.email) staffData.email = addFormData.value.email;
    if (addFormData.value.phone) staffData.phone = addFormData.value.phone;
    if (addFormData.value.notes) staffData.notes = addFormData.value.notes;

    const result = await addEventStaff(eventId, staffData);

    if (result.success && result.staff) {
      staff.value.push(result.staff);
      memberFlights.value[result.staff.id] = [];
      addFormData.value = {
        name: '',
        role: 'staff',
        email: '',
        phone: '',
        notes: '',
      };
      showAddForm.value = false;
    } else {
      addError.value = result.error || 'Failed to add staff member';
    }
  } catch (err: any) {
    console.error('Error adding staff:', err);
    addError.value = err.message || 'An unexpected error occurred';
  } finally {
    adding.value = false;
  }
};

const handleCardClick = (member: StaffMember) => {
  console.log('handleCardClick called', { memberId: member.id, isEventOwner: isEventOwner.value });
  
  if (!isEventOwner.value) {
    alert('You are not the event owner. Only the event owner can edit staff information.');
    return;
  }
  
  toggleEdit(member);
};

const toggleEdit = (member: StaffMember) => {
  console.log('toggleEdit called', { memberId: member.id, currentEditing: editingMember.value?.id });
  
  if (editingMember.value && editingMember.value.id === member.id) {
    // Close edit form
    editingMember.value = null;
    console.log('Edit form closed');
  } else {
    // Open edit form - Create a deep copy and ensure all fields are strings (not null)
    editingMember.value = {
      id: member.id,
      event_id: member.event_id,
      name: member.name,
      role: member.role,
      email: member.email || '',
      phone: member.phone || '',
      notes: member.notes || '',
      created_at: member.created_at,
      updated_at: member.updated_at,
    };
    console.log('Edit form opened', editingMember.value);
  }
  updateError.value = null;
};

const handleUpdateStaff = async (member: StaffMember) => {
  if (!editingMember.value) return;
  
  updateError.value = null;
  updating.value = true;

  try {
    const staffData: any = {
      name: editingMember.value.name,
      role: editingMember.value.role,
    };

    // Include fields even if empty (to clear them)
    staffData.email = editingMember.value.email || null;
    staffData.phone = editingMember.value.phone || null;
    staffData.notes = editingMember.value.notes || null;

    const result = await updateEventStaff(eventId, member.id, staffData);

    if (result.success && result.staff) {
      const index = staff.value.findIndex(s => s.id === member.id);
      if (index !== -1) {
        staff.value[index] = result.staff;
      }
      editingMember.value = null;
    } else {
      updateError.value = result.error || 'Failed to update staff member';
    }
  } catch (err: any) {
    console.error('Error updating staff:', err);
    updateError.value = err.message || 'An unexpected error occurred';
  } finally {
    updating.value = false;
  }
};

const confirmDelete = (member: StaffMember) => {
  if (confirm(`Are you sure you want to remove "${member.name}"? This will also delete all their flights.`)) {
    handleDelete(member);
  }
};

const handleDelete = async (member: StaffMember) => {
  try {
    const result = await deleteEventStaff(eventId, member.id);
    if (result.success) {
      staff.value = staff.value.filter(s => s.id !== member.id);
      delete memberFlights.value[member.id];
    } else {
      alert(result.error || 'Failed to delete staff member');
    }
  } catch (err: any) {
    console.error('Error deleting staff:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

const toggleFlightsForm = (member: StaffMember) => {
  if (showingFlightsForm.value === member.id) {
    showingFlightsForm.value = null;
    flightFormData.value = {
      flight_number: '',
      flight_type: 'departure',
      departure_date: '',
    };
  } else {
    showingFlightsForm.value = member.id;
  }
  flightError.value = null;
};

const handleAddFlight = async (member: StaffMember) => {
  flightError.value = null;
  addingFlight.value = true;

  try {
    const flightData: any = {
      flight_number: flightFormData.value.flight_number.toUpperCase().trim(),
      flight_type: flightFormData.value.flight_type,
    };

    if (flightFormData.value.departure_date) {
      flightData.departure_date = flightFormData.value.departure_date;
    }

    const result = await addStaffFlight(eventId, member.id, flightData);

    if (result.success && result.flight) {
      if (!memberFlights.value[member.id]) {
        memberFlights.value[member.id] = [];
      }
      memberFlights.value[member.id].push(result.flight);
      flightFormData.value = {
        flight_number: '',
        flight_type: 'departure',
        departure_date: '',
      };
      showingFlightsForm.value = null;
    } else {
      flightError.value = result.error || 'Failed to add flight';
    }
  } catch (err: any) {
    console.error('Error adding flight:', err);
    flightError.value = err.message || 'An unexpected error occurred';
  } finally {
    addingFlight.value = false;
  }
};

const confirmDeleteFlight = (member: StaffMember, flight: Flight) => {
  if (confirm(`Are you sure you want to remove flight ${flight.flight_number}?`)) {
    handleDeleteFlight(member, flight);
  }
};

const handleDeleteFlight = async (member: StaffMember, flight: Flight) => {
  try {
    const result = await deleteStaffFlight(eventId, member.id, flight.id);
    if (result.success) {
      if (memberFlights.value[member.id]) {
        memberFlights.value[member.id] = memberFlights.value[member.id].filter(f => f.id !== flight.id);
      }
    } else {
      alert(result.error || 'Failed to delete flight');
    }
  } catch (err: any) {
    console.error('Error deleting flight:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

</script>

