/**
 * Minimal localisation layer.
 *
 * The app is not text-hard-wired into components: navigation, common states and
 * page titles go through `t()`. Both English and Bangla dictionaries exist so
 * adding a language is a data change, not a rewrite. Long-form body copy and
 * form microcopy are still English-only in Phase 1 (documented limitation).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '@/types/domain';

export type TranslationKey =
  | 'nav.dashboard'
  | 'nav.curriculum'
  | 'nav.subjects'
  | 'nav.lectures'
  | 'nav.sessions'
  | 'nav.revisions'
  | 'nav.tasks'
  | 'nav.difficulties'
  | 'nav.mistakes'
  | 'nav.exams'
  | 'nav.notes'
  | 'nav.reports'
  | 'nav.reminders'
  | 'nav.settings'
  | 'common.loading'
  | 'common.retry'
  | 'common.cancel'
  | 'common.save'
  | 'common.delete'
  | 'common.edit'
  | 'common.empty'
  | 'common.error'
  | 'common.optional'
  | 'common.required'
  | 'status.not_recorded'
  | 'status.in_progress'
  | 'status.needs_practice'
  | 'status.needs_revision'
  | 'status.complete'
  | 'status.blocked'
  | 'status.not_started'
  | 'app.tagline'
  | 'app.demoBanner';

type Dictionary = Record<TranslationKey, string>;

const en: Dictionary = {
  'nav.dashboard': 'Dashboard',
  'nav.curriculum': 'My Curriculum',
  'nav.subjects': 'Subjects & Chapters',
  'nav.lectures': 'Lecture Log',
  'nav.sessions': 'Study Sessions',
  'nav.revisions': 'Revision Planner',
  'nav.tasks': 'Tasks & Weekly Plan',
  'nav.difficulties': 'Difficult Topics',
  'nav.mistakes': 'Mistake Log',
  'nav.exams': 'Exams & Results',
  'nav.notes': 'Notes & Resources',
  'nav.reports': 'AI Coach & Reports',
  'nav.reminders': 'Reminders',
  'nav.settings': 'Profile & Settings',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.empty': 'Nothing here yet',
  'common.error': 'Something went wrong',
  'common.optional': 'optional',
  'common.required': 'required',
  'status.not_recorded': 'Not recorded',
  'status.in_progress': 'In progress',
  'status.needs_practice': 'Needs practice',
  'status.needs_revision': 'Needs revision',
  'status.complete': 'Complete',
  'status.blocked': 'Blocked',
  'status.not_started': 'Not started',
  'app.tagline': 'Academic memory, planning and honest progress',
  'app.demoBanner': 'Demo data is loaded. Remove it any time from Settings → Data.',
};

const bn: Dictionary = {
  'nav.dashboard': 'ড্যাশবোর্ড',
  'nav.curriculum': 'আমার পাঠ্যক্রম',
  'nav.subjects': 'বিষয় ও অধ্যায়',
  'nav.lectures': 'লেকচার লগ',
  'nav.sessions': 'স্টাডি সেশন',
  'nav.revisions': 'রিভিশন প্ল্যানার',
  'nav.tasks': 'কাজ ও সাপ্তাহিক পরিকল্পনা',
  'nav.difficulties': 'কঠিন বিষয়',
  'nav.mistakes': 'ভুলের লগ',
  'nav.exams': 'পরীক্ষা ও ফলাফল',
  'nav.notes': 'নোট ও রিসোর্স',
  'nav.reports': 'এআই কোচ ও রিপোর্ট',
  'nav.reminders': 'রিমাইন্ডার',
  'nav.settings': 'প্রোফাইল ও সেটিংস',
  'common.loading': 'লোড হচ্ছে…',
  'common.retry': 'আবার চেষ্টা করুন',
  'common.cancel': 'বাতিল',
  'common.save': 'সংরক্ষণ',
  'common.delete': 'মুছুন',
  'common.edit': 'সম্পাদনা',
  'common.empty': 'এখনো কিছু নেই',
  'common.error': 'কিছু ভুল হয়েছে',
  'common.optional': 'ঐচ্ছিক',
  'common.required': 'আবশ্যক',
  'status.not_recorded': 'রেকর্ড নেই',
  'status.in_progress': 'চলমান',
  'status.needs_practice': 'অনুশীলন দরকার',
  'status.needs_revision': 'রিভিশন দরকার',
  'status.complete': 'সম্পন্ন',
  'status.blocked': 'আটকে আছে',
  'status.not_started': 'শুরু হয়নি',
  'app.tagline': 'পড়াশোনার স্মৃতি, পরিকল্পনা ও সৎ অগ্রগতি',
  'app.demoBanner': 'ডেমো ডেটা লোড করা আছে। সেটিংস → ডেটা থেকে যেকোনো সময় মুছে ফেলুন।',
};

const dictionaries: Record<Locale, Dictionary> = { en, bn };
const STORAGE_KEY = 'mkj.studyos.locale';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored === 'bn' || stored === 'en') return stored;
  } catch {
    // ignore storage access errors
  }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      // storage may be unavailable; the in-memory locale still switches
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
