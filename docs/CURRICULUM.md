# Curriculum data: what is verified, what is not

This file records the exact state of the curriculum reference data shipped in
`supabase/migrations/0007_official_subject_structure.sql` and
`src/services/seed/officialCurriculum.ts` (the two are kept identical by
`tests/db/curriculumParity.test.ts`).

Last reviewed: **2026-10-28**.

## Summary

| Level | Group | Academic year | Subjects seeded | Chapters seeded | Verification status |
| --- | --- | --- | --- | --- | --- |
| SSC | Science | 2025 | 15 | **0** | `needs_verification` |
| SSC | Humanities | 2025 | 15 | **0** | `needs_verification` |
| SSC | Business Studies | 2025 | 14 | **0** | `needs_verification` |
| HSC | Science | 2026–2027 | 7 | **0** | `needs_verification` |
| HSC | Humanities | 2026–2027 | 12 | **0** | `needs_verification` |
| HSC | Business Studies | 2026–2027 | 7 | **0** | `needs_verification` |

All 70 subject rows carry `scope = 'subject_structure'`. That is a deliberate,
narrow claim: *these are the subjects a student in this group studies, with
their official names in English and Bangla*. It is **not** a claim that the
chapter list, topic list or mark distribution is known.

## Sources

| Purpose | URL |
| --- | --- |
| SSC Class 9–10 textbook list, 2025 | https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767 |
| SSC subject structure / marks, National Curriculum 2012 | https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292 |
| HSC notices — ২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক পাঠ্যসূচি | https://nctb.gov.bd/pages/notices/ |
| HSC Class 11–12 textbook list | https://nctb.gov.bd/pages/static-pages/6922de2b933eb65569e18bdf |

Supporting (not official; used only to corroborate, never as the recorded source):

- Prothom Alo, 9 Sept 2025 — NCTB published the revised Class 11–12 subject
  structure under National Curriculum 2012: compulsory Bangla, English and ICT;
  Science takes Physics, Chemistry, Biology *or* Higher Mathematics; Humanities
  takes three from History *or* Islamic History & Culture, Civics & Good
  Governance, Economics, Sociology *or* Social Work, Geography, Logic, plus one
  optional; Business Studies takes three from Accounting, Business Organization
  & Management, Finance Banking & Insurance, Production Management & Marketing.
- Board/college subject-code lists corroborating the HSC Humanities codes
  (109/110 Economics, 117/118 Sociology, 121/122 Logic, 125/126 Geography,
  267/268 Islamic History, 269/270 Civics, 271/272 Social Work).

### Copyright / reproduction

Every source is linked, never copied. No chapter text, question or table of
contents is reproduced here.

## What is genuinely confirmed

1. **The group structure is real.** SSC/Class 9–10 and HSC/Class 11–12 both
   divide into Science, Humanities and Business Studies, and both continue to
   run under National Curriculum 2012 for the academic years recorded above.
2. **The compulsory subjects are real.** Bangla, English, ICT (SSC adds
   Mathematics, plus one religion paper, Career Education, and Physical
   Education/Health/Sports; HSC does not examine Mathematics as a compulsory
   paper).
3. **The group-specific subject names are real.** Physics/Chemistry/Biology/
   Higher Mathematics/BGS for SSC Science; History, Geography, Economics,
   Civics, Sociology, Social Work, Logic for HSC Humanities, and so on.
4. **The Bangla names match the names printed on the NCTB book covers.**

## What is NOT confirmed — do not treat as done

1. **Every chapter list.** Absent by design. NCTB publishes tables of contents
   inside 300+ page PDFs; direct fetches of `nctb.gov.bd` returned only
   JS-rendered navigation shells, so no chapter title was ever read. Inventing
   them would corrupt every downstream progress record.
2. **Per-subject paper splits** (`paper_label`). SSC subjects are commonly split
   into 1st/2nd paper for some subjects and not others; this is not recorded, so
   `paper_label` is `null` everywhere, not guessed.
3. **Subject codes** (`code`). Not stored. The codes above are from
   board/college listings, not from the NCTB document itself.
4. **Marks distribution and period allocation.** Deliberately not stored; the
   schema has no field for it.
5. **The six HSC streams.** NCTB lists six (adds Islamic Studies, Home Science,
   Music). Only the three requested groups are seeded; the other three are
   missing, not empty by choice.
6. **2026 SSC revision.** NCTB published revised Class 9–10 subject structure
   and 2026 SSC syllabuses. The SSC rows here reflect the **2025** textbook list.
   They have not been compared with the 2026 revision.

## How to finish the job (human step, per subject)

1. Open the official textbook PDF or the per-stream curriculum PDF for one
   subject.
2. Copy the chapter titles (English and Bangla) and chapter numbers.
3. Add them in a **new** migration numbered above the highest existing one:

   ```sql
   insert into public.curriculum_chapters
     (id, curriculum_subject_id, title, title_bn, chapter_number, sort_order,
      source_url, verification_status, is_demo)
   values
     (gen_random_uuid(), '<subject-uuid>', 'Chapter 1 …', '১ম অধ্যায় …', '1', 1,
      '<exact source url>', 'needs_verification', false)
   on conflict do nothing;
   ```

   Use `needs_verification` first. Only after a second person or a second source
   agrees, update that row to `verified` — and update the parent subject and
   version too, because `src/domain/curriculum.ts` refuses to show a version as
   "Chapter list verified" while the version itself is unverified.
4. Re-run `npx vitest run tests/db` — the parity test will fail until
   `src/services/seed/officialCurriculum.ts` matches the SQL, which is the point.

Never edit `0001`–`0007` after they have been applied anywhere. Add a new file.

## Data-safety guarantees

- Re-running the seed is a no-op: every row has a deterministic UUID and is
  written with `on conflict (id) do update`.
- `curriculum_subjects` has `unique (curriculum_version_id, name, paper_label)`,
  which **cannot** dedupe these rows: Postgres treats `NULL`s as distinct and
  every seeded subject has `paper_label = null`. The seed therefore keys on `id`.
- No student table is written by the seed. `user_subjects`, `user_chapters`,
  `chapter_checklist_progress`, notes, revisions and sessions keep their ids, so
  progress survives a metadata refresh. Proven by
  `tests/integration/curriculumProgress.test.ts` (local mode, re-runs the seed on
  restart) and `tests/db/curriculumParity.test.ts` (SQL, re-applies the
  migration twice with a linked `user_chapters` row present).
