import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OFFICIAL_CHAPTERS, OFFICIAL_SUBJECTS, OFFICIAL_VERSIONS } from '@/services/seed/officialCurriculum';
import { CURRICULUM_SOURCES, PENDING_REQUIREMENTS } from '@/services/seed/curriculumReadiness';

/**
 * The curriculum reference data exists twice on purpose: as TypeScript (local
 * demo mode reads it straight from `src/services/seed`) and as SQL (cloud mode
 * applies the migration). Two copies drift. This test applies the real
 * migrations and asserts the database rows match the TypeScript rows field for
 * field, so a mismatch fails CI instead of showing up as a different syllabus
 * depending on whether the student is online.
 *
 * It also asserts the two properties the import must never lose:
 *   * re-running the seed does not duplicate a single row, and
 *   * no chapter row exists for an official version (nothing invented).
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

const SEED_FILE = '0007_official_subject_structure.sql';
const READINESS_FILE = '0009_curriculum_inventory.sql';

let db: PGlite;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function applyAll(): Promise<void> {
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
}

async function rows<T>(sql: string): Promise<T[]> {
  await db.exec('reset role');
  const result = await db.query<T>(sql);
  return result.rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(BOOTSTRAP, 'utf8'));
  await applyAll();
}, 60_000);

describe('official curriculum seed', () => {
  it('matches the TypeScript reference data exactly', async () => {
    const versions = await rows<{
      id: string;
      education_level: string;
      stream: string;
      academic_year: string;
      version_label: string;
      scope: string;
      verification_status: string;
      is_demo: boolean;
      source_url: string | null;
    }>(
      `select id, education_level, stream, academic_year, version_label, scope,
              verification_status, is_demo, source_url
         from curriculum_versions where not is_demo order by id`,
    );

    const expected = [...OFFICIAL_VERSIONS].sort((a, b) => a.id.localeCompare(b.id));
    expect(versions).toHaveLength(expected.length);
    expect(versions).toEqual(
      expected.map((v) => ({
        id: v.id,
        education_level: v.education_level,
        stream: v.stream,
        academic_year: v.academic_year,
        version_label: v.version_label,
        scope: v.scope,
        verification_status: v.verification_status,
        is_demo: v.is_demo,
        source_url: v.source_url,
      })),
    );

    const subjects = await rows<{
      id: string;
      curriculum_version_id: string;
      name: string;
      name_bn: string | null;
      is_compulsory: boolean;
      sort_order: number;
      verification_status: string;
    }>(
      `select s.id, s.curriculum_version_id, s.name, s.name_bn, s.is_compulsory,
              s.sort_order, s.verification_status
         from curriculum_subjects s
         join curriculum_versions v on v.id = s.curriculum_version_id
        where not v.is_demo order by s.id`,
    );

    const expectedSubjects = [...OFFICIAL_SUBJECTS].sort((a, b) => a.id.localeCompare(b.id));
    expect(subjects).toHaveLength(expectedSubjects.length);
    expect(subjects).toEqual(
      expectedSubjects.map((s) => ({
        id: s.id,
        curriculum_version_id: s.curriculum_version_id,
        name: s.name,
        name_bn: s.name_bn,
        is_compulsory: s.is_compulsory,
        sort_order: s.sort_order,
        verification_status: s.verification_status,
      })),
    );
  });

  it('covers SSC and HSC for all three study groups with bilingual names', async () => {
    const summary = await rows<{ level: string; stream: string; n: number; bn: number }>(
      `select v.education_level as level, v.stream,
              count(*)::int as n,
              count(s.name_bn)::int as bn
         from curriculum_subjects s
         join curriculum_versions v on v.id = s.curriculum_version_id
        where not v.is_demo
        group by v.education_level, v.stream
        order by v.education_level, v.stream`,
    );

    expect(summary.map((r) => `${r.level}/${r.stream}`)).toEqual([
      'HSC/Business Studies',
      'HSC/Humanities',
      'HSC/Science',
      'SSC/Business Studies',
      'SSC/Humanities',
      'SSC/Science',
    ]);
    for (const row of summary) {
      expect(row.n).toBeGreaterThan(4);
      // Bangla names are the ones students actually read on the textbook cover.
      expect(row.bn).toBe(row.n);
    }
  });

  it('matches the TypeScript chapter data exactly, and every chapter names a source', async () => {
    const chapters = await rows<{
      id: string;
      curriculum_subject_id: string;
      title: string;
      chapter_number: string | null;
      sort_order: number;
      source_url: string | null;
      verification_status: string;
    }>(
      `select c.id, c.curriculum_subject_id, c.title, c.chapter_number,
              c.sort_order, c.source_url, c.verification_status
         from curriculum_chapters c
         join curriculum_subjects s on s.id = c.curriculum_subject_id
         join curriculum_versions v on v.id = s.curriculum_version_id
        where not v.is_demo
        order by c.id`,
    );

    const expected = [...OFFICIAL_CHAPTERS].sort((a, b) => a.id.localeCompare(b.id));
    expect(chapters).toEqual(
      expected.map((c) => ({
        id: c.id,
        curriculum_subject_id: c.curriculum_subject_id,
        title: c.title,
        chapter_number: c.chapter_number,
        sort_order: c.sort_order,
        source_url: c.source_url,
        verification_status: c.verification_status,
      })),
    );

    // A chapter without a source is an invented chapter, whatever it says.
    for (const chapter of chapters) {
      expect(chapter.source_url).toBeTruthy();
      expect(chapter.verification_status).not.toBe('verified');
    }

    // Only the two subjects whose printed contents page was read have chapters.
    const [{ subjects_with_chapters }] = await rows<{ subjects_with_chapters: number }>(
      `select count(distinct curriculum_subject_id)::int as subjects_with_chapters
         from curriculum_chapters c
         join curriculum_subjects s on s.id = c.curriculum_subject_id
         join curriculum_versions v on v.id = s.curriculum_version_id
        where not v.is_demo`,
    );
    expect(subjects_with_chapters).toBe(2);
  });

  it('never marks an official row verified while chapters are missing', async () => {
    const [{ verified }] = await rows<{ verified: number }>(
      `select count(*)::int as verified
         from curriculum_versions where not is_demo and verification_status = 'verified'`,
    );
    expect(verified).toBe(0);
  });

  it('keeps a student chapter linked to its curriculum row when the seed re-runs', async () => {
    // A student adopted a subject and added a chapter from the demo curriculum.
    const [version] = await rows<{ id: string }>(
      'select id from curriculum_versions where is_demo limit 1',
    );
    const [subject] = await rows<{ id: string }>(
      `select id from curriculum_subjects where curriculum_version_id = '${version!.id}' limit 1`,
    );
    const [chapter] = await rows<{ id: string }>(
      `select id from curriculum_chapters where curriculum_subject_id = '${subject!.id}' limit 1`,
    );

    await db.exec('reset role');
    await db.exec(`insert into auth.users (id) values ('33333333-3333-4333-8333-333333333333')`);
    await db.exec(
      `insert into public.user_subjects (id, user_id, curriculum_subject_id, curriculum_version_id, status, color, sort_order, is_demo)
       values ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
               '${subject!.id}', '${version!.id}', 'active', '#1d4ed8', 1, false)`,
    );
    await db.exec(
      `insert into public.user_chapters (id, user_id, user_subject_id, curriculum_chapter_id, status, is_demo)
       values ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333',
               '44444444-4444-4444-8444-444444444444', '${chapter!.id}', 'complete', false)`,
    );

    // Curriculum metadata is refreshed — twice, the way a re-deploy and a
    // corrective migration would.
    const seed = readFileSync(join(MIGRATIONS_DIR, SEED_FILE), 'utf8');
    await db.exec(seed);
    await db.exec(seed);

    const [progress] = await rows<{ status: string; curriculum_chapter_id: string | null }>(
      `select status, curriculum_chapter_id from public.user_chapters
        where id = '55555555-5555-4555-8555-555555555555'`,
    );
    expect(progress?.status).toBe('complete');
    expect(progress?.curriculum_chapter_id).toBe(chapter!.id);
  });

  it('records the paper split for Bangla and English without renumbering ids', async () => {
    const papers = await rows<{
      education_level: string;
      stream: string;
      name: string;
      paper_label: string | null;
      sort_order: number;
      verification_status: string;
    }>(
      `select v.education_level, v.stream, s.name, s.paper_label, s.sort_order, s.verification_status
         from curriculum_subjects s
         join curriculum_versions v on v.id = s.curriculum_version_id
        where not v.is_demo and s.name in ('Bangla', 'English')
        order by v.education_level, v.stream, s.name, s.paper_label`,
    );

    // Six versions x two subjects x two papers.
    expect(papers).toHaveLength(24);
    for (const row of papers) {
      expect(row.paper_label === '1st Paper' || row.paper_label === '2nd Paper').toBe(true);
    }
    // Paper 1 keeps the low sort order, so an existing student record that
    // pointed at "Bangla" still resolves to the same subject row.
    const firstPapers = papers.filter((row) => row.paper_label === '1st Paper');
    expect(firstPapers.every((row) => row.sort_order <= 3)).toBe(true);
  });

  it('keeps the source registry and outstanding requirements in sync with SQL', async () => {
    const sources = await rows<{ url: string; document_type: string; access_state: string; checked_at: string | null }>(
      `select url, document_type, access_state, checked_at::text from curriculum_sources order by url, document_type`,
    );
    const expectedSources = [...CURRICULUM_SOURCES]
      .map((s) => ({
        url: s.url,
        document_type: s.document_type,
        access_state: s.access_state,
        checked_at: s.checked_at,
      }))
      .sort((a, b) => a.url.localeCompare(b.url) || a.document_type.localeCompare(b.document_type));
    expect(sources).toEqual(expectedSources);

    const requirements = await rows<{ education_level: string; academic_year: string; stream: string; requirement: string; status: string }>(
      `select education_level, academic_year, stream, requirement, status
         from curriculum_pending_requirements
        order by education_level, academic_year, stream, requirement`,
    );
    const expectedRequirements = [...PENDING_REQUIREMENTS]
      .map((r) => ({
        education_level: r.education_level,
        academic_year: r.academic_year,
        stream: r.stream,
        requirement: r.requirement,
        status: r.status,
      }))
      .sort(
        (a, b) =>
          a.education_level.localeCompare(b.education_level) ||
          a.academic_year.localeCompare(b.academic_year) ||
          a.stream.localeCompare(b.stream) ||
          a.requirement.localeCompare(b.requirement),
      );
    expect(requirements).toEqual(expectedRequirements);
  });

  it('is idempotent: re-running the inventory migration creates no duplicates', async () => {
    const counts = async () => {
      const [s] = await rows<{ n: number }>('select count(*)::int as n from curriculum_subjects');
      const [src] = await rows<{ n: number }>('select count(*)::int as n from curriculum_sources');
      const [req] = await rows<{ n: number }>('select count(*)::int as n from curriculum_pending_requirements');
      return { subjects: s.n, sources: src.n, requirements: req.n };
    };

    const before = await counts();
    const inventory = readFileSync(join(MIGRATIONS_DIR, READINESS_FILE), 'utf8');
    await db.exec(inventory);
    await db.exec(inventory);
    expect(await counts()).toEqual(before);
  });

  it('is idempotent: re-running the seed creates no duplicates', async () => {
    const counts = async () => {
      const [v] = await rows<{ n: number }>('select count(*)::int as n from curriculum_versions');
      const [s] = await rows<{ n: number }>('select count(*)::int as n from curriculum_subjects');
      return { versions: v.n, subjects: s.n };
    };

    const before = await counts();
    const seed = readFileSync(join(MIGRATIONS_DIR, SEED_FILE), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    expect(await counts()).toEqual(before);
  });
});
