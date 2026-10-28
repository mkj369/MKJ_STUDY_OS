import type { TranslationKey } from '@/i18n';

// Icons must be the actual SVG data, not their names: a bare name makes IonIcon try
// to fetch the icon from the icon CDN at runtime, which fails offline and in the
// Android webview. `ionicons/icons` exports the data-URI payload.
import {
  addCircleOutline,
  alertCircleOutline,
  analyticsOutline,
  bookmarkOutline,
  calendarOutline,
  checkboxOutline,
  documentTextOutline,
  downloadOutline,
  flagOutline,
  helpCircleOutline,
  homeOutline,
  layersOutline,
  libraryOutline,
  listOutline,
  notificationsOutline,
  radioButtonOnOutline,
  refreshOutline,
  schoolOutline,
  settingsOutline,
  sparklesOutline,
  timeOutline,
  timerOutline,
  trendingUpOutline,
  videocamOutline,
  warningOutline,
} from 'ionicons/icons';

export interface NavItem {
  path: string;
  labelKey: TranslationKey;
  icon: string;
  group: 'plan' | 'study' | 'reflect' | 'account';
  /** Optional short label for the mobile bottom bar. */
  shortLabelKey?: TranslationKey;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.dashboard', icon: homeOutline, group: 'plan' },
  { path: '/planner', labelKey: 'nav.planner', icon: sparklesOutline, group: 'plan' },
  { path: '/tasks', labelKey: 'nav.tasks', icon: checkboxOutline, group: 'plan' },
  { path: '/revisions', labelKey: 'nav.revisions', icon: refreshOutline, group: 'plan' },
  { path: '/revisions/smart', labelKey: 'nav.smartRevision', icon: calendarOutline, group: 'plan' },
  { path: '/reminders', labelKey: 'nav.reminders', icon: notificationsOutline, group: 'plan' },
  { path: '/curriculum', labelKey: 'nav.curriculum', icon: libraryOutline, group: 'study' },
  { path: '/syllabus', labelKey: 'nav.syllabus', icon: listOutline, group: 'study' },
  { path: '/subjects', labelKey: 'nav.subjects', icon: layersOutline, group: 'study' },
  { path: '/lectures', labelKey: 'nav.lectures', icon: videocamOutline, group: 'study' },
  { path: '/sessions', labelKey: 'nav.sessions', icon: timerOutline, group: 'study' },
  { path: '/time', labelKey: 'nav.time', icon: timeOutline, group: 'study' },
  { path: '/focus', labelKey: 'nav.focus', icon: radioButtonOnOutline, group: 'study' },
  { path: '/difficulties', labelKey: 'nav.difficulties', icon: alertCircleOutline, group: 'reflect' },
  { path: '/mistakes', labelKey: 'nav.mistakes', icon: warningOutline, group: 'reflect' },
  { path: '/weakness', labelKey: 'nav.weakness', icon: analyticsOutline, group: 'reflect' },
  { path: '/exams', labelKey: 'nav.exams', icon: schoolOutline, group: 'reflect' },
  { path: '/exams/prep', labelKey: 'nav.preparation', icon: flagOutline, group: 'reflect' },
  { path: '/notes', labelKey: 'nav.notes', icon: documentTextOutline, group: 'reflect' },
  { path: '/vault', labelKey: 'nav.vault', icon: bookmarkOutline, group: 'reflect' },
  { path: '/practice', labelKey: 'nav.practice', icon: helpCircleOutline, group: 'reflect' },
  { path: '/reports', labelKey: 'nav.reports', icon: sparklesOutline, group: 'reflect' },
  { path: '/insights', labelKey: 'nav.insights', icon: trendingUpOutline, group: 'reflect' },
  { path: '/export', labelKey: 'nav.export', icon: downloadOutline, group: 'account' },
  { path: '/settings', labelKey: 'nav.settings', icon: settingsOutline, group: 'account' },
];

export const NAV_GROUPS: { key: NavItem['group']; label: string }[] = [
  { key: 'plan', label: 'Plan' },
  { key: 'study', label: 'Study' },
  { key: 'reflect', label: 'Review & reflect' },
  { key: 'account', label: 'Account' },
];

export const BOTTOM_NAV: { path: string; label: string; icon: string }[] = [
  { path: '/', label: 'Home', icon: homeOutline },
  { path: '/tasks', label: 'Tasks', icon: checkboxOutline },
  { path: '/lectures', label: 'Log', icon: addCircleOutline },
  { path: '/revisions', label: 'Revise', icon: refreshOutline },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0];
  // Longest match wins, so /revisions/smart does not highlight /revisions and
  // /exams/prep does not highlight /exams.
  return [...NAV_ITEMS]
    .filter((item) => item.path !== '/' && pathname.startsWith(item.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
