<script setup lang="ts">
// Redirect from old route /events/[id]/edit to new route /events/edit/[id]
const route = useRoute();
const router = useRouter();

const eventId = route.params.id as string;

// Redirect to the new route structure
onMounted(() => {
  if (process.client) {
    router.replace(`/events/edit/${eventId}`);
  }
});
</script>

<template>
  <div>
    <!-- Redirecting... -->
  </div>
</template>
