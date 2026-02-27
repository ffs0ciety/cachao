<template>
  <div class="min-h-screen bg-surface flex items-center justify-center p-6">
    <div class="max-w-md w-full text-center">
      <div v-if="status === 'loading'" class="space-y-4">
        <div class="inline-block animate-spin rounded-full h-10 w-10 border-2 border-border-subtle border-t-primary"></div>
        <p class="text-text-secondary">Validating ticket...</p>
      </div>
      <div v-else-if="status === 'success'" class="space-y-4">
        <div class="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 class="text-xl font-semibold text-text-primary">Ticket validated</h1>
        <p class="text-text-secondary">Redirecting to management...</p>
      </div>
      <div v-else-if="status === 'error'" class="space-y-4">
        <div class="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 class="text-xl font-semibold text-text-primary">Validation failed</h1>
        <p class="text-text-secondary">{{ errorMessage }}</p>
        <p v-if="errorMessage && errorMessage.toLowerCase().includes('paid')" class="text-sm text-text-disabled">
          Only orders with status &quot;paid&quot; can be validated. If the customer just paid, wait a moment and try again.
        </p>
        <NuxtLink
          :to="eventId ? `/events/edit/${eventId}` : '/events/manage'"
          class="inline-block px-4 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600"
        >
          Go to event management
        </NuxtLink>
      </div>
      <div v-else-if="status === 'auth'" class="space-y-4">
        <p class="text-text-secondary">Sign in as the event owner to validate tickets.</p>
        <NuxtLink
          to="/"
          class="inline-block px-4 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary-600"
        >
          Go to home
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

function paramStr(p: unknown): string {
  if (p == null) return '';
  if (typeof p === 'string') return p;
  if (Array.isArray(p) && p.length > 0) return String(p[0]);
  return String(p);
}

const eventId = computed(() => paramStr(route.params.eventId));
const orderId = computed(() => paramStr(route.params.orderId));

const status = ref<'loading' | 'success' | 'error' | 'auth'>('loading');
const errorMessage = ref('');

const { isAuthenticated, checkAuth } = useAuth();
const { fetchEvent } = useEvents();
const { markTicketOrderValidated } = useTickets();

onMounted(async () => {
  const eid = eventId.value;
  const oid = orderId.value;
  if (!eid || !oid) {
    status.value = 'error';
    errorMessage.value = 'Invalid link.';
    return;
  }

  try {
    await checkAuth();
    if (!isAuthenticated.value) {
      status.value = 'auth';
      return;
    }

    const eventRes = await fetchEvent(eid);
    if (!eventRes.success || !eventRes.event) {
      status.value = 'error';
      errorMessage.value = typeof eventRes.error === 'string' ? eventRes.error : 'Event not found.';
      return;
    }

    const event = eventRes.event as { cognito_sub?: string | null };
    const { getCognitoSub } = useAuth();
    const sub = await getCognitoSub();
    if (!event.cognito_sub || event.cognito_sub !== sub) {
      status.value = 'error';
      errorMessage.value = 'Only the event owner can validate tickets.';
      return;
    }

    const res = await markTicketOrderValidated(eid, oid, true);
    if (res.success) {
      status.value = 'success';
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const manageUrl = `${base}/events/edit/${eid}?module=validate&validated=1`;
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.href = manageUrl;
      }, 800);
    } else {
      status.value = 'error';
      errorMessage.value = typeof res.error === 'string' ? res.error : 'Failed to validate ticket.';
    }
  } catch (e: unknown) {
    status.value = 'error';
    const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.';
    errorMessage.value = msg;
  }
});
</script>
