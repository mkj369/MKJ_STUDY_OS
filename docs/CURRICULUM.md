# Curriculum data: what is verified, what is not

This file records the exact state of the curriculum reference data shipped in
`supabase/migrations/0007_official_subject_structure.sql`,
`0009_curriculum_inventory.sql`, `0010_ssc_physics_chemistry_chapters.sql`,
`0011_hsc_two_paper_split_and_physics_2.sql` and their TypeScript twins in
`src/services/seed/` (the two sides are kept identical by
`tests/db/curriculumParity.test.ts`).

The source-hunt audit — which documents were opened, which were readable, and
what each one yielded — lives in [CURRICULUM_SOURCES.md](CURRICULUM_SOURCES.md).
This file is the resulting state of the data.

Last reviewed: **2026-10-28**.

## Summary

| Level | Group | Academic year | Subjects | Chapters | Topics | Verification status |
| --- | --- | --- | --- | --- | --- | --- |
| HSC | Science | 2026–2027 | 13 | **15** (Physics 2nd Paper) | **0** | 1 subject-paper `partially_verified`, 12 `needs_verification` |
| HSC | Humanities | 2026–2027 | 14 | **0** | **0** | `needs_verification` |
| HSC | Business Studies | 2026–2027 | 9 | **0** | **0** | `needs_verification` |
| SSC | Science | 2025 | 17 | **26** (Physics 14, Chemistry 12) | **0** | 2 subjects `partially_verified`, 15 `needs_verification` |
| SSC | Humanities | 2025 | 17 | **0** | **0** | `needs_verification` |
| SSC | Business Studies | 2025 | 16 | **0** | **0** | `needs_verification` |

HSC is listed first because it is the strategic priority, not because it is
more complete — it has fewer chapters than SSC.

**86 subjects, 41 chapters, 0 topics.** Three of the 86 subject-papers have a
chapter list, each read from the printed সূচিপত্র of an official textbook; the
other 83 have none. No subject and no version is `verified`.

Every subject row carries
`scope = 'subject_structure'`, which is a deliberately narrow claim: *these are
the subjects a student in this group studies, with their official names in
English and Bangla*. It is **not** a claim that the chapter list, topic list or
mark distribution is known.

The curriculum is therefore **incomplete**, and the app says so on screen
rather than in a footnote. `docs/` and the UI both refuse to call any level,
group or year complete while chapter data is missing.

## The chapter data that exists (migrations 0010 and 0011)

| Subject | Chapters | Evidence | Status |
| --- | --- | --- | --- |
| SSC Science / Physics (পদার্থবিজ্ঞান) | 14 | [archive.org/details/physics-class-9-10-com-opt](https://archive.org/details/physics-class-9-10-com-opt) — scan of the printed NCTB book, Bengali OCR layer | `partially_verified` |
| SSC Science / Chemistry (রসায়ন) | 12 | [archive.org/details/chemistry-class-9-10-com-opt](https://archive.org/details/chemistry-class-9-10-com-opt) — same imprint, same OCR pipeline | `partially_verified` |
| HSC Science / Physics 2nd Paper | 15 | [archive.org/details/hsc-nctb-book-physics-2nd-part](https://archive.org/details/hsc-nctb-book-physics-2nd-part) — 151-page scan, ABBYY text layer, **English gloss only** | `partially_verified` |

**Imprint of the two SSC scans:** প্রথম প্রকাশ সেপ্টেম্বর ২০১২ · পরিমার্জিত সংস্করণ
সেপ্টেম্বর ২০১৭ · পুনঃমুদ্রণ ২০২২.

**Imprint of the HSC Physics 2nd Paper scan: unknown.** There is no legible
imprint or copyright page in the text layer, so the edition cannot be recorded
— which is one of the reasons that subject stays `partially_verified` rather
than `verified`, and the reason `curriculum_sources.academic_year` reads
`edition unknown` for it.

**HSC Physics 2nd Paper chapters, exactly as stored** (the printed English gloss
is kept in `title_en`; `title_bn` is `null` because the Bengali half of each
title did not survive OCR and was not reconstructed):

1. Electrostatics or Static Electricity
2. Electric Current and Circuit
3. Heating & Chemical Effect of Electric Current
4. Magnetic Effect of Electric Current
5. Magnetic Material Terrestrial Magnetism
6. Electromagnetic Induction and Alternating Current
7. Electromagnetic Wave
8. Reflection Of light
9. Refraction of Light
10. Optical Instrument
11. Wave Theory Of Light
12. Electron And Photon
13. Atom
14. Electronics
15. Theory Of Relativity And Astro Physics

The chapter *numbers* and the English titles are what the book prints next to
them; the capitalisation is the scan's, not a style guide's.

### Why HSC Accounting was not imported

The Accounting scan is the near-miss of this round. Its সূচিপত্র prints an
English title on every chapter row, and ten of them are legible:

> Introduction to Accounting · Books of Accounts · Bank Reconciliation
> Statement · Trial Balance · Principles of Accounting · Accounting for
> Receivables · Worksheet · Accounting for Tangible and Intangible Assets ·
> Financial Statements · Single Entry System

What did **not** survive is the other half of each row: the Bengali title, and
the chapter number. Both are printed in Bengali digits, and the legacy font
turns those into arbitrary ASCII (`১.`→`\s`, `৩.`→`8.`) with no consistent
mapping. Physics 2nd Paper was importable precisely because its numbers are
Latin digits.

So the titles exist and the numbering does not. Numbering ten rows `1…10` by
their position on the page would be an inference dressed as a fact, and a wrong
number shifts every later chapter for every student who ticks it. The subject
stays at zero chapters and the gap is recorded in
`curriculum_pending_requirements` as *needs the সূচিপত্র page*.

**Why not `verified`.** Three reasons, each of which a person can clear:

1. The evidence is an OCR text layer over a scan, not the publisher's digital file.
2. The scan is a **2022 reprint**; the app's SSC version is **2025**. Nobody has
   compared the 2025 contents page with this one. Until that happens, calling it
   verified would be claiming a check that did not occur.
3. OCR damaged four words. The printed spellings were restored, and every
   correction is recorded rather than applied silently:

   | OCR text | Printed text | Where |
   | --- | --- | --- |
   | চতুথ … শন্তি | চতুর্থ … শক্তি | Physics ch. 4 |
   | তরঙ্া | তরঙ্গ | Physics ch. 7 |
   | শন্তি | শক্তি | Chemistry ch. 8 |
   | বন্তুর | বস্তুর | Physics ch. 6 |

**What is still missing for these three subject-papers:** every topic and every
Bengali title for HSC Physics 2nd Paper. The section headings (১.১, ১.২ …) live
in the body of each book, not on the contents page, so extracting them means
reading ~400 pages of OCR — a different job from this one, and a
half-extracted topic list would be worse than an empty one.

## Subjects still awaiting a contents page

**83 of 86.** The three that are done are listed above. Every remaining SSC and
HSC subject needs the same single artefact: the সূচিপত্র page of the official
book, plus its edition.

The HSC gap is the harder one. Ten HSC Science books were searched for on the
Internet Archive and NCTB; six items were inspected, one contents page was
recoverable (Physics 2nd Paper). The other HSC science items are either empty
`emptyfiles` stubs or legacy-font scans whose contents pages OCR to mojibake with
no English gloss — see [CURRICULUM_SOURCES.md](CURRICULUM_SOURCES.md) §3 for the
per-item result. Consequently the HSC elective lists seeded from the curriculum
notice stay unverified, and HSC Humanities and Business Studies still have **no**
official inventory at all beyond the seed.

## An exam syllabus is not a contents page

Three ২০২৬-২৭ HSC exam syllabi were recovered this round as born-digital PDFs
with real text layers: বাংলা ১ম পত্র, English 1st Paper and তথ্য ও যোগাযোগ
প্রযুক্তি. They are the first HSC documents this project has read *cleanly* —
no OCR, no legacy font — and it is tempting to treat them as chapter sources.
They are not, and migration `0013` deliberately imports none of their contents.

The difference is not pedantry:

| | Textbook সূচিপত্র | Exam syllabus |
| --- | --- | --- |
| Answers | What the book contains | What the board will examine |
| Bangla ১ম পত্র | the book's own chapter list | গদ্য ১২ + কবিতা ১২ + সহপাঠ ২ — examination groupings, not chapters |
| English 1st Paper | the book's units | 12 units, each split into *seen / unseen* comprehension marks |
| ICT | the book's 6 chapters | 6 chapters **and** mark distribution per question type |

The Bangla syllabus is the clearest case: the book is one continuous
সাহিত্যপাঠ volume; the syllabus splits the same selections into গদ্য and কবিতা
for exam weighting. Storing that split as chapters would give a student a
curriculum the book does not have. The syllabus mark tables have the same
problem in reverse — they are real, official numbers, but they belong to an
exam, not to a chapter, and there is no column for them yet.

So `0013` records all three documents in `curriculum_sources` with
`document_type = 'exam_syllabus'`, and `0014`'s import validator **rejects**
`exam_syllabus` outright so the mistake cannot be made by accident later. The
text is preserved in [CURRICULUM_SOURCES.md](CURRICULUM_SOURCES.md) as
evidence, and requirement 17 asks for the three textbooks' actual contents
pages.

## Topic extraction groundwork (`0014`)

`0014_topic_source_columns.sql` adds the three columns a topic needs to be
checkable: `topic_number` (the printed number, verbatim), `source_page` (the
printed page, or null) and `source_document`, with a `source_page > 0` check and
a partial unique index on `(curriculum_chapter_id, topic_number)`. **It inserts
nothing.** The topics table still holds 8 demo rows and 0 official rows.

`src/domain/curriculumImport.ts` gained the matching validator and planner
(`70` lines of policy, `14` tests), and [TOPIC_EXTRACTION.md](TOPIC_EXTRACTION.md)
is the workflow a person follows to produce a file it will accept. The gate is
the source, not the code: no chapter *body* is readable in this environment
yet, so the first real topic import still awaits one chapter of a born-digital
book.

## What changed in this pass

| Change | Why |
| --- | --- |
| `partially_verified` added as a status | The four-state model forced a subject whose existence is confirmed but whose detail is not into either "verified" (a lie) or "needs_verification" (understates real work). |
| Bangla and English split into 1st / 2nd Paper for all six versions | NCTB does not publish either subject as a single book. The official 2025 Class 9–10 list carries বাংলা সাহিত্য + বাংলা সহপাঠ + বাংলা ভাষার ব্যাকরণ ও নির্মিতি, and English for Today + English Grammar and Composition. Tracking them as one subject meant two examined papers shared one chapter list. |
| Source registry (`curriculum_sources`) | Records what was opened and what came out of it, so "0 chapters" can be traced to a specific blocker. |
| Outstanding requirements (`curriculum_pending_requirements`) | Separates *NCTB has not published it* from *it is published and we could not read it*. Only the second is a failure on our side. |
| Coverage view (`curriculum_coverage`) and screen panel | Per level / group / year / subject breakdown instead of a single percentage. |
| HSC Physics / Chemistry / Biology / Higher Mathematics split into 1st / 2nd Paper (`0011`) | HSC Science is examined as two books; a student revising ২য় পত্র could not see half of their syllabus under one flat subject. Append-only: the four existing rows keep their ids and gain `paper_label = '1st Paper'`. |
| HSC Physics 2nd Paper chapters (`0011`) | The one HSC contents page that survived OCR. English gloss verbatim; Bengali `null`. |
| HSC first in navigation and coverage sort (`levelRank`) | The user is an HSC student. This is presentation order only — SSC stays visible and is not filtered away. |
| Group coverage split into verified / partly / no chapters | "0 chapters" and "chapters we could not verify" were being read as the same fact. |

Paper rows: SSC 2nd-paper rows are `partially_verified` (the book is confirmed
in the rendered 2025 list; the paper number printed on the cover was not read
independently). HSC 2nd-paper rows are `needs_verification` except Physics 2nd
Paper, which is `partially_verified` because its contents page was read — a
subject's paper split being inferred does not upgrade the *subject* row's
evidence, but the row that actually has a read source says so.

## Sources accessed

| Document | URL | What came out |
| --- | --- | --- |
| SSC Class 9–10 textbook list, 2025 | https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767 | **Read in full.** 33 books, Bangla and English, each with two download links. Authority for the SSC inventory. |
| SSC Class 9–10 textbook list, 2026 | https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612 | **Blocked.** Page exists; the content block is a `পাতা` sub-page widget that never resolves. Only navigation, a share bar and the accessibility menu render. |
| SSC Physics textbook, 2025 (Bangla) | https://drive.google.com/file/d/121GCSD2909n-ETowJfdtzqOoVcdAe9Fx/view | **Blocked.** 105 MB; Google serves a virus-scan interstitial, and the egovcloud mirror returns HTTP 500. **Worked around**, not ignored: a scan of the same printed book was read instead — see the two archive.org rows below. |
| SSC Physics textbook, printed scan | https://archive.org/details/physics-class-9-10-com-opt | **Read in full.** Bengali OCR text layer; the সূচিপত্র yields 14 chapters with page numbers, and the imprint page gives the edition. Source of migration 0010. |
| SSC Chemistry textbook, printed scan | https://archive.org/details/chemistry-class-9-10-com-opt | **Read in full.** Same pipeline; সূচিপত্র yields 12 chapters. Source of migration 0010. |
| Government Cloud Drive mirror | https://drive.egovcloud.gov.bd/index.php/s/QciQ1yYNg2c6Jmf | **Blocked.** Share page renders and confirms the same 104.9 MB file; `/download` returns HTTP 500. |
| National Curriculum 2012 — secondary | https://nctb.gov.bd/pages/files/6922db5b933eb65569e09a2c | **Partly readable.** 93-page PDF extracts, but in legacy Bijoy/ANSI single-byte encoding; unusable without a converter. |
| National Curriculum 2012 — higher secondary | https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702 | **Partly readable.** 43-page PDF, same encoding problem. |
| SSC/HSC subject structure and marks | https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292 | Cited by 0007. Not re-opened in this pass. |
| HSC notices, 2026–27 syllabus | https://nctb.gov.bd/pages/notices/ | Cited by 0007. Not re-opened in this pass. |
| HSC ২০২৫-২৬ textbook list | https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b | **Read (corrected).** An earlier version of this row said the table did not render. It does: five books, all compulsory (সাহিত্যপাঠ · সহপাঠ · English for Today · তথ্য ও যোগাযোগ প্রযুক্তি · তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন)). No group or elective title appears, so this document cannot settle the HSC Humanities and Business Studies inventories — not because it is unreadable, but because it does not contain them. |
| HSC Physics 2nd Paper textbook, printed scan | https://archive.org/details/hsc-nctb-book-physics-2nd-part | **Read.** 151 pages, ABBYY layer over a legacy font. The সূচিপত্র yields 15 numbered chapters with English glosses; Bengali titles and the imprint page are unreadable. Source of migration `0011`. |
| HSC Biology 1st Paper textbook, printed scan | https://archive.org/details/hsc-nctb-book-biology | **Blocked.** Same legacy-font problem, no English gloss in the chapter headings; nothing imported. |
| HSC ICT textbook, printed scan | https://archive.org/details/hsc-nctb-book-ict | **Blocked.** Legacy font, no contents page in the text layer. |
| `hsc-nctb-book-physics` (four uploads) | https://archive.org/details/hsc-nctb-book-physics | **Unreachable.** The items contain no files at all (`emptyfiles` collection). |
| HSC Accounting textbook, printed scan | https://archive.org/details/hsc-nctb-book-accounting | **Partly read.** 441 pages, ABBYY over a legacy font. Ten English chapter titles are legible on the সূচিপত্র; the Bengali titles and the chapter numbers are not (both printed in Bengali digits). Not imported — see below. |
| HSC Business Organisation and Management, printed scan | https://archive.org/details/hsc-nctb-book-business-organisation-and-management | **Blocked.** 246 pages, same font problem, no English gloss on any chapter row. |
| 10 Minute School "HSC Physics / Chemistry / Biology 1st and 2nd" uploads | https://archive.org/details/hsc-physics-1st-and-2nd-pdf-by-10-minute-school | **Rejected.** Coaching slide decks, not NCTB textbooks: clean Bengali OCR but no official সূচিপত্র, imprint or chapter numbering. Registered as `other` so nobody mistakes them for a source. |

### How the site became reachable

`nctb.gov.bd` is a client-rendered Payload CMS. A direct fetch returns
navigation boilerplate only. Reading the same URL through a rendering proxy
(`https://r.jina.ai/<url>`) returns the real page body — which is how the 2025
list and both curriculum PDFs were read.

The limitation that remains is the documents themselves, not the site: large
Drive-hosted textbook PDFs are gated behind an interstitial, and the sandbox
cannot reach `drive.google.com` or `drive.egovcloud.gov.bd` at all.

### Books whose contents page did not survive OCR

Three more SSC books are on the Internet Archive with the same pipeline
(Mathematics, Higher Mathematics, Biology). Their text layers are readable, but
the contents page is not: the Mathematics scan runs from প্রসঙ্গ-কথা straight
into অধ্যায় ১, and the Higher Mathematics scan left only a column of page numbers
(১২৩, ১৩৬, ১৪৬ …) with the titles stripped out. Transcribing chapter titles from
that would be reconstructing a page, not reading one, so those three subjects
stay at zero chapters and need the screenshot/PDF route in
[CURRICULUM_IMPORT.md](CURRICULUM_IMPORT.md) §6.

### The Bijoy/ANSI problem (attempted, rejected, still not faked)

Both National Curriculum PDFs are single-byte legacy encodings: the bytes are not
Unicode, so `pdftotext` (absent here anyway) would return mojibake. The safe path
was:

1. Convert with an off-the-shelf Bijoy→Unicode mapper, or a documented
   per-glyph mapping table — never by eyeballing the mojibake.
2. **Validate against the original**: convert a page whose subject names are
   independently known (the SSC/HSC subject tables already in
   `curriculum_subjects`), and require an exact match before trusting any page
   that feeds an import.
3. Only then read the elective tables.

**Step 1 was attempted** with the `bijoy2unicode` package. It works on clean
Bijoy input, but on the OCR output of these scans it returns wrong words — it
turned `c`v_©weÁvb` into পদাথির্বজ্ঞান instead of পদার্থবিজ্ঞান. Since it fails
step 2 (no exact match against known subject names), it was **rejected as an
evidence path** and nothing was imported through it. The Physics 2nd Paper
migration keeps the printed English gloss and a `null` Bengali title rather than
a guessed one. Recorded in [CURRICULUM_SOURCES.md](CURRICULUM_SOURCES.md) §4.

The HSC elective lists are still the unverified seeded lists.

### Rejected sources

Third-party sites publish SSC Physics chapter lists that disagree with each
other — 13 chapters on one, 14 on another, with different titles for the last
chapter. A district school's SSC-2028 syllabus PDF is readable but is an
exam syllabus for a different exam year, OCR-damaged, and its wording already
differs from the textbook. None of these were used. A list that cannot be
reproduced from the official book is indistinguishable from a guess.

## Outstanding requirements

The machine-readable version of this list is
`curriculum_pending_requirements` (migration 0009) and it is shown on the
Curriculum screen.

| Level | Year | Requirement | Status |
| --- | --- | --- | --- |
| SSC | 2025 | Chapter and topic lists for every subject | `source_blocked` — textbook PDFs unreadable |
| SSC | 2025 | Group applicability of optional subjects (Arts & Crafts, Music, Arabic, Sanskrit, Pali) | `awaiting_source` — book list is group-agnostic |
| SSC | 2026 | Complete subject inventory | `source_blocked` — list page does not render |
| SSC | 2027 | Complete subject inventory | `awaiting_publication` |
| SSC | 2028 | Complete subject inventory | `awaiting_publication` |
| SSC | 2029 | Complete subject inventory | `awaiting_publication` |
| HSC | 2026–27 | Chapter and topic lists (Physics 1st Paper, Chemistry, Biology, Higher Mathematics) | `source_blocked` — no readable HSC science scan |
| HSC | 2026–27 | Bengali titles for the 15 Physics 2nd Paper chapters | `source_blocked` — legacy-font OCR, converter rejected |
| HSC | 2026–27 | Elective and optional subject lists per stream | `source_blocked` — ২০২৫-২৬ HSC list page renders as an empty পাতা widget |
| HSC | 2026–27 | Chapter numbers + Bengali titles for the ten legible Accounting chapters | `source_blocked` — numbers printed in Bengali digits, mangled by the legacy font |
| HSC | 2026–27 | Chapter list for Business Organisation and Management | `source_blocked` — contents page has no English gloss |
| HSC | 2026–27 | Paper split for electives | `awaiting_source` |

Years 2027–2029 are listed because they were explicitly asked for. NCTB had
published no Class 9–10 list for them as of 2026-10-28, so no rows exist. An
empty, labelled column is the honest representation; inventing a plausible
2028 syllabus is not.

## What is still needed

To finish the chapter data for a single subject, one artefact is enough:

1. The **সূচিপত্র (table of contents) page** of that subject's NCTB textbook —
   a screenshot or a PDF of those one or two pages, not the whole 100 MB book.
2. A note of which academic year the edition is.

Then follow [CURRICULUM_IMPORT.md](CURRICULUM_IMPORT.md): validate the file,
review the plan, apply the upsert. Re-running is a no-op, and student progress
survives because chapters are updated in place and never deleted.

## Related

- [CURRICULUM_SOURCES.md](CURRICULUM_SOURCES.md) — the per-document source
  matrix: what was opened, what came back, and what is still needed.
- `/syllabus` shows the chapter-list status per subject (verified / partly
  verified / unverified) with a sentence explaining what that status means, so
  an OCR-sourced list is never presented as a checked one.
- [CURRICULUM_IMPORT.md](CURRICULUM_IMPORT.md) — import format, validation and
  the exact SQL.
- [VERIFICATION.md](VERIFICATION.md) §2.4 — what was executed here.
