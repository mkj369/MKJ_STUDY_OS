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
| Screens: 27 lazy routes (14 Phase 1 screens, chapter detail, 11 Phase 2 screens, 404) | **Browser-tested**: all 25 navigable routes load in Chromium, plus the main flows; the jsdom boot test covers every Phase-1 screen too |
| Student journeys A–I (setup, syllabus, time, planning, mistakes, practice, insights, export) | A–G and I **browser-tested**; H (cross-user security) **DB-tested**; see §9 |
| Postgres schema + RLS (`0001`–`0005`) | **DB-tested** in PGlite; **not** applied to a hosted project |
| RLS isolation (two users, forged writes, composite FKs) | **DB-tested** |
| AI narrative Edge Function | **Written + unit-tested** (fake provider); **not executed** — no provider key here |
| Android (Capacitor 7) | Configured; **APK not built** (no JDK/Android SDK in this environment) |
| Demo curriculum | **Placeholder**, `needs_verification`, **not** official NCTB content |
| Export / backup | **Browser-tested** (JSON download contains real rows); restore is **not implemented** |
| Production build + route splitting | **Verified**: 27 route chunks, 8 shared chunks, 4 vendor chunks (39 JS files) |

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
| **Syllabus tracker** | Class/group/stream filters, curriculum versions with authority + academic year + verification status, 11 activities tracked independently (reading, lectures, notes, formula sheet, practice, board, admission, MCQ, written, revision, self test), topic-level status, chapter/subject coverage, completion *estimates* labelled as estimates | `/syllabus` |
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

   `0005` uses `on delete set null (practice_question_id)`, which needs Postgres 15+
   (Supabase projects are 15/16/17; PGlite here is 18).

4. Deploy the functions and set server-side secrets (see §8):

   ```bash
   supabase functions deploy weekly-summary
   supabase functions deploy delete-account
   ```

5. Restart `npm run dev`. The app switches to cloud mode and shows the sign-in screen.

### Using your own curriculum data

The repository never ships a verified official syllabus. Add a version, subjects and
chapters with SQL or use the CSV/JSON chapter import for chapters of an adopted subject.
Keep `verification_status`, `source_url` and `academic_year` accurate. Version a new
curriculum instead of editing rows students already adopted.

---

## 5. Curriculum accuracy

- The seeded curriculum is **demo**: names are structural placeholders, every row is
  `is_demo = true`, and versions carry `verification_status = 'needs_verification'` plus a
  visible notice in the syllabus tracker.
- No NCTB chapter list, lecture count, mark distribution or exam date is invented. Where
  a denominator is unknown the UI shows “Not recorded”.
- To import real data you must record the source (`authority`, `source_url`),
  `academic_year`, `version_label` and verification status. Only then flip the status to
  `verified`.
- The schema is version-ready for Classes 1–12, SSC/HSC and admission preparation, but
  **no such official data is included**.

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
npm run verify        # typecheck && lint && test && build
npm run android:sync  # build + cap sync android
npm run android:open  # open the Android project
```

### Verified output in this snapshot (2026-10-27)

```
npm run typecheck  → no errors
npm run lint       → no errors, no warnings
npm test           → 27 files, 347 tests passed
                     (incl. 32 database/migration/RLS assertions in tests/db)
npm run build      → ✓ built in 5.58 s
npm run test:e2e   → 36 passed (51.9 s) in Chromium against the production preview build
```

Bundle after route-level code splitting (raw / gzip):

```
ionic-vendor      1 261.03 kB / 278.17 kB   (only chunk above Vite's 500 kB warning)
supabase-vendor     227.08 kB /  58.97 kB
data-vendor         129.52 kB /  36.63 kB
app entry           148.73 kB /  43.49 kB
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
still complete, and `/insights` works fully offline. **No real provider request has been
made from this repository snapshot** — there was no key available.

---

## 9. Testing

### What runs, and what it proves

| Command | Scope | Result here |
| --- | --- | --- |
| `npm run typecheck` | whole project incl. tests | pass |
| `npm run lint` | ESLint (no warnings allowed in the result we report) | pass |
| `npm test` | 27 files / 347 tests | pass |
| `npx vitest run tests/db` | migrations `0001`–`0005` applied to PGlite; RLS, FKs, constraints, storage policies, audit immutability | pass (32 tests) |
| `npm run build` | production build + chunk report | pass |
| `npx playwright test` | production build served by `vite preview`; real Chromium; 27 routes, 11 flows, 25-route accessibility sweep | pass (36 tests, 52 s) |

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
- `tests/integration/aiClient.test.ts` — provider wiring, error mapping, malformed output
  rejected, no key leakage.
- `tests/ui/appBoot.test.tsx` — the real app boots in jsdom, seeds demo rows, navigates and
  renders every Phase 1 screen without a load error.
- `tests/ui/i18n.test.tsx` + `tests/i18n.test.ts` — locale switch updates `document.lang`,
  and both dictionaries hold exactly the same keys.
- `tests/db/schema.test.ts` — two users, cross-user reads/writes denied, forged ownership
  rejected, subject delete restricted, foreign-key behaviour, RLS on every Phase 2 table.
- `tests/db/tableSync.test.ts` — every SQL table has a TypeScript row type and vice versa.
- `tests/e2e/*` — the journeys below plus a 25-route accessibility sweep (names, labels,
  landmarks), via Chromium against the production build.

### Journeys covered in the browser

| Journey | Spec | What it asserts |
| --- | --- | --- |
| A — academic setup | `journeys.spec.ts` | curriculum reachable, demo/`needs verification` notice visible |
| B — syllabus tracking | `journeys.spec.ts` | tick a checklist item, reload, still ticked; dashboard shows the same denominator |
| C — time tracking | `phase2.spec.ts` | log a 45-minute college block, it appears on the timeline |
| D — planning & revision | `journeys.spec.ts` | create task → complete it (moves to Done) → create second task → reschedule → persists after reload |
| E — mistake book | `journeys.spec.ts` | log a mistake linked to a practice question, reload, unlink it without deleting the mistake |
| F — questions & notes | `phase2.spec.ts`, `journeys.spec.ts` | practice question + graded attempt (100 %), quick capture note found by vault search |
| G — progress & AI fallback | `journeys.spec.ts` | four insight bands render; AI-off message is explicit |
| H — security | `tests/db`, `tests/integration` | cross-user reads/writes rejected in Postgres and in the repository (the browser build is single-workspace by design) |
| I — backup/export | `journeys.spec.ts` | downloaded JSON parses, contains `user_subjects` with `user_id` and `is_demo` |
| Mobile shell | `smoke.spec.ts` | 390×844: no horizontal overflow, drawer navigation works, main column scrolls |
| Accessibility | `a11y.spec.ts` | every route: one `main`, one `h1`, every button/link has an accessible name, every control has a label, every image has `alt` |

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

Prerequisites: Node 20+, JDK 17+, Android Studio with an SDK, and a device or emulator.

```bash
npm run build
npx cap add android      # first time only — creates android/
npm run android:sync
npx cap run android      # or open in Android Studio and press Run
```

Configured in `capacitor.config.ts` (`appId com.mkjstudyos.app`, `webDir dist`,
`androidScheme https`, local-notification icon/colour). Reminder scheduling uses
`@capacitor/local-notifications` and asks for permission at runtime; on the web it says
plainly that device notifications are unavailable.

**Status in this snapshot: BLOCKED — NOT VERIFIED.** No JDK or Android SDK is installed
here, so no APK was built and no notification was delivered to a device. Everything up to
`cap sync` is written and builds.

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
   no hosted Supabase project was available. Run §4 and the `psql` RLS script before
   trusting cloud mode with real data.
2. **No real AI call.** The function and adapter are unit-tested with a fake provider; the
   provider itself was never contacted. Set secrets and press “Generate AI narrative”.
3. **No Android build.** APK and device notifications are unverified (no JDK/SDK).
4. **Demo curriculum only.** No official NCTB data is bundled; `needs_verification` stays
   until a real, sourced import replaces it.
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

1. Run `0001`–`0005` against a staging Supabase project, execute `supabase/tests/rls.test.sql`,
   then spot-check the app in cloud mode with two accounts.
2. Deploy the Edge Functions with a real provider key, generate one AI narrative, and
   confirm it is stored, labelled and rate-limited.
3. `npx cap add android`, build a debug APK, and verify notification permission,
   scheduling, time zones and dedupe on a device.
4. Import a verified curriculum with `authority`, `source_url` and `academic_year`, then
   flip `verification_status` to `verified` only for the reviewed rows.
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
supabase/
  migrations/     0001 schema+RLS · 0002 demo curriculum · 0003 phase 2 ·
                  0004 demo topics · 0005 mistake→question link
  functions/      weekly-summary, delete-account, shared CORS + provider adapter
  tests/          rls.test.sql (for a real Supabase instance)
tests/
  domain/         deterministic unit tests
  integration/    local repository, auth, mistake link, AI client
  db/             migration + RLS execution (PGlite) and schema/type sync
  ui/             jsdom app boot + component tests
  e2e/            Playwright journeys
docs/             progress rules and thresholds
```

---

Built to be honest about what it knows. Missing records are missing data, not a verdict on
your effort.
