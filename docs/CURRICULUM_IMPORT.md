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
