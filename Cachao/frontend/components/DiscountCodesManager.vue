<template>
  <div class="space-y-4">
    <!-- Add Discount Code Form -->
    <div class="bg-elevated rounded-lg p-4 border border-border-subtle">
      <h3 class="text-lg font-semibold text-text-secondary mb-4">Add New Discount Code</h3>
      <form @submit.prevent="handleAddCode" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-1">Code *</label>
            <input
              v-model="newCode.code"
              type="text"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              placeholder="e.g., SUMMER2024"
              style="text-transform: uppercase"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-1">Discount Type *</label>
            <select
              v-model="newCode.discount_type"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount ($)</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-1">Discount Value *</label>
            <input
              v-model.number="newCode.discount_value"
              type="number"
              step="0.01"
              min="0"
              :max="newCode.discount_type === 'percentage' ? 100 : undefined"
              required
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              :placeholder="newCode.discount_type === 'percentage' ? '0-100' : '0.00'"
            />
            <p class="text-xs text-text-disabled mt-1">
              {{ newCode.discount_type === 'percentage' ? 'Enter percentage (0-100)' : 'Enter fixed amount in dollars' }}
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-1">Max Uses (Optional)</label>
            <input
              v-model.number="newCode.max_uses"
              type="number"
              min="1"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Leave empty for unlimited"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-1">Valid From (Optional)</label>
            <input
              v-model="newCode.valid_from"
              type="datetime-local"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-secondary mb-1">Valid Until (Optional)</label>
            <input
              v-model="newCode.valid_until"
              type="datetime-local"
              class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          type="submit"
          :disabled="addingCode"
          class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="addingCode">Adding...</span>
          <span v-else>Add Discount Code</span>
        </button>
      </form>
    </div>

    <!-- Discount Codes List -->
    <div v-if="discountCodes.length > 0" class="space-y-3">
      <h3 class="text-lg font-semibold text-text-secondary">Existing Discount Codes</h3>
      <div
        v-for="code in discountCodes"
        :key="code.id"
        class="bg-surface border border-border-subtle rounded-lg p-4 hover:shadow-md transition-shadow"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h4 class="text-lg font-semibold text-text-primary font-mono">{{ code.code }}</h4>
              <span
                :class="[
                  'px-2 py-1 rounded text-xs font-medium',
                  code.is_active ? 'bg-green-100 text-green-800' : 'bg-elevated text-text-primary'
                ]"
              >
                {{ code.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-text-secondary">
              <div>
                <span class="font-medium">Discount:</span>
                {{ code.discount_type === 'percentage' 
                  ? `${code.discount_value}%` 
                  : `$${code.discount_value.toFixed(2)}` }}
              </div>
              <div>
                <span class="font-medium">Max Uses:</span> {{ code.max_uses || 'Unlimited' }}
              </div>
              <div>
                <span class="font-medium">Used:</span> {{ code.used_count }}
              </div>
              <div>
                <span class="font-medium">Remaining:</span>
                {{ code.max_uses ? code.max_uses - code.used_count : '∞' }}
              </div>
            </div>
            <div v-if="code.valid_from || code.valid_until" class="mt-2 text-xs text-text-disabled">
              <div v-if="code.valid_from">
                <span class="font-medium">From:</span> {{ formatDateTime(code.valid_from) }}
              </div>
              <div v-if="code.valid_until">
                <span class="font-medium">Until:</span> {{ formatDateTime(code.valid_until) }}
              </div>
            </div>
          </div>
          <div class="flex gap-2 ml-4">
            <button
              @click="editCode(code)"
              class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
            >
              Edit
            </button>
            <button
              @click="confirmDeleteCode(code)"
              class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Discount Code Modal -->
    <div v-if="editingCode" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="cancelEdit">
      <div class="bg-surface rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <h3 class="text-xl font-bold text-text-primary mb-4">Edit Discount Code</h3>
          <form @submit.prevent="handleUpdateCode" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Code *</label>
                <input
                  v-model="editingCode.code"
                  type="text"
                  required
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  style="text-transform: uppercase"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Discount Type *</label>
                <select
                  v-model="editingCode.discount_type"
                  required
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount ($)</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Discount Value *</label>
                <input
                  v-model.number="editingCode.discount_value"
                  type="number"
                  step="0.01"
                  min="0"
                  :max="editingCode.discount_type === 'percentage' ? 100 : undefined"
                  required
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Max Uses</label>
                <input
                  v-model.number="editingCode.max_uses"
                  type="number"
                  min="1"
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Valid From</label>
                <input
                  v-model="editingCode.valid_from"
                  type="datetime-local"
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Valid Until</label>
                <input
                  v-model="editingCode.valid_until"
                  type="datetime-local"
                  class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select
                v-model="editingCode.is_active"
                class="w-full px-3 py-2 border border-border-subtle rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option :value="true">Active</option>
                <option :value="false">Inactive</option>
              </select>
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                :disabled="updatingCode"
                class="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <span v-if="updatingCode">Updating...</span>
                <span v-else>Update Code</span>
              </button>
              <button
                type="button"
                @click="cancelEdit"
                class="btn btn-secondary"
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
interface DiscountCode {
  id: string;
  event_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const props = defineProps<{
  eventId: string;
}>();

const { fetchDiscountCodes, addDiscountCode, updateDiscountCode, deleteDiscountCode } = useTickets();

const discountCodes = ref<DiscountCode[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const addingCode = ref(false);
const updatingCode = ref(false);
const editingCode = ref<DiscountCode | null>(null);

const newCode = ref({
  code: '',
  discount_type: 'percentage' as 'percentage' | 'fixed',
  discount_value: 0,
  max_uses: null as number | null,
  valid_from: null as string | null,
  valid_until: null as string | null,
});

const formatDateTime = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatDateTimeLocal = (dateString: string | null): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const loadDiscountCodes = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetchDiscountCodes(props.eventId);
    if (response.success) {
      discountCodes.value = response.discount_codes;
    } else {
      error.value = response.error || 'Failed to load discount codes';
    }
  } catch (err: any) {
    console.error('Error loading discount codes:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

const handleAddCode = async () => {
  try {
    addingCode.value = true;
    error.value = null;

    const codeData = {
      code: newCode.value.code.toUpperCase(),
      discount_type: newCode.value.discount_type,
      discount_value: newCode.value.discount_value,
      max_uses: newCode.value.max_uses,
      valid_from: newCode.value.valid_from || null,
      valid_until: newCode.value.valid_until || null,
    };

    const result = await addDiscountCode(props.eventId, codeData);
    if (result.success) {
      newCode.value = {
        code: '',
        discount_type: 'percentage',
        discount_value: 0,
        max_uses: null,
        valid_from: null,
        valid_until: null,
      };
      await loadDiscountCodes();
    } else {
      error.value = result.error || 'Failed to add discount code';
    }
  } catch (err: any) {
    console.error('Error adding discount code:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    addingCode.value = false;
  }
};

const editCode = (code: DiscountCode) => {
  editingCode.value = {
    ...code,
    valid_from: code.valid_from ? formatDateTimeLocal(code.valid_from) : null,
    valid_until: code.valid_until ? formatDateTimeLocal(code.valid_until) : null,
  };
};

const cancelEdit = () => {
  editingCode.value = null;
};

const handleUpdateCode = async () => {
  if (!editingCode.value) return;

  try {
    updatingCode.value = true;
    error.value = null;

    const codeData: any = {
      code: editingCode.value.code.toUpperCase(),
      discount_type: editingCode.value.discount_type,
      discount_value: editingCode.value.discount_value,
      max_uses: editingCode.value.max_uses,
      is_active: editingCode.value.is_active,
    };

    if (editingCode.value.valid_from) {
      codeData.valid_from = editingCode.value.valid_from.replace('T', ' ') + ':00';
    } else {
      codeData.valid_from = null;
    }

    if (editingCode.value.valid_until) {
      codeData.valid_until = editingCode.value.valid_until.replace('T', ' ') + ':00';
    } else {
      codeData.valid_until = null;
    }

    const result = await updateDiscountCode(props.eventId, editingCode.value.id, codeData);
    if (result.success) {
      cancelEdit();
      await loadDiscountCodes();
    } else {
      error.value = result.error || 'Failed to update discount code';
    }
  } catch (err: any) {
    console.error('Error updating discount code:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    updatingCode.value = false;
  }
};

const confirmDeleteCode = (code: DiscountCode) => {
  if (confirm(`Are you sure you want to delete discount code "${code.code}"? This action cannot be undone.`)) {
    handleDeleteCode(code);
  }
};

const handleDeleteCode = async (code: DiscountCode) => {
  try {
    const result = await deleteDiscountCode(props.eventId, code.id);
    if (result.success) {
      await loadDiscountCodes();
    } else {
      error.value = result.error || 'Failed to delete discount code';
    }
  } catch (err: any) {
    console.error('Error deleting discount code:', err);
    error.value = err.message || 'An unexpected error occurred';
  }
};

onMounted(() => {
  loadDiscountCodes();
});
</script>


