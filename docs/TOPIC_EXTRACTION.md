# Topic extraction — the workflow, and why it is not running yet

**Status: designed, schema ready, validation tested, zero topics extracted.**
This document specifies how a chapter's *body* turns into `curriculum_topics`
rows once chapter lists exist. It is deliberately not a promise that topics are
coming soon — it is the set of rules that will decide whether a topic list is
allowed into the database at all.

Last reviewed: **2026-10-28**.

---

## 1. Why topics are a different problem from chapters

| | Chapter list | Topic list |
| --- | --- | --- |
| Where it lives | The সূচিপত্র, 1–2 pages | The body, 10–40 pages per chapter |
| Numbered? | Yes — `১.`, `২.` … | Yes, but `১.১`, `১.২` sit *between* paragraphs |
| A missed line | Shows as a gap in a run | Shows as nothing. The page looks complete |
| Typical failure | OCR damage to a title | Missing a heading that had no blank line above it |
| Cost to re-check | Re-read one page | Re-read the chapter |

A chapter list that is missing a row is *detectable*. A topic list that is
missing three rows is not, which is why the rules below lean towards refusing
a file rather than importing a plausible one.

---

## 2. What a topic row has to carry

Migration `0014` added the three columns that were missing. Everything here
exists in the schema today:

| Column | Rule | Why |
| --- | --- | --- |
| `curriculum_chapter_id` | must reference a chapter that already has a read source | A topic cannot be better sourced than its chapter |
| `topic_number` | the **printed** number, verbatim (`১.১`, `1.2`) | Natural key for idempotency; proves the run is unbroken |
| `title` | verbatim, never re-worded | The whole point of the import |
| `title_bn` | `null` is allowed and honest | A scan that lost the Bengali did not lose the section |
| `source_page` | the printed page, or `null` | A section that cannot be found again is indistinguishable from an invented one |
| `source_document`, `source_url` | required | Same provenance rule as chapters |
| `verification_status` | `partially_verified` until every row was re-opened | `verified` requires a source (constrained in `0008`) and a page (`0009`‑style check in the validator) |
| `is_demo` | `false` | Demo topics must never be counted as coverage |

Topics are **not** chapters. Nothing in this workflow creates, renames or
deletes a `curriculum_chapters` row, and nothing touches `user_chapters` or
`user_topics` — a student's ticks, notes and revision history survive because
the import only ever inserts or updates curriculum rows in place.

---

## 3. The workflow

```
        ┌─────────────────────────────────────────────────────┐
        │ 0. Chapter list exists and is read-sourced           │
        │    (a chapter with no source cannot gain topics)     │
        └───────────────────────┬─────────────────────────────┘
                                ▼
        ┌─────────────────────────────────────────────────────┐
        │ 1. Capture the body pages                            │
        │    PDF / scan / photographs of ONE chapter           │
        │    Record: edition, printing year, page range        │
        └───────────────────────┬─────────────────────────────┘
                                ▼
        ┌─────────────────────────────────────────────────────┐
        │ 2. Transcribe headings, in order, verbatim            │
        │    number + title + printed page                     │
        │    Unreadable → leave the row out and note the page  │
        │    Never fill a gap from memory or from another book │
        └───────────────────────┬─────────────────────────────┘
                                ▼
        ┌─────────────────────────────────────────────────────┐
        │ 3. validateTopicImport(file)                         │
        │    errors → fix the file, do not "fix" the validator │
        │    warnings → read the named page again              │
        └───────────────────────┬─────────────────────────────┘
                                ▼
        ┌─────────────────────────────────────────────────────┐
        │ 4. planTopicImport(existing, file)                   │
        │    insert / update / unchanged, plus missing         │
        │    `idempotent: true` means a re-run writes nothing  │
        └───────────────────────┬─────────────────────────────┘
                                ▼
        ┌─────────────────────────────────────────────────────┐
        │ 5. Re-open the book and check every row against its   │
        │    own page number — this is what "verified" means    │
        └───────────────────────┬─────────────────────────────┘
                                ▼
        ┌─────────────────────────────────────────────────────┐
        │ 6. Upsert by (chapter, topic_number).                │
        │    Nothing is deleted. `missing_from_import` is      │
        │    reported, never applied.                          │
        └─────────────────────────────────────────────────────┘
```

### The file

```json
{
  "chapter_id": "b0000000-0000-4000-8000-000000003001",
  "academic_year": "2026–2027",
  "source_document": "NCTB HSC পদার্থবিজ্ঞান ১ম পত্র — অধ্যায় ১, পৃষ্ঠা ১–২৪",
  "source_url": "https://…",
  "document_type": "textbook",
  "checked_at": "2026-10-28",
  "fully_verified": false,
  "topics": [
    { "number": "১.১", "title": "ভৌত জগৎ ও পরিমাপ", "page": 3 },
    { "number": "১.২", "title": "মাত্রা ও একক", "page": 5 }
  ]
}
```

`document_type` must be `textbook`. An exam syllabus is refused by the
validator with a specific message, because a syllabus lists the sections that
are *examined* and the book lists the sections it *contains* — different sets,
and the smaller one must never sit in the column the bigger one belongs in.

---

## 4. What the validator actually checks

Implemented in `src/domain/curriculumImport.ts`, tested in
`tests/domain/topicImport.test.ts` (14 tests).

### Errors — the import is refused

| Check | Message |
| --- | --- |
| `document_type === 'exam_syllabus'` | An exam syllabus lists the sections being examined, not the sections the book contains. |
| Duplicate printed number | `Section number "1.1" already appears at topics[0].` |
| Blank title | A title of only whitespace is an OCR artefact, not a heading. |
| Blank number | A section number of only whitespace cannot key an import. |
| `page <= 0` | Rejected by the schema and by `curriculum_topics_source_page_positive`. |
| `fully_verified` with any page missing | A topic list cannot be marked verified while some sections carry no page reference to verify against. |
| Empty `topics[]` | Nothing to import. |

### Warnings — the file is accepted but a human must look

| Check | Why it is a warning |
| --- | --- |
| Section numbers are not a clean `1..n` run per chapter prefix | Books do skip numbers. A gap is *usually* a missed heading, and the warning names the numbers found. |
| Two rows share a title under different numbers | Often the same page read twice; sometimes a genuine repeat. Only a human can tell. |
| Some sections have no page | Allowed, but it caps the status at `partially_verified`. |

---

## 5. Idempotency and the "missing" problem

`planTopicImport` classifies every incoming row against what is stored:

* **insert** — the number is not in the chapter yet;
* **update** — same number, different title or page (the `previous_title` is
  kept in the plan so a reviewer sees exactly what changed);
* **unchanged** — byte-identical; a re-run of the same file lands entirely here
  and `idempotent === true`.

Rows that exist in the database but are **not** in the new reading are
returned as `missing_from_import` and are **never deleted**. Deleting would
cascade into `user_topics` and take a student's progress with it — the same
reason chapters are never deleted (see `docs/CURRICULUM_IMPORT.md` §4).

---

## 6. Known limit: what has to be true before the first import

Nothing here has been run against a real book, because **no chapter body is
readable in this environment yet**:

| Requirement | State |
| --- | --- |
| At least one chapter with a read source | 41 chapters across 3 subject-papers |
| A readable *body* (not contents page) for one of them | **0** — the SSC scans are OCR of a legacy font, the HSC Physics 2nd Paper scan is the same |
| A born-digital body with a text layer | **0** found so far |

So the workflow is ready and the gate is the source, not the code. The first
subject to clear it will most likely be an HSC science book supplied as a
born-digital PDF or a set of clear photographs of one chapter — 10–30 pages,
not the whole book.

### What a usable submission looks like

1. Which subject-paper and which chapter (by the chapter title already in the app).
2. The edition and printing year from the imprint page.
3. Photographs or a PDF of that chapter's pages, in order, with the printed
   page numbers visible.
4. Optionally: the section numbers you had to skip because they were
   unreadable, so they can be recorded as missing rather than guessed.

That is enough to run steps 2–6 above and end up with a topic list whose every
row can be checked by opening one page.

---

## 7. Related

- [CURRICULUM_IMPORT.md](CURRICULUM_IMPORT.md) — the chapter-level version of
  this workflow, including the SQL.
- [CURRICULUM_SOURCES.md](CURRICULUM_SOURCES.md) — which books are readable at
  all, and which are not.
- `supabase/migrations/0014_topic_source_columns.sql` — the columns.
- `tests/domain/topicImport.test.ts`, `tests/db/curriculumRealChapters.test.ts`
  — the tests that keep the rules above true.
