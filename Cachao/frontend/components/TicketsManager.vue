<template>
  <div class="space-y-4">
    <!-- Add Ticket Form -->
    <div class="card">
      <h3 class="text-lg font-semibold text-text-primary mb-4">Add New Ticket</h3>
      <form @submit.prevent="handleAddTicket" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Ticket Name *</label>
            <input
              v-model="newTicket.name"
              type="text"
              required
              class="form-input"
              placeholder="e.g., General Admission"
            />
          </div>
          <div class="form-group">
            <label class="form-label">Price *</label>
            <input
              v-model.number="newTicket.price"
              type="number"
              step="0.01"
              min="0"
              required
              class="form-input"
              placeholder="0.00"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label">Max Quantity (Optional)</label>
            <input
              v-model.number="newTicket.max_quantity"
              type="number"
              min="1"
              class="form-input"
              placeholder="Leave empty for unlimited"
            />
          </div>
          <div class="form-group">
            <label class="form-label">Ticket Image (Optional)</label>
            <input
              ref="imageInput"
              type="file"
              accept="image/*"
              @change="handleImageSelect"
              class="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-subtle file:text-primary hover:file:opacity-80"
            />
            <div v-if="newTicketImagePreview" class="mt-2">
              <img :src="newTicketImagePreview" alt="Preview" class="h-24 object-cover rounded-md border border-border-subtle" />
            </div>
          </div>
        </div>
        <button
          type="submit"
          :disabled="addingTicket"
          class="btn btn-primary"
        >
          <span v-if="addingTicket">Adding...</span>
          <span v-else>Add Ticket</span>
        </button>
      </form>
    </div>

    <!-- Tickets List -->
    <div v-if="tickets.length > 0" class="space-y-3">
      <h3 class="text-lg font-semibold text-text-primary">Existing Tickets</h3>
      <div
        v-for="ticket in tickets"
        :key="ticket.id"
        class="card p-4 hover:bg-elevated transition-colors"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h4 class="text-lg font-semibold text-text-primary">{{ ticket.name }}</h4>
              <span
                :class="[
                  'badge',
                  ticket.is_active ? 'badge-success' : ''
                ]"
              >
                {{ ticket.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-text-secondary">
              <div>
                <span class="font-medium">Price:</span> ${{ ticket.price.toFixed(2) }}
              </div>
              <div>
                <span class="font-medium">Max:</span> {{ ticket.max_quantity || 'Unlimited' }}
              </div>
              <div>
                <span class="font-medium">Sold:</span> {{ ticket.sold_quantity }}
              </div>
              <div>
                <span class="font-medium">Available:</span>
                {{ ticket.max_quantity ? ticket.max_quantity - ticket.sold_quantity : '∞' }}
              </div>
            </div>
            <div v-if="ticket.image_url" class="mt-2">
              <img :src="ticket.image_url" alt="Ticket image" class="h-32 object-cover rounded-md border border-border-subtle" />
            </div>
            <!-- Ticket Discounts Section -->
            <div class="mt-4 pt-4 border-t border-border-subtle">
              <div class="flex items-center justify-between mb-2">
                <h5 class="text-sm font-semibold text-text-secondary">Date-Based Discounts</h5>
                <button
                  @click="openAddDiscountModal(ticket)"
                  class="btn btn-success btn-sm"
                >
                  + Add Discount
                </button>
              </div>
              <div v-if="ticketDiscounts[ticket.id]?.length > 0" class="space-y-2">
                <div
                  v-for="discount in ticketDiscounts[ticket.id]"
                  :key="discount.id"
                  class="flex items-center justify-between p-2 bg-elevated rounded text-sm"
                >
                  <div class="flex-1">
                    <span class="font-medium text-text-primary">
                      {{ discount.discount_type === 'percentage' ? `${discount.discount_value}%` : `$${discount.discount_value.toFixed(2)}` }}
                    </span>
                    <span class="text-text-secondary ml-2">until {{ formatDate(discount.valid_until) }}</span>
                    <span
                      :class="[
                        'ml-2 badge',
                        discount.is_active ? 'badge-success' : ''
                      ]"
                    >
                      {{ discount.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </div>
                  <div class="flex gap-1">
                    <button
                      @click="editDiscount(ticket, discount)"
                      class="btn btn-primary btn-sm"
                    >
                      Edit
                    </button>
                    <button
                      @click="confirmDeleteDiscount(ticket, discount)"
                      class="btn btn-danger btn-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
              <div v-else class="text-sm text-text-disabled italic">No discounts configured</div>
            </div>
          </div>
          <div class="flex gap-2 ml-4">
            <button
              @click="editTicket(ticket)"
              class="btn btn-primary btn-sm"
            >
              Edit
            </button>
            <button
              @click="confirmDeleteTicket(ticket)"
              class="btn btn-danger btn-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Ticket Modal -->
    <div v-if="editingTicket" class="modal-overlay" @click.self="cancelEdit">
      <div class="modal max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <h3 class="text-xl font-bold text-text-primary mb-4">Edit Ticket</h3>
          <form @submit.prevent="handleUpdateTicket" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Ticket Name *</label>
                <input
                  v-model="editingTicket.name"
                  type="text"
                  required
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Price *</label>
                <input
                  v-model.number="editingTicket.price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  class="form-input"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Max Quantity</label>
                <input
                  v-model.number="editingTicket.max_quantity"
                  type="number"
                  min="1"
                  class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  v-model="editingTicket.is_active"
                  class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option :value="true">Active</option>
                  <option :value="false">Inactive</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Ticket Image</label>
              <input
                ref="editImageInput"
                type="file"
                accept="image/*"
                @change="handleEditImageSelect"
                class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <div v-if="editingTicket.image_url || editImagePreview" class="mt-2">
                <img
                  :src="editImagePreview || editingTicket.image_url"
                  alt="Preview"
                  class="h-32 object-cover rounded-md border border-gray-300"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="updatingTicket"
                class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <span v-if="updatingTicket">Updating...</span>
                <span v-else>Update Ticket</span>
              </button>
              <button
                type="button"
                @click="cancelEdit"
                class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Add/Edit Discount Modal -->
    <div v-if="discountModalOpen" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closeDiscountModal">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <h3 class="text-xl font-bold text-gray-800 mb-4">
            {{ editingDiscount ? 'Edit Discount' : 'Add Discount' }}
          </h3>
          <form @submit.prevent="handleSaveDiscount" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Discount Type *</label>
              <select
                v-model="newDiscount.discount_type"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fixed">Fixed Amount ($)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Discount Value *
                <span class="text-xs text-gray-500">
                  ({{ newDiscount.discount_type === 'percentage' ? '0-100%' : 'Amount in $' }})
                </span>
              </label>
              <input
                v-model.number="newDiscount.discount_value"
                type="number"
                :step="newDiscount.discount_type === 'percentage' ? '1' : '0.01'"
                :min="newDiscount.discount_type === 'percentage' ? '0' : '0'"
                :max="newDiscount.discount_type === 'percentage' ? '100' : undefined"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                :placeholder="newDiscount.discount_type === 'percentage' ? 'e.g., 10' : 'e.g., 10.00'"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Valid Until *</label>
              <input
                v-model="newDiscount.valid_until"
                type="date"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="savingDiscount"
                class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <span v-if="savingDiscount">Saving...</span>
                <span v-else>{{ editingDiscount ? 'Update' : 'Add' }} Discount</span>
              </button>
              <button
                type="button"
                @click="closeDiscountModal"
                class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
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
  created_at: string;
  updated_at: string;
}

const props = defineProps<{
  eventId: string;
}>();

const {
  fetchTickets,
  addTicket,
  updateTicket,
  deleteTicket,
  generateTicketImageUploadUrl,
  fetchTicketDiscounts,
  addTicketDiscount,
  updateTicketDiscount,
  deleteTicketDiscount,
} = useTickets();

const tickets = ref<Ticket[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const addingTicket = ref(false);
const updatingTicket = ref(false);
const editingTicket = ref<Ticket | null>(null);
const editImagePreview = ref<string | null>(null);
const editImageInput = ref<HTMLInputElement | null>(null);
const newTicketImagePreview = ref<string | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);

// Ticket discounts
interface TicketDiscount {
  id: string;
  ticket_id: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  valid_until: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ticketDiscounts = ref<Record<string, TicketDiscount[]>>({});
const discountModalOpen = ref(false);
const editingDiscount = ref<{ ticket: Ticket; discount: TicketDiscount } | null>(null);
const savingDiscount = ref(false);
const currentTicketId = ref<string | null>(null);
const newDiscount = ref({
  discount_type: 'fixed' as 'percentage' | 'fixed',
  discount_value: 0,
  valid_until: '',
});

const newTicket = ref({
  name: '',
  price: 0,
  max_quantity: null as number | null,
  image_url: null as string | null,
});

const loadTickets = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchTickets(props.eventId);
    if (response.success) {
      tickets.value = response.tickets;
      // Load discounts for each ticket
      for (const ticket of tickets.value) {
        await loadTicketDiscounts(ticket.id);
      }
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

const loadTicketDiscounts = async (ticketId: string) => {
  try {
    const response = await fetchTicketDiscounts(props.eventId, ticketId);
    if (response.success) {
      ticketDiscounts.value[ticketId] = response.discounts;
    }
  } catch (err: any) {
    console.error('Error loading ticket discounts:', err);
  }
};

const handleImageSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      newTicketImagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const handleEditImageSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      editImagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const uploadTicketImage = async (file: File): Promise<string> => {
  const result = await generateTicketImageUploadUrl(props.eventId, file.name);
  if (!result.success || !result.upload_url) {
    throw new Error(result.error || 'Failed to generate upload URL');
  }

  const xhr = new XMLHttpRequest();
  return new Promise((resolve, reject) => {
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
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

const handleAddTicket = async () => {
  try {
    addingTicket.value = true;
    error.value = null;

    let imageUrl = null;
    if (imageInput.value?.files?.[0]) {
      const file = imageInput.value.files[0];
      imageUrl = await uploadTicketImage(file);
    }

    const ticketData = {
      name: newTicket.value.name,
      price: newTicket.value.price,
      max_quantity: newTicket.value.max_quantity,
      image_url: imageUrl,
    };

    const result = await addTicket(props.eventId, ticketData);
    if (result.success) {
      newTicket.value = {
        name: '',
        price: 0,
        max_quantity: null,
        image_url: null,
      };
      newTicketImagePreview.value = null;
      if (imageInput.value) {
        imageInput.value.value = '';
      }
      await loadTickets();
    } else {
      error.value = result.error || 'Failed to add ticket';
    }
  } catch (err: any) {
    console.error('Error adding ticket:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    addingTicket.value = false;
  }
};

const editTicket = (ticket: Ticket) => {
  editingTicket.value = { ...ticket };
  editImagePreview.value = null;
};

const cancelEdit = () => {
  editingTicket.value = null;
  editImagePreview.value = null;
};

const handleUpdateTicket = async () => {
  if (!editingTicket.value) return;

  try {
    updatingTicket.value = true;
    error.value = null;

    let imageUrl = editingTicket.value.image_url;
    if (editImageInput.value?.files?.[0]) {
      const file = editImageInput.value.files[0];
      imageUrl = await uploadTicketImage(file);
    }

    const ticketData: any = {
      name: editingTicket.value.name,
      price: editingTicket.value.price,
      max_quantity: editingTicket.value.max_quantity,
      is_active: editingTicket.value.is_active,
    };

    if (imageUrl !== editingTicket.value.image_url) {
      ticketData.image_url = imageUrl;
    }

    const result = await updateTicket(props.eventId, editingTicket.value.id, ticketData);
    if (result.success) {
      cancelEdit();
      await loadTickets();
    } else {
      error.value = result.error || 'Failed to update ticket';
    }
  } catch (err: any) {
    console.error('Error updating ticket:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    updatingTicket.value = false;
  }
};

const confirmDeleteTicket = (ticket: Ticket) => {
  if (confirm(`Are you sure you want to delete "${ticket.name}"? This action cannot be undone.`)) {
    handleDeleteTicket(ticket);
  }
};

const handleDeleteTicket = async (ticket: Ticket) => {
  try {
    const result = await deleteTicket(props.eventId, ticket.id);
    if (result.success) {
      await loadTickets();
    } else {
      error.value = result.error || 'Failed to delete ticket';
    }
  } catch (err: any) {
    console.error('Error deleting ticket:', err);
    error.value = err.message || 'An unexpected error occurred';
  }
};

const openAddDiscountModal = (ticket: Ticket) => {
  editingDiscount.value = null;
  currentTicketId.value = ticket.id;
  newDiscount.value = {
    discount_type: 'fixed',
    discount_value: 0,
    valid_until: '',
  };
  discountModalOpen.value = true;
};

const editDiscount = (ticket: Ticket, discount: TicketDiscount) => {
  editingDiscount.value = { ticket, discount };
  newDiscount.value = {
    discount_type: discount.discount_type,
    discount_value: discount.discount_value,
    valid_until: discount.valid_until.split('T')[0], // Extract date part
  };
  discountModalOpen.value = true;
};

const closeDiscountModal = () => {
  discountModalOpen.value = false;
  editingDiscount.value = null;
  currentTicketId.value = null;
  newDiscount.value = {
    discount_type: 'fixed',
    discount_value: 0,
    valid_until: '',
  };
};

const handleSaveDiscount = async () => {
  if (!newDiscount.value.valid_until || newDiscount.value.discount_value <= 0) {
    error.value = 'Please fill in all required fields';
    return;
  }

  try {
    savingDiscount.value = true;
    error.value = null;

    const ticketId = editingDiscount.value?.ticket.id || currentTicketId.value;
    if (!ticketId) {
      error.value = 'Ticket ID is missing';
      return;
    }

    if (editingDiscount.value) {
      // Update existing discount
      const result = await updateTicketDiscount(
        props.eventId,
        ticketId,
        editingDiscount.value.discount.id,
        {
          discount_type: newDiscount.value.discount_type,
          discount_value: newDiscount.value.discount_value,
          valid_until: newDiscount.value.valid_until,
        }
      );
      if (result.success) {
        await loadTicketDiscounts(ticketId);
        closeDiscountModal();
      } else {
        error.value = result.error || 'Failed to update discount';
      }
    } else {
      // Add new discount
      const result = await addTicketDiscount(props.eventId, ticketId, {
        discount_type: newDiscount.value.discount_type,
        discount_value: newDiscount.value.discount_value,
        valid_until: newDiscount.value.valid_until,
      });
      if (result.success) {
        await loadTicketDiscounts(ticketId);
        closeDiscountModal();
      } else {
        error.value = result.error || 'Failed to add discount';
      }
    }
  } catch (err: any) {
    console.error('Error saving discount:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    savingDiscount.value = false;
  }
};

const confirmDeleteDiscount = (ticket: Ticket, discount: TicketDiscount) => {
  if (confirm(`Are you sure you want to delete this discount?`)) {
    handleDeleteDiscount(ticket, discount);
  }
};

const handleDeleteDiscount = async (ticket: Ticket, discount: TicketDiscount) => {
  try {
    const result = await deleteTicketDiscount(props.eventId, ticket.id, discount.id);
    if (result.success) {
      await loadTicketDiscounts(ticket.id);
    } else {
      error.value = result.error || 'Failed to delete discount';
    }
  } catch (err: any) {
    console.error('Error deleting discount:', err);
    error.value = err.message || 'An unexpected error occurred';
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

onMounted(() => {
  loadTickets();
});
</script>

