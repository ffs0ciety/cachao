<template>
  <div
    class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    aria-live="polite"
    aria-label="Notifications"
  >
    <TransitionGroup name="notif">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="pointer-events-auto rounded-xl shadow-lg border p-3 flex items-start gap-3"
        :class="typeClasses[item.type]"
      >
        <span v-if="item.type === 'success'" class="flex-shrink-0 text-success" aria-hidden="true">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <span v-if="item.type === 'error'" class="flex-shrink-0 text-error" aria-hidden="true">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
        <span v-if="item.type === 'info'" class="flex-shrink-0 text-primary" aria-hidden="true">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <p class="text-sm font-medium flex-1 min-w-0">{{ item.message }}</p>
        <button
          type="button"
          @click="dismiss(item.id)"
          class="flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary/50"
          :aria-label="'Dismiss notification'"
        >
          <svg class="w-4 h-4 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
const { notifications, dismiss } = useNotifications();

const typeClasses: Record<string, string> = {
  success: 'bg-success-subtle border-success/25 text-success',
  error: 'bg-error-subtle border-error/25 text-error',
  info: 'bg-elevated border-border-subtle text-text-primary',
};
</script>

<style scoped>
.notif-enter-active,
.notif-leave-active {
  transition: all 0.25s ease;
}
.notif-enter-from,
.notif-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}
.notif-move {
  transition: transform 0.25s ease;
}
</style>
