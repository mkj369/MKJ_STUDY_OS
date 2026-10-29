# Round 8 — HSC Science curriculum audit and premium UI pass

Run **2026-10-30**. This document is the evidence for Round 8: what was audited,
what could and could not be sourced, what changed, and how each claim was checked.

It separates three things that are easy to blur together:

* **Verified facts** — read from an official document, reproducible.
* **Partial coverage** — real data with a named limitation.
* **Unresolved gaps** — no source exists that this project could read.

---

## 1. The headline

**Seven of the eight required HSC Science papers have no official chapter list,
because NCTB does not publish one.** That is the finding of the audit, not a
failure to search hard enough. The eighth — Physics 2nd Paper — has 15 chapter
rows recovered from a readable scan, every one still *partially verified*.

No chapter title, number, topic or count in this repository was invented to fill
a gap. Where the data is missing, the app says so on screen.

---

## 2. Per-paper audit table

Generated from the seeded rows by
`tests/domain/hscSciencePapers.test.ts`, not typed by hand, so it cannot drift
from what the app holds.

| Paper | Existing chapters | Official count | Imported | Status | Bengali titles | Source |
|---|---|---|---|---|---|---|
| Physics 1st Paper | 0 | not published | 0 | `needs_verification` | — | none |
| Physics 2nd Paper | 15 | not published (scan read, not the official 2026–27 file) | 15 | `partially_verified` | 0/15 | archive.org `hsc-nctb-book-physics-2nd-part` |
| Chemistry 1st Paper | 0 | not published | 0 | `needs_verification` | — | none |
| Chemistry 2nd Paper | 0 | not published | 0 | `needs_verification` | — | none |
| Biology 1st Paper | 0 | not published | 0 | `needs_verification` | — | none |
| Biology 2nd Paper | 0 | not published | 0 | `needs_verification` | — | none |
| Higher Mathematics 1st Paper | 0 | not published | 0 | `needs_verification` | — | none |
| Higher Mathematics 2nd Paper | 0 | not published | 0 | `needs_verification` | — | none |

Other subjects in the same HSC Science version, all preserved and all
`needs_verification` with no chapters: Bangla 1st Paper, Bangla 2nd Paper,
English 1st Paper, English 2nd Paper, Information & Communication Technology.

### Why the seven are empty — the exact reason

The official page
[২০২৬-২৭ HSC textbook list](https://nctb.gov.bd/pages/static-pages/২০২৬-২৭-শিক্ষাবর্ষের-উচ্চ-মাধ্যমিক-স্তরের-একাদশ-দ্বাদশ-শ্রেণির-পাঠ্যপুস্তক-o4phi6-6ae03d7be0cf994829342115)
renders in full and lists **five books, all compulsory**:

1. সাহিত্যপাঠ
2. সহপাঠ
3. English for Today
4. তথ্য ও যোগাযোগ প্রযুক্তি
5. তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন)

There is no Science, Humanities or Business Studies section. The
[২০২৬ SSC list](https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612)
*does* publish subject-wise books (29 rows, including Physics, Chemistry,
Biology and Higher Mathematics), which rules out the possibility that the reader
failed on the HSC page — the same reader, same proxy, same session returns the
other page in full.

So NCTB publishes no group-wise HSC textbook list at all, and no HSC Science
book link exists to follow. This conclusion also explains why the
[২০২৬-২৭ HSC syllabus notice](https://nctb.gov.bd/pages/notices/) carries only
three attachments — বাংলা ১ম পত্র, English 1st Paper, ICT — none of them a
science subject.

**This finding is now recorded in the app**, in migration `0017` and in
`curriculumReadiness.ts`, replacing two earlier notes that claimed these pages
"render only navigation". Those notes were wrong, and being wrong in the
direction that makes the project look *more* blocked than it is is still wrong.

### What would unblock it

Any of these, in order of authority:

1. A printed NCTB distribution list or school-issued book list for ২০২৬-২৭.
2. A readable copy of the official textbook whose সূচিপত্র page survives OCR,
   supplied as an image or PDF.
3. The exam syllabus for a science subject, once NCTB publishes one — that gives
   exam scope, which is a different (weaker) claim than textbook contents and must
   be labelled `scope = exam_syllabus`.

---

## 3. Before / after inventory

| | Before Round 8 | After Round 8 |
|---|---|---|
| Curriculum sources | 26 | **27** — two notes corrected in place, one source added (the ICT textbook file that does resolve) |
| Subjects (all rows in the DB) | 95 | 95 — 86 official, 9 demo |
| Official chapter rows | 41 | 41 |
| Verified chapters | 0 | 0 |
| Official topics | 0 | **0** — the 8 topic rows in the DB are all demo |
| Papers with a recovered chapter list | 1 (Physics 2nd) | 1 (Physics 2nd) |
| Requirements marked `source_blocked` | 3 of 17 | **8 of 17** — see the note below |

**Nothing was imported this round.** No new chapter exists in this commit that
did not exist in the previous one. What changed is the *accuracy of the record*
around them.

The `source_blocked` count went **up**, not down, and that is deliberate. Three
requirements that had been marked `source_blocked` were reclassified to
`awaiting_publication` — they were never blocked, the pages are published and
readable. But five other requirements that genuinely described unreadable
documents were left exactly as they were, and the count above is the total of
all 17 requirements, not of the three that were touched. A round that reported
"zero blocked" here would be flattering itself: eight items genuinely remain
blocked, and `curriculumReadiness.ts` says which and why.

---

## 4. UI and UX changes

### Curriculum (the priority screen)

`src/features/curriculum/PaperRow.tsx` — new. Each paper is now a card rather
than a list row:

* subject + paper in the title, with the Bengali paper label leading
  (`পদার্থবিজ্ঞান · ২য় পত্র 2nd Paper`);
* session and version in the subtitle, so the academic year is never ambiguous;
* **verified / partial / unverified counts side by side** — a paper with fifteen
  rows and zero verified ones cannot look finished;
* real progress, shown only when the student owns the chapters, computed from
  saved records (`3/15 chapters complete`, `%` of checklist items ticked);
* per-chapter rows with printed number, Bengali title where it exists, the
  English gloss as supplementary text, saved lecture/practice/revision activity,
  next revision date, open difficulties, and a source link;
* an explicit "no chapter list yet" body with the reason and what the student can
  still do;
* the source document stated once per card instead of repeated under every row.

### Search

Found and fixed a real bug: searching `Physics 1st Paper` returned **nothing**.
The subject filter matched name, Bengali name and code — but not `paper_label`,
which is exactly the field that separates ১ম পত্র from ২য় পত্র. Replaced with a
normalising matcher that also translates Bengali ordinals and digits, so
`২য় পত্র`, `2nd`, `দ্বিতীয়` and `2` all find the same paper.

### Dashboard

* hero compacted (~40% shorter) so the actionable cards sit above the fold;
* **weekly study-time chart** — seven bars, one per day, heights taken from saved
  `study_sessions` rows. A day with nothing logged renders a dash and a tooltip
  reading "nothing recorded", never an average or an estimate;
* the "Next useful action" panel lists the next two tasks instead of saying
  "1 more task" and stopping, which removed ~200px of empty card body.

### Syllabus

Each paper now states how many official chapter rows it has and how many are
verified versus partial, and a paper with none says that plainly instead of
showing an empty progress bar with no explanation.

### Type and colour

* **Bengali now renders everywhere.** The font stack named
  `'Noto Sans Bengali'` but nothing shipped it, so on any machine without that
  font every chapter title was a row of empty boxes — which is what happened
  during this round's own visual check. `@fontsource/noto-sans-bengali` is now
  self-hosted (44 KB per weight, Bengali subset, `font-display: swap`), so
  Bengali works offline on a device that has no Bengali font at all.
* premium dark theme with the supplied palette as the shipped default; the old
  light palette moved to an opt-in `[data-theme='light']` block;
* all text meets WCAG AA against its real painted background (see §6).

### Responsive

No horizontal overflow on any of the 25 routes at 1440px or 390px. Small buttons
and disclosure rows reach the 44px touch minimum under 560px.

---

## 5. Files changed

**Added**

* `src/features/curriculum/PaperRow.tsx` — the paper card
* `supabase/migrations/0017_source_corrections_ssc_2026.sql` — corrects two source
  notes and three requirement statuses; adds no data
* `tests/domain/hscSciencePapers.test.ts` — 11 tests
* `tests/integration/curriculumImportIdempotency.test.ts` — 8 tests
* `scripts/route-audit.mjs`, `scripts/contrast-audit.mjs` — verification tools
* `docs/ROUND8_REPORT.md` — this file

**Modified**

* `src/styles/theme.css` — premium palette, paper-card system, weekly bars,
  touch targets
* `src/features/curriculum/CurriculumPage.tsx` — renders `PaperRow`, passes saved
  progress through
* `src/features/syllabus/SyllabusPage.tsx` — verified/partial split per paper
* `src/features/dashboard/DashboardPage.tsx` — weekly chart, next actions
* `src/domain/curriculum.ts` — `matchesSubjectQuery`, `normaliseCurriculumQuery`,
  `paperLabelBn`
* `src/services/seed/curriculumReadiness.ts` — corrected source notes
* `src/main.tsx` — self-hosted Bengali font
* `tests/db/curriculumRealChapters.test.ts` — the test that asserted the obsolete
  "both pages are blocked" claim now pins the corrected finding
* `tests/e2e/journeys.spec.ts` — 3 new journeys (C7, C8, C9), 2 selectors updated

**No migration was required for the data**, because no data changed. `0017` exists
only to correct written claims that were false.

---

## 6. Verification actually performed

All commands run on this commit, Node v22.22.3:

```
npm run typecheck      -> clean
npm run lint           -> clean
npm run build          -> built in 4.94s
npx vitest run         -> 45 files, 532 tests passed
npx playwright test    -> 46 tests passed (Chromium, production bundle)
node scripts/route-audit.mjs     -> 25/25 routes, 0 console errors, 0 overflow @1440 & @390
node scripts/contrast-audit.mjs  -> PASS, no text below WCAG AA across 10 routes
```

Browser verification was performed at **1440×1000 and 390×844** in a real
Chromium: the curriculum cards were expanded, a paper was adopted
(`0/15 chapters complete` → survives reload), a checklist item was ticked and the
card showed `8% checklist` (1 of 12 items) after navigating back, Bengali titles
were confirmed to render as glyphs rather than boxes, and the dashboard chart was
checked against the underlying session rows.

**The contrast audit self-tests.** It plants an unreadable element
(`#0d1b15` on `#08130f`, ~1.07:1) and fails if the sweep does not flag it, so a
green result cannot come from matching nothing.

### Not verified

* **Android APK: not built and not tested.** No JDK and no `ANDROID_HOME` in this
  environment; `docs/ANDROID_APK.md` documents the local steps.
* **Hosted Supabase: not configured and not migrated.** This run is local demo
  mode with browser storage. Migration `0017` has been exercised against PGlite
  under the DB tests; it has **not** been applied to any hosted project, and no
  claim is made that it has.
* **Real AI narrative: not exercised** — no API key is configured, and the app
  says so rather than faking a response.

---

## 7. Unresolved gaps

1. **Seven papers have no chapter list.** Documented above; the blocker is
   upstream at NCTB, not in this codebase.
2. **Physics 2nd Paper has no Bengali titles.** The source is an OCR whose Bengali
   glyphs did not survive. The printed English gloss is reproduced exactly,
   including its own capitalisation and its missing "and" in chapter 5. The
   Bengali half stays `null` — reconstructing it from a guess would convert an
   honest partial record into a false one.
3. **Zero verified chapters.** Nothing in this repository claims otherwise.
4. **41 chapter rows against a subject structure of 86 subjects** — the SSC
   Physics and Chemistry lists are from 2017/2022 scans and are `partially_verified`
   for the same edition reason.

---

## 8. Running it

```bash
npm ci
npm run dev -- --host 0.0.0.0 --port 5173     # http://localhost:5173
```

Production build and the audit tools:

```bash
npm run build && npm run preview -- --port 4173
npm run audit:routes      # needs the dev server on :5173
npm run audit:contrast    # needs the dev server on :5173
```
