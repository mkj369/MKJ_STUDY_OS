import { describe, expect, it } from 'vitest';
import { planTopicImport, validateTopicImport, type TopicImportFile } from '@/domain/curriculumImport';

/**
 * Topic extraction validation (Priority 4 of the source-recovery milestone).
 *
 * A topic list is read out of the body of a chapter, where a missed heading
 * leaves no trace. These tests pin down the checks that turn "the file looks
 * fine" into "the file can be defended": printed number present and unique,
 * page reference carried where the source had one, no duplicate rows, and no
 * topic list ever imported from an exam syllabus or marked verified without a
 * page to verify it against.
 */

const CHAPTER_ID = 'b0000000-0000-4000-8000-000000003001';

function file(overrides: Partial<TopicImportFile> = {}, topics?: TopicImportFile['topics']): TopicImportFile {
  return {
    chapter_id: CHAPTER_ID,
    academic_year: '2026–2027',
    source_document: 'NCTB HSC Physics 1st Paper — সূচিপত্র',
    source_url: 'https://archive.org/details/example',
    document_type: 'textbook',
    checked_at: '2026-10-28',
    fully_verified: false,
    topics: topics ?? [
      { number: '1.1', title: 'ভৌত জগৎ ও পরিমাপ', page: 3 },
      { number: '1.2', title: 'মাত্রা ও একক', page: 5 },
      { number: '1.3', title: 'ত্রুটি ও নির্ভুলতা', page: 9 },
    ],
    ...overrides,
  };
}

describe('validateTopicImport', () => {
  it('accepts an unbroken, page-referenced list', () => {
    const result = validateTopicImport(file());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.resulting_status).toBe('partially_verified');
  });

  it('rejects a list read from an exam syllabus', () => {
    const result = validateTopicImport(file({ document_type: 'exam_syllabus' }));
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toBe('document_type');
  });

  it('rejects two sections carrying the same printed number', () => {
    const result = validateTopicImport(
      file({}, [
        { number: '1.1', title: 'ক', page: 1 },
        { number: '1.1', title: 'খ', page: 2 },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.path === 'topics[1].number')).toBe(true);
  });

  it('warns — not fails — when a section number is skipped', () => {
    const result = validateTopicImport(
      file({}, [
        { number: '1.1', title: 'ক', page: 1 },
        { number: '1.3', title: 'গ', page: 4 },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue) => /not a clean 1\.\.2 run/.test(issue.message))).toBe(true);
  });

  it('warns when the same title is filed under two numbers', () => {
    const result = validateTopicImport(
      file({}, [
        { number: '1.1', title: 'একই শিরোনাম', page: 1 },
        { number: '1.2', title: 'একই শিরোনাম', page: 2 },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue) => /Title repeats/.test(issue.message))).toBe(true);
  });

  it('records a missing page rather than inventing one', () => {
    const result = validateTopicImport(
      file({}, [
        { number: '1.1', title: 'ক', page: 1 },
        { number: '1.2', title: 'খ' },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue) => /no page reference/.test(issue.message))).toBe(true);
    expect(result.data?.topics[1]?.page ?? null).toBeNull();
  });

  it('refuses to mark a list verified while a section has no page', () => {
    const result = validateTopicImport(
      file({ fully_verified: true }, [
        { number: '1.1', title: 'ক', page: 1 },
        { number: '1.2', title: 'খ' },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toBe('fully_verified');
  });

  it('rejects a placeholder page instead of treating 0 as a reference', () => {
    const result = validateTopicImport(file({}, [{ number: '1.1', title: 'ক', page: 0 }]));
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toBe('topics.0.page');
  });

  it('rejects an empty title', () => {
    const result = validateTopicImport(file({}, [{ number: '1.1', title: '   ', page: 1 }]));
    expect(result.ok).toBe(false);
  });
});

describe('planTopicImport', () => {
  const incoming = validateTopicImport(file()).data!;

  it('plans inserts against an empty chapter', () => {
    const plan = planTopicImport([], incoming);
    expect(plan.inserts).toHaveLength(3);
    expect(plan.idempotent).toBe(false);
  });

  it('is a no-op when the same list is imported twice', () => {
    const existing = incoming.topics.map((topic, index) => ({
      id: `t${index}`,
      topic_number: topic.number,
      title: topic.title,
      source_page: topic.page ?? null,
    }));
    const plan = planTopicImport(existing, incoming);
    expect(plan.idempotent).toBe(true);
    expect(plan.unchanged).toHaveLength(3);
  });

  it('updates a title that changed without touching the others', () => {
    const existing = [
      { id: 't0', topic_number: '1.1', title: 'পুরনো শিরোনাম', source_page: 3 },
      { id: 't1', topic_number: '1.2', title: 'মাত্রা ও একক', source_page: 5 },
      { id: 't2', topic_number: '1.3', title: 'ত্রুটি ও নির্ভুলতা', source_page: 9 },
    ];
    const plan = planTopicImport(existing, incoming);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.previous_title).toBe('পুরনো শিরোনাম');
    expect(plan.unchanged).toHaveLength(2);
  });

  it('reports sections that disappeared instead of deleting them', () => {
    const existing = [
      { id: 't0', topic_number: '1.1', title: 'ক', source_page: 1 },
      { id: 't9', topic_number: '1.9', title: 'পুরনো', source_page: 40 },
    ];
    const plan = planTopicImport(existing, incoming);
    expect(plan.missing_from_import).toEqual(['1.9']);
    expect(plan.inserts).toHaveLength(2);
  });

  it('treats a changed page reference as an update', () => {
    const existing = incoming.topics.map((topic, index) => ({
      id: `t${index}`,
      topic_number: topic.number,
      title: topic.title,
      source_page: index === 0 ? 99 : (topic.page ?? null),
    }));
    const plan = planTopicImport(existing, incoming);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.number).toBe('1.1');
  });
});
