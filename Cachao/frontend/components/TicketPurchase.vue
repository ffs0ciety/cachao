<template>
  <div class="space-y-4">
    <h3 class="text-xl font-bold text-gray-800 mb-4">Purchase Tickets</h3>
    
    <div v-if="tickets.length === 0" class="text-gray-500 text-center py-8">
      No tickets available for this event.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="ticket in tickets"
        :key="ticket.id"
        class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
      >
        <div v-if="ticket.image_url" class="mb-4">
          <img
            :src="ticket.image_url"
            :alt="ticket.name"
            class="w-full h-48 object-cover rounded-md"
          />
        </div>
        <h4 class="text-lg font-semibold text-gray-800 mb-2">{{ ticket.name }}</h4>
        <div class="mb-4">
          <span class="text-2xl font-bold text-blue-600">€{{ ticket.price.toFixed(2) }}</span>
        </div>
        <div class="text-sm text-gray-600 mb-4">
          <div v-if="ticket.max_quantity">
            <span class="font-medium">Available:</span>
            {{ ticket.max_quantity - ticket.sold_quantity }} / {{ ticket.max_quantity }}
          </div>
          <div v-else>
            <span class="font-medium">Available:</span> Unlimited
          </div>
        </div>
        <button
          @click="openPurchaseModal(ticket)"
          :disabled="!ticket.is_active || (ticket.max_quantity && ticket.sold_quantity >= ticket.max_quantity)"
          :class="[
            'w-full px-4 py-2 rounded-md font-medium transition-colors',
            !ticket.is_active || (ticket.max_quantity && ticket.sold_quantity >= ticket.max_quantity)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          ]"
        >
          {{ !ticket.is_active ? 'Sold Out' : (ticket.max_quantity && ticket.sold_quantity >= ticket.max_quantity) ? 'Sold Out' : 'Purchase' }}
        </button>
      </div>
    </div>

    <!-- Purchase Modal -->
    <div v-if="selectedTicket" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closePurchaseModal">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <h3 class="text-xl font-bold text-gray-800 mb-4">Purchase {{ selectedTicket.name }}</h3>
          <form @submit.prevent="handlePurchase" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                v-model="purchaseForm.email"
                type="email"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                v-model.number="purchaseForm.quantity"
                type="number"
                min="1"
                :max="selectedTicket.max_quantity ? selectedTicket.max_quantity - selectedTicket.sold_quantity : undefined"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p class="text-xs text-gray-500 mt-1">
                Max: {{ selectedTicket.max_quantity ? selectedTicket.max_quantity - selectedTicket.sold_quantity : 'Unlimited' }}
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Discount Code (Optional)</label>
              <input
                v-model="purchaseForm.discount_code"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter discount code"
              />
            </div>
            <div class="pt-4 border-t border-gray-200">
              <div class="flex justify-between items-center mb-4">
                <span class="font-medium">Subtotal:</span>
                <span class="text-lg font-semibold">€{{ (selectedTicket.price * purchaseForm.quantity).toFixed(2) }}</span>
              </div>
              <div v-if="purchaseForm.discount_code" class="text-sm text-green-600 mb-2">
                Discount code will be applied at checkout
              </div>
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="processing"
                class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <span v-if="processing">Processing...</span>
                <span v-else>Proceed to Payment</span>
              </button>
              <button
                type="button"
                @click="closePurchaseModal"
                class="px-4 py-2 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
            <div v-if="error" class="text-red-600 text-sm mt-2">
              {{ error }}
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Ticket {
  id: string;
  event_id: string;
  name: string;
  price: number;
  image_url: string | null;
  max_quantity: number | null;
  sold_quantity: number;
  is_active: boolean;
}

const props = defineProps<{
  eventId: string;
}>();

const { fetchTickets, createTicketCheckout } = useTickets();
const { isAuthenticated, getUserEmail, checkAuth } = useAuth();

const tickets = ref<Ticket[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedTicket = ref<Ticket | null>(null);
const processing = ref(false);
const userEmail = ref<string | null>(null);

const purchaseForm = ref({
  email: '',
  quantity: 1,
  discount_code: '',
});

const loadTickets = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchTickets(props.eventId);
    if (response.success) {
      // Only show active tickets
      tickets.value = response.tickets.filter((t: Ticket) => t.is_active);
    } else {
      error.value = response.error || 'Failed to load tickets';
    }
  } catch (err: any) {
    console.error('Error loading tickets:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const openPurchaseModal = async (ticket: Ticket) => {
  selectedTicket.value = ticket;
  
  // Check authentication and pre-fill email if user is logged in
  let emailToUse = '';
  const authStatus = await checkAuth();
  if (authStatus && isAuthenticated.value) {
    try {
      const email = await getUserEmail();
      if (email) {
        userEmail.value = email;
        emailToUse = email;
        console.log('Pre-filling email:', email);
      }
    } catch (err) {
      console.error('Error getting user email:', err);
    }
  }
  
  purchaseForm.value = {
    email: emailToUse,
    quantity: 1,
    discount_code: '',
  };
  error.value = null;
};

const closePurchaseModal = () => {
  selectedTicket.value = null;
  purchaseForm.value = {
    email: '',
    quantity: 1,
    discount_code: '',
  };
  error.value = null;
};

const handlePurchase = async () => {
  if (!selectedTicket.value) return;

  try {
    processing.value = true;
    error.value = null;

    // Validate quantity
    if (selectedTicket.value.max_quantity) {
      const available = selectedTicket.value.max_quantity - selectedTicket.value.sold_quantity;
      if (purchaseForm.value.quantity > available) {
        error.value = `Only ${available} tickets available`;
        return;
      }
    }

    const result = await createTicketCheckout(
      props.eventId,
      selectedTicket.value.id,
      {
        quantity: purchaseForm.value.quantity,
        email: purchaseForm.value.email,
        discount_code: purchaseForm.value.discount_code || undefined,
      }
    );

    console.log('Checkout result:', result);

    if (result.success && result.checkout_url) {
      // Redirect to Stripe checkout
      console.log('Redirecting to Stripe checkout:', result.checkout_url);
      window.location.href = result.checkout_url;
    } else {
      console.error('Checkout failed:', result);
      const errorMessage = result.error || 'Failed to create checkout session';
      error.value = errorMessage;
      console.error('Full error details:', {
        result,
        eventId: props.eventId,
        ticketId: selectedTicket.value.id,
        formData: purchaseForm.value,
      });
    }
  } catch (err: any) {
    console.error('Error purchasing ticket:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    processing.value = false;
  }
};

onMounted(async () => {
  loadTickets();
  // Pre-load user email if authenticated
  const authStatus = await checkAuth();
  if (authStatus && isAuthenticated.value) {
    try {
      userEmail.value = await getUserEmail();
      console.log('Pre-loaded user email:', userEmail.value);
    } catch (err) {
      console.error('Error loading user email:', err);
    }
  }
});
</script>

