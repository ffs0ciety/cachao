<template>
  <nav class="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl border-b border-border-subtle">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <!-- Logo/Brand -->
        <NuxtLink to="/" class="flex items-center space-x-2">
          <h1 class="text-xl font-semibold text-text-primary">Cachao</h1>
        </NuxtLink>

        <!-- Navigation Links -->
        <div class="hidden md:flex items-center space-x-8">
          <NuxtLink
            to="/"
            class="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            active-class="text-primary"
          >
            Events
          </NuxtLink>
          <NuxtLink
            v-if="isAuthenticated"
            to="/events/manage"
            class="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
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
              class="btn btn-primary rounded-full"
            >
              Create Event
            </NuxtLink>
            <NuxtLink
              to="/profile"
              class="p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded-full transition-colors"
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
            class="btn btn-primary rounded-full"
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
