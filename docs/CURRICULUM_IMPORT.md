# Importing official chapter data

How to move an NCTB table of contents into `curriculum_chapters` /
`curriculum_topics` without duplicating rows, without orphaning a student's
progress, and without ever accidentally labelling a guess as verified.

The short version:

1. Transcribe the সূচিপত্র page of one official textbook into a JSON file.
2. Validate it with `validateChapterImport`.
3. Review the plan from `planChapterImport` — nothing is written yet.
4. Apply the upsert below, once per subject.

---

## 1. The file

```json
{
  "subject_id": "a0000000-0000-4000-8000-000000001111",
  "academic_year": "2025",
  "source_document": "NCTB Physics Class 9–10 (2025), table of contents p. 7",
  "source_url": "https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767",
  "document_type": "textbook",
  "checked_at": "2026-10-28",
  "fully_verified": false,
  "chapters": [
    { "number": "1", "title": "Physical Quantities and Their Measurements", "title_bn": "ভৌত রাশি এবং পরিমাপ", "topics": [] }
  ]
}
```

| Field | Rule |
| --- | --- |
| `subject_id` | Must be an existing `curriculum_subjects.id`. Find it in `curriculum_coverage`. |
| `academic_year` | Must match the version's `academic_year`. A 2025 list cannot fill a 2026 row. |
| `source_document` | Names the artefact and the page. "NCTB textbook" is not enough; a reviewer has to be able to find the page. |
| `source_url` | URL of the official document. |
| `document_type` | `textbook` or `curriculum`. **`exam_syllabus` is rejected.** |
| `checked_at` | ISO date the human compared the document with these rows. |
| `fully_verified` | `true` only if every row was compared. Otherwise rows are stored as `partially_verified`. |
| `chapters[].number` | Printed chapter number, as a string. Must be unique within the file. |
| `chapters[].title` | 1–160 characters. `title_bn` optional. |

### Why `exam_syllabus` is rejected

An exam syllabus lists the chapters being examined. That is a subset of the
book, and usually a differently-worded one. Importing it as the textbook's
contents would make a partial list look complete — the exact failure this whole
pipeline exists to prevent. If all you have is a syllabus, the correct move is
to record it against a version with `scope = 'exam_syllabus'`, not to fill the
textbook's chapter list with it.

## 2. Validation

`src/domain/curriculumImport.ts` exports two pure functions:

- **`validateChapterImport(raw)`** → `{ ok, errors, warnings, resulting_status }`
  Rejects a missing source, a non-URL source, duplicate chapter numbers, an
  empty list, and `document_type: 'exam_syllabus'`. Warns when the numbering has
  a gap (usually a missed page) or when the import will be stored as
  `partially_verified`.
- **`planChapterImport(existing, data)`** →
  `{ inserts, updates, unchanged, missing_from_import, idempotent }`
  Classifies every row against what is already stored. `idempotent: true` means
  a re-run writes nothing.

Both are covered by `tests/domain/curriculumImport.test.ts`.

`missing_from_import` is a report, never a delete. A chapter that disappears
from a revised list still has student progress pointing at it.

## 3. Applying it

The upsert is the whole import. It is safe to run repeatedly, because
`0008_curriculum_coverage.sql` adds a partial unique index on
`(curriculum_subject_id, chapter_number)`:

```sql
insert into public.curriculum_chapters
  (curriculum_subject_id, title, title_bn, chapter_number, sort_order,
   verification_status, source_url, source_document, source_checked_at)
values
  ('a0000000-0000-4000-8000-000000001111', 'Physical Quantities and Their Measurements',
   'ভৌত রাশি এবং পরিমাপ', '1', 1, 'partially_verified',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767',
   'NCTB Physics Class 9–10 (2025), table of contents p. 7', '2026-10-28')
on conflict (curriculum_subject_id, chapter_number) where chapter_number is not null
do update set
  title               = excluded.title,
  title_bn            = excluded.title_bn,
  sort_order          = excluded.sort_order,
  verification_status = excluded.verification_status,
  source_url          = excluded.source_url,
  source_document     = excluded.source_document,
  source_checked_at   = excluded.source_checked_at;
```

Topics follow the same shape against
`curriculum_topics (curriculum_chapter_id, title)`.

## 4. What the database enforces even if you skip this document

| Rule | Where |
| --- | --- |
| One chapter per `(subject, chapter_number)` | `curriculum_chapters_subject_number_key` |
| One topic per `(chapter, title)` | `curriculum_topics_chapter_title_key` |
| No `verified` row without `source_url` | `curriculum_chapters_verified_needs_source` |
| `partially_verified` is a valid status | the four rebuilt `*_verification_status_check` constraints |
| Imports never delete | no `delete` in any migration; `user_chapters.curriculum_chapter_id` is `on delete set null`, so a delete would silently orphan progress |

`tests/db/curriculumImportSafety.test.ts` asserts each of these against a real
Postgres (PGlite), including that a student's `user_chapters` row keeps its
`complete` status and its chapter id across two re-imports.

## 5. Flipping a subject to verified

Only after every chapter in that subject is verified against the same document:

```sql
update public.curriculum_subjects
   set verification_status = 'verified'
 where id = 'a0000000-0000-4000-8000-000000001111';
```

Then, and only then, consider the version. `groupCoverage` in
`src/domain/curriculumCoverage.ts` will not report a group complete until every
subject has chapters *and* every chapter is verified *and* the version itself is
`verified`. That rule is unit-tested, so a partially filled curriculum cannot
render as finished.

---

## 6. Importing from a screenshot or a PDF of the সূচিপত্র

This is the route that actually works. The NCTB PDFs are ~100 MB behind a Drive
virus-scan interstitial, so in practice the artefact a human can obtain is one
photographed or scanned page: the book's own contents page.

### What to send, per subject

| # | Item | Why it cannot be skipped |
| --- | --- | --- |
| 1 | The সূচিপত্র page — screenshot, scan, or the PDF page itself | It is the only acceptable source. Not a coaching note, not a blog's chapter list, not an exam syllabus. |
| 2 | The book's imprint page (প্রথম প্রকাশ / পরিমার্জিত সংস্করণ / পুনঃমুদ্রণ) | Decides the `source_document` edition and whether the rows may ever become `verified`. |
| 3 | Subject identity: level (SSC/HSC), class, group, paper (১ম/২য় পত্র) | A chapter list with no subject is unusable, and Bangla/English are two subjects per version. |
| 4 | The `curriculum_subjects.id` it belongs to | From `curriculum_coverage`; the import keys on it. |
| 5 | The academic year the student is actually studying | The version's `academic_year`. A 2022 book cannot silently fill a 2026 row. |

If items 2 or 3 are missing, the import can still be recorded as
`needs_verification`, but it cannot claim `partially_verified`.

### The translation into JSON

```json
{
  "subject_id": "a0000000-0000-4000-8000-000000001111",
  "academic_year": "2025",
  "source_document": "NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র",
  "source_url": "https://archive.org/details/physics-class-9-10-com-opt",
  "document_type": "textbook",
  "checked_at": "2026-10-28",
  "fully_verified": false,
  "chapters": [{ "number": "1", "title": "ভৌত রাশি এবং পরিমাপ", "title_bn": null, "topics": [] }]
}
```

`source_document` must name the edition, not just the subject: two printings of
the same book are different evidence, and the difference is exactly what decides
`verified` versus `partially_verified`.

### Reading a page that came through OCR

An OCR text layer on a scanned page is not a transcript. Four rules:

1. **Reproduce the printed word, and log the fix.** OCR turned চতুর্থ into
   চতুথ, শক্তি into শন্তি and তরঙ্গ into তরঙ্া across the two books imported so
   far. The printed spelling is what a student sees on the page, so it is
   restored — and the correction is written into `source_document` and
   `docs/CURRICULUM.md`. Correcting silently is how invented text gets in.
2. **Never fill a gap from memory.** If a line is unreadable, the chapter is
   missing from the import and the subject stays incomplete. A guessed chapter
   number shifts every later row.
3. **Ignore stray punctuation.** `একাদশ | চল বিদ্যুৎ` is OCR noise around the
   number, not a title.
4. **Check the number sequence before applying.** `validateChapterImport` warns
   on gaps; a gap almost always means a missed line, and it is the cheapest
   signal that the transcription is wrong.

### Worked example (the two imports that exist today)

| Subject | Chapters | Source | Status |
| --- | --- | --- | --- |
| SSC Science / Physics | 14 | `archive.org/details/physics-class-9-10-com-opt` — 2017 revised edition, 2022 reprint | `partially_verified` |
| SSC Science / Chemistry | 12 | `archive.org/details/chemistry-class-9-10-com-opt` — same imprint | `partially_verified` |

Neither is `verified`: the scan is a 2022 reprint, the app's SSC version is
2025, and no one has yet placed the two contents pages side by side. That
comparison is the whole difference — see §5.

### Two mistakes this pipeline has already made, so you do not repeat them

- **Renaming a row that is part of a unique key is not idempotent.** A first
  version of migration `0010` rewrote a `curriculum_pending_requirements.requirement`
  string. `(education_level, academic_year, stream, requirement)` is unique, and
  `0009` re-inserts the old string on every run, so the second application hit a
  duplicate key. Annotate (`note = …`); never rename.
- **Merging only versions and subjects hides the chapters in local mode.** The
  local database merged `OFFICIAL_CURRICULUM.versions` and `.subjects` but not
  `.chapters`, so an import would have appeared in the cloud and vanished in the
  browser demo. Both paths now merge chapters by id.
