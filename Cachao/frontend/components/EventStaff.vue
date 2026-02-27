<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold text-text-primary">Team</h2>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-8">
      <div class="spinner mx-auto mb-2"></div>
      <p class="text-text-secondary">Loading staff...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="alert alert-error">
      <p class="font-bold">Error:</p>
      <p>{{ error }}</p>
    </div>

    <!-- Staff List -->
    <div v-else-if="staff.length > 0" class="space-y-2">
      <div
        v-for="member in staff"
        :key="member.id"
        class="group flex items-center justify-between p-3 bg-surface rounded-xl border border-border-subtle hover:bg-elevated transition-all"
      >
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="flex-shrink-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-info flex items-center justify-center text-white font-semibold text-sm">
              {{ member.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="font-medium text-text-primary truncate">{{ member.name }}</span>
              <span
                class="badge flex-shrink-0"
                :class="member.role === 'staff' ? 'badge-primary' : 'badge-info'"
              >
                {{ member.role === 'staff' ? 'Staff' : 'Artist' }}
              </span>
              <div v-if="member.role === 'artist' && member.subcategories && member.subcategories.length > 0" class="flex flex-wrap gap-1">
                <span
                  v-for="subcat in member.subcategories"
                  :key="subcat"
                  class="badge capitalize"
                >
                  {{ subcat }}
                </span>
              </div>
            </div>
            <div class="text-xs text-text-disabled space-y-0.5">
              <div v-if="member.email" class="flex items-center gap-1 truncate">
                <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span class="truncate">{{ member.email }}</span>
              </div>
              <div v-if="member.phone" class="flex items-center gap-1 truncate">
                <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span class="truncate">{{ member.phone }}</span>
              </div>
            </div>
            <div v-if="member.notes" class="text-xs text-text-disabled italic mt-1 line-clamp-1">
              {{ member.notes }}
            </div>
          </div>
        </div>
        <div v-if="isEventOwner" class="flex-shrink-0 ml-3">
          <button
            @click="confirmDelete(member)"
            class="p-1.5 text-text-disabled hover:text-error hover:bg-error-subtle rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            title="Remove"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-8 text-text-disabled">
      <svg class="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <p class="text-sm">No team members yet</p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface StaffMember {
  id: string;
  event_id: string;
  name: string;
  role: 'staff' | 'artist';
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_public?: boolean | null;
  created_at: string;
  updated_at: string;
}

const props = defineProps<{
  eventId: string;
  isEventOwner: boolean;
}>();

const { fetchEventStaff, deleteEventStaff } = useStaff();

const staff = ref<StaffMember[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const staffMembers = computed(() => {
  return staff.value.filter(s => s.role === 'staff');
});

const artists = computed(() => {
  return staff.value.filter(s => s.role === 'artist');
});

const loadStaff = async () => {
  try {
    loading.value = true;
    error.value = null;
    // If not event owner, only fetch public artists
    const publicOnly = !props.isEventOwner;
    const response = await fetchEventStaff(props.eventId, publicOnly);
    
    if (response.success && response.staff) {
      staff.value = response.staff;
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

const confirmDelete = (member: StaffMember) => {
  if (confirm(`Are you sure you want to remove "${member.name}"?`)) {
    handleDelete(member);
  }
};

const handleDelete = async (member: StaffMember) => {
  try {
    const result = await deleteEventStaff(props.eventId, member.id);
    if (result.success) {
      // Remove from list
      staff.value = staff.value.filter(s => s.id !== member.id);
    } else {
      alert(result.error || 'Failed to delete staff member');
    }
  } catch (err: any) {
    console.error('Error deleting staff:', err);
    alert(err.message || 'An unexpected error occurred');
  }
};

onMounted(() => {
  if (process.client) {
    loadStaff();
  }
});

// Expose refresh method for parent component
defineExpose({
  refresh: loadStaff,
});
</script>


