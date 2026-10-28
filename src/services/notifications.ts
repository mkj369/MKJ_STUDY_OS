/**
 * Local notification delivery (Android via Capacitor).
 *
 * Honesty rules:
 *  - On web nothing is delivered natively: the caller is told `supported: false`.
 *  - `sent` is only reported after the plugin confirms the schedule call.
 *  - Failures carry the platform error message so the UI can show it.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface NotificationInput {
  id: string;
  title: string;
  body: string;
  scheduled_for: string;
}

export interface NotificationResult {
  eventId: string;
  ok: boolean;
  error?: string;
}

export interface NotificationOutcome {
  supported: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  results: NotificationResult[];
  message: string;
}

function numericId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000;
}

export function localNotificationsSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');
}

export async function scheduleLocalReminders(events: NotificationInput[]): Promise<NotificationOutcome> {
  if (!localNotificationsSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      results: [],
      message:
        'Native scheduled notifications need the Android build (Capacitor). On web these reminders stay in-app only.',
    };
  }
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== 'granted') {
    return {
      supported: true,
      permission: 'denied',
      results: events.map((event) => ({ eventId: event.id, ok: false, error: 'Permission not granted' })),
      message: 'Notification permission was not granted, so nothing was scheduled.',
    };
  }
  const results: NotificationResult[] = [];
  for (const event of events) {
    try {
      const at = new Date(event.scheduled_for);
      if (Number.isNaN(at.getTime()) || at.getTime() < Date.now()) {
        results.push({ eventId: event.id, ok: false, error: 'Scheduled time is in the past' });
        continue;
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: numericId(event.id),
            title: event.title,
            body: event.body,
            schedule: { at, allowWhileIdle: true },
            smallIcon: 'ic_stat_icon_config_sample',
          },
        ],
      });
      results.push({ eventId: event.id, ok: true });
    } catch (error) {
      results.push({ eventId: event.id, ok: false, error: (error as Error).message });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  return {
    supported: true,
    permission: 'granted',
    results,
    message: `Scheduled ${okCount} of ${events.length} notification(s) on this device.`,
  };
}
