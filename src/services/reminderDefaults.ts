import type { ReminderPreferences } from '@/types/domain';

/**
 * Supportive defaults: reminders on, but capped and quiet overnight.
 * Nothing here claims a reminder was delivered — delivery state lives in
 * `reminder_events` and is only ever written after the platform reports it.
 */
export function defaultReminderPreferences(userId: string, timezone: string): Omit<ReminderPreferences, 'updated_at'> {
  return {
    user_id: userId,
    timezone: timezone || 'Asia/Dhaka',
    reminders_enabled: true,
    task_due_enabled: true,
    task_overdue_enabled: true,
    revision_due_enabled: true,
    weekly_planning_enabled: true,
    incomplete_goal_enabled: false,
    weekly_planning_day: 5, // Friday, the usual planning day in Bangladesh
    weekly_planning_time: '18:00',
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    max_per_day: 3,
    channel: 'in_app',
  };
}

export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka (Bangladesh, UTC+6)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi (UTC+5)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'UTC', label: 'UTC' },
];
