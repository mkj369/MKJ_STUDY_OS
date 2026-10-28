# Source availability matrix

What exists, what was actually opened, and what could not be read. Every row is
a document someone can go and check. `Checked` is the date this environment last
attempted it — not a claim that the document is fine.

The purpose of this file is to stop the same dead ends being explored twice, and
to make the remaining work a **shopping list of artefacts** rather than a vague
"more sources needed".

Legend for **Read**:

| Mark | Meaning |
| --- | --- |
| ✅ full | Contents page read end to end; titles transcribed |
| 🟡 partial | Page opened, but only part of each title survived OCR |
| 🚫 blocked | Document exists and was opened, but its content is unreadable here |
| ⬜ empty | The item exists but contains no file at all |
| ❔ unread | Known to exist, not yet retrieved |

---

## 1. HSC — Priority 1 (Science)

| Subject | Paper | Artefact | Read | Result |
| --- | --- | --- | --- | --- |
| Physics | 2nd | [archive.org/details/hsc-nctb-book-physics-2nd-part](https://archive.org/details/hsc-nctb-book-physics-2nd-part) — 151-page scan of the NCTB book | 🟡 partial | **Imported.** 15 chapters. The printed English gloss inside each title survived; the Bengali glyphs did not (ABBYY OCR over a legacy single-byte font). `title_bn` is null, not guessed. |
| Physics | 1st | `hsc-nctb-book-physics` and its four `_201907*` siblings | ⬜ empty | Every one of those items is metadata only — **no PDF, no pages**. Do not re-check them expecting a file. |
| Chemistry | 1st, 2nd | [archive.org/details/hsc-chemistry-1st-and-2nd-pdf-by-10-minute-school](https://archive.org/details/hsc-chemistry-1st-and-2nd-pdf-by-10-minute-school) | 🚫 blocked | A third-party upload, not an NCTB artefact. Not used: no provenance, and this pipeline only accepts official documents. |
| Biology | 1st | [archive.org/details/hsc-nctb-book-biology](https://archive.org/details/hsc-nctb-book-biology) — 53 pages | 🚫 blocked | Legacy-font OCR on the body text, and the chapter headings carry no English gloss. Nothing usable. |
| Higher Mathematics | 1st, 2nd | *not located* | ❔ unread | No scan on the Internet Archive under any of the names tried. |
| ICT | — | [archive.org/details/hsc-nctb-book-ict](https://archive.org/details/hsc-nctb-book-ict) | 🚫 blocked | Same legacy-font problem. |
| All HSC | — | [NCTB higher-secondary curriculum, 43 pp](https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702) | 🚫 blocked | The authoritative document. Its text layer is legacy single-byte; the page renders as a file wrapper with no inline text. |
| All HSC | — | [২০২৫-২৬ HSC textbook list](https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b) | 🚫 blocked | Page exists and is titled correctly, but the body is a `পাতা` sub-page widget that returns navigation only — the same failure as the 2026 SSC list. |

**Net HSC result:** 1 of 10 Science subject-papers has a chapter list, and it is
`partially_verified`. HSC is **not** complete, and no part of it may be described
as such.

### What would unblock HSC Science

One artefact per book, in priority order:

1. Photograph or PDF of the **সূচিপত্র page** of *পদার্থবিজ্ঞান ১ম পত্র* — this
   alone completes Physics.
2. The same page for *রসায়ন ১ম ও ২য় পত্র*, *জীববিজ্ঞান ১ম ও ২য় পত্র*,
   *উচ্চতর গণিত ১ম ও ২য় পত্র*.
3. Ideally the imprint page too (প্রথম প্রকাশ / পরিমার্জিত সংস্করণ / পুনঃমুদ্রণ),
   because that is what decides whether a subject can ever leave
   `partially_verified`.

The import format for one page is specified in
[CURRICULUM_IMPORT.md §6](CURRICULUM_IMPORT.md).

---

## 2. HSC — Priority 2 (Humanities, Business Studies)

| Subject area | Artefact | Read | Result |
| --- | --- | --- | --- |
| Accounting | [archive.org/details/Accounting11](https://archive.org/details/Accounting11) — 441 pages | 🚫 blocked | Text layer is legacy-font garble; the contents page is not extractable. |
| Business Organisation & Management | `hsc-nctb-book-business-organisation-and-management` | ⬜ empty | Metadata only. |
| Economics, Civics, History, Geography, Sociology, Social Work, Psychology, Logic | *not located* | ❔ unread | No readable artefacts. |
| Finance / Production Management / Marketing | *not located* | ❔ unread | No readable artefacts. |

**Inventory gap, stated plainly:** the seeded HSC Humanities list (14 rows) and
Business Studies list (9 rows) came from the 2026–27 curriculum notice, and
**nobody has confirmed them against a rendered official list**. The 2025–26 HSC
textbook list would do it and is blocked. Until then those rows stay
`needs_verification`, and the app reports the group as *incomplete* rather than
counting the seeded rows as proof.

---

## 3. SSC — Priority 3 (all three groups)

| Subject | Artefact | Read | Result |
| --- | --- | --- | --- |
| Physics | [physics-class-9-10-com-opt](https://archive.org/details/physics-class-9-10-com-opt) | ✅ full | 14 chapters imported (`partially_verified`; 2022 reprint of the 2017 edition). |
| Chemistry | [chemistry-class-9-10-com-opt](https://archive.org/details/chemistry-class-9-10-com-opt) | ✅ full | 12 chapters imported (same imprint). |
| Mathematics | [math-class-9-10-com-opt](https://archive.org/details/math-class-9-10-com-opt) | 🚫 blocked | Readable body, **no contents page**: the scan runs from প্রসঙ্গ-কথা straight into অধ্যায় ১. |
| Higher Mathematics | [higher-math-9-10-com-opt](https://archive.org/details/higher-math-9-10-com-opt) | 🚫 blocked | Contents page reduced to a column of page numbers (১২৩, ১৩৬, ১৪৬ …) with the titles stripped. |
| Biology | [biology-class-9-com-opt](https://archive.org/details/biology-class-9-com-opt) | 🚫 blocked | OCR text layer 404s from the archive's download path; the pages are not retrievable as text. |
| Bangla (সাহিত্য / সহপাঠ / ব্যাকরণ), English, ICT, BGS, Islam | various `*-com-opt` items | ❔ unread | Located, not yet transcribed. |
| All SSC | [২০২৫ SSC textbook list](https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767) | ✅ full | 33 books; basis of the SSC subject inventory. |
| All SSC | [২০২৬ SSC textbook list](https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612) | 🚫 blocked | `পাতা` widget. |

**Net SSC result:** 2 of 50 SSC subject rows have a chapter list.

---

## 4. Tools that were tried, and what they did

| Tool | Outcome |
| --- | --- |
| `bijoy2unicode` (PyPI) | Installed and **works** on correct Bijoy bytes (`evsjv` → বাংলা). Useless on the OCR text, because OCR has already corrupted the byte values — feeding it `1. fe vt)[vB^` produces plausible-looking garbage, which is worse than nothing. Usable only on a born-digital PDF text layer. |
| Archive page-image endpoint | Returns an image; the reader describes it ("an image of a page with text") but does not transcribe it. No OCR is available in this container. |
| `pdftotext` / `pypdf` | Not installed, and the sandbox can reach only a short list of hosts, so the NCTB PDFs cannot be downloaded to run them anyway. |
| `_djvu.txt` OCR text layers | **The one thing that works**, for scans that were OCRed with a Unicode-aware engine (the 2023 Tesseract ones). Anything OCRed over a legacy font is lost. |

---

## 5. What this matrix changes about the app

Nothing in it is a shortcut. Every row above lands in the database as one of
three states, and the coverage report counts them separately:

| State | Meaning | Current count |
| --- | --- | --- |
| `verified` | Read against the exact edition the student is sitting | **0** |
| `partially_verified` | Read from a real copy of the book, with a named limitation | **3 subject-papers** (SSC Physics, SSC Chemistry, HSC Physics 2nd Paper) |
| `needs_verification` | Listed, never read | everything else |

Reproduce the counts from the app itself with `/curriculum` → *Curriculum
coverage*, or from SQL via the `curriculum_coverage` view.
