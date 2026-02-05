<template>
  <div class="min-h-screen bg-white">
    <AppNavigation @open-auth="showAuthModal = true" />
    <div class="pt-16">
      <NuxtPage />
    </div>
    <AuthModal
      :is-open="showAuthModal"
      @close="showAuthModal = false"
      @authenticated="handleAuthenticated"
    />
    <AppNotifications />
  </div>
</template>

<script setup lang="ts">
const showAuthModal = ref(false);
const { checkAuth } = useAuth();

const handleAuthenticated = async () => {
  showAuthModal.value = false;
  await checkAuth();
};
</script>
