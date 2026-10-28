/**
 * Curriculum readiness reference data — the TypeScript twin of migration 0009.
 *
 * WHAT THIS IS
 *   Two lists that answer "how complete is the curriculum?" honestly:
 *
 *   * `CURRICULUM_SOURCES` — every official NCTB document consulted, with what
 *     this environment could actually extract from it.
 *   * `PENDING_REQUIREMENTS` — one row per concrete gap, saying whether NCTB
 *     has not published the document yet (`awaiting_publication`) or whether it
 *     is published and we could not read it (`source_blocked`).
 *
 * WHY IT EXISTS AT ALL
 *   A coverage report that only counts rows cannot tell "we never looked" from
 *   "the file is 105 MB behind a virus-scan wall". Both render as zero
 *   chapters, and only one of them is our fault. These rows are what turns an
 *   empty column into an actionable item.
 *
 * WHAT IT IS NOT
 *   It is not curriculum content. Nothing here names a chapter or a topic.
 *
 * KEEPING IT IN SYNC
 *   The SQL side is `supabase/migrations/0009_curriculum_inventory.sql`.
 *   `tests/db/curriculumParity.test.ts` compares the two by natural key, so a
 *   row added to one side and not the other fails CI.
 */
import type { CurriculumPendingRequirement, CurriculumSource } from '@/types/domain';

const NOW = '2026-10-28T00:00:00.000Z';
const CHECKED = '2026-10-28';

function sourceId(n: number): string {
  return `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function requirementId(n: number): string {
  return `c0000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;
}

export const CURRICULUM_SOURCES: CurriculumSource[] = [
  {
    id: sourceId(1),
    url: 'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767',
    title: '২০২৫ শিক্ষাবর্ষের মাধ্যমিক স্তরের নবম-দশম শ্রেণির পাঠ্যপুস্তক (SSC textbook list 2025)',
    authority: 'NCTB',
    document_type: 'textbook_list',
    education_level: 'SSC',
    academic_year: '2025',
    access_state: 'rendered',
    checked_at: CHECKED,
    note: 'All 33 books listed in Bangla and English with two download links each (Google Drive + drive.egovcloud.gov.bd). This is the authority for the SSC subject inventory.',
    created_at: NOW,
  },
  {
    id: sourceId(2),
    url: 'https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612',
    title: '২০২৬ শিক্ষাবর্ষের মাধ্যমিক স্তরের নবম-দশম শ্রেণির পাঠ্যপুস্তক (SSC textbook list 2026)',
    authority: 'NCTB',
    document_type: 'textbook_list',
    education_level: 'SSC',
    academic_year: '2026',
    access_state: 'blocked',
    checked_at: CHECKED,
    note: 'Page exists and its title lists the 2026 books, but the content block is a "পাতা" (sub-page) widget that never resolves: the rendered body contains only navigation, a share bar and the accessibility menu. No subject rows could be extracted.',
    created_at: NOW,
  },
  {
    id: sourceId(3),
    url: 'https://drive.google.com/file/d/121GCSD2909n-ETowJfdtzqOoVcdAe9Fx/view',
    title: 'Physics Class 9-10 BV book full pdf_compressed.pdf (SSC Physics textbook, Bangla version)',
    authority: 'NCTB',
    document_type: 'textbook',
    education_level: 'SSC',
    academic_year: '2025',
    access_state: 'blocked',
    checked_at: CHECKED,
    note: 'Linked from the SSC 2025 list. Google reports the file as 105 MB and serves a virus-scan interstitial instead of the bytes; the egovcloud mirror returns HTTP 500. The table of contents inside this file is the only legitimate source for SSC Physics chapter titles.',
    created_at: NOW,
  },
  {
    id: sourceId(4),
    url: 'https://drive.egovcloud.gov.bd/index.php/s/QciQ1yYNg2c6Jmf',
    title: 'Government Cloud Drive mirror — Physics Class 9-10 BV book full pdf_compressed.pdf',
    authority: 'NCTB / Bangladesh Government Cloud',
    document_type: 'textbook',
    education_level: 'SSC',
    academic_year: '2025',
    access_state: 'blocked',
    checked_at: CHECKED,
    note: 'Share page renders and confirms the same 104.9 MB file, but /download returns HTTP 500 to this environment.',
    created_at: NOW,
  },
  {
    id: sourceId(5),
    url: 'https://nctb.gov.bd/pages/files/6922db5b933eb65569e09a2c',
    title: 'মাধ্যমিক স্তরের শিক্ষাক্রম, প্রকাশকাল ২০১২ (National Curriculum 2012, secondary)',
    authority: 'NCTB',
    document_type: 'curriculum',
    education_level: 'SSC',
    academic_year: '2012',
    access_state: 'partial',
    checked_at: CHECKED,
    note: '93-page PDF. Text extracts, but it is encoded in the legacy Bijoy/ANSI single-byte font mapping, so the output is unusable without a Bijoy→Unicode converter.',
    created_at: NOW,
  },
  {
    id: sourceId(6),
    url: 'https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
    title: 'জাতীয় শিক্ষাক্রম ২০১২ — একাদশ ও দ্বাদশ শ্রেণি (National Curriculum 2012, higher secondary)',
    authority: 'NCTB',
    document_type: 'curriculum',
    education_level: 'HSC',
    academic_year: '2012',
    access_state: 'partial',
    checked_at: CHECKED,
    note: '43-page PDF. Same Bijoy/ANSI encoding problem as the secondary curriculum document.',
    created_at: NOW,
  },
  {
    id: sourceId(7),
    url: 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292',
    title: 'এসএসসি ও এইচএসসি পরীক্ষার পুনর্বিন্যাসকৃত পাঠ্যসূচি ও বিষয় কাঠামো / নম্বর বিভাজন',
    authority: 'NCTB',
    document_type: 'subject_structure',
    education_level: 'SSC',
    academic_year: '2012',
    access_state: 'not_attempted',
    checked_at: null,
    note: 'Cited by migration 0007 as the source for group structure. Not re-opened in this pass.',
    created_at: NOW,
  },
  {
    id: sourceId(8),
    url: 'https://nctb.gov.bd/pages/notices/',
    title: 'নোটিশ — ২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক ও সমমান শ্রেণির নির্ধারিত পাঠ্যসূচি',
    authority: 'NCTB',
    document_type: 'notice',
    education_level: 'HSC',
    academic_year: '2026–2027',
    access_state: 'not_attempted',
    checked_at: null,
    note: 'Cited by migration 0007 as the HSC source. Not re-opened in this pass; no HSC textbook list has been rendered.',
    created_at: NOW,
  },
];

export const PENDING_REQUIREMENTS: CurriculumPendingRequirement[] = [
  {
    id: requirementId(1),
    education_level: 'SSC',
    stream: 'all',
    academic_year: '2025',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Chapter and topic lists for every SSC subject (textbook tables of contents)',
    status: 'source_blocked',
    source_url: 'https://drive.google.com/file/d/121GCSD2909n-ETowJfdtzqOoVcdAe9Fx/view',
    note: 'Each NCTB textbook PDF is roughly 100 MB and is served behind a Drive virus-scan interstitial; the egovcloud mirror returns HTTP 500. Reading the contents page of each book is the only acceptable source. A screenshot or PDF of that page per subject is enough to import from.',
    created_at: NOW,
  },
  {
    id: requirementId(2),
    education_level: 'SSC',
    stream: 'all',
    academic_year: '2026',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Complete SSC subject inventory for the 2026 academic year',
    status: 'source_blocked',
    source_url: 'https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612',
    note: 'The 2026 list page is identified but renders only navigation — the book table lives in a sub-page widget that does not resolve. Needs the page transcribed by hand, or a rendered copy.',
    created_at: NOW,
  },
  {
    id: requirementId(3),
    education_level: 'SSC',
    stream: 'all',
    academic_year: '2027',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Complete SSC subject inventory for the 2027 academic year',
    status: 'awaiting_publication',
    source_url: null,
    note: 'NCTB had not published a 2027 Class 9–10 textbook list as of 2026-10-28. Nothing is seeded for this year; inventing it would be worse than an empty column.',
    created_at: NOW,
  },
  {
    id: requirementId(4),
    education_level: 'SSC',
    stream: 'all',
    academic_year: '2028',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Complete SSC subject inventory for the 2028 academic year',
    status: 'awaiting_publication',
    source_url: null,
    note: 'Not published by NCTB as of 2026-10-28.',
    created_at: NOW,
  },
  {
    id: requirementId(5),
    education_level: 'SSC',
    stream: 'all',
    academic_year: '2029',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Complete SSC subject inventory for the 2029 academic year',
    status: 'awaiting_publication',
    source_url: null,
    note: 'Not published by NCTB as of 2026-10-28.',
    created_at: NOW,
  },
  {
    id: requirementId(6),
    education_level: 'SSC',
    stream: 'all',
    academic_year: '2025',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Group applicability of optional subjects (Arts & Crafts, Music, Arabic, Sanskrit, Pali)',
    status: 'awaiting_source',
    source_url: 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292',
    note: 'These books appear in the official 2025 Class 9–10 list, but a textbook list is group-agnostic. Which group may take which optional subject comes from the subject-structure/marks table, which has not been read here.',
    created_at: NOW,
  },
  {
    id: requirementId(7),
    education_level: 'HSC',
    stream: 'all',
    academic_year: '2026–2027',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Chapter and topic lists for every HSC subject (textbook tables of contents)',
    status: 'source_blocked',
    source_url: 'https://nctb.gov.bd/pages/notices/',
    note: 'Same blocker as SSC: the chapter titles are inside the per-subject textbook PDFs, none of which could be retrieved here.',
    created_at: NOW,
  },
  {
    id: requirementId(8),
    education_level: 'HSC',
    stream: 'all',
    academic_year: '2026–2027',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Elective and optional subject lists per stream (only the core 7/12/7 are seeded)',
    status: 'awaiting_source',
    source_url: 'https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
    note: 'The higher-secondary curriculum PDF is the right artefact but is Bijoy/ANSI encoded, so its subject tables cannot be read without a converter. Until then the seeded elective lists must be treated as incomplete rather than authoritative.',
    created_at: NOW,
  },
  {
    id: requirementId(9),
    education_level: 'HSC',
    stream: 'all',
    academic_year: '2026–2027',
    curriculum_version_id: null,
    curriculum_subject_id: null,
    requirement: 'Confirmation that every seeded elective is recorded as 1st and 2nd Paper',
    status: 'awaiting_source',
    source_url: 'https://nctb.gov.bd/pages/notices/',
    note: 'Only Bangla and English are split into papers here, and those are marked needs_verification because no HSC textbook list could be rendered. HSC electives are two-paper subjects as well.',
    created_at: NOW,
  },
];
