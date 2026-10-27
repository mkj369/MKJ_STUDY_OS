import type { TranslationKey } from '@/i18n';

export interface NavItem {
  path: string;
  labelKey: TranslationKey;
  icon: string;
  group: 'plan' | 'study' | 'reflect' | 'account';
  /** Optional short label for the mobile bottom bar. */
  shortLabelKey?: TranslationKey;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.dashboard', icon: 'home-outline', group: 'plan' },
  { path: '/tasks', labelKey: 'nav.tasks', icon: 'checkbox-outline', group: 'plan' },
  { path: '/revisions', labelKey: 'nav.revisions', icon: 'refresh-outline', group: 'plan' },
  { path: '/reminders', labelKey: 'nav.reminders', icon: 'notifications-outline', group: 'plan' },
  { path: '/curriculum', labelKey: 'nav.curriculum', icon: 'library-outline', group: 'study' },
  { path: '/subjects', labelKey: 'nav.subjects', icon: 'layers-outline', group: 'study' },
  { path: '/lectures', labelKey: 'nav.lectures', icon: 'videocam-outline', group: 'study' },
  { path: '/sessions', labelKey: 'nav.sessions', icon: 'timer-outline', group: 'study' },
  { path: '/difficulties', labelKey: 'nav.difficulties', icon: 'alert-circle-outline', group: 'reflect' },
  { path: '/mistakes', labelKey: 'nav.mistakes', icon: 'warning-outline', group: 'reflect' },
  { path: '/exams', labelKey: 'nav.exams', icon: 'school-outline', group: 'reflect' },
  { path: '/notes', labelKey: 'nav.notes', icon: 'document-text-outline', group: 'reflect' },
  { path: '/reports', labelKey: 'nav.reports', icon: 'sparkles-outline', group: 'reflect' },
  { path: '/settings', labelKey: 'nav.settings', icon: 'settings-outline', group: 'account' },
];

export const NAV_GROUPS: { key: NavItem['group']; label: string }[] = [
  { key: 'plan', label: 'Plan' },
  { key: 'study', label: 'Study' },
  { key: 'reflect', label: 'Review & reflect' },
  { key: 'account', label: 'Account' },
];

export const BOTTOM_NAV: { path: string; label: string; icon: string }[] = [
  { path: '/', label: 'Home', icon: 'home-outline' },
  { path: '/tasks', label: 'Tasks', icon: 'checkbox-outline' },
  { path: '/lectures', label: 'Log', icon: 'add-circle-outline' },
  { path: '/revisions', label: 'Revise', icon: 'refresh-outline' },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0];
  return NAV_ITEMS.find((item) => item.path !== '/' && pathname.startsWith(item.path));
}
