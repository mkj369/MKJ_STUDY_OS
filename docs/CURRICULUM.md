# Curriculum data: what is verified, what is not

This file records the exact state of the curriculum reference data shipped in
`supabase/migrations/0007_official_subject_structure.sql`,
`0009_curriculum_inventory.sql`, `0010_ssc_physics_chemistry_chapters.sql` and
their TypeScript twins in `src/services/seed/` (the two sides are kept identical
by `tests/db/curriculumParity.test.ts`).

Last reviewed: **2026-10-28**.

## Summary

| Level | Group | Academic year | Subjects | Chapters | Topics | Verification status |
| --- | --- | --- | --- | --- | --- | --- |
| SSC | Science | 2025 | 17 | **26** (Physics 14, Chemistry 12) | **0** | 2 subjects `partially_verified`, 15 `needs_verification` |
| SSC | Humanities | 2025 | 17 | **0** | **0** | `needs_verification` |
| SSC | Business Studies | 2025 | 16 | **0** | **0** | `needs_verification` |
| HSC | Science | 2026–2027 | 9 | **0** | **0** | `needs_verification` |
| HSC | Humanities | 2026–2027 | 14 | **0** | **0** | `needs_verification` |
| HSC | Business Studies | 2026–2027 | 9 | **0** | **0** | `needs_verification` |

**82 subjects, 26 chapters, 0 topics.** Two of the 82 subjects have a chapter
list, both read from the printed সূচিপত্র of the official textbook; the other 80
have none. No subject and no version is `verified`.

Every subject row carries
`scope = 'subject_structure'`, which is a deliberately narrow claim: *these are
the subjects a student in this group studies, with their official names in
English and Bangla*. It is **not** a claim that the chapter list, topic list or
mark distribution is known.

The curriculum is therefore **incomplete**, and the app says so on screen
rather than in a footnote. `docs/` and the UI both refuse to call any level,
group or year complete while chapter data is missing.

## The chapter data that exists (migration 0010)

| Subject | Chapters | Evidence | Status |
| --- | --- | --- | --- |
| SSC Science / Physics (পদার্থবিজ্ঞান) | 14 | [archive.org/details/physics-class-9-10-com-opt](https://archive.org/details/physics-class-9-10-com-opt) — scan of the printed NCTB book, Bengali OCR layer | `partially_verified` |
| SSC Science / Chemistry (রসায়ন) | 12 | [archive.org/details/chemistry-class-9-10-com-opt](https://archive.org/details/chemistry-class-9-10-com-opt) — same imprint, same OCR pipeline | `partially_verified` |

**Imprint of both scans:** প্রথম প্রকাশ সেপ্টেম্বর ২০১২ · পরিমার্জিত সংস্করণ
সেপ্টেম্বর ২০১৭ · পুনঃমুদ্রণ ২০২২.

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

**What is still missing for these two subjects:** every topic. The section
headings (১.১, ১.২ …) live in the body of each book, not on the contents page, so
extracting them means reading ~400 pages of OCR — a different job from this one,
and a half-extracted topic list would be worse than an empty one.

## Subjects still awaiting a contents page

78 of 80. The two that are done are listed above. The remaining SSC subjects and
**every HSC subject** need the same single artefact: the সূচিপত্র page of the
official book, plus its edition. The HSC gap is the harder one — no HSC Physics,
Chemistry, Biology or elective textbook exists on the Internet Archive in a form
this environment could read, so the HSC elective lists seeded from the curriculum
notice stay unverified.

## What changed in this pass

| Change | Why |
| --- | --- |
| `partially_verified` added as a status | The four-state model forced a subject whose existence is confirmed but whose detail is not into either "verified" (a lie) or "needs_verification" (understates real work). |
| Bangla and English split into 1st / 2nd Paper for all six versions | NCTB does not publish either subject as a single book. The official 2025 Class 9–10 list carries বাংলা সাহিত্য + বাংলা সহপাঠ + বাংলা ভাষার ব্যাকরণ ও নির্মিতি, and English for Today + English Grammar and Composition. Tracking them as one subject meant two examined papers shared one chapter list. |
| Source registry (`curriculum_sources`) | Records what was opened and what came out of it, so "0 chapters" can be traced to a specific blocker. |
| Outstanding requirements (`curriculum_pending_requirements`) | Separates *NCTB has not published it* from *it is published and we could not read it*. Only the second is a failure on our side. |
| Coverage view (`curriculum_coverage`) and screen panel | Per level / group / year / subject breakdown instead of a single percentage. |

Paper rows: SSC 2nd-paper rows are `partially_verified` (the book is confirmed
in the rendered 2025 list; the paper number printed on the cover was not read
independently). HSC 2nd-paper rows are `needs_verification` because no HSC
textbook list could be rendered here.

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

### The Bijoy/ANSI problem (not solved, and not faked)

Both National Curriculum PDFs are single-byte legacy encodings: the bytes are not
Unicode, so `pdftotext` (absent here anyway) would return mojibake. The safe path,
if someone picks this up:

1. Convert with an off-the-shelf Bijoy→Unicode mapper, or a documented
   per-glyph mapping table — never by eyeballing the mojibake.
2. **Validate against the original**: convert a page whose subject names are
   independently known (the SSC/HSC subject tables already in
   `curriculum_subjects`), and require an exact match before trusting any page
   that feeds an import.
3. Only then read the elective tables. Until step 2 passes, the HSC elective
   lists stay `needs_verification`, exactly as they are now.

This was **not** attempted in this pass. The HSC elective lists are still the
unverified 7/12/7 seed.

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
| HSC | 2026–27 | Chapter and topic lists | `source_blocked` |
| HSC | 2026–27 | Elective and optional subject lists per stream | `awaiting_source` — curriculum PDF is Bijoy-encoded |
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

- [CURRICULUM_IMPORT.md](CURRICULUM_IMPORT.md) — import format, validation and
  the exact SQL.
- [VERIFICATION.md](VERIFICATION.md) §2.4 — what was executed here.
