/**
 * Returns the absolute URL to open when scanning a ticket's QR code.
 * Uses NUXT_PUBLIC_APP_URL when set (e.g. production or LAN URL for scanning); otherwise window.location.origin.
 * Always includes protocol so scanners open the link correctly.
 */
export function useValidateQr() {
  const config = useRuntimeConfig();
  const appUrl = config.public?.appUrl as string | undefined;

  function getValidateUrl(eventId: string, orderId: string): string {
    let base = '';
    if (import.meta.client && typeof window !== 'undefined') {
      base = (appUrl && appUrl.trim()) || window.location.origin;
    } else {
      base = (appUrl && appUrl.trim()) || '';
    }
    if (!base) return `/events/validate/${eventId}/${orderId}`;
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
    return `${base.replace(/\/$/, '')}/events/validate/${eventId}/${orderId}`;
  }

  async function getQrDataUrl(eventId: string, orderId: string, size: number = 160): Promise<string> {
    const url = getValidateUrl(eventId, orderId);
    const mod = await import('qrcode');
    const QRCode = (mod as any).default ?? mod;
    return QRCode.toDataURL(url, { width: size, margin: 1 });
  }

  return { getValidateUrl, getQrDataUrl };
}
