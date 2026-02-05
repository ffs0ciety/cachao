<template>
  <div class="min-h-screen bg-gray-100 p-8">
    <div class="bg-green-500 text-white p-4 rounded mb-4">
      <h1 class="text-2xl font-bold">✅ TEST PAGE - If you see this, routing works!</h1>
      <p>Event ID: {{ eventId }}</p>
    </div>
    <NuxtLink to="/events/1" class="text-blue-600 underline">
      ← Back to Event
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  ssr: false
});

const route = useRoute();
const eventId = route.params.id as string;
</script>




