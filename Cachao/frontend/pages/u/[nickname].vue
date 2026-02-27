<template>
  <div class="min-h-screen">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="spinner spinner-lg"></div>
    </div>

    <!-- Not Found -->
    <div v-else-if="!profile" class="flex flex-col items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="w-24 h-24 mx-auto mb-6 rounded-full bg-elevated flex items-center justify-center">
          <svg class="w-12 h-12 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-text-primary mb-2">User not found</h1>
        <p class="text-text-secondary mb-6">The profile you're looking for doesn't exist.</p>
        <NuxtLink to="/" class="btn btn-primary">Go Home</NuxtLink>
      </div>
    </div>

    <!-- Profile Content -->
    <div v-else>
      <!-- Cover & Profile Header -->
      <div class="relative">
        <!-- Cover Photo -->
        <div class="h-48 md:h-64 lg:h-80 relative overflow-hidden">
          <div 
            v-if="profile.cover_photo_url"
            class="absolute inset-0 bg-cover bg-center"
            :style="{ backgroundImage: `url(${profile.cover_photo_url})` }"
          ></div>
          <div v-else class="absolute inset-0 bg-gradient-to-br from-primary/30 to-info/30"></div>
          <!-- Overlay for better text readability -->
          <div class="absolute inset-0 bg-gradient-to-t from-base via-base/50 to-transparent"></div>
        </div>

        <!-- Profile Info Overlay -->
        <div class="container mx-auto px-4">
          <div class="relative -mt-20 md:-mt-24 pb-4">
            <div class="flex flex-col md:flex-row md:items-end gap-4 md:gap-6">
              <!-- Profile Photo -->
              <div class="flex-shrink-0">
                <div class="relative">
                  <div 
                    class="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-base overflow-hidden bg-elevated"
                  >
                    <img 
                      v-if="profile.photo_url" 
                      :src="profile.photo_url" 
                      :alt="profile.name || profile.nickname"
                      class="w-full h-full object-cover"
                    />
                    <div v-else class="w-full h-full flex items-center justify-center">
                      <span class="text-4xl md:text-5xl font-bold text-text-disabled">
                        {{ (profile.name || profile.nickname || '?').charAt(0).toUpperCase() }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Name & Stats -->
              <div class="flex-1 pb-2">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h1 class="text-2xl md:text-3xl font-bold text-text-primary">
                      {{ profile.name || profile.nickname }}
                    </h1>
                    <p class="text-text-secondary">@{{ profile.nickname }}</p>
                    <p v-if="profile.bio" class="text-text-secondary mt-2 max-w-lg">
                      {{ profile.bio }}
                    </p>
                    <div v-if="profile.location" class="flex items-center gap-1 text-text-disabled mt-2">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{{ profile.location }}</span>
                    </div>
                  </div>

                  <!-- Stats & Actions -->
                  <div class="flex items-center gap-6">
                    <div class="text-center cursor-pointer hover:opacity-80 transition-opacity">
                      <div class="text-xl font-bold text-text-primary">{{ formatNumber(profile.followers_count) }}</div>
                      <div class="text-sm text-text-secondary">Followers</div>
                    </div>
                    <div class="text-center cursor-pointer hover:opacity-80 transition-opacity">
                      <div class="text-xl font-bold text-text-primary">{{ formatNumber(profile.following_count) }}</div>
                      <div class="text-sm text-text-secondary">Following</div>
                    </div>
                    <button 
                      v-if="!isOwnProfile"
                      class="btn btn-primary"
                      @click="handleFollow"
                    >
                      {{ isFollowing ? 'Following' : 'Follow' }}
                    </button>
                    <NuxtLink 
                      v-else
                      to="/profile"
                      class="btn btn-secondary"
                    >
                      Edit Profile
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>

            <!-- Dance Styles Tags -->
            <div v-if="profile.dance_styles && profile.dance_styles.length > 0" class="mt-4 flex flex-wrap gap-2">
              <span 
                v-for="style in profile.dance_styles" 
                :key="style"
                class="badge badge-primary"
              >
                {{ style }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="sticky top-16 z-40 bg-surface border-b border-border-subtle">
        <div class="container mx-auto px-4">
          <div class="tabs">
            <button 
              @click="activeTab = 'profile'"
              :class="['tab', activeTab === 'profile' ? 'active' : '']"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </button>
            <button 
              @click="activeTab = 'media'"
              :class="['tab', activeTab === 'media' ? 'active' : '']"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Media
            </button>
          </div>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="container mx-auto px-4 py-8">
        <!-- Profile Tab -->
        <div v-if="activeTab === 'profile'" class="space-y-8">
          <!-- Groups Section -->
          <section v-if="profile.groups && profile.groups.length > 0">
            <h2 class="text-xl font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Groups
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div 
                v-for="group in profile.groups" 
                :key="group.id"
                class="card p-4 flex items-center gap-4 hover:bg-elevated transition-colors cursor-pointer"
              >
                <div class="w-14 h-14 rounded-full bg-elevated overflow-hidden flex-shrink-0">
                  <img v-if="group.image_url" :src="group.image_url" :alt="group.name" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center text-text-disabled font-bold">
                    {{ group.name.charAt(0).toUpperCase() }}
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-medium text-text-primary truncate">{{ group.name }}</h3>
                  <p class="text-sm text-text-secondary capitalize">{{ group.role }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Dance Schools Section -->
          <section v-if="profile.schools && profile.schools.length > 0">
            <h2 class="text-xl font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Dance Schools
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div 
                v-for="school in profile.schools" 
                :key="school.id"
                class="card p-4 flex items-center gap-4 hover:bg-elevated transition-colors cursor-pointer"
              >
                <div class="w-14 h-14 rounded-lg bg-elevated overflow-hidden flex-shrink-0">
                  <img v-if="school.image_url" :src="school.image_url" :alt="school.name" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center text-text-disabled font-bold">
                    {{ school.name.charAt(0).toUpperCase() }}
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-medium text-text-primary truncate">{{ school.name }}</h3>
                  <p v-if="school.location" class="text-sm text-text-secondary truncate">{{ school.location }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Calendar Section (Placeholder) -->
          <section>
            <h2 class="text-xl font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upcoming Events
            </h2>
            <div class="card p-8 text-center">
              <svg class="w-12 h-12 mx-auto mb-3 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-text-secondary">No upcoming events</p>
            </div>
          </section>

          <!-- Empty State if no groups or schools -->
          <div v-if="(!profile.groups || profile.groups.length === 0) && (!profile.schools || profile.schools.length === 0)" class="text-center py-12">
            <svg class="w-16 h-16 mx-auto mb-4 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-text-secondary">No profile information available yet</p>
          </div>
        </div>

        <!-- Media Tab -->
        <div v-else-if="activeTab === 'media'">
          <!-- Loading videos -->
          <div v-if="loadingVideos" class="flex justify-center py-12">
            <div class="spinner"></div>
          </div>

          <!-- Videos Grid -->
          <div v-else-if="videos.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
            <div 
              v-for="video in videos" 
              :key="video.id"
              class="relative aspect-[9/16] bg-elevated rounded-lg overflow-hidden group cursor-pointer"
              @click="openVideo(video)"
            >
              <video 
                :src="video.video_url" 
                class="w-full h-full object-cover"
                preload="metadata"
              ></video>
              <!-- Overlay on hover -->
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg class="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <!-- Video info -->
              <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                <p class="text-white text-xs truncate">{{ video.title || 'Untitled' }}</p>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="text-center py-12">
            <svg class="w-16 h-16 mx-auto mb-4 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p class="text-text-secondary">No videos yet</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Video Modal -->
    <div 
      v-if="selectedVideo" 
      class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      @click.self="selectedVideo = null"
    >
      <button 
        @click="selectedVideo = null"
        class="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
      >
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <video 
        :src="selectedVideo.video_url" 
        class="max-h-[90vh] max-w-[90vw] rounded-lg"
        controls
        autoplay
      ></video>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PublicUserProfile, UserVideo } from '~/composables/useUserProfile';

const route = useRoute();
const { fetchPublicProfile, fetchPublicUserVideos } = useUserProfile();
const { isAuthenticated, getCurrentUser } = useAuth();

const nickname = computed(() => route.params.nickname as string);

const profile = ref<PublicUserProfile | null>(null);
const videos = ref<UserVideo[]>([]);
const loading = ref(true);
const loadingVideos = ref(false);
const activeTab = ref<'profile' | 'media'>('profile');
const isFollowing = ref(false);
const selectedVideo = ref<UserVideo | null>(null);
const currentUserNickname = ref<string | null>(null);

const isOwnProfile = computed(() => {
  return currentUserNickname.value && currentUserNickname.value === profile.value?.nickname;
});

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

const handleFollow = () => {
  // TODO: Implement follow/unfollow logic
  isFollowing.value = !isFollowing.value;
};

const openVideo = (video: UserVideo) => {
  selectedVideo.value = video;
};

const loadProfile = async () => {
  try {
    loading.value = true;
    profile.value = await fetchPublicProfile(nickname.value);
  } catch (error) {
    console.error('Error loading profile:', error);
    profile.value = null;
  } finally {
    loading.value = false;
  }
};

const loadVideos = async () => {
  if (!profile.value) return;
  try {
    loadingVideos.value = true;
    videos.value = await fetchPublicUserVideos(nickname.value);
  } catch (error) {
    console.error('Error loading videos:', error);
    videos.value = [];
  } finally {
    loadingVideos.value = false;
  }
};

watch(activeTab, (newTab) => {
  if (newTab === 'media' && videos.value.length === 0 && !loadingVideos.value) {
    loadVideos();
  }
});

onMounted(async () => {
  await loadProfile();
  
  // Check if this is the current user's profile
  if (isAuthenticated.value) {
    try {
      const user = await getCurrentUser();
      // TODO: Get current user's nickname from their profile
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  }
});

// SEO
useHead({
  title: computed(() => profile.value ? `${profile.value.name || profile.value.nickname} (@${profile.value.nickname})` : 'Profile'),
});
</script>

<style scoped>
.tabs {
  display: flex;
  gap: 0;
}

.tab {
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  position: relative;
  transition: color 150ms ease-in-out;
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--color-primary);
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--color-primary);
}
</style>
