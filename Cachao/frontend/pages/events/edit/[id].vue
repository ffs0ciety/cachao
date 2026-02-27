<template>
  <div class="min-h-screen bg-surface py-12" :key="`edit-${eventId}`">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Back + Event name -->
      <div class="mb-8">
        <NuxtLink
          :to="`/events/${eventId}`"
          class="inline-flex items-center text-text-secondary hover:text-text-primary transition-colors text-sm font-medium mb-2"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Event
        </NuxtLink>
        <h1 v-if="event" class="text-2xl font-semibold text-text-primary">{{ event.name }}</h1>
        <p class="text-text-secondary text-sm mt-1">Manage event details, tickets, discount codes, validation, and team</p>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="text-center py-16">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-border-subtle border-t-primary"></div>
        <p class="mt-4 text-text-disabled">Loading event...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="alert alert-error mb-6">
        <p class="font-medium">{{ error }}</p>
      </div>

      <!-- Tab navigation (inside event management) -->
      <div v-else-if="event" class="border-b border-border-subtle mb-8">
        <nav class="flex space-x-8 overflow-x-auto" aria-label="Event management tabs">
          <button
            @click="activeModule = 'details'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
              activeModule === 'details'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-disabled hover:text-text-secondary hover:border-border-subtle'
            ]"
          >
            Details
          </button>
          <button
            @click="activeModule = 'tickets'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
              activeModule === 'tickets'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-disabled hover:text-text-secondary hover:border-border-subtle'
            ]"
          >
            Tickets
          </button>
          <button
            @click="activeModule = 'discount-codes'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
              activeModule === 'discount-codes'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-disabled hover:text-text-secondary hover:border-border-subtle'
            ]"
          >
            Discount codes
          </button>
          <button
            @click="activeModule = 'validate'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
              activeModule === 'validate'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-disabled hover:text-text-secondary hover:border-border-subtle'
            ]"
          >
            Validate
          </button>
          <button
            @click="activeModule = 'team'"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
              activeModule === 'team'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-disabled hover:text-text-secondary hover:border-border-subtle'
            ]"
          >
            Team
          </button>
        </nav>
      </div>

      <!-- Module: Details -->
      <div v-if="event && activeModule === 'details'" class="bg-surface rounded-2xl border border-border-subtle p-6 sm:p-8">
        <h2 class="text-xl font-semibold text-text-primary mb-6">Event details</h2>

        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- Event Name -->
          <div>
            <label for="name" class="block text-sm font-medium text-text-secondary mb-2">
              Event Name <span class="text-red-500">*</span>
            </label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter event name"
            />
          </div>

          <!-- Description -->
          <div>
            <label for="description" class="block text-sm font-medium text-text-secondary mb-2">
              Description
            </label>
            <textarea
              id="description"
              v-model="formData.description"
              rows="4"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter event description"
            ></textarea>
          </div>

          <!-- Image Upload -->
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Event Image (Optional)
            </label>
            <div v-if="!imagePreview && !selectedImageFile && !event.image_url" class="space-y-2">
              <input
                ref="imageInput"
                type="file"
                accept="image/*"
                @change="handleImageSelect"
                class="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-subtle file:text-primary hover:file:opacity-80"
              />
              <p class="text-xs text-text-disabled">Select an image for the event</p>
            </div>
            
            <!-- Current Image -->
            <div v-if="event.image_url && !imagePreview && !selectedImageFile" class="space-y-2 mb-2">
              <div class="relative inline-block">
                <img
                  :src="event.image_url"
                  alt="Current event image"
                  class="max-w-full h-64 object-contain border border-border-subtle rounded-md"
                />
              </div>
              <button
                type="button"
                @click="removeImage"
                class="px-3 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors text-sm"
              >
                Remove Image
              </button>
            </div>

            <!-- New Image Preview -->
            <div v-if="imagePreview && !imageUrl" class="space-y-2">
              <div class="relative inline-block">
                <img
                  :src="imagePreview"
                  alt="Event image preview"
                  class="max-w-full h-64 object-contain border border-border-subtle rounded-md"
                />
                <button
                  type="button"
                  @click="removeImage"
                  class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Image Uploaded Successfully -->
            <div v-if="imageUrl" class="space-y-2">
              <div class="relative inline-block">
                <img
                  :src="imagePreview || imageUrl"
                  alt="Event image"
                  class="max-w-full h-64 object-contain border border-border-subtle rounded-md"
                />
              </div>
              <p class="text-xs text-success">✓ Image uploaded successfully</p>
            </div>
          </div>

          <!-- Start Date -->
          <div>
            <label for="start_date" class="block text-sm font-medium text-text-secondary mb-2">
              Start Date <span class="text-red-500">*</span>
            </label>
            <input
              id="start_date"
              v-model="formData.start_date"
              type="datetime-local"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <!-- End Date -->
          <div>
            <label for="end_date" class="block text-sm font-medium text-text-secondary mb-2">
              End Date (Optional)
            </label>
            <input
              id="end_date"
              v-model="formData.end_date"
              type="datetime-local"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <!-- Upload Progress (shown during image upload and event update) -->
          <div v-if="submitting || uploadingImage" class="space-y-3 bg-info-subtle border border-info/25 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-info">
                <span v-if="uploadingImage">Uploading image...</span>
                <span v-else-if="submitting">Updating event...</span>
              </p>
              <span class="text-sm text-info">{{ Math.round(uploadProgress) }}%</span>
            </div>
            <div class="w-full bg-elevated rounded-full h-2.5">
              <div
                class="bg-info h-2.5 rounded-full transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              ></div>
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="submitError && !submitting && !uploadingImage" class="alert alert-error">
            <p class="font-bold">Error:</p>
            <p>{{ submitError }}</p>
          </div>

          <!-- Success Message -->
          <div v-if="success" class="alert alert-success">
            <p class="font-bold">Success!</p>
            <p>Event updated successfully.</p>
          </div>

          <!-- Submit Buttons -->
          <div class="flex flex-wrap gap-3">
            <button
              type="submit"
              :disabled="submitting || uploadingImage"
              class="px-5 py-2.5 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span v-if="submitting || uploadingImage">Updating...</span>
              <span v-else>Update event</span>
            </button>
            <NuxtLink
              :to="`/events/${eventId}`"
              class="px-4 py-2.5 bg-elevated text-text-secondary rounded-full text-sm font-medium hover:bg-hover transition-colors"
            >
              Cancel
            </NuxtLink>
            <button
              type="button"
              @click="confirmDelete"
              class="px-4 py-2.5 bg-error-subtle text-error rounded-full text-sm font-medium hover:bg-error/20 transition-colors"
            >
              Delete event
            </button>
          </div>
        </form>
      </div>

      <!-- Module: Tickets -->
      <div v-if="event && activeModule === 'tickets'" class="bg-surface rounded-2xl border border-border-subtle p-6 sm:p-8">
        <h2 class="text-xl font-semibold text-text-primary mb-6">Tickets</h2>
        <TicketsManager :event-id="eventId" />
      </div>

      <!-- Module: Discount codes -->
      <div v-if="event && activeModule === 'discount-codes'" class="bg-surface rounded-2xl border border-border-subtle p-6 sm:p-8">
        <h2 class="text-xl font-semibold text-text-primary mb-6">Discount codes</h2>
        <DiscountCodesManager :event-id="eventId" />
      </div>

      <!-- Module: Validate tickets -->
      <div v-if="event && activeModule === 'validate'" class="bg-surface rounded-2xl border border-border-subtle p-6 sm:p-8">
        <h2 class="text-xl font-semibold text-text-primary mb-6">Validate tickets</h2>
        <div class="space-y-4">
          <!-- Search and filters -->
          <div class="flex flex-wrap gap-3 items-end">
            <div class="flex-1 min-w-[200px]">
              <label for="validate-search" class="block text-sm font-medium text-text-secondary mb-1">Search</label>
              <input
                id="validate-search"
                v-model="validateSearch"
                type="text"
                placeholder="Email or order ID..."
                class="w-full px-3 py-2 border border-border-subtle rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                @keydown.enter.prevent="loadTicketOrders(1)"
              />
            </div>
            <div class="flex flex-wrap gap-2 items-center">
              <span class="text-sm font-medium text-text-secondary">Show:</span>
              <button
                type="button"
                @click="showUnpaid = !showUnpaid; loadTicketOrders(1)"
                :class="[
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  showUnpaid ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-elevated text-text-secondary hover:bg-hover'
                ]"
              >
                Unpaid
              </button>
              <button
                type="button"
                @click="showValidated = !showValidated; loadTicketOrders(1)"
                :class="[
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  showValidated ? 'bg-success-subtle text-success hover:bg-success/20' : 'bg-elevated text-text-secondary hover:bg-hover'
                ]"
              >
                Validated
              </button>
            </div>
            <button
              type="button"
              @click="loadTicketOrders(1)"
              class="px-4 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors"
            >
              Apply
            </button>
          </div>
          <!-- Table -->
          <div class="border border-border-subtle rounded-2xl overflow-hidden">
            <div v-if="validateOrdersLoading" class="p-8 text-center text-text-disabled">
              Loading orders...
            </div>
            <div v-else-if="validateOrdersError" class="p-4 bg-error-subtle text-error rounded-2xl">
              {{ validateOrdersError }}
            </div>
            <div v-else-if="!validateOrders.length" class="p-8 text-center text-text-disabled">
              No ticket orders found.
            </div>
            <div v-else class="w-full min-w-0">
              <table class="w-full table-fixed divide-y divide-gray-200">
                <thead class="bg-elevated">
                  <tr>
                    <th scope="col" class="w-14 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">QR</th>
                    <th scope="col" class="w-16 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">Order</th>
                    <th scope="col" class="w-[16%] min-w-0 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">Email</th>
                    <th scope="col" class="w-[16%] min-w-0 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">Ticket</th>
                    <th scope="col" class="w-12 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">Qty</th>
                    <th scope="col" class="w-16 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">Total</th>
                    <th scope="col" class="w-16 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">Status</th>
                    <th scope="col" class="w-16 px-2 py-2 text-left text-xs font-medium text-text-disabled uppercase tracking-wider">Validated</th>
                    <th scope="col" class="w-28 px-2 py-2 text-right text-xs font-medium text-text-disabled uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-surface divide-y divide-gray-200">
                  <tr v-for="order in validateOrders" :key="order.id" class="hover:bg-elevated">
                    <td class="px-2 py-2 align-middle">
                      <ClientOnly>
                        <TicketValidateQr
                          :event-id="eventId"
                          :order-id="String(order.id)"
                          :size="52"
                        />
                        <template #fallback>
                          <div class="w-[52px] h-[52px] bg-elevated rounded flex items-center justify-center text-text-disabled text-[10px]">QR</div>
                        </template>
                      </ClientOnly>
                    </td>
                    <td class="px-2 py-2 text-sm text-text-primary truncate" :title="String(order.id)">{{ order.id }}</td>
                    <td class="px-2 py-2 text-sm text-text-secondary min-w-0 truncate" :title="order.email || ''">{{ order.email || '—' }}</td>
                    <td class="px-2 py-2 text-sm text-text-secondary min-w-0 truncate" :title="order.ticket_name || ''">{{ order.ticket_name || '—' }}</td>
                    <td class="px-2 py-2 text-sm text-text-secondary">{{ order.quantity }}</td>
                    <td class="px-2 py-2 text-sm text-text-secondary">€{{ formatAmount(order.total_amount) }}</td>
                    <td class="px-2 py-2">
                      <span
                        :class="[
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
                          order.status === 'paid' ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'
                        ]"
                      >
                        {{ order.status }}
                      </span>
                    </td>
                    <td class="px-2 py-2 text-sm text-text-secondary">
                      <span v-if="order.validated_at" class="text-success">Yes</span>
                      <span v-else class="text-text-disabled">No</span>
                    </td>
                    <td class="px-2 py-2 text-right">
                      <template v-if="order.status === 'paid'">
                        <button
                          v-if="order.validated_at"
                          type="button"
                          @click="toggleValidated(order, false)"
                          :disabled="validateTogglingId === order.id"
                          class="px-2 py-1 text-amber-700 bg-amber-50 rounded-full text-xs font-medium hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
                        >
                          {{ validateTogglingId === order.id ? '…' : 'Unvalidate' }}
                        </button>
                        <button
                          v-else
                          type="button"
                          @click="toggleValidated(order, true)"
                          :disabled="validateTogglingId === order.id"
                          class="px-2 py-1 text-white bg-primary rounded-full text-xs font-medium hover:bg-primary-600 disabled:opacity-50 whitespace-nowrap"
                        >
                          {{ validateTogglingId === order.id ? '…' : 'Validate' }}
                        </button>
                      </template>
                      <span v-else class="text-xs text-text-disabled" title="Only paid orders can be validated">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <!-- Pagination -->
          <div v-if="validateTotalPages > 1" class="flex items-center justify-between">
            <p class="text-sm text-text-secondary">
              Page {{ validatePage }} of {{ validateTotalPages }} ({{ validateTotal }} orders)
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                :disabled="validatePage <= 1 || validateOrdersLoading"
                @click="loadTicketOrders(validatePage - 1)"
                class="px-3 py-1.5 border border-border-subtle rounded-full text-sm font-medium text-text-secondary hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                :disabled="validatePage >= validateTotalPages || validateOrdersLoading"
                @click="loadTicketOrders(validatePage + 1)"
                class="px-3 py-1.5 border border-border-subtle rounded-full text-sm font-medium text-text-secondary hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Module: Team -->
      <div v-if="event && activeModule === 'team'" class="bg-surface rounded-2xl border border-border-subtle p-6 sm:p-8">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-text-primary">Team</h2>
          <NuxtLink
            :to="`/events/staff/${eventId}`"
            class="inline-flex items-center px-4 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            Full team management
          </NuxtLink>
        </div>
        <EventStaff :event-id="eventId" :is-event-owner="isEventOwner" />
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
  cognito_sub: string | null;
  created_at: string;
  updated_at: string;
}

const route = useRoute();
const router = useRouter();
const eventId = route.params.id as string;

// Debug: Log route info
if (process.client) {
  console.log('Edit page route:', route.path, route.params);
}

const { fetchEvent, updateEvent, deleteEvent, generateImageUploadUrl } = useEvents();
const { isAuthenticated, checkAuth, getCognitoSub } = useAuth();
const { fetchEventTicketOrders, markTicketOrderValidated } = useTickets();

const event = ref<Event | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const currentUserSub = ref<string | null>(null);
const activeModule = ref<'details' | 'tickets' | 'discount-codes' | 'validate' | 'team'>('details');

// Check if current user is the event owner
const isEventOwner = computed(() => {
  if (!event.value || !currentUserSub.value) {
    return false;
  }
  // Strict check: event must have cognito_sub and it must match exactly
  if (!event.value.cognito_sub) {
    return false;
  }
  return event.value.cognito_sub === currentUserSub.value;
});

const imageInput = ref<HTMLInputElement | null>(null);
const formData = ref({
  name: '',
  description: '',
  start_date: '',
  end_date: '',
  image_url: '',
});

const imagePreview = ref<string | null>(null);
const selectedImageFile = ref<File | null>(null);
const imageUrl = ref<string | null>(null);
const uploadingImage = ref(false);
const uploadProgress = ref(0);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const success = ref(false);

// Validate tab state (default: paid only, not validated)
const validateSearch = ref('');
const showUnpaid = ref(false);
const showValidated = ref(false);
const validateOrders = ref<any[]>([]);
const validateOrdersLoading = ref(false);
const validateOrdersError = ref<string | null>(null);
const validatePage = ref(1);
const validateTotal = ref(0);
const validateTotalPages = ref(1);
const validateTogglingId = ref<string | null>(null);

const formatAmount = (amount: number | string | null | undefined): string => {
  if (amount == null) return '0.00';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Number.isNaN(n) ? '0.00' : n.toFixed(2);
};

const loadTicketOrders = async (page: number = 1) => {
  if (!eventId) return;
  validateOrdersLoading.value = true;
  validateOrdersError.value = null;
  try {
    const res = await fetchEventTicketOrders(eventId, {
      page,
      limit: 20,
      search: validateSearch.value.trim() || undefined,
      status: showUnpaid.value ? undefined : 'paid',
      validated: showValidated.value ? undefined : 'no',
    });
    if (res.success && res.orders != null) {
      validateOrders.value = res.orders;
      validatePage.value = res.page ?? page;
      validateTotal.value = res.total ?? 0;
      validateTotalPages.value = res.totalPages ?? 1;
    } else {
      validateOrdersError.value = res.error ?? 'Failed to load orders';
      validateOrders.value = [];
    }
  } catch (e: any) {
    validateOrdersError.value = e.message ?? 'Failed to load orders';
    validateOrders.value = [];
  } finally {
    validateOrdersLoading.value = false;
  }
};

const { success: notifySuccess, info: notifyInfo, error: notifyError } = useNotifications();

const toggleValidated = async (order: any, validated: boolean) => {
  if (!eventId || !order?.id) return;
  validateTogglingId.value = order.id;
  try {
    const res = await markTicketOrderValidated(eventId, String(order.id), validated);
    if (res.success) {
      const idx = validateOrders.value.findIndex((o) => String(o.id) === String(order.id));
      if (idx >= 0) {
        validateOrders.value[idx] = {
          ...validateOrders.value[idx],
          validated_at: validated ? new Date().toISOString() : null,
        };
      }
      if (validated) {
        notifySuccess('Ticket validated');
      } else {
        notifyInfo('Ticket unvalidated');
      }
    } else {
      validateOrdersError.value = res.error ?? 'Failed to update';
      notifyError(res.error ?? 'Failed to update');
    }
  } catch (e: any) {
    validateOrdersError.value = e.message ?? 'Failed to update';
    notifyError(e.message ?? 'Failed to update');
  } finally {
    validateTogglingId.value = null;
  }
};

const formatDateTimeLocal = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const loadEvent = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchEvent(eventId);
    
    if (response.success && response.event) {
      event.value = response.event;
      
      // Check ownership after loading event
      if (currentUserSub.value) {
        if (!event.value.cognito_sub || event.value.cognito_sub !== currentUserSub.value) {
          // User is not the owner, redirect to event page
          await navigateTo(`/events/${eventId}`);
          return;
        }
      }
      
      formData.value = {
        name: response.event.name,
        description: response.event.description || '',
        start_date: formatDateTimeLocal(response.event.start_date),
        end_date: response.event.end_date ? formatDateTimeLocal(response.event.end_date) : '',
        image_url: response.event.image_url || '',
      };
    } else {
      error.value = response.error || 'Failed to fetch event';
    }
  } catch (err: any) {
    console.error('Fetch error:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleImageSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    selectedImageFile.value = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const removeImage = () => {
  imagePreview.value = null;
  selectedImageFile.value = null;
  imageUrl.value = null;
  formData.value.image_url = '';
  if (imageInput.value) {
    imageInput.value.value = '';
  }
};

const uploadImage = async (file: File): Promise<string> => {
  const result = await generateImageUploadUrl(file.name, file.size, file.type);
  if (!result.success || !result.upload_url) {
    throw new Error(result.error || 'Failed to generate upload URL');
  }

  uploadProgress.value = 10;

  const xhr = new XMLHttpRequest();
  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 40; // Image upload is 40% of total progress
        uploadProgress.value = 10 + percentComplete;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        uploadProgress.value = 50;
        const s3Url = result.s3_url;
        if (!s3Url) {
          reject(new Error('S3 URL not returned'));
          return;
        }
        resolve(s3Url);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.open('PUT', result.upload_url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
};

const handleSubmit = async () => {
  if (!isAuthenticated.value) {
    submitError.value = 'Please sign in to update events';
    return;
  }

  submitError.value = null;
  success.value = false;
  uploadProgress.value = 0;

  try {
    // Step 1: Upload image if one is selected
    if (selectedImageFile.value && !imageUrl.value) {
      uploadingImage.value = true;
      uploadProgress.value = 5;
      
      try {
        const uploadedUrl = await uploadImage(selectedImageFile.value);
        imageUrl.value = uploadedUrl;
        formData.value.image_url = uploadedUrl;
      } catch (err: any) {
        submitError.value = err.message || 'Failed to upload image';
        uploadingImage.value = false;
        return;
      }
      
      uploadingImage.value = false;
    } else {
      uploadProgress.value = 50;
    }

    // Step 2: Update the event
    submitting.value = true;
    uploadProgress.value = 60;

    // Convert datetime-local format to MySQL DATETIME format
    const formatDateTime = (dateTimeString: string): string => {
      if (!dateTimeString) return '';
      let formatted = dateTimeString.replace('T', ' ');
      if (formatted.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
        formatted += ':00';
      }
      return formatted;
    };

    uploadProgress.value = 80;

    const updateData: any = {
      name: formData.value.name,
    };

    if (formData.value.description !== undefined) {
      updateData.description = formData.value.description || null;
    }
    if (formData.value.start_date) {
      updateData.start_date = formatDateTime(formData.value.start_date);
    }
    if (formData.value.end_date) {
      updateData.end_date = formatDateTime(formData.value.end_date);
    } else if (formData.value.end_date === '') {
      updateData.end_date = null;
    }
    if (formData.value.image_url !== undefined) {
      updateData.image_url = formData.value.image_url || null;
    }

    const result = await updateEvent(eventId, updateData);

    uploadProgress.value = 100;

    if (result.success && result.event) {
      success.value = true;
      // Redirect to event page after 1.5 seconds
      setTimeout(() => {
        router.push(`/events/${eventId}`);
      }, 1500);
    } else {
      submitError.value = result.error || 'Failed to update event';
    }
  } catch (err: any) {
    console.error('Error updating event:', err);
    submitError.value = err.message || 'An unexpected error occurred';
  } finally {
    submitting.value = false;
    uploadingImage.value = false;
  }
};

const confirmDelete = () => {
  if (confirm(`Are you sure you want to delete "${event?.name}"? This action cannot be undone.`)) {
    handleDelete();
  }
};

const handleDelete = async () => {
  try {
    const result = await deleteEvent(eventId);
    if (result.success) {
      // Redirect to home page
      router.push('/');
    } else {
      submitError.value = result.error || 'Failed to delete event';
    }
  } catch (err: any) {
    console.error('Error deleting event:', err);
    submitError.value = err.message || 'An unexpected error occurred';
  }
};

watch(activeModule, (module) => {
  if (module === 'validate' && eventId) {
    loadTicketOrders(1);
  }
});

onMounted(async () => {
  if (process.client) {
    await checkAuth();
    if (!isAuthenticated.value) {
      error.value = 'Please sign in to edit events';
      await navigateTo(`/events/${eventId}`);
      return;
    }
    
    // Get current user's cognito sub for ownership check
    currentUserSub.value = await getCognitoSub();
    console.log('Edit page - Current user sub:', currentUserSub.value);
    
    await loadEvent();
    
    // Double-check ownership after loading
    if (event.value) {
      console.log('Edit page - Ownership check:', {
        eventCognitoSub: event.value.cognito_sub,
        currentUserSub: currentUserSub.value,
        isEventOwner: isEventOwner.value
      });

      if (!isEventOwner.value) {
        console.log('User is not event owner, redirecting to event page');
        await navigateTo(`/events/${eventId}`);
        return;
      }

      const query = route.query;
      if (query.module === 'validate') {
        activeModule.value = 'validate';
      }
      if (query.validated === '1') {
        const { success: notifySuccess } = useNotifications();
        notifySuccess('Ticket validated');
        if (window.history.replaceState) {
          window.history.replaceState(
            {},
            '',
            `${route.path}${query.module === 'validate' ? '?module=validate' : ''}`
          );
        }
      }
    }
  }
});
</script>

