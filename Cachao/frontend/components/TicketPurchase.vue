<template>
  <div class="space-y-4">
    <h3 class="text-xl font-bold text-text-primary mb-4">Purchase Tickets</h3>
    
    <div v-if="tickets.length === 0" class="text-text-secondary text-center py-8">
      No tickets available for this event.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="ticket in tickets"
        :key="ticket.id"
        class="card p-6 hover:bg-elevated transition-colors"
      >
        <div v-if="ticket.image_url" class="mb-4">
          <img
            :src="ticket.image_url"
            :alt="ticket.name"
            class="w-full h-48 object-cover rounded-md"
          />
        </div>
        <h4 class="text-lg font-semibold text-text-primary mb-2">{{ ticket.name }}</h4>
        <div class="mb-4">
          <span class="text-2xl font-bold text-primary">€{{ ticket.price.toFixed(2) }}</span>
        </div>
        <div class="text-sm text-text-secondary mb-4">
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
            'btn w-full',
            !ticket.is_active || (ticket.max_quantity && ticket.sold_quantity >= ticket.max_quantity)
              ? 'btn-secondary opacity-50 cursor-not-allowed'
              : 'btn-primary'
          ]"
        >
          {{ !ticket.is_active ? 'Sold Out' : (ticket.max_quantity && ticket.sold_quantity >= ticket.max_quantity) ? 'Sold Out' : 'Purchase' }}
        </button>
      </div>
    </div>

    <!-- Purchase Modal -->
    <div v-if="selectedTicket" class="modal-overlay" @click.self="closePurchaseModal">
      <div class="modal max-w-md max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <h3 class="text-xl font-bold text-text-primary mb-4">Purchase {{ selectedTicket.name }}</h3>
          <form @submit.prevent="handlePurchase" class="space-y-4">
            <div class="form-group">
              <label class="form-label">Email *</label>
              <input
                v-model="purchaseForm.email"
                type="email"
                required
                class="form-input"
                placeholder="your@email.com"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Quantity *</label>
              <input
                v-model.number="purchaseForm.quantity"
                type="number"
                min="1"
                :max="selectedTicket.max_quantity ? selectedTicket.max_quantity - selectedTicket.sold_quantity : undefined"
                required
                class="form-input"
              />
              <p class="form-help">
                Max: {{ selectedTicket.max_quantity ? selectedTicket.max_quantity - selectedTicket.sold_quantity : 'Unlimited' }}
              </p>
            </div>
            <div class="form-group">
              <label class="form-label">Discount Code (Optional)</label>
              <input
                v-model="purchaseForm.discount_code"
                type="text"
                class="form-input"
                placeholder="Enter discount code"
              />
            </div>
            <div class="pt-4 border-t border-border-subtle">
              <div class="flex justify-between items-center mb-4">
                <span class="font-medium text-text-primary">Subtotal:</span>
                <span class="text-lg font-semibold text-text-primary">€{{ (selectedTicket.price * purchaseForm.quantity).toFixed(2) }}</span>
              </div>
              <div v-if="purchaseForm.discount_code" class="text-sm text-success mb-2">
                Discount code will be applied at checkout
              </div>
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="processing"
                class="btn btn-primary flex-1"
              >
                <span v-if="processing">Processing...</span>
                <span v-else>Proceed to Payment</span>
              </button>
              <button
                type="button"
                @click="closePurchaseModal"
                class="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
            <div v-if="error" class="text-error text-sm mt-2">
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

