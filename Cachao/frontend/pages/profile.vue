<template>
  <div class="min-h-screen py-12">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 class="text-4xl font-semibold text-text-primary mb-2">Profile</h1>
          <p class="text-lg text-text-secondary">Manage your profile, events, and videos</p>
        </div>
        <button
          v-if="!loading && !error"
          type="button"
          @click="handleLogout"
          class="btn btn-secondary"
        >
          Sign out
        </button>
      </div>

      <!-- Tab Navigation -->
      <div v-if="!loading && !error" class="tabs mb-8">
        <button
          @click="activeTab = 'profile'"
          :class="['tab', activeTab === 'profile' ? 'active' : '']"
        >
          Profile
        </button>
        <button
          @click="activeTab = 'events'"
          :class="['tab', activeTab === 'events' ? 'active' : '']"
        >
          Events
        </button>
        <button
          @click="activeTab = 'tickets'"
          :class="['tab', activeTab === 'tickets' ? 'active' : '']"
        >
          Tickets
        </button>
        <button
          @click="activeTab = 'videos'"
          :class="['tab', activeTab === 'videos' ? 'active' : '']"
        >
          Videos
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-16">
        <div class="spinner spinner-lg mx-auto"></div>
        <p class="mt-4 text-text-secondary">Loading profile...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="alert alert-error mb-6">
        <p>{{ error }}</p>
      </div>

      <!-- Profile Content -->
      <div v-else class="space-y-8">
        <!-- Profile Section -->
        <div v-if="activeTab === 'profile'" class="card">
          <h2 class="text-2xl font-semibold text-text-primary mb-6">Profile Information</h2>
          
          <div class="flex flex-col sm:flex-row gap-6">
            <!-- Photo Section -->
            <div class="flex-shrink-0">
              <div class="relative">
                <div v-if="!profile.photo_url" class="avatar avatar-xl bg-elevated">
                  <svg class="w-10 h-10 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <img
                  v-else
                  :src="profile.photo_url"
                  alt="Profile photo"
                  class="w-32 h-32 rounded-full object-cover"
                />
                <button
                  @click="triggerPhotoUpload"
                  class="absolute bottom-0 right-0 bg-primary text-white rounded-full p-2 hover:bg-primary-600 transition-colors shadow-lg"
                  :disabled="uploadingPhoto"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <input
                  ref="photoInput"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handlePhotoSelect"
                />
              </div>
              <p v-if="uploadingPhoto" class="mt-2 text-sm text-primary">Uploading...</p>
            </div>

            <!-- Name, Nickname and Email Section -->
            <div class="flex-1 space-y-4">
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Name
                </label>
                <div class="flex gap-2">
                  <input
                    v-model="editingName"
                    type="text"
                    class="form-input flex-1"
                    placeholder="Your name"
                  />
                  <button
                    @click="saveName"
                    :disabled="savingName || editingName === profile.name"
                    class="btn btn-primary"
                  >
                    <span v-if="savingName">Saving...</span>
                    <span v-else>Save</span>
                  </button>
                </div>
              </div>

              <!-- Nickname Section -->
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Username / Nickname
                </label>
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-text-disabled">@</span>
                    <input
                      v-model="editingNickname"
                      type="text"
                      class="form-input pl-8 w-full"
                      :class="{
                        'border-success': nicknameStatus === 'available',
                        'border-error': nicknameStatus === 'taken' || nicknameStatus === 'invalid'
                      }"
                      placeholder="your_username"
                      pattern="[a-zA-Z0-9_]+"
                      @input="checkNickname"
                    />
                  </div>
                  <button
                    @click="saveNickname"
                    :disabled="savingNickname || !canSaveNickname"
                    class="btn btn-primary"
                  >
                    <span v-if="savingNickname">Saving...</span>
                    <span v-else>Save</span>
                  </button>
                </div>
                <div class="mt-1 text-xs">
                  <span v-if="checkingNickname" class="text-text-disabled">Checking availability...</span>
                  <span v-else-if="nicknameStatus === 'available'" class="text-success">✓ Username is available</span>
                  <span v-else-if="nicknameStatus === 'taken'" class="text-error">✗ Username is already taken</span>
                  <span v-else-if="nicknameStatus === 'invalid'" class="text-error">✗ Only letters, numbers, and underscores allowed</span>
                  <span v-else-if="profile.nickname" class="text-text-disabled">
                    Your public profile: 
                    <NuxtLink :to="`/u/${profile.nickname}`" class="text-primary hover:underline">
                      cachao.io/u/{{ profile.nickname }}
                    </NuxtLink>
                  </span>
                  <span v-else class="text-text-disabled">Choose a unique username for your public profile</span>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Email
                </label>
                <div class="px-4 py-2 bg-elevated border border-border-subtle rounded-lg text-text-primary">
                  {{ userEmail || 'Loading...' }}
                </div>
                <p class="mt-1 text-xs text-text-disabled">Your email address from your account</p>
              </div>
            </div>
          </div>
        </div>

        <!-- My Events Section -->
        <div v-if="activeTab === 'events'" class="bg-surface rounded-2xl p-8 border border-border-subtle">
          <h2 class="text-2xl font-semibold text-text-primary mb-6">My Events</h2>
          
          <div v-if="loadingEvents" class="text-center py-12">
            <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-border-subtle border-t-primary"></div>
          </div>
          
          <div v-else-if="userEvents.length === 0" class="text-center py-12 text-text-disabled">
            <p class="mb-4">You haven't created or joined any events yet.</p>
            <NuxtLink to="/events/new" class="inline-block text-primary hover:text-primary-600 font-medium">
              Create your first event →
            </NuxtLink>
          </div>
          
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NuxtLink
              v-for="event in userEvents"
              :key="event.id"
              :to="`/events/${event.id}`"
              class="group border border-border-subtle rounded-xl p-6 hover:shadow-lg transition-all duration-300 bg-surface"
            >
              <div v-if="event.image_url" class="mb-4 overflow-hidden rounded-lg">
                <img
                  :src="event.image_url"
                  :alt="event.name"
                  class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div class="flex items-start justify-between mb-2">
                <h3 class="font-semibold text-text-primary flex-1 group-hover:text-primary transition-colors">{{ event.name }}</h3>
                <span
                  v-if="event.user_role"
                  :class="{
                    'px-2.5 py-1 rounded-full text-xs font-medium': true,
                    'bg-primary/10 text-primary': event.user_role === 'owner',
                    'bg-elevated text-text-secondary': event.user_role !== 'owner',
                  }"
                >
                  {{ event.user_role === 'owner' ? 'Owner' : event.user_role.charAt(0).toUpperCase() + event.user_role.slice(1) }}
                </span>
              </div>
              <p class="text-sm text-text-secondary">
                {{ formatDate(event.start_date) }}
                <span v-if="event.end_date"> - {{ formatDate(event.end_date) }}</span>
              </p>
            </NuxtLink>
          </div>
        </div>

        <!-- My Tickets Section -->
        <div v-if="activeTab === 'tickets'" class="bg-surface rounded-2xl p-8 border border-border-subtle">
          <h2 class="text-2xl font-semibold text-text-primary mb-6">My Tickets</h2>
          
          <div v-if="loadingTickets" class="text-center py-12">
            <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-border-subtle border-t-primary"></div>
          </div>
          
          <div v-else-if="userTickets.length === 0" class="text-center py-12 text-text-disabled">
            <p class="mb-4">You haven't purchased any tickets yet.</p>
            <NuxtLink to="/" class="inline-block text-primary hover:text-primary-600 font-medium">
              Browse Events →
            </NuxtLink>
          </div>
          
          <div v-else class="space-y-4">
            <div
              v-for="order in userTickets"
              :key="order.id"
              class="border border-border-subtle rounded-xl p-6 hover:shadow-lg transition-shadow bg-surface"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3 mb-2">
                    <div v-if="order.ticket_image_url" class="w-20 h-20 flex-shrink-0">
                      <img
                        :src="order.ticket_image_url"
                        :alt="order.ticket_name"
                        class="w-full h-full object-cover rounded-md"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <h3 class="font-semibold text-text-primary">{{ order.ticket_name }}</h3>
                      <p class="text-sm text-text-secondary mt-1">{{ order.event_name }}</p>
                      <p v-if="order.event_start_date" class="text-xs text-text-disabled mt-2">
                        {{ formatDate(order.event_start_date) }}
                        <span v-if="order.event_end_date"> - {{ formatDate(order.event_end_date) }}</span>
                      </p>
                      <p v-if="order.event_location" class="text-xs text-text-disabled mt-1">{{ order.event_location }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-4 text-sm text-text-secondary mt-4">
                    <span>Quantity: <strong class="text-text-primary">{{ order.quantity }}</strong></span>
                    <span>Total: <strong class="text-text-primary">€{{ parseFloat(order.total_amount).toFixed(2) }}</strong></span>
                    <span
                      :class="{
                        'px-3 py-1 rounded-full text-xs font-medium': true,
                        'bg-green-50 text-green-700': order.status === 'paid',
                        'bg-yellow-50 text-yellow-700': order.status === 'pending',
                        'bg-red-50 text-red-700': order.status === 'failed' || order.status === 'cancelled',
                      }"
                    >
                      {{ order.status.toUpperCase() }}
                    </span>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-2 flex-shrink-0">
                  <ClientOnly>
                    <button
                      type="button"
                      @click="expandedQrOrder = order"
                      class="rounded-lg border border-border-subtle p-1 hover:border-primary hover:bg-elevated transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                      title="Tap to enlarge for scanning"
                    >
                      <TicketValidateQr
                        :event-id="String(order.event_id)"
                        :order-id="String(order.id)"
                        :size="100"
                      />
                    </button>
                    <template #fallback>
                      <div class="w-[100px] h-[100px] bg-elevated rounded-lg flex items-center justify-center text-text-disabled text-xs">QR</div>
                    </template>
                  </ClientOnly>
                  <NuxtLink
                    :to="`/events/${order.event_id}`"
                    class="px-5 py-2.5 bg-primary text-white rounded-full hover:bg-primary-600 transition-colors text-sm font-medium"
                  >
                    View Event
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- QR enlarge modal (My Tickets) -->
        <Teleport to="body">
          <div
            v-if="expandedQrOrder"
            class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
            @click.self="expandedQrOrder = null"
          >
            <div class="bg-surface rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col items-center gap-4" @click.stop>
              <div class="flex items-start justify-between w-full gap-2">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-text-primary truncate">{{ expandedQrOrder.ticket_name }}</p>
                  <p class="text-sm text-text-secondary truncate">{{ expandedQrOrder.event_name }}</p>
                </div>
                <button
                  type="button"
                  @click="expandedQrOrder = null"
                  class="flex-shrink-0 p-2 rounded-full hover:bg-elevated text-text-disabled focus:outline-none focus:ring-2 focus:ring-primary/50"
                  aria-label="Close"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p class="text-sm text-text-disabled">Show this to staff to scan</p>
              <ClientOnly>
                <div class="bg-surface p-3 rounded-xl border border-border-subtle">
                  <TicketValidateQr
                    v-if="expandedQrOrder"
                    :event-id="String(expandedQrOrder.event_id)"
                    :order-id="String(expandedQrOrder.id)"
                    :size="280"
                  />
                </div>
                <template #fallback>
                  <div class="w-[280px] h-[280px] bg-elevated rounded-xl flex items-center justify-center text-text-disabled">Loading QR…</div>
                </template>
              </ClientOnly>
              <button
                type="button"
                @click="expandedQrOrder = null"
                class="px-4 py-2 text-sm font-medium text-text-secondary bg-elevated rounded-full hover:bg-hover"
              >
                Close
              </button>
            </div>
          </div>
        </Teleport>

        <!-- My Videos Section -->
        <div v-if="activeTab === 'videos'" class="bg-surface rounded-2xl p-8 border border-border-subtle">
          <h2 class="text-2xl font-semibold text-text-primary mb-6">My Videos</h2>
          
          <div v-if="loadingVideos" class="text-center py-12">
            <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-border-subtle border-t-primary"></div>
          </div>
          
          <div v-else-if="userVideos.length === 0" class="text-center py-12 text-text-disabled">
            <p>You haven't uploaded any videos yet.</p>
          </div>
          
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              v-for="video in userVideos"
              :key="video.id"
              class="border border-border-subtle rounded-xl overflow-hidden hover:shadow-lg transition-shadow bg-surface"
            >
              <div class="aspect-video bg-elevated relative">
                <video
                  :src="video.video_url"
                  class="w-full h-full object-contain"
                  preload="metadata"
                  @click.stop
                ></video>
              </div>
              <div class="p-4">
                <h3 class="font-medium text-text-primary mb-1 truncate">{{ video.title }}</h3>
                <p v-if="video.event_name" class="text-sm text-text-secondary truncate">
                  Event: {{ video.event_name }}
                </p>
                <p v-if="video.album_name" class="text-sm text-text-secondary truncate">
                  Album: {{ video.album_name }}
                </p>
                <NuxtLink
                  v-if="video.event_id"
                  :to="`/events/${video.event_id}`"
                  class="mt-2 inline-block text-sm text-primary hover:text-primary-600 font-medium"
                >
                  View Event →
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserProfile, UserEvent, UserVideo } from '~/composables/useUserProfile';

const { fetchProfile, updateProfile, generatePhotoUploadUrl, uploadPhotoToS3, fetchUserEvents, fetchUserVideos, checkNicknameAvailability, updateNickname } = useUserProfile();
const { fetchUserTickets } = useTickets();
const { isAuthenticated, checkAuth, getUserEmail, logout } = useAuth();

const profile = ref<UserProfile | null>(null);
const userEvents = ref<UserEvent[]>([]);
const userVideos = ref<UserVideo[]>([]);
const userTickets = ref<any[]>([]);
const expandedQrOrder = ref<any>(null);
const userEmail = ref<string | null>(null);
const loading = ref(true);
const loadingEvents = ref(false);
const loadingVideos = ref(false);
const loadingTickets = ref(false);
const error = ref<string | null>(null);
const editingName = ref('');
const savingName = ref(false);
const uploadingPhoto = ref(false);
const photoInput = ref<HTMLInputElement | null>(null);
const activeTab = ref<'profile' | 'events' | 'tickets' | 'videos'>('profile');

// Nickname related state
const editingNickname = ref('');
const savingNickname = ref(false);
const checkingNickname = ref(false);
const nicknameStatus = ref<'available' | 'taken' | 'invalid' | 'unchanged' | null>(null);
let nicknameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  // Check authentication first
  const authResult = await checkAuth();
  if (!authResult) {
    // Not authenticated, redirect to home
    navigateTo('/');
    return;
  }

  // Load profile data (backend will create profile if it doesn't exist)
  await loadProfile();
  await loadEmail();
  await loadEvents();
  await loadVideos();
  await loadTickets();
});

const handleLogout = async () => {
  await logout();
  await navigateTo('/');
};

// Computed property for nickname save button
const canSaveNickname = computed(() => {
  if (!editingNickname.value) return false;
  if (editingNickname.value === profile.value?.nickname) return false;
  if (nicknameStatus.value === 'taken' || nicknameStatus.value === 'invalid') return false;
  if (checkingNickname.value) return false;
  return nicknameStatus.value === 'available';
});

// Validate and check nickname availability
const checkNickname = () => {
  const nickname = editingNickname.value.trim().toLowerCase();
  
  // Clear any pending check
  if (nicknameCheckTimeout) {
    clearTimeout(nicknameCheckTimeout);
  }
  
  // If empty or same as current, reset status
  if (!nickname) {
    nicknameStatus.value = null;
    return;
  }
  
  if (nickname === profile.value?.nickname) {
    nicknameStatus.value = 'unchanged';
    return;
  }
  
  // Validate format: only letters, numbers, underscores, 3-30 chars
  const validPattern = /^[a-zA-Z0-9_]{3,30}$/;
  if (!validPattern.test(nickname)) {
    nicknameStatus.value = 'invalid';
    return;
  }
  
  // Debounce the API call
  checkingNickname.value = true;
  nicknameStatus.value = null;
  
  nicknameCheckTimeout = setTimeout(async () => {
    try {
      const available = await checkNicknameAvailability(nickname);
      nicknameStatus.value = available ? 'available' : 'taken';
    } catch (err) {
      console.error('Error checking nickname:', err);
      nicknameStatus.value = null;
    } finally {
      checkingNickname.value = false;
    }
  }, 500);
};

// Save nickname
const saveNickname = async () => {
  if (!canSaveNickname.value) return;
  
  try {
    savingNickname.value = true;
    const result = await updateNickname(editingNickname.value.trim().toLowerCase());
    
    if (result.success) {
      // Reload profile to get updated data
      await loadProfile();
      nicknameStatus.value = null;
    } else {
      error.value = result.error || 'Failed to update nickname';
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to update nickname';
  } finally {
    savingNickname.value = false;
  }
};

const loadProfile = async () => {
  try {
    loading.value = true;
    error.value = null;
    const data = await fetchProfile();
    if (data) {
      profile.value = data;
      editingName.value = data.name || '';
      editingNickname.value = data.nickname || '';
    } else {
      error.value = 'Profile not found. Please try refreshing the page.';
    }
  } catch (err: any) {
    console.error('Error loading profile:', err);
    error.value = err.message || 'Failed to load profile';
    // If it's an auth error, redirect to home
    if (err.message?.includes('Authentication required') || err.message?.includes('Not authenticated')) {
      navigateTo('/');
    }
  } finally {
    loading.value = false;
  }
};

const loadEmail = async () => {
  try {
    const email = await getUserEmail();
    userEmail.value = email;
  } catch (err: any) {
    console.error('Error loading email:', err);
  }
};

const loadEvents = async () => {
  try {
    loadingEvents.value = true;
    userEvents.value = await fetchUserEvents();
  } catch (err: any) {
    console.error('Error loading events:', err);
  } finally {
    loadingEvents.value = false;
  }
};

const loadTickets = async () => {
  try {
    loadingTickets.value = true;
    const response = await fetchUserTickets();
    if (response.success && response.orders) {
      userTickets.value = (response.orders as any[]).filter((o: any) => o.status === 'paid');
    }
  } catch (err: any) {
    console.error('Error loading tickets:', err);
  } finally {
    loadingTickets.value = false;
  }
};

const loadVideos = async () => {
  try {
    loadingVideos.value = true;
    userVideos.value = await fetchUserVideos();
  } catch (err: any) {
    console.error('Error loading videos:', err);
  } finally {
    loadingVideos.value = false;
  }
};

const saveName = async () => {
  if (!profile.value || editingName.value === profile.value.name) return;
  
  try {
    savingName.value = true;
    const updated = await updateProfile({ name: editingName.value });
    profile.value = updated;
  } catch (err: any) {
    error.value = err.message || 'Failed to update name';
  } finally {
    savingName.value = false;
  }
};

const triggerPhotoUpload = () => {
  photoInput.value?.click();
};

const handlePhotoSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    uploadingPhoto.value = true;
    error.value = null;

    // Generate upload URL
    const { upload_url, s3_url } = await generatePhotoUploadUrl(
      file.name,
      file.size,
      file.type
    );

    // Upload to S3
    await uploadPhotoToS3(upload_url, file);

    // Update profile with new photo URL
    const updated = await updateProfile({ photo_url: s3_url });
    profile.value = updated;

    // Reset input
    if (target) {
      target.value = '';
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to upload photo';
  } finally {
    uploadingPhoto.value = false;
  }
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
</script>

