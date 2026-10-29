import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The first genuinely imported curriculum data (migration 0010).
 *
 * Two official NCTB textbooks — SSC Physics and SSC Chemistry — were read from
 * scans of the printed সূচিপত্র and encoded here. These tests pin down the parts
 * that matter for a student:
 *
 *   * the chapter counts and numbering are what the printed page says;
 *   * the two subjects are `partially_verified`, never `verified`, because the
 *     source is a 2022 OCR scan and not the 2025 edition;
 *   * re-running the migration changes nothing and destroys nothing;
 *   * a student's progress record survives a re-import and still points at the
 *     same chapter;
 *   * nothing claims `verified` without a source anywhere in the database.
 *
 * The test deliberately does not re-type the chapter titles as an oracle. It
 * reads them back from the database, which is the same thing a student sees.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'db', 'bootstrap.sql');

const PHYSICS_SUBJECT = 'a0000000-0000-4000-8000-000000001111';
const CHEMISTRY_SUBJECT = 'a0000000-0000-4000-8000-000000001112';
const STUDENT = '77777777-7777-4777-8777-777777777777';

let db: PGlite;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function applyAllMigrations(): Promise<void> {
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
}

async function exec(sql: string): Promise<void> {
  await db.exec('reset role');
  await db.exec(sql);
}

async function rows<T>(sql: string): Promise<T[]> {
  await db.exec('reset role');
  const result = await db.query<T>(sql);
  return result.rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(BOOTSTRAP, 'utf8'));
  await applyAllMigrations();
  await exec(`insert into auth.users (id) values ('${STUDENT}')`);
}, 120_000);

describe('imported SSC Physics and Chemistry chapters', () => {
  it('stores exactly the 14 Physics chapters from the printed contents page', async () => {
    const chapters = await rows<{ chapter_number: string; title: string; sort_order: number }>(
      `select chapter_number, title, sort_order
         from public.curriculum_chapters
        where curriculum_subject_id = '${PHYSICS_SUBJECT}'
        order by sort_order`,
    );

    expect(chapters.map((row) => row.chapter_number)).toEqual(
      Array.from({ length: 14 }, (_, index) => String(index + 1)),
    );
    expect(chapters[0]?.title).toBe('ভৌত রাশি এবং পরিমাপ');
    expect(chapters[3]?.title).toBe('কাজ, ক্ষমতা ও শক্তি');
    expect(chapters[6]?.title).toBe('তরঙ্গ ও শব্দ');
    expect(chapters[13]?.title).toBe('জীবন বাঁচাতে পদার্থবিজ্ঞান');
  });

  it('stores exactly the 12 Chemistry chapters from the printed contents page', async () => {
    const chapters = await rows<{ chapter_number: string; title: string }>(
      `select chapter_number, title
         from public.curriculum_chapters
        where curriculum_subject_id = '${CHEMISTRY_SUBJECT}'
        order by sort_order`,
    );

    expect(chapters).toHaveLength(12);
    expect(chapters[0]?.title).toBe('রসায়নের ধারণা');
    expect(chapters[7]?.title).toBe('রসায়ন ও শক্তি');
    expect(chapters[11]?.title).toBe('আমাদের জীবনে রসায়ন');
  });

  it('keeps every imported chapter and subject at partially_verified with a source', async () => {
    const chapters = await rows<{ verification_status: string; source_url: string | null }>(
      `select verification_status, source_url
         from public.curriculum_chapters
        where curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')`,
    );
    expect(chapters).toHaveLength(26);
    for (const chapter of chapters) {
      expect(chapter.verification_status).toBe('partially_verified');
      expect(chapter.source_url).toContain('archive.org/details/');
    }

    const subjects = await rows<{ verification_status: string; source_document: string | null }>(
      `select verification_status, source_document
         from public.curriculum_subjects
        where id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')`,
    );
    expect(subjects).toHaveLength(2);
    for (const subject of subjects) {
      expect(subject.verification_status).toBe('partially_verified');
      expect(subject.source_document).toContain('সূচিপত্র');
    }
  });

  it('invents no topics for the imported chapters', async () => {
    const topics = await rows<{ count: number }>(
      `select count(*)::int as count
         from public.curriculum_topics t
         join public.curriculum_chapters c on c.id = t.curriculum_chapter_id
        where c.curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')`,
    );
    expect(topics[0]?.count).toBe(0);
  });

  it('never lets any row claim verified without a source', async () => {
    const orphans = await rows<{ table_name: string }>(`
      select 'chapters' as table_name from public.curriculum_chapters
       where verification_status = 'verified' and source_url is null
      union all
      select 'subjects' from public.curriculum_subjects
       where verification_status = 'verified' and source_url is null
      union all
      select 'versions' from public.curriculum_versions
       where verification_status = 'verified' and source_url is null
    `);
    expect(orphans).toEqual([]);
  });
});

describe('re-running the import', () => {
  it('changes nothing on a second application', async () => {
    const before = await rows<{ id: string; title: string; verification_status: string }>(
      `select id, title, verification_status
         from public.curriculum_chapters
        where curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')
        order by curriculum_subject_id, sort_order`,
    );

    await applyAllMigrations();

    const after = await rows<{ id: string; title: string; verification_status: string }>(
      `select id, title, verification_status
         from public.curriculum_chapters
        where curriculum_subject_id in ('${PHYSICS_SUBJECT}', '${CHEMISTRY_SUBJECT}')
        order by curriculum_subject_id, sort_order`,
    );

    expect(after).toEqual(before);
  });

  it('keeps a student chapter record through a re-import, on the same chapter', async () => {
    await exec(`select set_config('request.jwt.claim.sub', '${STUDENT}', false)`);

    const [userSubject] = await rows<{ id: string }>(`
      insert into public.user_subjects (user_id, curriculum_subject_id, is_demo)
      values ('${STUDENT}', '${PHYSICS_SUBJECT}', false)
      returning id
    `);
    const [chapter] = await rows<{ id: string }>(
      `select id from public.curriculum_chapters
        where curriculum_subject_id = '${PHYSICS_SUBJECT}' and chapter_number = '7'`,
    );

    await exec(`
      insert into public.user_chapters (user_id, user_subject_id, curriculum_chapter_id, status)
      values ('${STUDENT}', '${userSubject!.id}', '${chapter!.id}', 'complete')
    `);

    await applyAllMigrations();

    const records = await rows<{ curriculum_chapter_id: string; status: string }>(
      `select curriculum_chapter_id, status from public.user_chapters where user_id = '${STUDENT}'`,
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.curriculum_chapter_id).toBe(chapter!.id);
    expect(records[0]?.status).toBe('complete');

    await exec(`select set_config('request.jwt.claim.sub', '', false)`);
  });
});

/**
 * HSC first. The person using this app is an HSC student, so the HSC Science
 * split and the one HSC contents page that survived get their own assertions.
 *
 * The Physics 2nd Paper titles are English glosses transcribed from the printed
 * সূচিপত্র of the official book. Its Bengali half is unrecoverable — the scan
 * was OCRed over a legacy single-byte font — so `title_bn` must stay null.
 * A test that quietly filled those in would be inventing a syllabus.
 */
const HSC_SCIENCE_VERSION = 'a0000000-0000-4000-8000-000000000021';
const HSC_PHYSICS_2 = 'a0000000-0000-4000-8000-000000002110';

describe('HSC Science two-paper structure', () => {
  it('splits every HSC Science subject into 1st and 2nd Paper', async () => {
    const papers = await rows<{ name: string; paper_label: string | null }>(
      `select name, paper_label from public.curriculum_subjects
        where curriculum_version_id = '${HSC_SCIENCE_VERSION}'
          and name in ('Physics', 'Chemistry', 'Biology', 'Higher Mathematics')
        order by name, paper_label`,
    );

    expect(papers.map((p) => `${p.name}:${p.paper_label}`)).toEqual([
      'Biology:1st Paper',
      'Biology:2nd Paper',
      'Chemistry:1st Paper',
      'Chemistry:2nd Paper',
      'Higher Mathematics:1st Paper',
      'Higher Mathematics:2nd Paper',
      'Physics:1st Paper',
      'Physics:2nd Paper',
    ]);
  });

  it('keeps the original four subject ids so adopted subjects are not orphaned', async () => {
    // These ids existed before the split and must still resolve to the same
    // subject; migration 0011 only adds a paper label to them.
    const originals = await rows<{ id: string; paper_label: string | null }>(
      `select id, paper_label from public.curriculum_subjects
        where id in ('a0000000-0000-4000-8000-000000002104',
                     'a0000000-0000-4000-8000-000000002105',
                     'a0000000-0000-4000-8000-000000002106',
                     'a0000000-0000-4000-8000-000000002107')
        order by id`,
    );
    expect(originals).toHaveLength(4);
    expect(originals.every((row) => row.paper_label === '1st Paper')).toBe(true);
  });
});

describe('HSC Physics 2nd Paper chapters', () => {
  it('stores the 15 chapters exactly as the printed contents page reads', async () => {
    const chapters = await rows<{ chapter_number: string; title: string; title_bn: string | null }>(
      `select chapter_number, title, title_bn from public.curriculum_chapters
        where curriculum_subject_id = '${HSC_PHYSICS_2}'
        order by sort_order`,
    );

    expect(chapters.map((c) => c.chapter_number)).toEqual(
      Array.from({ length: 15 }, (_, i) => String(i + 1)),
    );
    expect(chapters[0]?.title).toBe('Electrostatics or Static Electricity');
    expect(chapters[6]?.title).toBe('Electromagnetic Wave');
    expect(chapters[14]?.title).toBe('Theory Of Relativity And Astro Physics');
    // Not one Bengali title was invented to fill the gap.
    expect(chapters.every((c) => c.title_bn === null)).toBe(true);
  });

  it('is partially_verified with its OCR limitation recorded, never verified', async () => {
    const chapters = await rows<{ verification_status: string; source_document: string }>(
      `select verification_status, source_document from public.curriculum_chapters
        where curriculum_subject_id = '${HSC_PHYSICS_2}'`,
    );
    expect(chapters).toHaveLength(15);
    for (const chapter of chapters) {
      expect(chapter.verification_status).toBe('partially_verified');
      expect(chapter.source_document).toMatch(/সূচিপত্র/);
    }

    const [subject] = await rows<{ verification_status: string }>(
      `select verification_status from public.curriculum_subjects where id = '${HSC_PHYSICS_2}'`,
    );
    expect(subject?.verification_status).toBe('partially_verified');
  });

  it('leaves the three unsourced HSC Science second papers empty', async () => {
    const empty = await rows<{ name: string; chapters: number }>(
      `select s.name, count(c.id)::int as chapters
         from public.curriculum_subjects s
         left join public.curriculum_chapters c on c.curriculum_subject_id = s.id
        where s.id in ('a0000000-0000-4000-8000-000000002111',
                       'a0000000-0000-4000-8000-000000002112',
                       'a0000000-0000-4000-8000-000000002113')
        group by s.name order by s.name`,
    );
    expect(empty.map((row) => `${row.name}:${row.chapters}`)).toEqual([
      'Biology:0',
      'Chemistry:0',
      'Higher Mathematics:0',
    ]);
  });
});

describe('sources recorded but deliberately not imported (migration 0012)', () => {
  it('keeps the Accounting book in the registry as partial, not as a success', async () => {
    const [source] = await rows<{ access_state: string; document_type: string; note: string }>(
      `select access_state, document_type, note
         from public.curriculum_sources
        where url = 'https://archive.org/details/hsc-nctb-book-accounting'`,
    );
    expect(source?.access_state).toBe('partial');
    expect(source?.document_type).toBe('textbook');
    // The reason it was not imported has to survive in the data, not only in a doc.
    expect(source?.note).toContain('chapter numbers');
  });

  it('imports no chapters for HSC Business Studies, where the numbers are unreadable', async () => {
    const [row] = await rows<{ subjects: number; chapters: number }>(
      `select count(distinct s.id)::int as subjects,
              count(c.id)::int as chapters
         from public.curriculum_versions v
         join public.curriculum_subjects s on s.curriculum_version_id = v.id
         left join public.curriculum_chapters c on c.curriculum_subject_id = s.id
        where v.education_level = 'HSC'
          and v.stream = 'Business Studies'
          and v.is_demo = false
          and s.is_compulsory = true`,
    );
    expect(row?.subjects).toBeGreaterThan(0);
    expect(row?.chapters).toBe(0);
  });

  it('marks the third-party slide decks as rejected rather than as an official textbook', async () => {
    const [source] = await rows<{ document_type: string; authority: string }>(
      `select document_type, authority
         from public.curriculum_sources
        where url like '%10-minute-school%'`,
    );
    expect(source?.document_type).toBe('other');
    expect(source?.authority).toContain('not NCTB');
  });

  it('links the two new Business Studies gaps to the HSC 2026–27 version', async () => {
    const gaps = await rows<{ requirement: string; status: string }>(
      `select requirement, status
         from public.curriculum_pending_requirements
        where education_level = 'HSC'
          and stream = 'Business Studies'
          and academic_year = '2026–2027'
        order by requirement`,
    );
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap.status === 'source_blocked')).toBe(true);
  });
});

describe('topic import groundwork (migration 0014)', () => {
  it('adds the printed number and page columns without backfilling anything', async () => {
    const columns = await rows<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable
         from information_schema.columns
        where table_schema = 'public' and table_name = 'curriculum_topics'
          and column_name in ('topic_number', 'source_page', 'source_document')
        order by column_name`,
    );
    expect(columns.map((column) => column.column_name)).toEqual(['source_document', 'source_page', 'topic_number']);
    expect(columns.every((column) => column.is_nullable === 'YES')).toBe(true);
  });

  it('still holds zero official topics — the columns are empty on purpose', async () => {
    const [row] = await rows<{ topics: number; numbered: number }>(
      `select count(*)::int as topics,
              count(topic_number)::int as numbered
         from public.curriculum_topics
        where is_demo = false`,
    );
    expect(row?.topics).toBe(0);
    expect(row?.numbered).toBe(0);
  });

  it('refuses two sections with the same printed number in one chapter', async () => {
    await expect(
      exec(`insert into public.curriculum_topics
              (curriculum_chapter_id, title, topic_number, source_page, is_demo)
            values
              ('b0000000-0000-4000-8000-000000003001', 'ক', '1.1', 3, false),
              ('b0000000-0000-4000-8000-000000003001', 'খ', '1.1', 5, false)`),
    ).rejects.toThrow(/curriculum_topics_chapter_number_key/);
  });

  it('refuses page 0 as a placeholder reference', async () => {
    await expect(
      exec(`insert into public.curriculum_topics
              (curriculum_chapter_id, title, topic_number, source_page, is_demo)
            values ('b0000000-0000-4000-8000-000000003001', 'গ', '1.2', 0, false)`),
    ).rejects.toThrow(/curriculum_topics_source_page_positive/);
  });

  it('accepts a numbered, page-referenced section and keeps it out of the chapter table', async () => {
    await exec(`insert into public.curriculum_topics
                  (curriculum_chapter_id, title, title_bn, topic_number, source_page,
                   source_document, source_url, verification_status, is_demo)
                values ('b0000000-0000-4000-8000-000000003001', 'Test section', null, '9.9', 42,
                        'test fixture', 'https://example.org/t', 'partially_verified', false)`);
    const [topic] = await rows<{ topic_number: string; source_page: number; chapters: number }>(
      `select t.topic_number, t.source_page,
              (select count(*)::int from public.curriculum_chapters c
                where c.id = t.curriculum_chapter_id) as chapters
         from public.curriculum_topics t
        where t.topic_number = '9.9'`,
    );
    expect(topic?.topic_number).toBe('9.9');
    expect(topic?.source_page).toBe(42);
    // A topic never creates or duplicates a chapter row.
    expect(topic?.chapters).toBe(1);
    await exec(`delete from public.curriculum_topics where topic_number = '9.9'`);
  });
});

describe('2026 HSC textbook pages (migration 0015)', () => {
  /*
   * CORRECTED 2026-10-30. This test used to assert that both ২০২৬ pages were
   * `blocked` and described as an empty পাতা widget. That was wrong: re-read
   * through the same proxy on 2026-10-30, both pages render their tables in
   * full — 29 SSC books, and 5 compulsory HSC books. The assertion now pins the
   * real finding, which is the one that matters for the HSC Science mission:
   * the HSC list renders and simply contains no science elective.
   */
  it('records both verified ২০২৬ pages as rendered, with what each actually lists', async () => {
    // The two pages re-read on 2026-10-30. The third ২০২৬ row (the combined
    // secondary + higher-secondary list) is still genuinely empty and is left
    // out of this assertion on purpose — it is the one page where "blocked"
    // remains the honest state.
    const rows2026 = await rows<{ title: string; access_state: string; note: string }>(
      `select title, access_state, note
         from public.curriculum_sources
        where document_type = 'textbook_list'
          and (url like '%695b99afc4774958d7b70612%' or url like '%o4phi6%')
        order by title`,
    );
    expect(rows2026).toHaveLength(2);
    // Rendered, never "missing": the documents exist and were read.
    expect(rows2026.every((row) => row.access_state === 'rendered')).toBe(true);
    // And each note says what was actually in the table.
    expect(rows2026.every((row) => /render|২৯|five books/i.test(row.note))).toBe(true);
    // The stale claim must not survive on either row.
    expect(rows2026.some((row) => /only navigation|never resolves/i.test(row.note))).toBe(false);
  });

  it('the ২০২৬-২৭ HSC list proves no science elective is published', async () => {
    const [row] = await rows<{ note: string }>(
      `select note from public.curriculum_sources
        where document_type = 'textbook_list'
          and url like '%o4phi6%'`,
    );
    expect(row?.note).toMatch(/five/i);
    expect(row?.note).toMatch(/no Science|not.*Science|Science.*no/i);
  });

  it('no longer repeats the false claim that the ২০২৫-২৬ page did not render', async () => {
    const [requirement] = await rows<{ note: string }>(
      `select note from public.curriculum_pending_requirements
        where requirement = 'Physics 1st Paper, Chemistry, Biology and Higher Mathematics chapter lists'`,
    );
    expect(requirement?.note).not.toMatch(/renders as an unresolved পাতা widget/);
    expect(requirement?.note).toMatch(/CORRECTED 2026-10-28/);
  });

  it('still has no official chapter for the science papers that were searched', async () => {
    const [row] = await rows<{ chapters: number }>(
      `select count(*)::int as chapters
         from public.curriculum_chapters c
         join public.curriculum_subjects s on s.id = c.curriculum_subject_id
         join public.curriculum_versions v on v.id = s.curriculum_version_id
        where c.is_demo = false
          and v.education_level = 'HSC'
          and (s.name like 'Physics%' or s.name like 'Chemistry%'
               or s.name like 'Biology%' or s.name like 'Higher Mathematics%')`,
    );
    // Only Physics 2nd Paper has a read contents page; everything else is 0.
    expect(row?.chapters).toBe(15);
  });
});
