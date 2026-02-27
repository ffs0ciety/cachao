<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading" class="text-center py-8">
      <p class="text-text-secondary">Loading artists...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="alert alert-error">
      <p class="font-bold">Error:</p>
      <p>{{ error }}</p>
    </div>

    <!-- Artists List -->
    <div v-else-if="filteredArtists.length > 0" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="artist in filteredArtists"
        :key="artist.id"
        :to="`/artists/${artist.id}`"
        class="bg-elevated rounded-lg p-4 border border-border-subtle hover:shadow-md transition-shadow block"
      >
        <div class="flex items-start gap-4">
          <!-- Avatar -->
          <div class="flex-shrink-0">
            <img
              v-if="artist.image_url"
              :src="artist.image_url"
              :alt="artist.name"
              class="w-16 h-16 rounded-full object-cover border-2 border-border-subtle"
            />
            <div
              v-else
              class="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white font-semibold text-xl border-2 border-border-subtle"
            >
              {{ artist.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          
          <!-- Artist Info -->
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-text-primary mb-1 hover:text-blue-600">{{ artist.name }}</h3>
            <div v-if="artist.subcategories && artist.subcategories.length > 0" class="flex flex-wrap gap-1 mb-2">
              <span
                v-for="subcat in artist.subcategories"
                :key="subcat"
                class="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 capitalize"
              >
                {{ subcat }}
              </span>
            </div>
            <div v-if="artist.notes" class="text-sm text-text-secondary line-clamp-2">
              {{ artist.notes }}
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12 text-text-disabled">
      <svg class="w-16 h-16 mx-auto mb-3 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <p class="text-sm">No artists found</p>
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
  image_url: string | null;
  is_public?: boolean | null;
  subcategories?: string[] | null;
  created_at: string;
  updated_at: string;
}

const props = defineProps<{
  eventId: string;
  category: 'all' | 'dj' | 'media' | 'teachers' | 'performers' | 'other';
}>();

const { fetchEventStaff } = useStaff();

const staff = ref<StaffMember[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const filteredArtists = computed(() => {
  // Filter to only public artists
  const publicArtists = staff.value.filter(s => s.role === 'artist' && s.is_public === true);
  
  if (props.category === 'all') {
    return publicArtists;
  }
  
  if (props.category === 'dj') {
    return publicArtists.filter(a => a.subcategories?.includes('dj'));
  }
  
  if (props.category === 'media') {
    return publicArtists.filter(a => a.subcategories?.includes('media'));
  }
  
  if (props.category === 'teachers') {
    return publicArtists.filter(a => a.subcategories?.includes('teacher'));
  }
  
  if (props.category === 'performers') {
    return publicArtists.filter(a => a.subcategories?.includes('performer'));
  }
  
  // Other: artists that don't have dj, media, teacher, or performer subcategories
  return publicArtists.filter(a => {
    const subcats = a.subcategories || [];
    return !subcats.includes('dj') && !subcats.includes('media') && 
           !subcats.includes('teacher') && !subcats.includes('performer');
  });
});

const loadStaff = async () => {
  try {
    loading.value = true;
    error.value = null;
    // Fetch only public artists
    const response = await fetchEventStaff(props.eventId, true);
    
    if (response.success && response.staff) {
      staff.value = response.staff;
    } else {
      error.value = response.error || 'Failed to fetch artists';
    }
  } catch (err: any) {
    console.error('Fetch artists error:', err);
    error.value = err.message || 'An unexpected error occurred';
  } finally {
    loading.value = false;
  }
};

watch(() => props.category, () => {
  // Reload when category changes (though we already have the data)
}, { immediate: false });

onMounted(() => {
  if (process.client) {
    loadStaff();
  }
});
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

