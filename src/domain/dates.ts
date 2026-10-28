import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns';
import type { DateOnly, Locale } from '@/types/domain';

/** Bangladesh school weeks conventionally start on Sunday. */
export const WEEK_STARTS_ON = 0 as const;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== 'string' || !DATE_ONLY_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Parse `YYYY-MM-DD` as a *local* calendar date at midnight (no UTC shifting). */
export function parseDateOnly(value: DateOnly): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Local calendar date → `YYYY-MM-DD`. */
export function toDateOnly(date: Date): DateOnly {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(now: Date = new Date()): DateOnly {
  return toDateOnly(now);
}

export interface ZonedParts {
  date: DateOnly;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

/**
 * Wall-clock parts of an instant in an IANA time zone.
 * Used so quiet hours and "today" respect the student's own time zone.
 */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
  } catch {
    // Invalid time zone: fall back to the device's local zone rather than crash.
    formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
  }
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  // Intl can return "24" for midnight with hour12: false in some engines.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const weekdayName = get('weekday');
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayMap[weekdayName] ?? instant.getDay(),
  };
}

export function todayInZone(timeZone: string | undefined, now: Date = new Date()): DateOnly {
  return timeZone ? getZonedParts(now, timeZone).date : todayISO(now);
}

export function addDaysISO(value: DateOnly, days: number): DateOnly {
  return toDateOnly(addDays(parseDateOnly(value), days));
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffDaysISO(from: DateOnly, to: DateOnly): number {
  return differenceInCalendarDays(parseDateOnly(to), parseDateOnly(from));
}

export interface DateRange {
  start: DateOnly;
  end: DateOnly;
}

/** The Sunday–Saturday week containing `value`. */
export function weekRange(value: DateOnly): DateRange {
  const start = startOfWeek(parseDateOnly(value), { weekStartsOn: WEEK_STARTS_ON });
  const end = addDays(start, 6);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

export function shiftWeek(value: DateOnly, weeks: number): DateOnly {
  return toDateOnly(addDays(parseDateOnly(value), weeks * 7));
}

export function isWithinRange(value: DateOnly, range: DateRange): boolean {
  return value >= range.start && value <= range.end;
}

export function compareDateOnly(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatDate(value: DateOnly, locale: Locale = 'en'): string {
  if (!isDateOnly(value)) return value;
  const tag = locale === 'bn' ? 'bn-BD' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(tag, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parseDateOnly(value));
  } catch {
    return value;
  }
}

export function formatDateTime(iso: string, locale: Locale = 'en', timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function minutesToHuman(minutes: number, locale: Locale = 'en'): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (locale === 'bn') {
    if (h === 0) return `${m} মিনিট`;
    if (m === 0) return `${h} ঘণ্টা`;
    return `${h} ঘণ্টা ${m} মিনিট`;
  }
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** `HH:mm` + a number of minutes → `HH:mm` (wraps within the day). */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes + 1440 * 4) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

export function nowISO(now: Date = new Date()): string {
  return now.toISOString();
}

export function weekdayName(day: number, locale: Locale = 'en', style: 'short' | 'long' = 'short'): string {
  const base = new Date(2024, 0, 7 + day); // 2024-01-07 is a Sunday
  try {
    return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { weekday: style }).format(base);
  } catch {
    return String(day);
  }
}

function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - utcMs;
}

/**
 * Convert a wall-clock date+time in an IANA zone to a real instant.
 * Two-pass offset resolution handles most DST boundaries; Bangladesh has no DST.
 */
export function zonedWallTimeToInstant(date: DateOnly, time: string, timeZone: string): Date {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  let offset = timeZoneOffsetMs(naiveUtc, timeZone);
  const firstPass = naiveUtc - offset;
  offset = timeZoneOffsetMs(firstPass, timeZone);
  return new Date(naiveUtc - offset);
}

export function isWithinQuietHours(time: string, start: string, end: string): boolean {
  const t = timeToMinutes(time);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return false;
  if (s < e) return t >= s && t < e;
  // Window wraps midnight, e.g. 22:00 → 07:00
  return t >= s || t < e;
}
