import type { TranslationKey } from '@/i18n';

// Icons must be the actual SVG data, not their names: a bare name makes IonIcon try
// to fetch the icon from the CDN at runtime, which fails offline and in the
// Android webview. `ionicons/icons` exports the data-URI payload.
import {
  alertCircleOutline,
  analyticsOutline,
  bookmarkOutline,
  calendarOutline,
  checkboxOutline,
  documentTextOutline,
  downloadOutline,
  flagOutline,
  folderOutline,
  helpCircleOutline,
  homeOutline,
  layersOutline,
  listOutline,
  notificationsOutline,
  radioButtonOnOutline,
  refreshOutline,
  schoolOutline,
  settingsOutline,
  sparklesOutline,
  sunnyOutline,
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

/**
 * Navigation.
 *
 * Five destinations, not twenty-five. Studying a chapter, planning a week and
 * reviewing mistakes are one workflow, so they live together under Study; the
 * long tail (vault, practice, reminders, export) sits in More. Nothing was
 * removed — every route below still exists and is still reachable.
 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.dashboard', icon: homeOutline, group: 'plan' },
  { path: '/tasks', labelKey: 'nav.tasks', icon: checkboxOutline, group: 'plan' },
  { path: '/planner', labelKey: 'nav.planner', icon: sparklesOutline, group: 'plan' },
  { path: '/reminders', labelKey: 'nav.reminders', icon: notificationsOutline, group: 'plan' },

  { path: '/curriculum', labelKey: 'nav.curriculum', icon: layersOutline, group: 'study' },
  { path: '/curriculum/templates', labelKey: 'nav.templates', icon: bookmarkOutline, group: 'study' },
  { path: '/more', labelKey: 'nav.more', icon: helpCircleOutline, group: 'account' },
  { path: '/syllabus', labelKey: 'nav.syllabus', icon: listOutline, group: 'study' },
  { path: '/subjects', labelKey: 'nav.subjects', icon: folderOutline, group: 'study' },
  { path: '/lectures', labelKey: 'nav.lectures', icon: videocamOutline, group: 'study' },
  { path: '/sessions', labelKey: 'nav.sessions', icon: timerOutline, group: 'study' },
  { path: '/focus', labelKey: 'nav.focus', icon: radioButtonOnOutline, group: 'study' },
  { path: '/time', labelKey: 'nav.time', icon: timeOutline, group: 'study' },

  { path: '/revisions', labelKey: 'nav.revisions', icon: refreshOutline, group: 'reflect' },
  { path: '/revisions/smart', labelKey: 'nav.smartRevision', icon: calendarOutline, group: 'reflect' },
  { path: '/difficulties', labelKey: 'nav.difficulties', icon: alertCircleOutline, group: 'reflect' },
  { path: '/mistakes', labelKey: 'nav.mistakes', icon: warningOutline, group: 'reflect' },
  { path: '/weakness', labelKey: 'nav.weakness', icon: analyticsOutline, group: 'reflect' },
  { path: '/exams', labelKey: 'nav.exams', icon: schoolOutline, group: 'reflect' },
  { path: '/exams/prep', labelKey: 'nav.preparation', icon: flagOutline, group: 'reflect' },
  { path: '/notes', labelKey: 'nav.notes', icon: documentTextOutline, group: 'reflect' },
  { path: '/vault', labelKey: 'nav.vault', icon: bookmarkOutline, group: 'reflect' },
  { path: '/practice', labelKey: 'nav.practice', icon: helpCircleOutline, group: 'reflect' },
  { path: '/insights', labelKey: 'nav.insights', icon: trendingUpOutline, group: 'reflect' },

  { path: '/reports', labelKey: 'nav.reports', icon: sunnyOutline, group: 'account' },
  { path: '/export', labelKey: 'nav.export', icon: downloadOutline, group: 'account' },
  { path: '/settings', labelKey: 'nav.settings', icon: settingsOutline, group: 'account' },
];

/**
 * The sidebar shows only these five. Everything else lives one level in, on the
 * Study and More screens. `NAV_ITEMS` stays complete so route lookups (topbar
 * titles, active states) keep working for every page.
 */
export const PRIMARY_NAV = [
  { path: '/', label: 'Home', icon: homeOutline },
  { path: '/tasks', label: 'Tasks', icon: checkboxOutline },
  { path: '/subjects', label: 'Study', icon: layersOutline },
  { path: '/revisions', label: 'Revision', icon: refreshOutline },
  { path: '/more', label: 'More', icon: helpCircleOutline },
];

export const BOTTOM_NAV = PRIMARY_NAV;

export const NAV_GROUPS: { key: NavItem['group']; label: string }[] = [
  { key: 'plan', label: 'Plan' },
  { key: 'study', label: 'Study' },
  { key: 'reflect', label: 'Review' },
  { key: 'account', label: 'Account' },
];

/** Secondary destinations, grouped for the More screen and the sidebar. */
export const MORE_SECTIONS: { title: string; items: { path: string; label: string; hint: string; icon: string }[] }[] = [
  {
    title: 'Study',
    items: [
      { path: '/syllabus', label: 'Syllabus tracker', hint: 'Per-chapter checklist and topics', icon: listOutline },
      { path: '/lectures', label: 'Lecture log', hint: 'Classes you attended', icon: videocamOutline },
      { path: '/sessions', label: 'Study sessions', hint: 'Time you recorded', icon: timerOutline },
      { path: '/focus', label: 'Focus timer', hint: 'Pomodoro blocks', icon: radioButtonOnOutline },
      { path: '/time', label: 'Daily time', hint: 'Where the hours went', icon: timeOutline },
      { path: '/planner', label: 'Smart planner', hint: 'Build a week that fits', icon: sparklesOutline },
    ],
  },
  {
    title: 'Review',
    items: [
      { path: '/revisions/smart', label: 'Smart revision', hint: 'What is due next', icon: calendarOutline },
      { path: '/difficulties', label: 'Difficult topics', hint: 'What is still unclear', icon: alertCircleOutline },
      { path: '/mistakes', label: 'Mistake log', hint: 'Errors worth remembering', icon: warningOutline },
      { path: '/weakness', label: 'Weakness analyser', hint: 'Where marks leak', icon: analyticsOutline },
      { path: '/practice', label: 'Question practice', hint: 'Board and MCQ drills', icon: helpCircleOutline },
      { path: '/exams', label: 'Exams & results', hint: 'Marks you recorded', icon: schoolOutline },
      { path: '/exams/prep', label: 'Exam preparation', hint: 'Targets and countdowns', icon: flagOutline },
    ],
  },
  {
    title: 'Library',
    items: [
      { path: '/notes', label: 'Notes & resources', hint: 'Your own notes', icon: documentTextOutline },
      { path: '/vault', label: 'Formula vault', hint: 'Formulas to remember', icon: bookmarkOutline },
      { path: '/insights', label: 'Progress insights', hint: 'Trends from real records', icon: trendingUpOutline },
      { path: '/reports', label: 'Reports', hint: 'Weekly summary', icon: sunnyOutline },
      { path: '/reminders', label: 'Reminders', hint: 'Notifications you set', icon: notificationsOutline },
      { path: '/curriculum/templates', label: 'Official templates', hint: 'Reference chapter lists', icon: layersOutline },
    ],
  },
  {
    title: 'Account',
    items: [
      { path: '/settings', label: 'Settings & appearance', hint: 'Theme, profile, data', icon: settingsOutline },
      { path: '/export', label: 'Export', hint: 'Download your records', icon: downloadOutline },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0];
  // Longest match wins, so /revisions/smart does not highlight /revisions.
  return [...NAV_ITEMS]
    .filter((item) => item.path !== '/' && pathname.startsWith(item.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
