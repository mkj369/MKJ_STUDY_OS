/**
 * DEMO curriculum.
 *
 * This is explicitly a *structure sample*, not NCTB content. Subject names are
 * real HSC Science paper names, but the chapter rows are placeholders whose only
 * purpose is to demonstrate the tracking workflow. Every row is flagged
 * `is_demo` / `needs_verification` and the UI labels it as demo data.
 *
 * The same UUIDs are used by `supabase/migrations/0002_demo_curriculum.sql`, so
 * cloud mode and local mode share identical identifiers.
 */
import type { CurriculumChapter, CurriculumSubject, CurriculumVersion } from '@/types/domain';

export const DEMO_VERSION_ID = 'd0000000-0000-4000-8000-000000000001';

export const DEMO_VERSION: CurriculumVersion = {
  id: DEMO_VERSION_ID,
  authority: 'MKJ StudyOS demo',
  country: 'Bangladesh',
  education_level: 'HSC',
  class_grade: 'Class 11–12',
  stream: 'Science',
  academic_year: '2025–2026',
  version_label: 'demo-v1',
  title: 'Demo HSC Science structure (not official NCTB content)',
  source_url: null,
  verification_status: 'needs_verification',
  is_demo: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function subjectId(n: number): string {
  return `d0000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;
}

function chapterId(n: number): string {
  return `d0000000-0000-4000-8000-${String(200 + n).padStart(12, '0')}`;
}

interface DemoSubjectSeed {
  name: string;
  paper: string | null;
  compulsory: boolean;
  chapters: [title: string, number: string][];
}

const SEEDS: DemoSubjectSeed[] = [
  {
    name: 'Physics',
    paper: '1st Paper',
    compulsory: false,
    chapters: [
      ['Demo chapter 1 — mechanics', '1'],
      ['Demo chapter 2 — waves', '2'],
    ],
  },
  {
    name: 'Physics',
    paper: '2nd Paper',
    compulsory: false,
    chapters: [
      ['Demo chapter 1 — electricity', '1'],
      ['Demo chapter 2 — modern physics', '2'],
    ],
  },
  {
    name: 'Chemistry',
    paper: '1st Paper',
    compulsory: false,
    chapters: [
      ['Demo chapter 1 — atomic structure', '1'],
      ['Demo chapter 2 — bonding', '2'],
    ],
  },
  {
    name: 'Chemistry',
    paper: '2nd Paper',
    compulsory: false,
    chapters: [
      ['Demo chapter 1 — organic chemistry', '1'],
      ['Demo chapter 2 — quantitative chemistry', '2'],
    ],
  },
  {
    name: 'Higher Mathematics',
    paper: '1st Paper',
    compulsory: false,
    chapters: [
      ['Demo chapter 1 — limits', '1'],
      ['Demo chapter 2 — differentiation', '2'],
    ],
  },
  {
    name: 'Biology',
    paper: '1st Paper',
    compulsory: false,
    chapters: [
      ['Demo chapter 1 — cell biology', '1'],
      ['Demo chapter 2 — genetics', '2'],
    ],
  },
  {
    name: 'ICT',
    paper: null,
    compulsory: true,
    chapters: [
      ['Demo chapter 1 — ICT systems', '1'],
      ['Demo chapter 2 — networking', '2'],
    ],
  },
  {
    name: 'Bangla',
    paper: '1st Paper',
    compulsory: true,
    chapters: [
      ['Demo chapter 1 — prose', '1'],
      ['Demo chapter 2 — poetry', '2'],
    ],
  },
  {
    name: 'English',
    paper: '1st Paper',
    compulsory: true,
    chapters: [
      ['Demo chapter 1 — reading skills', '1'],
      ['Demo chapter 2 — writing skills', '2'],
    ],
  },
];

const NOW = '2026-01-01T00:00:00.000Z';

export const DEMO_SUBJECTS: CurriculumSubject[] = SEEDS.map((seed, index) => ({
  id: subjectId(index + 1),
  curriculum_version_id: DEMO_VERSION_ID,
  name: seed.name,
  name_bn: null,
  code: `${seed.name.slice(0, 3).toUpperCase()}-${
    seed.paper ? seed.paper.replace(/\s/g, '').slice(0, 3) : 'GEN'
  }`,
  paper_label: seed.paper,
  is_compulsory: seed.compulsory,
  sort_order: index + 1,
  created_at: NOW,
}));

let chapterCounter = 0;
export const DEMO_CHAPTERS: CurriculumChapter[] = SEEDS.flatMap((seed, sIndex) => {
  const subject = DEMO_SUBJECTS[sIndex];
  return seed.chapters.map(([title, number], cIndex) => {
    chapterCounter += 1;
    return {
      id: chapterId(chapterCounter),
      curriculum_subject_id: subject?.id ?? '',
      parent_id: null,
      title,
      title_bn: null,
      chapter_number: number,
      sort_order: cIndex + 1,
      source_url: null,
      verification_status: 'needs_verification' as const,
      is_demo: true,
      created_at: NOW,
    } satisfies CurriculumChapter;
  });
});

export const DEMO_SUBJECT_IDS = {
  physics1: subjectId(1),
  physics2: subjectId(2),
  chemistry1: subjectId(3),
  chemistry2: subjectId(4),
  higherMath1: subjectId(5),
  biology1: subjectId(6),
  ict: subjectId(7),
  bangla1: subjectId(8),
  english1: subjectId(9),
} as const;

export const DEMO_CURRICULUM = {
  version: DEMO_VERSION,
  subjects: DEMO_SUBJECTS,
  chapters: DEMO_CHAPTERS,
};

export const DEMO_CURRICULUM_NOTICE =
  'Demo curriculum: structure sample only. Chapter names are placeholders, not official NCTB content. Add your own chapters or import a verified list.';
