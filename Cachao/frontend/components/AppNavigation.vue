<template>
  <nav class="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <!-- Logo/Brand -->
        <NuxtLink to="/" class="flex items-center space-x-2">
          <h1 class="text-xl font-semibold text-gray-900">Cachao</h1>
        </NuxtLink>

        <!-- Navigation Links -->
        <div class="hidden md:flex items-center space-x-8">
          <NuxtLink
            to="/"
            class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            active-class="text-primary"
          >
            Events
          </NuxtLink>
          <NuxtLink
            v-if="isAuthenticated"
            to="/events/manage"
            class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            active-class="text-primary"
          >
            Manage Events
          </NuxtLink>
        </div>

        <!-- Right Side Actions -->
        <div class="flex items-center space-x-4">
          <div v-if="isAuthenticated" class="flex items-center space-x-3">
            <NuxtLink
              to="/events/new"
              class="px-5 py-2.5 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors"
            >
              Create Event
            </NuxtLink>
            <NuxtLink
              to="/profile"
              class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
              title="Profile"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </NuxtLink>
          </div>
          <button
            v-else
            @click="$emit('openAuth')"
            class="px-5 py-2.5 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
const { isAuthenticated, checkAuth } = useAuth();

defineEmits(['openAuth']);

// Check authentication status on mount and ensure reactive state
onMounted(async () => {
  if (process.client) {
    await checkAuth();
  }
});

// Watch for auth state changes (e.g., after login/logout in other components)
watch(isAuthenticated, (newValue) => {
  console.log('Navigation: Auth state changed to', newValue);
}, { immediate: true });
</script>
