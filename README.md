# MKJ StudyOS

A personal academic memory, syllabus tracker and study planner for an HSC Science
student — built as a real, runnable app rather than a mock-up.

React 18 + TypeScript + Vite, Ionic React UI, a local-first demo repository and a
Supabase/Postgres implementation behind the same interface. It runs with **no backend
and no API keys**, and it says clearly what it does not know.

> Missing records are missing data, not a verdict on your effort.

---

## 1. Status at a glance

Verification levels used below (and nowhere upgraded beyond what was actually run):

| Label | Means |
| --- | --- |
| **Written** | Code/SQL exists but was not executed here |
| **Unit-tested** | Covered by deterministic domain tests (`npx vitest run`) |
| **Integration-tested** | Local repository / auth tested in Node with a fake storage |
| **DB-tested** | SQL migrations applied and RLS asserted in PGlite (Postgres 18/WASM) |
| **Browser-tested** | Playwright against Chromium on the production bundle: real UI, real localStorage, real downloads |
| **Cloud-verified** | Run against a hosted Supabase project — **not done in this snapshot** |
| **Device-verified** | Installed on Android hardware/emulator — **not done in this snapshot** |

| Area | State |
| --- | --- |
| Domain engine: progress, checklist denominators, revision spacing, exam maths, planner, recovery, reports, reminders, import | **Unit-tested** (deterministic, explicit `today`) |
| Phase 2 domain: time tracking, focus state machine, syllabus matrix, mistakes, practice, preparation, insights | **Unit-tested** |
| Data layer: local demo repository | **Integration-tested**, including cross-workspace isolation |
| Data layer: Supabase repository | **Written** — cloud mode has never been executed against a real project |
| Auth: local workspace + email/password (cloud) | Local **integration- and browser-tested**; cloud **unverified** |
| Screens: 28 lazy routes (14 Phase 1 screens, chapter detail, 11 Phase 2 screens, 404) | **Browser-tested**: all 25 navigable routes load in Chromium, plus the main flows; the jsdom boot test covers every Phase-1 screen too |
| Student journeys A–I (setup, syllabus, time, planning, mistakes, practice, insights, export) | A–G and I **browser-tested**; H (cross-user security) **DB-tested**; see §9 |
| Postgres schema + RLS (`0001`–`0016`) | **DB-tested** in PGlite, including applying the whole set **twice**; **not** applied to a hosted project |
| RLS isolation (two users, forged writes, composite FKs) | **DB-tested** |
| AI narrative Edge Function | **Unit-tested end-to-end with a stubbed provider** (16 tests: request shape, key handling, schema + invented-number rejection, timeout/5xx/401 mapping); **no live call** — no key, provider hosts unreachable |
| Android (Capacitor 7) | `android/` project generated, plugin synced, 8 config assertions pass; **APK not built** (no JDK/SDK), **no device test** |
| Demo curriculum | **Placeholder**, `needs_verification`, **not** official NCTB content |
| Official SSC/HSC subject structure | **Sourced and seeded** (NCTB, 6 versions, **86 subjects**, bilingual names, Bangla/English split into 1st & 2nd Paper; HSC Physics is two papers since `0011`). Versions `needs_verification`; SSC paper rows `partially_verified`. **41 chapters** exist for 3 subject-papers (SSC Physics 14, SSC Chemistry 12, HSC Physics 2nd Paper 15) recovered from scanned textbook contents pages; the other 83 subjects have **0 chapters, 0 topics — not invented** — see [docs/CURRICULUM.md](docs/CURRICULUM.md) and the source matrix in [docs/CURRICULUM_SOURCES.md](docs/CURRICULUM_SOURCES.md) |
| Curriculum coverage reporting | **Unit- and DB-tested**: per level / group / year / subject counts from `curriculum_coverage` + `src/domain/curriculumCoverage.ts`, shown on `/curriculum` with HSC first but SSC still visible, and a verified / partly / no-chapters split per group. Reports **incomplete**: 3 of 86 subjects have a chapter list, 0 topics, 0 subjects `verified` — by design, it cannot report complete while chapter data is missing |
| Curriculum import tooling | **Unit- and DB-tested** validator + idempotency planner (`src/domain/curriculumImport.ts`), SQL upsert tested against PGlite including progress preservation and `verified`-requires-source. **Real data imported twice**: 14 SSC Physics + 12 SSC Chemistry chapters (`0010`) and 15 HSC Physics 2nd Paper chapters (`0011`), all `partially_verified`, from scanned official books. The HSC rows carry the printed English gloss only — the Bengali titles are unrecoverable from the scan and stay `null`. Screenshot/PDF-of-সূচিপত্র workflow documented in [docs/CURRICULUM_IMPORT.md](docs/CURRICULUM_IMPORT.md) |
| Curriculum progress safety | **Integration- and DB-tested**: a reseed created no duplicates and left chapter status, checklist ticks, notes and curriculum links intact |
| Export / backup | **Browser-tested** (JSON download contains real rows); restore is **not implemented** |
| Secret handling | **Verified against the built bundle** (`tests/bundle/secrets.test.ts`): no service-role key, provider key or key header ships to the client |
| Loading / empty / error / retry states | **Browser- and jsdom-tested** on gated pages; every page has a written empty state |
| Production build + route splitting | **Verified**: 27 route chunks, 8 shared chunks, 4 vendor chunks (39 JS files) |
| Android project (native config) | **Generated and config-tested**; APK build **not executed** here |
| HSC Science curriculum completeness | **Settled, and still incomplete — by publication, not by omission.** The official ২০২৬-২৭ HSC textbook page now renders and lists **5 compulsory books only**; NCTB publishes no group-wise HSC science list, so **7 of the 8 required papers have no official chapter list anywhere**. Physics 2nd Paper is the one recovered list (15 rows, `partially_verified`, no Bengali titles). Nothing was invented to fill the gap. Per-paper table and exact reasoning: [docs/ROUND8_REPORT.md](docs/ROUND8_REPORT.md) |
| Hosted Supabase, real AI call, device run | **BLOCKED** — see [docs/VERIFICATION.md](docs/VERIFICATION.md) for the per-item commands |

---

## 2. What the app does

**Phase 1 — the core HSC Science workflow.** Adopt or create subjects and chapters, set
a lecture target, log lectures, tick a per-chapter checklist, log study sessions,
schedule revisions with a confidence rating, flag difficult topics, record exams and
mistakes, write notes and resources, plan tasks with carry-over, read a deterministic
weekly report, and receive planned reminders.

**Phase 2 — the study system around it.**

| Feature | What is real | Where |
| --- | --- | --- |
| **Syllabus tracker** | Level (SSC/HSC), academic year, group/stream and subject filters, curriculum versions with authority + academic year + verification status, 11 activities tracked independently (reading, lectures, notes, formula sheet, practice, board, admission, MCQ, written, revision, self test), topic-level status, chapter/subject coverage, completion *estimates* labelled as estimates | `/syllabus` |
| **Daily time tracker** | One timeline merging study sessions (source of truth) with non-study day blocks; stopwatch with pause/resume and a 180-minute cap; overlap detection; duplicate warning (never auto-deleted); planned vs actual from your study windows; rest days; subject-wise totals; end-of-day summary | `/time` |
| **Smart planner** | Suggestions with evidence (revision due, overdue task, unresolved mistake, remaining syllabus), accept → task, split, reschedule, postpone, reject; guilt-free recovery that drops what no longer matters | `/planner`, `/tasks` |
| **Smart revision** | Spaced baseline from your confidence (1–2 d, 3 d, 7 d, 14 d), your own next date wins, due-today queue, history, weak chapters; revision count is **not** mastery | `/revisions/smart` |
| **Mistake book + weakness** | Attempted answer, correction, lesson, category, link to the practice question (migration `0005`), recurring-pattern detection across different days, unresolved weak chapters | `/mistakes`, `/weakness` |
| **Exam countdown + preparation** | Exam targets, days remaining, coverage of the linked chapters, due revisions, weak areas, a draft plan. **No predicted marks or ranks.** | `/exams/prep` |
| **Notes / formula vault / practice** | Notes with kinds (note, formula, definition, bookmark), tags, pinning, search; quick capture from any screen; practice questions with attempts, accuracy, needs-review, AI-sourced questions labelled | `/notes`, `/vault`, `/practice` |
| **Progress insights + AI coach** | Four bands: observed → calculated → interpretation → missing, each with evidence; deterministic next steps; AI is optional and additive | `/insights`, `/reports` |
| **Dashboard** | Today's study time (from the timeline), next exam countdown, today's tasks, revision queue, needs-attention flags, weekly facts — all from the same records as their pages | `/` |
| **Focus mode** | Foreground focus/break timer (5–120 min focus, ≤ 30 min breaks, ≤ 8 intervals), linked to task/subject/chapter, writes exactly one study session | `/focus` |
| **Export & academic history** | JSON backup of every table + per-table CSV, demo rows marked, subject/chapter history preserved across curriculum changes, delete flows that never silently destroy history | `/export`, `/settings` |

Everything above runs in the browser with no server: local mode keeps rows in
`localStorage` under one key and seeds labelled demo data.

**Classes 1–12, one curriculum system.** The student picks a class (1–12). A study group
is asked only where it exists — optional for 9–10, required for 11–12, never for 1–8.
Everything else reads that one choice:

| Class | What the Add-subject library offers | Chapters |
| --- | --- | --- |
| 1–8 | No official subject list is published in a form this project could verify, so the library says so and offers common names as *suggestions* that open the form pre-filled | Always yours: add one or many, auto-numbered |
| 9–10 (SSC) | The full official subject structure for Science, Humanities and Business Studies, plus both Bangla/English papers | Official chapter lists where a source was recovered; otherwise an honest "no list yet" |
| 11–12 (HSC) | All papers per group — HSC Science is 13 rows (3 common, 4 group subjects, second papers for each) | Same rule as SSC |

Custom subjects are first-class: name (English and Bengali), paper label, colour, edit,
archive (progress kept) and restore. Duplicates in the same class are refused by name.
Chapters can be added one or many, renamed in place (the row keeps its id, checklist and
history), reordered, and marked complete; a rename never deletes and re-creates a row.

`view.subjects` and every aggregate read one class-scoped projection, so a Class 9
session never lands in a Class 11 week's total. Changing class hides the other class and
changes nothing else; changing back brings every record, tick and note back.

**Appearance.** Ten accent presets — Sky Blue (default), Ocean Blue, Violet, Lavender,
Emerald, Teal, Rose Pink, Sunset Orange, Amber, Graphite — each in light, dark or system
mode. The choice persists per device. Contrast is not eyeballed: `npm run audit:contrast`
computes the real rendered colours (compositing alpha and gradients) for 15 routes in six
schemes and fails the build on any text below WCAG AA. Button labels and brand marks use
separate tokens because they sit on different gradients.

**Branding.** The mark is drawn for this app — an open book with a rising trend line, on
a Sky Blue tile — not a stock icon or emoji. The sidebar, splash, favicon, PWA manifest,
Apple touch icon and the Android launcher PNGs are generated from that one geometry. Bengali text (subject and chapter
titles) renders from a bundled Noto Sans Bengali, so it works offline.

---

## 3. Quick start (no backend needed)

```bash
npm install
npm run dev          # http://localhost:5173
```

Without `VITE_SUPABASE_*` variables the app starts in **local demo mode**: records live in
this browser's `localStorage`, and the landing screen offers “Start local workspace”,
which seeds clearly labelled demo data.

Local mode is for trying the workflow. It is **not** encrypted, **not** a security
boundary and **not** backed up. Explore with it; do not make it the only copy of anything
important.

### Demo data

Every seeded row has `is_demo = true` and shows a **Demo** badge. The demo curriculum is a
structural placeholder (`needs_verification`), **not official NCTB content**.
“Remove demo data” in Settings deletes demo rows and keeps everything you created.

---

## 4. Configure Supabase (cloud accounts and sync)

1. Create a project at <https://supabase.com>.
2. Copy `.env.example` to `.env.local` and fill in:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLISHABLE-KEY
   ```

   Only the anon key belongs in the client; RLS is what makes that safe. Never put the
   service-role key or an AI key in a `VITE_*` variable — `VITE_*` is bundled.
3. Apply the schema (in order):

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Or paste these files into the SQL editor in order — they are idempotent:

   | Migration | Contents |
   | --- | --- |
   | `0001_init.sql` | profiles, curriculum versions/subjects/chapters, user subjects/chapters, checklist, lectures, sessions, revisions, difficulties, mistakes, tasks, exams, notes, resources, summaries, reminders, audit, RLS, storage policies |
   | `0002_demo_curriculum.sql` | labelled demo curriculum (`needs_verification`) |
   | `0003_learning_systems.sql` | Phase 2: topics, day blocks, focus sessions, exam targets, practice questions/attempts, note kinds/tags, mistake detail columns |
   | `0004_demo_topics.sql` | demo topics for the demo curriculum |
   | `0005_mistake_practice_link.sql` | optional mistake → practice question link with a composite `(id, user_id)` FK |
   | `0006_curriculum_provenance.sql` | curriculum `scope` (textbook / exam syllabus / subject structure), `source_checked_at`, `source_note`, per-subject verification status |
   | `0007_official_subject_structure.sql` | 6 versions + 70 official SSC/HSC subjects (bilingual) |
   | `0008_curriculum_coverage.sql` | `partially_verified` status, chapter/topic natural keys for idempotent imports, `verified`-requires-source constraints, source registry, outstanding requirements, `curriculum_coverage` view |
   | `0009_curriculum_inventory.sql` | Bangla/English 1st & 2nd Paper split (12 rows), source registry, outstanding requirements |
   | `0010_ssc_physics_chemistry_chapters.sql` | First real chapter data: 14 SSC Physics + 12 SSC Chemistry chapters from printed NCTB contents pages, both `partially_verified` |
   | `0011_hsc_two_paper_split_and_physics_2.sql` | HSC two-paper split (Physics/Chemistry/Biology/Higher Mathematics 1st & 2nd Paper, Science only), 15 HSC Physics 2nd Paper chapters (printed English gloss, `title_bn` null, `partially_verified`), 3 sources and 3 outstanding requirements |
   | `0012_hsc_business_studies_sources.sql` | HSC Accounting + Business Organisation scans registered (nothing imported — numbers unreadable / no English gloss), the 10 Minute School uploads registered as rejected third-party material, 2 outstanding requirements |
   | `0013_hsc_inventory_and_2026_27_syllabus.sql` | Corrects a wrong note about the ২০২৫-২৬ HSC textbook page (it renders — it just has no group lists), registers the 2026–27 Bangla 1st / English 1st / ICT **exam syllabi** as `exam_syllabus` sources, registers the Lecture Publications question bank as rejected, adds requirements 16–17. **No chapters, no topics.** |
   | `0016_textbook_download_walls.sql` | Records the two walls behind every textbook link: Google Drive returns its virus-scan interstitial (620 MB, needs a confirm token), and the ২০২১ archive page is empty like the ২০২৬ ones. 2 source rows, nothing imported. |
   | `0015_2026_hsc_textbook_pages_empty.sql` | Records that the ২০২৬ and ২০২৬-২৭ HSC textbook list pages exist and are empty (updated ২৭ Oct ২০২৬), corrects the second stale "did not render" note, and registers the Biology partial scan + the bucket-listing block. **No chapters, no topics.** |
   | `0014_topic_source_columns.sql` | `curriculum_topics.topic_number` / `source_page` / `source_document` + positive-page check + `(chapter, number)` unique index. **No rows** — the columns exist so the first real topic import can be checked. |

   `0005` uses `on delete set null (practice_question_id)`, which needs Postgres 15+
   (Supabase projects are 15/16/17; PGlite here is 18).

4. Deploy the functions and set server-side secrets (see §8):

   ```bash
   supabase functions deploy weekly-summary
   supabase functions deploy delete-account
   ```

5. Restart `npm run dev`. The app switches to cloud mode and shows the sign-in screen.

Row types are hand-written in `src/types/domain.ts` and kept honest by
`tests/db/tableSync.test.ts` (every migrated table must have a type and vice versa). Once
the Supabase CLI is available you can generate the canonical types with
`supabase gen types typescript --project-id YOUR_REF > src/types/database.generated.ts`
and diff them against the domain types before switching queries over.

### Using your own curriculum data

The repository ships the **official NCTB subject structure** for SSC and HSC (Science,
Humanities, Business Studies) but **no chapter lists**: those live inside the NCTB
textbook PDFs and were not machine-readable when the seed was written, so they are
absent rather than invented. Add chapters with SQL or the CSV/JSON chapter import.
Keep `verification_status`, `source_url` and `academic_year` accurate. Version a new
curriculum instead of editing rows students already adopted.

See `docs/CURRICULUM.md` for exactly what was confirmed, from which URL, and what a
human still has to check before anything may be marked `verified`.

---

## 5. Curriculum accuracy

- Two kinds of curriculum data ship, and they are visibly different:
  - **Demo** (`is_demo = true`): HSC Science placeholder structure. Chapter names are
    fake ("Demo chapter 1 — mechanics"), and the UI badges them.
  - **Official subject structure** (`is_demo = false`, `scope = 'subject_structure'`):
    NCTB subject names in English and Bangla for SSC and HSC × Science / Humanities /
    Business Studies. **No chapters.** Every row is `needs_verification`, because the
    subject names were cross-checked but the chapter lists do not exist yet.
- `scope` separates a full textbook table of contents from an exam-only revised syllabus
  from a bare subject structure. They are never presented as the same thing.
- No NCTB chapter list, lecture count, mark distribution or exam date is invented. Where
  a denominator is unknown the UI shows “Not recorded”.
- To import real data you must record the source (`authority`, `source_url`),
  `academic_year`, `version_label` and verification status. Only then flip the status to
  `verified`.
- The schema is version-ready for Classes 1–12, SSC/HSC and admission preparation.
  Chapter-level official data is **not** included and is never implied by the UI: the
  curriculum browser reports "Chapter list not yet verified" from the real row counts.

---

## 6. Scripts

```bash
npm install           # dependencies
npm run dev           # Vite on 0.0.0.0:5173
npm run build         # tsc -b && vite build  → dist/
npm run preview       # serve dist/ on 0.0.0.0:4173
npm run typecheck     # tsc -b --pretty false
npm run lint          # eslint .
npm test              # vitest run — unit + integration + DB/RLS + jsdom UI
npm run test:db       # vitest run tests/db — migrations + RLS in PGlite
npm run test:e2e      # playwright test — real Chromium against a preview build
npm run verify        # typecheck && lint && build && test (build first: the bundle secret scan reads dist/)
npm run verify:cloud  # hosted Supabase + optional real AI check (see §9.1)
npm run android:preflight # JDK 17 / Android SDK / wrapper / synced-assets check
npm run android:sync  # build + cap sync android
npm run android:build # ./gradlew assembleDebug → APK (needs JDK + SDK)
npm run android:open  # open the Android project
```

### Verified output in this snapshot (2026-10-30)

```
npm run typecheck  → no errors
npm run lint       → no errors, no warnings
npm test           → 53 files, 631 tests passed
                     (incl. 94 database/migration/RLS assertions across 8 test files,
                      24 Android config + preflight assertions,
                      a build-bundle secret scan and the loading/error/retry states)
npm run build      → ✓ built in 5.88 s
npm run test:e2e   → 54 passed in Chromium against the production preview build
```

Bundle after route-level code splitting (raw / gzip):

```
ionic-vendor      1 261.03 kB / 278.17 kB   (only chunk above Vite's 500 kB warning)
supabase-vendor     227.08 kB /  58.97 kB
data-vendor         129.52 kB /  36.63 kB
app entry           157.04 kB /  45.26 kB
react-vendor         22.55 kB /   8.32 kB
27 route chunks       4–25 kB each
8 shared chunks      small helpers (delete button, time formatting, Ionic page glue)
```

The remaining warning is the Ionic vendor chunk (a framework-wide import). It is loaded
once and cached; route chunks stay small. Splitting Ionic itself would break its web
components, so it is documented as a known limitation instead of being pretended away.

---

## 7. Data model and privacy

All user-owned tables carry `user_id` and have RLS enabled with `auth.uid()` policies.
Curriculum tables are read-only reference data for clients. Audit rows are append-only.

- **Profile** — display name, locale, IANA time zone, study windows per weekday.
- **Curriculum** — versions → subjects → chapters → topics, each with verification status.
- **User subjects/chapters/topics** — adopted or custom records, never shared.
- **Checklist** — per-chapter activity items plus progress rows.
- **Records** — lectures, study sessions (date + minutes, optional timestamps and
  idempotency key), revisions, difficulties, mistakes, tasks, exams, notes, resources,
  practice questions/attempts, day blocks, focus sessions, exam targets.
- **Derived views** — the daily timeline merges `study_sessions` (study time, the single
  source of truth) with `daily_blocks` (non-study time). They are disjoint by category, so
  minutes are never double counted.
- **Reminders** — preferences plus events with `scheduled | sent | failed | skipped`. A
  reminder shows “sent” only after the platform confirms.
- **Audit events** — append-only trail of writes.

Chapter deletion removes its checklist items and unlinks (never deletes) history; subject
deletion is blocked while linked records exist, and the app offers **Archive** instead.

### Export and deletion

Settings → *Data & privacy*:

- **Export everything** downloads a JSON backup and offers a “copy to clipboard” action.
- **Delete all my records** removes user rows but keeps the account/profile.
- **Delete account** calls the `delete-account` Edge Function; it is disabled and explains
  itself in local mode.

`/export` additionally downloads the JSON file or a single table as CSV, and lists the
academic history kept per curriculum version.

---

## 8. AI coach (optional)

The browser never holds an AI key. It calls the `weekly-summary` Edge Function, which:

1. authenticates the caller from the JWT and reads only that user's week (RLS applies);
2. builds a bounded facts payload (dates, subject names, durations, counts, task states,
   marks you entered) — no note bodies, no tokens;
3. asks the configured provider for strict JSON;
4. validates the shape, rejects invented numbers that do not appear in the facts, and
   only then stores and returns it;
5. rate-limits per user per hour and times out instead of hanging.

```bash
supabase secrets set AI_PROVIDER=gemini            # or openai
supabase secrets set AI_API_KEY=YOUR_PROVIDER_KEY
supabase secrets set AI_MODEL=gemini-2.0-flash     # or gpt-4o-mini, etc.
supabase secrets set AI_TIMEOUT_MS=20000
supabase secrets set AI_MAX_REQUESTS_PER_HOUR=20
supabase secrets set ALLOW_ORIGIN=https://your-web-app.example
```

With no key configured the app reports “AI not configured”, the deterministic report is
still complete, and `/insights` works fully offline.

**What is verified without a key:** the adapter itself runs in Node against a stubbed
provider (`tests/integration/aiFunction.test.ts`, 16 tests). It proves the key only ever
travels in a request header, that malformed JSON, off-schema fields, invented numbers,
401s, 5xxs and timeouts are rejected or retried as designed, and that `generated_at`,
`provider` and `model` are stamped server-side. **What is not verified:** that a real
provider accepts the request — no key and no outbound access to
`generativelanguage.googleapis.com` / `api.openai.com` exist here. After setting the
secrets, run `npm run verify:cloud -- --ai` (see §9.1).

---

## 9. Testing

### What runs, and what it proves

| Command | Scope | Result here |
| --- | --- | --- |
| `npm run typecheck` | whole project incl. tests | pass |
| `npm run lint` | ESLint (no warnings allowed in the result we report) | pass |
| `npm test` | 53 files / 631 tests | pass |
| `npx vitest run tests/db` | migrations `0001`–`0019` applied to PGlite **twice** (re-apply safe); RLS, FKs, constraints, storage policies, audit immutability, curriculum parity, topic columns, class/group migration | pass (94 tests) |
| `npm run build` | production build + chunk report | pass |
| `npx playwright test` | production build served by `vite preview`; real Chromium; 27 routes, 13 flows, 25-route accessibility sweep, icon rendering, Classes 1-8 custom curriculum | pass (54 tests) |

Key test files:

- `tests/domain/*` — progress denominators, revision spacing, exam maths, planner order,
  reminder quiet hours/dedupe, report facts vs interpretation, schema bounds, import
  parsing, time tracking overlaps/duplicates/timer caps, focus state machine, syllabus
  activity matrix, mistakes recurrence, practice accuracy, exam countdown, insights bands.
- `tests/integration/localRepository.test.ts` — per-workspace isolation, history-safe
  deletes, checklist toggles, adoption, import rollback, demo seed/remove, export.
- `tests/integration/localAuth.test.ts` — session persists across a reload, legacy session
  shape accepted, corrupt session ignored.
- `tests/integration/mistakePracticeLink.test.ts` — link stored, foreign question rejected,
  deleted question clears the link and keeps the mistake.
- `tests/integration/aiClient.test.ts` — browser-side provider wiring, error mapping,
  malformed output rejected, no key leakage.
- `tests/integration/aiFunction.test.ts` — the **server** adapter (`_shared/ai.ts`) executed
  in Node with a stubbed `Deno.env` and `fetch`: key confined to headers, schema and
  invented-number rejection, 401/5xx/timeout behaviour, retry policy, provider config.
- `tests/android/config.test.ts` — package id parity, SDK levels, reminder permissions,
  notification icon existence, Gradle wrapper pinning, corrected test stubs.
- `tests/android/preflight.test.ts` — `scripts/android-preflight.mjs`: Java version
  parsing (including `1.8.0_x`), numeric build-tools ordering, SDK package detection,
  missing wrapper and un-synced assets, and that every failure carries a remedy.
- `tests/csv.test.ts` — CSV quoting plus spreadsheet-formula neutralisation.
- `tests/ui/appBoot.test.tsx` — the real app boots in jsdom, seeds demo rows, navigates and
  renders every Phase 1 screen without a load error.
- `tests/ui/i18n.test.tsx` + `tests/i18n.test.ts` — locale switch updates `document.lang`,
  and both dictionaries hold exactly the same keys.
- `tests/db/schema.test.ts` — two users, cross-user reads/writes denied, forged ownership
  rejected, subject delete restricted, foreign-key behaviour, RLS on every Phase 2 table.
- `tests/db/tableSync.test.ts` — every SQL table has a TypeScript row type and vice versa.
- `tests/db/idempotency.test.ts` — the whole migration set applied twice to one database.
- `tests/bundle/secrets.test.ts` — scans the built bundle for service-role keys, provider
  keys, `x-goog-api-key` and `Deno.env`.
- `tests/ui/workspaceStates.test.tsx` — loading, real error message, and Retry recovering.
- `tests/integration/cloudErrorMapping.test.ts` — RLS/FK/duplicate failures become plain
  sentences, never raw SQL.
- `tests/e2e/*` — the journeys below plus a 25-route accessibility sweep (names, labels,
  landmarks), via Chromium against the production build.

### 9.0 Migrations are re-apply safe

Every `create trigger`, `create policy` and `create index` is preceded by a matching
`drop … if exists` (or is `if not exists`), so pasting `0001`–`0005` into the SQL editor
twice, or re-running a file after a partial failure, is safe. `tests/db/idempotency.test.ts`
applies the whole set twice to one database and compares the schema.

### 9.1 Hosted verification (one command)

Everything the local suite cannot prove is collected in one script:

```bash
export SUPABASE_URL="https://YOUR_TEST_PROJECT.supabase.co"
export SUPABASE_ANON_KEY="..."           # dashboard → Settings → API
export SUPABASE_SERVICE_ROLE_KEY="..."   # server-side only, used to create/delete test users

node scripts/verify-cloud.mjs --dry-run   # config check, prints the plan, writes nothing
node scripts/verify-cloud.mjs --apply-migrations --ai
```

It applies `0001`–`0005`, creates two throwaway users, asserts that B cannot read, forge,
update or delete A's rows, that B cannot attach records to A's practice question, that
`0005` clears the mistake link on question delete while keeping the mistake, that the
function rejects unauthenticated calls, optionally makes **one real AI request** and checks
the server-stamped fields, then deletes both users and confirms no rows remain. It refuses
URLs containing `prod` and never prints a key.

The guard paths (missing env → exit 2, malformed URL → exit 2, production URL → refused,
dry run → exit 0) were executed here. The live path has not been run — this sandbox has no
project and cannot reach `supabase.com`. Per-item commands and the current result of every
check are in [docs/VERIFICATION.md](docs/VERIFICATION.md).

### Journeys covered in the browser

| Journey | Spec | What it asserts |
| --- | --- | --- |
| A — academic setup | `journeys.spec.ts` | curriculum reachable, demo/`needs verification` notice visible |
| B — syllabus tracking | `journeys.spec.ts` | tick a checklist item, reload, still ticked; dashboard shows the same denominator |
| C — time tracking | `phase2.spec.ts` | log a 45-minute college block, it appears on the timeline |
| D — planning & revision | `journeys.spec.ts` | create task → complete it (moves to Done) → create second task → reschedule → persists after reload |
| E — mistake book | `journeys.spec.ts` | log a mistake linked to a practice question, reload, follow the link into that exact question, save an attempt, unlink without deleting the mistake |
| F — questions & notes | `phase2.spec.ts`, `journeys.spec.ts` | practice question + graded attempt (100 %), quick capture note found by vault search |
| G — progress & AI fallback | `journeys.spec.ts` | four insight bands render; AI-off message is explicit |
| H — security | `tests/db`, `tests/integration` | cross-user reads/writes rejected in Postgres and in the repository (the browser build is single-workspace by design) |
| I — backup/export | `journeys.spec.ts` | downloaded JSON parses, contains `user_subjects` with `user_id` and `is_demo` |
| Mobile shell | `smoke.spec.ts` | 390×844: no horizontal overflow, drawer navigation works, main column scrolls |
| Accessibility | `a11y.spec.ts` | every route: one `main`, one `h1`, every button/link has an accessible name, every control has a label, every image has `alt`; every icon renders inline |

### Defects found and fixed during this verification pass

The audit was not only additive. These were real failures reproduced in the browser or in
tests, then fixed:

1. **Content below the fold was unreachable.** Ionic renders `ion-app` as a fixed box and
   `body { overflow: hidden }`, so on a desktop the task list could not be scrolled with a
   wheel or by Playwright. Fixed in `theme.css` (`.app-main` scrolls); covered by the mobile
   shell test and by the task journey.
2. **Reloading the page signed you out of the local workspace.** A stored session used the
   shape `{ user, createdAt }` and the reader expected a bare user, so `getSession()`
   returned null. Fixed in `localAuth.ts` with backward compatibility, and locked down by
   `tests/integration/localAuth.test.ts` plus the reload assertion in `smoke.spec.ts`.
3. **Rows saved before a schema change crashed the vault.** A note without `tags`/`kind`
   threw on `.map`. Fixed with `COLUMN_DEFAULTS` + `normaliseRow` in `LocalDatabase` and
   defensive reads in the vault page.
4. **A practice attempt was silently not linked to its question.** The attempt dialog's
   defaults omitted `practice_question_id`, so accuracy stayed at “not recorded”. Fixed and
   asserted by the practice journey (now shows 100 %).
5. **A topic dialog omitted its chapter id**, which would have created an orphan topic.
   Fixed in the syllabus page.
6. **Switching to Bangla left `document.lang` at `en`.** Fixed in the provider; covered by
   `tests/ui/i18n.test.tsx`.
7. **Mistakes had no link to the practice question that caused them.** Added migration
   `0005`, types, validation, local FK mirroring, repository rejection of another user's
   question, UI select + link, and five integration tests plus a database test.
8. **“Delete all my records” failed on a non-empty workspace.** It walked tables in
   declaration order and hit `user_subjects` before the `on delete restrict` children, so
   the whole operation aborted half-way (the same order bug existed in the cloud
   repository's demo removal). Replaced with `deleteAllUserData()` in dependency order in
   both repositories; covered by three integration tests.
9. **CSV export allowed spreadsheet formula injection.** A note starting with `=` was
   written verbatim. `src/utils/csv.ts` now prefixes formula-like strings and has its own
   tests.
10. **Most navigation icons never rendered.** `nav.ts` stored icon *names*, so Ionic tried
    to fetch each SVG at runtime (and failed offline/in the Android webview): only 15 of 44
    icons had a glyph. Navigation now imports the icon data; the browser test asserts 100 %
    of icons render from inline SVG.
11. **The migrations were not re-apply safe**, although §4 says they are. `create trigger`
    and `create policy` were unguarded, so a second paste (or a re-run after a partial
    failure) aborted on `trigger "profiles_touch_updated_at" already exists`. Every
    trigger/policy is now created after `drop … if exists`; `tests/db/idempotency.test.ts`
    applies the full set twice to one database.
12. **The mistake book's practice link went to the page, not the question.** “Practice
    question: …” now opens `/practice?question=<id>` and immediately shows that question's
    attempt form (invalid or archived ids show a warning), proven end to end in journey E.

### Database tests without a hosted project

`tests/db/bootstrap.sql` supplies faithful stand-ins for the Supabase-managed objects the
migrations need (`auth.users`, `auth.uid()`, the `anon`/`authenticated` roles,
`storage.buckets/objects/foldername()`). PGlite is PostgreSQL 18 compiled to WASM, so the
SQL is parsed and executed for real. This is **not** the same as running against Supabase:
PostgREST, GoTrue, Studio and the real storage service remain unverified. To do that:

```bash
supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
```

---

## 10. Android build

Prerequisites: Node 20.19+, JDK 17+, and the Android SDK (platform 35 + build-tools +
platform-tools). A full walkthrough — including installing on your own phone, which backend
the APK should use, and what must never go into it — is in
**[docs/ANDROID_APK.md](docs/ANDROID_APK.md)**.

```bash
npm run android:preflight  # checks JDK, SDK, wrapper and synced assets; prints the fix
npm run android:sync       # vite build + cap sync android
npm run android:build      # → android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
# or: npm run android:open   (Android Studio)
```

The APK contains only the web bundle. With no `.env.local` it runs in **local demo mode**
with no key of any kind inside it; if you point it at your own Supabase project, only the
**anon** key is compiled in (safe because RLS is on) — never a service-role key or an AI
provider key. `npx vitest run tests/bundle` scans the built bundle for those.

What is in the repository: `appId com.mkjstudyos.app`, `minSdk 23 / target 35`,
`androidScheme https`, the `@capacitor/local-notifications@7.0.7` plugin registered by
`cap sync`, its permissions merged into the manifest
(`POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`), and a real status-bar icon
(`res/drawable/ic_stat_studyos.xml`) — the template pointed at a drawable that did not
exist. `tests/android/config.test.ts` re-checks package id, SDK levels, permissions and the
icon on every run, and the template test stubs were fixed so `./gradlew test` does not fail
on the renamed package.

**Status in this snapshot: sync PASS, configuration PASS, APK and device BLOCKED.** The web
build and `cap sync` were executed here (40 assets copied, plugin registered), but there is
no JDK, no Android SDK, and `services.gradle.org` / `dl.google.com` / Maven hosts are
unreachable, so `gradlew assembleDebug` was never run and no APK exists in this repository.
`npm run android:preflight` reproduces that verdict in one command. Reminders use inexact
alarms unless the user grants exact-alarm access — untested on hardware. See
[docs/ANDROID_APK.md](docs/ANDROID_APK.md) for the build and install steps and the
device checklist in [docs/VERIFICATION.md](docs/VERIFICATION.md) §2.3.

---

## 11. Architecture decisions

- **One repository interface, two implementations.** `LocalRepository` (browser storage)
  and `SupabaseRepository` (anon key + user session, RLS in Postgres). Mode is chosen by
  the presence of `VITE_SUPABASE_*`.
- **Pure domain layer.** No database, network or hidden clock inside progress/report
  rules: every function takes `today`/`now`, which is why the tests are deterministic.
- **Ratios always carry denominators.** A missing denominator renders “Not recorded”.
- **One timeline, no double counting.** Study minutes live in `study_sessions`; non-study
  time lives in `daily_blocks`. The tracker merges them for display only.
- **AI is an optional interpreter, never the source of truth.** Deterministic report
  first; AI text is validated, labelled and never used for marks or predictions.
- **Data-loss prevention over convenience.** Archive instead of delete, restricted
  deletes, import rollback, export, visible demo markers.
- **Route-level code splitting.** All 27 routes are `React.lazy`, with vendor chunks for
  React, Ionic, Supabase and date/data libraries (`vite.config.ts`).

Rules and thresholds are documented in [`docs/PROGRESS_RULES.md`](docs/PROGRESS_RULES.md).

---

## 12. Known limitations

1. **Cloud mode has never been executed.** Migrations and RLS are DB-tested in PGlite, but
   no hosted Supabase project was available. Run §4, `supabase/tests/rls.test.sql` and
   `node scripts/verify-cloud.mjs` before trusting cloud mode with real data.
2. **No real AI call.** The adapter is unit-tested against a stubbed provider (16 tests) but
   no provider was ever contacted. Set the secrets and run
   `node scripts/verify-cloud.mjs --ai`.
3. **No Android build or device run.** The native project, manifest, permissions and icon
   are committed and config-tested; nothing was compiled or installed (no JDK/SDK, no
   device). Run `npm run android:build` on a machine with the SDK.
4. **Subject structure only, no chapters.** The official NCTB subject lists for SSC and
   HSC ship for Science, Humanities and Business Studies, but chapter titles do not:
   they live in PDFs that could not be read here, so they are absent rather than
   invented. Every curriculum row stays `needs_verification` until a human compares it
   with the cited source. Six HSC streams exist; Islamic Studies, Home Science and Music
   are not seeded.
5. **No restore from backup.** Export works (JSON + CSV); importing a JSON workspace is
   not implemented. Chapter import is a separate, reviewed feature.
6. **No offline write queue.** Cloud mode needs a connection; failed writes surface as
   errors and are not replayed later.
7. **Ionic vendor chunk stays large.** Route chunks are split; Ionic itself is one
   framework chunk (278 kB gzip) and is cached after first load.
8. **Single local workspace per browser.** Local demo mode stores one identity; multi-user
   isolation is enforced and tested in the database layer, not in local mode.
9. **Time tracker is foreground-only.** The stopwatch computes elapsed wall-clock time
   from timestamps (so a sleeping tab does not lose time), but it does not run in the
   background and makes no claim to. There is no automatic tracking.
10. **No PDF export and no server-side push.** Export is JSON/CSV; reminders are
    local/native only, and the app never claims a notification was delivered without
    platform confirmation.
11. **Bangla coverage is UI labels.** User content keeps whatever you type; mixed
    direction text is not specially handled beyond `lang="bn"`.
12. **Bulk import is chapter-level**, not a full official syllabus import.

---

## 13. Sensible next steps

1. Run `0001`–`0005` against a staging Supabase project, execute
   `supabase/tests/rls.test.sql`, then `node scripts/verify-cloud.mjs` for the
   application-level checks and spot-check cloud mode with two accounts.
2. Deploy the Edge Functions with a real provider key, generate one AI narrative, and
   confirm it is stored, labelled and rate-limited.
3. Run `npm run android:build`, install the APK, and verify notification permission,
   scheduling, time zones, dedupe and reboot-restore on a device (checklist in
   `docs/VERIFICATION.md` §2.3).
4. Add the chapter lists for the seeded SSC/HSC subjects from the official NCTB PDFs,
   keeping `source_url` and `verification_status = 'needs_verification'` until each one
   has been read, then flip only the reviewed rows to `verified` (see
   [docs/CURRICULUM.md](docs/CURRICULUM.md) for the exact procedure).
5. Add JSON workspace restore (with a version check and a dry-run preview) on top of the
   existing export format.
6. Add a cloud-mode offline write queue if the app is used on unreliable connections.
7. Split the Ionic vendor chunk further only if a safe, tested approach is found.

---

## 14. Project layout

```
src/
  app/            providers, routes (lazy), navigation, services
  components/     layout (shell, drawer, quick capture) and UI primitives
  domain/         pure logic: progress, tasks, revisions, time, focus, syllabus,
                  mistakes, practice, preparation, insights, reports, reminders, import
  features/       one folder per screen
  hooks/          workspace query/mutation helpers
  i18n/           English/Bangla strings
  services/       repository interface, local + Supabase implementations, auth,
                  AI client, notifications, seed data
  styles/         design tokens and layout CSS
  types/          domain types
android/          generated Capacitor project (SDK 35, notifications plugin, status icon)
supabase/
  migrations/     0001 schema+RLS · 0002 demo curriculum · 0003 phase 2 ·
                  0004 demo topics · 0005 mistake→question link
  functions/      weekly-summary, delete-account, shared CORS + provider adapter
  tests/          rls.test.sql (for a real Supabase instance)
scripts/          playwright browser resolver, hosted verification harness
tests/
  domain/         deterministic unit tests
  integration/    local repository, auth, mistake link, AI client
  db/             migration + RLS execution (PGlite) and schema/type sync
  ui/             jsdom app boot + component tests
  e2e/            Playwright journeys, accessibility sweep
  android/        native configuration guard (no SDK required)
docs/             progress rules, verification record, Android build guide
```

---

Built to be honest about what it knows. Missing records are missing data, not a verdict on
your effort.
