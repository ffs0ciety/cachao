export type NotificationType = 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  createdAt: number;
}

const notifications = ref<Notification[]>([]);
const defaultDuration = 4000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dismiss(id: string): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  notifications.value = notifications.value.filter((n) => n.id !== id);
}

function add(message: string, type: NotificationType = 'info', duration: number = defaultDuration): string {
  const id = generateId();
  const item: Notification = {
    id,
    message,
    type,
    createdAt: Date.now(),
  };
  notifications.value = [...notifications.value, item];

  if (duration > 0) {
    const t = setTimeout(() => {
      dismiss(id);
      timers.delete(id);
    }, duration);
    timers.set(id, t);
  }
  return id;
}

export function useNotifications() {
  return {
    notifications,
    add,
    dismiss,
    success: (message: string, duration?: number) => add(message, 'success', duration ?? defaultDuration),
    error: (message: string, duration?: number) => add(message, 'error', duration ?? defaultDuration),
    info: (message: string, duration?: number) => add(message, 'info', duration ?? defaultDuration),
  };
}
