<template>
  <div class="bg-surface rounded-lg shadow-md p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-text-primary">Flights</h2>
      <button
        v-if="isEventOwner"
        @click="showAddForm = !showAddForm"
        class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
      >
        {{ showAddForm ? 'Cancel' : 'Add Flight' }}
      </button>
    </div>

    <!-- Add Flight Form -->
    <div v-if="showAddForm && isEventOwner" class="mb-6 p-4 bg-elevated rounded-lg border border-border-subtle">
      <h3 class="text-lg font-semibold text-text-secondary mb-4">Add New Flight</h3>
      <form @submit.prevent="handleAddFlight" class="space-y-4">
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label for="flight_number" class="block text-sm font-medium text-text-secondary mb-2">
              Flight Number <span class="text-red-500">*</span>
            </label>
            <input
              id="flight_number"
              v-model="formData.flight_number"
              type="text"
              required
              pattern="[A-Z]{2,3}\d+"
              placeholder="e.g., AA123"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p class="text-xs text-text-disabled mt-1">Format: Airline code + number (e.g., AA123, BA456)</p>
          </div>

          <div>
            <label for="flight_type" class="block text-sm font-medium text-text-secondary mb-2">
              Flight Type <span class="text-red-500">*</span>
            </label>
            <select
              id="flight_type"
              v-model="formData.flight_type"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="departure">Departure</option>
              <option value="return">Return</option>
            </select>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label for="departure_date" class="block text-sm font-medium text-text-secondary mb-2">
              Departure Date (optional)
            </label>
            <input
              id="departure_date"
              v-model="formData.departure_date"
              type="date"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label for="departure_time" class="block text-sm font-medium text-text-secondary mb-2">
              Departure Time (optional)
            </label>
            <input
              id="departure_time"
              v-model="formData.departure_time"
              type="time"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <!-- Departure Information -->
        <div class="border-t border-border-subtle pt-4">
          <h4 class="text-sm font-semibold text-text-secondary mb-3">Departure Information (optional)</h4>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label for="departure_airport_code" class="block text-sm font-medium text-text-secondary mb-2">
                Departure Airport Code
              </label>
              <input
                id="departure_airport_code"
                v-model="formData.departure_airport_code"
                type="text"
                maxlength="3"
                placeholder="e.g., JFK"
                class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                style="text-transform: uppercase;"
              />
            </div>
            <div>
              <label for="departure_city" class="block text-sm font-medium text-text-secondary mb-2">
                Departure City/Country
              </label>
              <input
                id="departure_city"
                v-model="formData.departure_city"
                type="text"
                placeholder="e.g., New York, USA"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <!-- Arrival Information -->
        <div class="border-t border-border-subtle pt-4">
          <h4 class="text-sm font-semibold text-text-secondary mb-3">Arrival Information (optional)</h4>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label for="arrival_date" class="block text-sm font-medium text-text-secondary mb-2">
                Arrival Date (optional)
              </label>
              <input
                id="arrival_date"
                v-model="formData.arrival_date"
                type="date"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label for="arrival_time" class="block text-sm font-medium text-text-secondary mb-2">
                Arrival Time (optional)
              </label>
              <input
                id="arrival_time"
                v-model="formData.arrival_time"
                type="time"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <label for="arrival_airport_code" class="block text-sm font-medium text-text-secondary mb-2">
                Arrival Airport Code
              </label>
              <input
                id="arrival_airport_code"
                v-model="formData.arrival_airport_code"
                type="text"
                maxlength="3"
                placeholder="e.g., LAX"
                class="w-full px-3 py-2 border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                style="text-transform: uppercase;"
              />
            </div>
            <div>
              <label for="arrival_city" class="block text-sm font-medium text-text-secondary mb-2">
                Arrival City/Country
              </label>
              <input
                id="arrival_city"
                v-model="formData.arrival_city"
                type="text"
                placeholder="e.g., Los Angeles, USA"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div class="flex gap-4">
          <button
            type="submit"
            :disabled="adding"
            class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ adding ? 'Adding...' : 'Add Flight' }}
          </button>
          <button
            type="button"
            @click="showAddForm = false"
            class="px-4 py-2 bg-gray-300 text-text-secondary rounded-full hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>

        <div v-if="addError" class="text-red-600 text-sm mt-2">
          {{ addError }}
        </div>
      </form>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-8 text-text-disabled">
      <p>Loading flights...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-8 text-red-500">
      <p>{{ error }}</p>
    </div>

    <!-- Flights List -->
    <div v-else-if="flights.length > 0" class="space-y-4">
      <div
        v-for="flight in flights"
        :key="flight.id"
        class="p-4 bg-elevated rounded-lg border border-border-subtle"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-lg font-semibold text-text-primary">{{ flight.flight_number }}</span>
              <span class="px-2 py-1 text-xs rounded-full"
                    :class="flight.flight_type === 'departure' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'">
                {{ flight.flight_type === 'departure' ? 'Departure' : 'Return' }}
              </span>
              <span v-if="flight.status" class="px-2 py-1 text-xs rounded-full bg-elevated text-text-primary">
                {{ flight.status }}
              </span>
            </div>

            <div v-if="flight.departure_airport_code || flight.arrival_airport_code" class="grid md:grid-cols-2 gap-4 mt-3">
              <div v-if="flight.departure_airport_code">
                <div class="text-sm font-medium text-text-secondary">Departure</div>
                <div class="text-lg font-semibold">{{ flight.departure_airport_code }}</div>
                <div v-if="flight.departure_airport_name" class="text-sm text-text-secondary">{{ flight.departure_airport_name }}</div>
                <div v-if="flight.departure_city" class="text-sm text-text-disabled">{{ flight.departure_city }}</div>
                <div v-if="flight.departure_date || flight.departure_time" class="text-sm text-text-secondary mt-1">
                  <span v-if="flight.departure_date">{{ formatDate(flight.departure_date) }}</span>
                  <span v-if="flight.departure_time"> {{ flight.departure_time }}</span>
                </div>
              </div>

              <div v-if="flight.arrival_airport_code">
                <div class="text-sm font-medium text-text-secondary">Arrival</div>
                <div class="text-lg font-semibold">{{ flight.arrival_airport_code }}</div>
                <div v-if="flight.arrival_airport_name" class="text-sm text-text-secondary">{{ flight.arrival_airport_name }}</div>
                <div v-if="flight.arrival_city" class="text-sm text-text-disabled">{{ flight.arrival_city }}</div>
                <div v-if="flight.arrival_date || flight.arrival_time" class="text-sm text-text-secondary mt-1">
                  <span v-if="flight.arrival_date">{{ formatDate(flight.arrival_date) }}</span>
                  <span v-if="flight.arrival_time"> {{ flight.arrival_time }}</span>
                </div>
              </div>
            </div>

            <div v-if="flight.aircraft_type" class="text-sm text-text-disabled mt-2">
              Aircraft: {{ flight.aircraft_type }}
            </div>
          </div>

          <button
            v-if="isEventOwner"
            @click="confirmDelete(flight)"
            class="ml-4 px-3 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors text-sm"
          >
            Remove
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-8 text-text-disabled">
      <p>No flights added yet.</p>
      <p v-if="isEventOwner" class="text-sm mt-2">Click "Add Flight" to get started.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
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

const props = defineProps<{
  eventId: string;
  staffId: string;
  isEventOwner: boolean;
}>();

const { fetchStaffFlights, addStaffFlight, updateStaffFlight, deleteStaffFlight } = useFlights();

const flights = ref<Flight[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showAddForm = ref(false);
const editingFlight = ref<Flight | null>(null);
const adding = ref(false);
const updating = ref(false);
const addError = ref<string | null>(null);

const formData = ref({
  flight_number: '',
  flight_type: 'departure' as 'departure' | 'return',
  departure_date: '',
  departure_time: '',
  departure_airport_code: '',
  departure_city: '',
  arrival_date: '',
  arrival_time: '',
  arrival_airport_code: '',
  arrival_city: '',
});

const departureFlights = computed(() => {
  return flights.value.filter(f => f.flight_type === 'departure');
});

const returnFlights = computed(() => {
  return flights.value.filter(f => f.flight_type === 'return');
});

const formatDate = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const loadFlights = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchStaffFlights(props.eventId, props.staffId);
    
    if (response.success && response.flights) {
      flights.value = response.flights;
    } else {
      error.value = response.error || 'Failed to fetch flights';
    }
  } catch (err: any) {
    console.error('Fetch flights error:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleAddFlight = async () => {
  addError.value = null;
  adding.value = true;

  try {
    const flightData: any = {
      flight_number: formData.value.flight_number.toUpperCase().trim(),
      flight_type: formData.value.flight_type,
    };

    // Add optional fields if provided
    if (formData.value.departure_date) {
      flightData.departure_date = formData.value.departure_date;
    }
    if (formData.value.departure_time) {
      flightData.departure_time = formData.value.departure_time;
    }
    if (formData.value.departure_airport_code) {
      flightData.departure_airport_code = formData.value.departure_airport_code.toUpperCase().trim();
    }
    if (formData.value.departure_city) {
      flightData.departure_city = formData.value.departure_city.trim();
    }
    if (formData.value.arrival_date) {
      flightData.arrival_date = formData.value.arrival_date;
    }
    if (formData.value.arrival_time) {
      flightData.arrival_time = formData.value.arrival_time;
    }
    if (formData.value.arrival_airport_code) {
      flightData.arrival_airport_code = formData.value.arrival_airport_code.toUpperCase().trim();
    }
    if (formData.value.arrival_city) {
      flightData.arrival_city = formData.value.arrival_city.trim();
    }

    const result = await addStaffFlight(props.eventId, props.staffId, flightData);

    if (result.success && result.flight) {
      // Add to list
      flights.value.push(result.flight);
      // Reset form
      formData.value = {
        flight_number: '',
        flight_type: 'departure',
        departure_date: '',
        departure_time: '',
        departure_airport_code: '',
        departure_city: '',
        arrival_date: '',
        arrival_time: '',
        arrival_airport_code: '',
        arrival_city: '',
      };
      showAddForm.value = false;
    } else {
      addError.value = result.error || 'Failed to add flight';
    }
  } catch (err: any) {
    console.error('Error adding flight:', err);
    addError.value = err.message || 'An unexpected error occurred';
  } finally {
    adding.value = false;
  }
};

const startEditFlight = (flight: Flight) => {
  editingFlight.value = {
    ...flight,
    departure_date: flight.departure_date ? flight.departure_date.split('T')[0] : '',
    arrival_date: flight.arrival_date ? flight.arrival_date.split('T')[0] : '',
  };
  addError.value = null;
};

const handleUpdateFlight = async (flight: Flight) => {
  if (!editingFlight.value) return;
  
  addError.value = null;
  updating.value = true;

  try {
    const flightData: any = {
      flight_number: editingFlight.value.flight_number.toUpperCase().trim(),
      flight_type: editingFlight.value.flight_type,
    };

    // Add optional fields if provided
    if (editingFlight.value.departure_date) {
      flightData.departure_date = editingFlight.value.departure_date;
    }
    if (editingFlight.value.departure_time) {
      flightData.departure_time = editingFlight.value.departure_time;
    }
    if (editingFlight.value.departure_airport_code !== undefined) {
      flightData.departure_airport_code = editingFlight.value.departure_airport_code ? editingFlight.value.departure_airport_code.toUpperCase().trim() : null;
    }
    if (editingFlight.value.departure_city !== undefined) {
      flightData.departure_city = editingFlight.value.departure_city ? editingFlight.value.departure_city.trim() : null;
    }
    if (editingFlight.value.arrival_date) {
      flightData.arrival_date = editingFlight.value.arrival_date;
    }
    if (editingFlight.value.arrival_time) {
      flightData.arrival_time = editingFlight.value.arrival_time;
    }
    if (editingFlight.value.arrival_airport_code !== undefined) {
      flightData.arrival_airport_code = editingFlight.value.arrival_airport_code ? editingFlight.value.arrival_airport_code.toUpperCase().trim() : null;
    }
    if (editingFlight.value.arrival_city !== undefined) {
      flightData.arrival_city = editingFlight.value.arrival_city ? editingFlight.value.arrival_city.trim() : null;
    }

    const result = await updateStaffFlight(props.eventId, props.staffId, flight.id, flightData);

    if (result.success && result.flight) {
      // Update in list
      const index = flights.value.findIndex(f => f.id === flight.id);
      if (index !== -1) {
        flights.value[index] = result.flight;
      }
      editingFlight.value = null;
    } else {
      addError.value = result.error || 'Failed to update flight';
    }
  } catch (err: any) {
    console.error('Error updating flight:', err);
    addError.value = err.message || 'An unexpected error occurred';
  } finally {
    updating.value = false;
  }
};

const startEditFlight = (flight: Flight) => {
  editingFlight.value = {
    ...flight,
    departure_date: flight.departure_date ? flight.departure_date.split('T')[0] : '',
    arrival_date: flight.arrival_date ? flight.arrival_date.split('T')[0] : '',
  };
  addError.value = null;
};

const handleUpdateFlight = async (flight: Flight) => {
  if (!editingFlight.value) return;
  
  addError.value = null;
  updating.value = true;

  try {
    const flightData: any = {
      flight_number: editingFlight.value.flight_number.toUpperCase().trim(),
      flight_type: editingFlight.value.flight_type,
    };

    // Add optional fields if provided
    if (editingFlight.value.departure_date) {
      flightData.departure_date = editingFlight.value.departure_date;
    }
    if (editingFlight.value.departure_time) {
      flightData.departure_time = editingFlight.value.departure_time;
    }
    if (editingFlight.value.departure_airport_code !== undefined) {
      flightData.departure_airport_code = editingFlight.value.departure_airport_code ? editingFlight.value.departure_airport_code.toUpperCase().trim() : null;
    }
    if (editingFlight.value.departure_city !== undefined) {
      flightData.departure_city = editingFlight.value.departure_city ? editingFlight.value.departure_city.trim() : null;
    }
    if (editingFlight.value.arrival_date) {
      flightData.arrival_date = editingFlight.value.arrival_date;
    }
    if (editingFlight.value.arrival_time) {
      flightData.arrival_time = editingFlight.value.arrival_time;
    }
    if (editingFlight.value.arrival_airport_code !== undefined) {
      flightData.arrival_airport_code = editingFlight.value.arrival_airport_code ? editingFlight.value.arrival_airport_code.toUpperCase().trim() : null;
    }
    if (editingFlight.value.arrival_city !== undefined) {
      flightData.arrival_city = editingFlight.value.arrival_city ? editingFlight.value.arrival_city.trim() : null;
    }

    const result = await updateStaffFlight(props.eventId, props.staffId, flight.id, flightData);

    if (result.success && result.flight) {
      // Update in list
      const index = flights.value.findIndex(f => f.id === flight.id);
      if (index !== -1) {
        flights.value[index] = result.flight;
      }
      editingFlight.value = null;
    } else {
      addError.value = result.error || 'Failed to update flight';
    }
  } catch (err: any) {
    console.error('Error updating flight:', err);
    addError.value = err.message || 'An unexpected error occurred';
  } finally {
    updating.value = false;
  }
};

const confirmDelete = (flight: Flight) => {
  if (confirm(`Are you sure you want to remove flight ${flight.flight_number}?`)) {
    handleDeleteFlight(flight);
  }
};

const handleDeleteFlight = async (flight: Flight) => {
  try {
    const result = await deleteStaffFlight(props.eventId, props.staffId, flight.id);

    if (result.success) {
      // Remove from list
      flights.value = flights.value.filter(f => f.id !== flight.id);
    } else {
      alert(result.error || 'Failed to delete flight');
    }
  } catch (err: any) {
    console.error('Error deleting flight:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

onMounted(() => {
  loadFlights();
});
</script>

