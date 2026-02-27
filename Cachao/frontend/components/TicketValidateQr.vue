<template>
  <div class="inline-block bg-surface p-1 rounded-lg border border-border-subtle" :title="'Scan to validate ticket #' + orderId">
    <img
      v-if="qrDataUrl"
      :src="qrDataUrl"
      :alt="'QR code to validate ticket ' + orderId"
      :width="size"
      :height="size"
      class="block"
    />
    <div v-else class="flex items-center justify-center text-text-disabled" :style="{ width: size + 'px', height: size + 'px' }">
      <span class="text-xs">QR</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    eventId: string;
    orderId: string;
    size?: number;
  }>(),
  { size: 120 }
);

const qrDataUrl = ref<string | null>(null);
const { getQrDataUrl } = useValidateQr();

onMounted(async () => {
  try {
    qrDataUrl.value = await getQrDataUrl(props.eventId, String(props.orderId), props.size);
  } catch (e) {
    console.error('QR generate error:', e);
  }
});
</script>
