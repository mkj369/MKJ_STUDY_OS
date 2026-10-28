/**
 * SSC / HSC subject-structure reference data.
 *
 * WHAT THIS IS
 *   The official subject *structure* for Bangladesh SSC (Class 9–10) and HSC
 *   (Class 11–12) across the three study groups. It contains academic level,
 *   group, subject names in English and Bangla, and the compulsory/elective
 *   flag. It deliberately contains **no chapter rows**.
 *
 * WHAT THIS IS NOT
 *   It is not a textbook table of contents, and it is not marked verified.
 *   Chapter titles live inside the NCTB textbook PDFs (300+ pages each) and in
 *   the per-stream curriculum PDFs. Those documents could not be opened and
 *   parsed programmatically while this file was written, and chapter titles are
 *   never invented to fill the gap. Every row is therefore
 *   `needs_verification` until a human compares it with the cited source.
 *
 * SOURCES (official NCTB, checked 2026-10-28)
 *   SSC — ২০২৫ শিক্ষাবর্ষের মাধ্যমিক স্তরের নবম-দশম শ্রেণির পাঠ্যপুস্তক
 *         https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767
 *   SSC — subject structure / marks distribution (National Curriculum 2012)
 *         https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292
 *   HSC — notices index carrying "২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক ও সমমান
 *         শ্রেণির জন্য নির্ধারিত পাঠ্যসূচি"
 *         https://nctb.gov.bd/pages/notices/
 *
 * HOW TO FINISH THE VERIFICATION
 *   Open the cited PDF for each subject, compare the chapter list, then insert
 *   the chapters with `source_url` set and flip `verification_status` to
 *   'verified' only for the rows that actually matched. See docs/CURRICULUM.md.
 */
import type { CurriculumChapter, CurriculumSubject, CurriculumVersion, VerificationStatus } from '@/types/domain';

const SSC_SOURCE = 'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767';
const SSC_STRUCTURE_SOURCE = 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292';
const HSC_SOURCE = 'https://nctb.gov.bd/pages/notices/';

const CHECKED = '2026-10-28';
const NOW = '2026-10-28T00:00:00.000Z';

export type Group = 'Science' | 'Humanities' | 'Business Studies';
export type Level = 'SSC' | 'HSC';

interface SubjectSeed {
  name: string;
  name_bn: string;
  compulsory: boolean;
  /**
   * '1st Paper' / '2nd Paper' where NCTB publishes the subject as two separate
   * books. Bangla and English are the two every student takes in both levels.
   */
  paper?: '1st Paper' | '2nd Paper';
}

/** Subjects every group takes. Confirmed in the official 2025 textbook list. */
const SSC_COMMON: SubjectSeed[] = [
  { name: 'Bangla', name_bn: 'বাংলা', compulsory: true, paper: '1st Paper' },
  { name: 'English', name_bn: 'ইংরেজি', compulsory: true, paper: '1st Paper' },
  { name: 'Mathematics', name_bn: 'গণিত', compulsory: true },
  { name: 'Information & Communication Technology', name_bn: 'তথ্য ও যোগাযোগ প্রযুক্তি', compulsory: true },
  { name: 'Career Education', name_bn: 'ক্যারিয়ার শিক্ষা', compulsory: true },
  { name: 'Physical Education, Health Science & Sports', name_bn: 'শারীরিক শিক্ষা, স্বাস্থ্যবিজ্ঞান ও খেলাধুলা', compulsory: true },
  { name: 'Islam & Moral Education', name_bn: 'ইসলাম ও নৈতিক শিক্ষা', compulsory: true },
  { name: 'Hindu Religion & Moral Education', name_bn: 'হিন্দু ধর্ম ও নৈতিক শিক্ষা', compulsory: true },
  { name: 'Buddhist Religion & Moral Education', name_bn: 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', compulsory: true },
  { name: 'Christian Religion & Moral Education', name_bn: 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', compulsory: true },
];

/** Group-specific SSC subjects. */
const SSC_GROUPS: Record<Group, SubjectSeed[]> = {
  Science: [
    { name: 'Physics', name_bn: 'পদার্থবিজ্ঞান', compulsory: false },
    { name: 'Chemistry', name_bn: 'রসায়ন', compulsory: false },
    { name: 'Biology', name_bn: 'জীববিজ্ঞান', compulsory: false },
    { name: 'Higher Mathematics', name_bn: 'উচ্চতর গণিত', compulsory: false },
    { name: 'Bangladesh & Global Studies', name_bn: 'বাংলাদেশ ও বিশ্বপরিচয়', compulsory: true },
  ],
  Humanities: [
    { name: 'History of Bangladesh & World Civilization', name_bn: 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা', compulsory: true },
    { name: 'Geography & Environment', name_bn: 'ভূগোল ও পরিবেশ', compulsory: true },
    { name: 'Economics', name_bn: 'অর্থনীতি', compulsory: false },
    { name: 'Civics & Citizenship', name_bn: 'পৌরনীতি ও নাগরিকতা', compulsory: false },
    { name: 'Science', name_bn: 'বিজ্ঞান', compulsory: true },
  ],
  'Business Studies': [
    { name: 'Business Entrepreneurship', name_bn: 'ব্যবসায় উদ্যোগ', compulsory: true },
    { name: 'Accounting', name_bn: 'হিসাববিজ্ঞান', compulsory: true },
    { name: 'Finance & Banking', name_bn: 'ফিন্যান্স ও ব্যাংকিং', compulsory: true },
    { name: 'Science', name_bn: 'বিজ্ঞান', compulsory: true },
  ],
};

const HSC_COMMON: SubjectSeed[] = [
  { name: 'Bangla', name_bn: 'বাংলা', compulsory: true, paper: '1st Paper' },
  { name: 'English', name_bn: 'ইংরেজি', compulsory: true, paper: '1st Paper' },
  { name: 'Information & Communication Technology', name_bn: 'তথ্য ও যোগাযোগ প্রযুক্তি', compulsory: true },
];

const HSC_GROUPS: Record<Group, SubjectSeed[]> = {
  Science: [
    { name: 'Physics', name_bn: 'পদার্থবিজ্ঞান', compulsory: false },
    { name: 'Chemistry', name_bn: 'রসায়ন', compulsory: false },
    { name: 'Biology', name_bn: 'জীববিজ্ঞান', compulsory: false },
    { name: 'Higher Mathematics', name_bn: 'উচ্চতর গণিত', compulsory: false },
  ],
  Humanities: [
    { name: 'History', name_bn: 'ইতিহাস', compulsory: false },
    { name: 'Islamic History & Culture', name_bn: 'ইসলামের ইতিহাস ও সংস্কৃতি', compulsory: false },
    { name: 'Geography', name_bn: 'ভূগোল', compulsory: false },
    { name: 'Economics', name_bn: 'অর্থনীতি', compulsory: false },
    { name: 'Civics & Good Governance', name_bn: 'পৌরনীতি ও সুশাসন', compulsory: false },
    { name: 'Sociology', name_bn: 'সমাজবিজ্ঞান', compulsory: false },
    { name: 'Social Work', name_bn: 'সমাজকর্ম', compulsory: false },
    { name: 'Psychology', name_bn: 'মনোবিজ্ঞান', compulsory: false },
    { name: 'Logic', name_bn: 'যুক্তিবিদ্যা', compulsory: false },
  ],
  'Business Studies': [
    { name: 'Accounting', name_bn: 'হিসাববিজ্ঞান', compulsory: false },
    { name: 'Business Organization & Management', name_bn: 'ব্যবসায় সংগঠন ও ব্যবস্থাপনা', compulsory: false },
    { name: 'Finance, Banking & Insurance', name_bn: 'ফিন্যান্স, ব্যাংকিং ও বিমা', compulsory: false },
    { name: 'Production Management & Marketing', name_bn: 'উৎপাদন ব্যবস্থাপনা ও বিপণন', compulsory: false },
  ],
};

/**
 * Second-paper companions for Bangla and English, appended after each group's
 * own subjects rather than inserted next to their first paper.
 *
 * Appending is deliberate. Subject ids are derived from array position, so
 * inserting in the middle would renumber every later subject and change its
 * primary key — which would orphan every `user_subjects` and `user_chapters`
 * row that points at it. A student's progress outranks a tidy sort order.
 */
const PAPER_TWO: SubjectSeed[] = [
  { name: 'Bangla', name_bn: 'বাংলা', compulsory: true, paper: '2nd Paper' },
  { name: 'English', name_bn: 'ইংরেজি', compulsory: true, paper: '2nd Paper' },
];

/** Named artefacts recorded in `source_document` for the paper-split rows. */
const SSC_BOOK_LIST_DOC = 'NCTB ২০২৫ শিক্ষাবর্ষের নবম-দশম শ্রেণির পাঠ্যপুস্তক তালিকা';
const SSC_PAPER_TWO_DOC: Record<string, string> = {
  Bangla: `${SSC_BOOK_LIST_DOC} — বাংলা ভাষার ব্যাকরণ ও নির্মিতি`,
  English: `${SSC_BOOK_LIST_DOC} — English Grammar and Composition`,
};

/** Deterministic ids keep local mode and the SQL seed byte-identical. */
function versionId(level: Level, group: Group): string {
  const index = level === 'SSC' ? 1 : 2;
  const groupIndex = group === 'Science' ? 1 : group === 'Humanities' ? 2 : 3;
  return `a0000000-0000-4000-8000-${String(index * 10 + groupIndex).padStart(12, '0')}`;
}

function subjectId(level: Level, group: Group, n: number): string {
  const index = level === 'SSC' ? 1 : 2;
  const groupIndex = group === 'Science' ? 1 : group === 'Humanities' ? 2 : 3;
  return `a0000000-0000-4000-8000-${String(index * 1000 + groupIndex * 100 + n).padStart(12, '0')}`;
}

const GROUPS: Group[] = ['Science', 'Humanities', 'Business Studies'];

const VERSION_META: Record<Level, { grade: string; year: string; label: string; source: string; note: string }> = {
  SSC: {
    grade: 'Class 9–10',
    year: '2025',
    label: 'ssc-2025-subject-structure',
    source: SSC_SOURCE,
    note:
      'Subject names and group structure cross-checked against the official NCTB 2025 Class 9–10 textbook list ' +
      'and the National Curriculum 2012 subject-structure/marks table. Chapter lists are NOT included: they ' +
      'require the per-subject textbook table of contents, which has not been compared yet.',
  },
  HSC: {
    grade: 'Class 11–12',
    year: '2026–2027',
    label: 'hsc-2026-subject-structure',
    source: HSC_SOURCE,
    note:
      'Six-stream structure (Science, Humanities, Business Studies, Islamic Studies, Home Science, Music) with ' +
      '3 compulsory + 3 elective + 1 optional subjects, per the NCTB 2026–27 HSC syllabus notice and the ' +
      'revised Class 11–12 subject structure published 8 September 2025. Only Science, Humanities and ' +
      'Business Studies streams are seeded here. Chapter lists are NOT included: they require the per-subject ' +
      'textbook table of contents, which has not been compared yet.',
  },
};

/**
 * The first chapter data that is not invented.
 *
 * Both books were read from scans of the printed সূচিপত্র of the official NCTB
 * textbooks, hosted with a Bengali OCR layer on the Internet Archive. The
 * imprint on each scan reads: প্রথম প্রকাশ সেপ্টেম্বর ২০১২, পরিমার্জিত সংস্করণ
 * সেপ্টেম্বর ২০১৭, পুনঃমুদ্রণ ২০২২.
 *
 * Hence `partially_verified`, never `verified`: the source is an OCR text layer
 * over a 2022 reprint, and nobody has yet opened the 2025 edition to confirm the
 * chapter list is unchanged. The OCR damaged four words across both books
 * (চতুথ→চতুর্থ, শন্তি→শক্তি, তরঙ্া→তরঙ্গ, বস্তুর read as বন্তুর); the printed
 * spellings are restored here and the corrections are documented in
 * docs/CURRICULUM.md rather than applied silently.
 */
type ChapterSource = {
  /** Stable id prefix: 1 = Physics, 2 = Chemistry. Mirrors migration 0010. */
  prefix: number;
  url: string;
  document: string;
  titles: readonly string[];
};

const CHAPTER_SOURCES: Record<string, ChapterSource> = {
  'SSC/Physics': {
    prefix: 1,
    url: 'https://archive.org/details/physics-class-9-10-com-opt',
    document:
      'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র',
    titles: [
      'ভৌত রাশি এবং পরিমাপ',
      'গতি',
      'বল',
      'কাজ, ক্ষমতা ও শক্তি',
      'পদার্থের অবস্থা ও চাপ',
      'বস্তুর ওপর তাপের প্রভাব',
      'তরঙ্গ ও শব্দ',
      'আলোর প্রতিফলন',
      'আলোর প্রতিসরণ',
      'স্থির বিদ্যুৎ',
      'চল বিদ্যুৎ',
      'বিদ্যুতের চৌম্বক ক্রিয়া',
      'আধুনিক পদার্থবিজ্ঞান ও ইলেকট্রনিকস',
      'জীবন বাঁচাতে পদার্থবিজ্ঞান',
    ],
  },
  'SSC/Chemistry': {
    prefix: 2,
    url: 'https://archive.org/details/chemistry-class-9-10-com-opt',
    document:
      'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র',
    titles: [
      'রসায়নের ধারণা',
      'পদার্থের অবস্থা',
      'পদার্থের গঠন',
      'পর্যায় সারণি',
      'রাসায়নিক বন্ধন',
      'মোলের ধারণা ও রাসায়নিক গণনা',
      'রাসায়নিক বিক্রিয়া',
      'রসায়ন ও শক্তি',
      'এসিড-ক্ষারক সমতা',
      'খনিজ সম্পদ: ধাতু-অধাতু',
      'খনিজ সম্পদ: জীবাশ্ম',
      'আমাদের জীবনে রসায়ন',
    ],
  },
};

/** Subject key used by `CHAPTER_SOURCES`; papers are distinct subjects. */
function chapterKey(level: Level, name: string, paper?: string): string {
  return `${level}/${name}${paper ? ` ${paper}` : ''}`;
}

export const OFFICIAL_VERSIONS: CurriculumVersion[] = (['SSC', 'HSC'] as Level[]).flatMap((level) =>
  GROUPS.map((group) => ({
    id: versionId(level, group),
    authority: 'National Curriculum and Textbook Board (NCTB)',
    country: 'Bangladesh',
    education_level: level,
    class_grade: VERSION_META[level].grade,
    stream: group,
    academic_year: VERSION_META[level].year,
    version_label: VERSION_META[level].label,
    title: `${level} ${group} — official subject structure (${VERSION_META[level].year})`,
    source_url: VERSION_META[level].source,
    scope: 'subject_structure' as const,
    source_checked_at: CHECKED,
    source_note: VERSION_META[level].note,
    // Not 'verified': the subject rows were cross-checked, the chapter rows do
    // not exist yet. A half-checked curriculum must not read as complete.
    verification_status: 'needs_verification' as const,
    is_demo: false,
    created_at: NOW,
    updated_at: NOW,
  })),
);

export const OFFICIAL_SUBJECTS: CurriculumSubject[] = (['SSC', 'HSC'] as Level[]).flatMap((level) =>
  GROUPS.flatMap((group) => {
    const seeds = [
      ...(level === 'SSC' ? SSC_COMMON : HSC_COMMON),
      ...(level === 'SSC' ? SSC_GROUPS : HSC_GROUPS)[group],
      ...PAPER_TWO,
    ];
    return seeds.map((seed, index) => {
      const isPaperTwo = seed.paper === '2nd Paper';
      // SSC paper-two rows are checked against the rendered 2025 textbook list,
      // which publishes both books. The paper *number* is inferred from which
      // book it is, hence partially_verified rather than verified. HSC has no
      // rendered book list here, so those rows stay needs_verification.
      const ssc = level === 'SSC';
      const chapters = CHAPTER_SOURCES[chapterKey(level, seed.name, seed.paper)];
      return {
        id: subjectId(level, group, index + 1),
        curriculum_version_id: versionId(level, group),
        name: seed.name,
        name_bn: seed.name_bn,
        code: null,
        paper_label: seed.paper ?? null,
        is_compulsory: seed.compulsory,
        sort_order: index + 1,
        // A subject with imported chapters outranks a subject without: its
        // contents page has been read, even if only from an OCR scan.
        verification_status: (chapters || (isPaperTwo && ssc)
          ? 'partially_verified'
          : 'needs_verification') as VerificationStatus,
        source_url: chapters ? chapters.url : isPaperTwo ? (ssc ? SSC_SOURCE : HSC_SOURCE) : ssc ? SSC_STRUCTURE_SOURCE : HSC_SOURCE,
        source_document: chapters
          ? chapters.document
          : isPaperTwo
            ? (ssc ? SSC_PAPER_TWO_DOC[seed.name] ?? null : null)
            : (ssc && seed.paper === '1st Paper' ? SSC_BOOK_LIST_DOC : null),
        created_at: NOW,
      };
    });
  }),
);

/**
 * Chapter rows, one per printed chapter. Empty for every subject whose contents
 * page has not been read — that emptiness is the honest state, not an omission.
 */
export const OFFICIAL_CHAPTERS: CurriculumChapter[] = OFFICIAL_SUBJECTS.flatMap((subject) => {
  const version = OFFICIAL_VERSIONS.find((entry) => entry.id === subject.curriculum_version_id);
  if (!version) return [];
  const source =
    CHAPTER_SOURCES[chapterKey(version.education_level as Level, subject.name, subject.paper_label ?? undefined)];
  if (!source) return [];
  return source.titles.map((title, index) => ({
    id: `b0000000-0000-4000-8000-${String(source.prefix * 1000 + index + 1).padStart(12, '0')}`,
    curriculum_subject_id: subject.id,
    parent_id: null,
    title,
    title_bn: null,
    chapter_number: String(index + 1),
    sort_order: index + 1,
    source_url: source.url,
    source_document: source.document,
    source_checked_at: CHECKED,
    verification_status: 'partially_verified' as const,
    is_demo: false,
    created_at: NOW,
  }));
});

export const OFFICIAL_CURRICULUM = {
  versions: OFFICIAL_VERSIONS,
  subjects: OFFICIAL_SUBJECTS,
  chapters: OFFICIAL_CHAPTERS,
};
