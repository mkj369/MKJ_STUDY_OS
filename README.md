# MKJ StudyOS

A personal academic memory, syllabus tracker, revision manager and study planner for
HSC Science students. Built with **React + TypeScript + Vite**, **Ionic + Capacitor**
for Android, and **Supabase** (Postgres, Auth, Row Level Security, Storage, Edge
Functions) for real accounts and sync.

The core design rule is honesty: the app shows **what you recorded**, distinguishes
`not recorded` from `not studied`, explains why anything is flagged, and never
invents curriculum content, lecture counts, marks or AI predictions. The AI coach is
optional, server-side, and produces a report that is validated before it is stored or
displayed — the deterministic report always works without it.

---

## 1. What this repository actually contains

| Area | State |
| --- | --- |
| Domain engine (progress, revision queue, planner, reports, import, reminders) | Implemented · unit tested |
| Data layer: local demo repository **or** Supabase/RLS repository | Implemented · local fully tested · cloud implemented, not run against a live project |
| Auth: email/password (cloud) + local workspace (demo) | Implemented · local boot-tested · cloud untested |
| All Phase 1 screens (14 routes) | Implemented · app boot/navigation smoke-tested · deep visual QA pending |
| Weekly deterministic report | Implemented · tested |
| AI weekly narrative via Edge Function | Implemented · **not executed** (no provider key project in this environment) |
| Weekly reminder planning + preferences | Implemented · planner tested · native delivery **not verified** |
| CSV/JSON chapter import with preview and rollback | Implemented · parser/preview/repository tests |
| Postgres schema + RLS policies | Written · **not executed** here (no local Postgres/Supabase) |
| RLS isolation tests | Written · **not executed** here |
| Android app | Capacitor configured · **APK not built** (no JDK/Android SDK here) |

Exact commands and the known limitations are in sections 6–11.

---

## 2. Quick start (no backend needed)

```bash
npm install
npm run dev          # http://localhost:5173
```

Without `VITE_SUPABASE_*` variables the app starts in **local demo mode**: records are
kept in this browser's `localStorage`, and the landing screen offers
“Start local workspace”, which seeds clearly labelled demo data.

Local mode is for trying the workflow. It is **not** encrypted, **not** a security
boundary, and **not** backed up. Use it to explore, not to store your only copy of
anything important.

### Demo data

Every seeded row has `is_demo = true` and shows a **Demo** badge. The demo curriculum
is a structural placeholder (`needs_verification`), **not official NCTB content**.
“Remove demo data” in Settings deletes demo rows and keeps anything you created.

---

## 3. Configure Supabase (cloud accounts and sync)

1. Create a project at <https://supabase.com>.
2. Copy `.env.example` to `.env.local` and fill in:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLISHABLE-KEY
   ```

   Only the anon key belongs in the client. RLS is what makes that safe; never put
   the service-role key or an AI key in a `VITE_*` variable.

3. Apply the schema:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push            # runs supabase/migrations/0001_init.sql and 0002_demo_curriculum.sql
   ```

   Or paste the migration files into the SQL editor in order. They are idempotent
   (`create table if not exists`, `on conflict do nothing`).

4. Deploy the functions and set server-side secrets (see section 7):

   ```bash
   supabase functions deploy weekly-summary
   supabase functions deploy delete-account
   ```

5. Restart `npm run dev`. The app switches to cloud mode automatically and shows the
   normal sign-in / sign-up screens. The first sign-in verifies your email using your
   Supabase auth settings.

### Using your own curriculum data

The app never ships a verified official syllabus. Add your own version, subjects and
chapters with SQL (or the CSV/JSON chapter import for chapters of an adopted subject).
Keep `verification_status` and `source_url` accurate. Version a new curriculum instead
of editing rows students already adopted — adopted subjects keep their own copy of the
name and their history.

---

## 4. Scripts

```bash
npm install        # install dependencies
npm run dev        # Vite dev server on 0.0.0.0:5173
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve the production build on 0.0.0.0:4173
npm run typecheck  # tsc -b --pretty false
npm run lint       # eslint .
npm test           # vitest run (unit + integration + UI smoke)
npm run test:watch # vitest watch mode
npm run android:sync  # build web app and copy to the Android project
npm run android:open  # open the Android project in Android Studio
```

Current verified output in this repository snapshot:

```
npm run typecheck   → no errors
npm run lint        → no errors, no warnings
npm test            → 11 files, 172 tests passed
npm run build       → built successfully (main chunk ≈ 1.78 MB / 429 kB gzip)
npm run dev         → ready on http://localhost:5173, responds 200
```

The build prints Vite's default chunk-size warning; the bundle is not yet split.
That is a performance item, not a functional failure (see limitations).

---

## 5. Data model and privacy

All user-owned tables have `user_id` and RLS policies so a signed-in user can only
read or write their own rows. Curriculum tables are read-only reference data for
clients. Audit rows are append-only.

- **Profile** — display name, locale (English/Bangla), IANA time zone, study windows per weekday.
- **Curriculum** — versions → subjects → chapters, each with verification status.
- **User subjects/chapters** — your adopted or custom subjects and chapters. Chapter
  status can be set manually; the engine also derives one and explains any difference.
- **Checklist** — per-chapter reading/lecture/notes/practice/board/MCQ/... items, plus
  progress rows. Ticking every box is **not** treated as mastery.
- **Records** — lectures, study sessions (manual date + minutes), revision sessions
  (confidence 1–5), difficult topics, mistake log, exams and results, notes, resources.
- **Tasks** — due/planned dates, estimate, priority, carry-over count and a gap reason.
- **Weekly summaries** — deterministic and AI reports, with source, status, provider and error code.
- **Reminders** — preferences plus events with `scheduled | sent | failed | skipped`.
  A reminder is only shown as “sent (confirmed)” after the platform confirms it.
- **Audit events** — append-only record of writes for troubleshooting.

Deleting a chapter never deletes your history: lecture/session/revision rows are kept
and unlinked. Deleting a subject is only allowed when no records reference it — the app
offers **Archive** instead, and the database enforces the same rule.

### Export and deletion

Settings → *Data & privacy*:

- **Export everything** downloads a JSON file (and copies it to the clipboard) of every
  table you own plus your profile.
- **Delete all my records** removes user rows but keeps the account/profile.
- **Delete account** permanently deletes the auth user and all related rows. This calls
  the `delete-account` Edge Function; if it is not deployed the app says so instead of
  pretending. Local mode cannot delete a cloud account and says that too.

Files uploaded through the resources screen go to a private `study-files` bucket with
per-user folder policies; nothing is public.

---

## 6. AI coach (optional)

The browser never holds an AI key. It calls the `weekly-summary` Edge Function, which:

1. authenticates the caller and reads only that user's week (RLS enforced by the
   user's JWT);
2. builds a small, bounded facts payload (dates, subject names, durations, counts,
   task states, exam marks you entered) — no note bodies, no tokens;
3. asks the configured provider for strict JSON;
4. validates the response shape, rejects invented numbers that are not present in the
   facts, and only then stores and returns it;
5. rate-limits per user per hour and times out rather than hanging.

Provider setup:

```bash
supabase secrets set AI_PROVIDER=gemini            # or openai
supabase secrets set AI_API_KEY=YOUR_PROVIDER_KEY
supabase secrets set AI_MODEL=gemini-2.0-flash     # or gpt-4o-mini, etc.
supabase secrets set AI_TIMEOUT_MS=20000
supabase secrets set AI_MAX_REQUESTS_PER_HOUR=20
supabase secrets set ALLOW_ORIGIN=https://your-web-app.example
```

Cost notes: each request sends a few kilobytes of JSON and asks for at most 1 600
output tokens. Provider pricing changes; check your provider's current rates. Free
tiers are not guaranteed. If no key is configured the app reports “AI not configured”
and the deterministic report continues to work. Nothing in the app requires AI.

Function status endpoint: the Reports screen calls `weekly-summary` with
`{ "action": "status" }` to show whether AI is configured, without exposing keys.

---

## 7. Testing

```bash
npm test
```

Coverage in this snapshot:

- `tests/domain/progress.test.ts` — checklist/lecture denominators, revision schedule,
  exam maths, status derivation order, "not recorded ≠ not studied", flag evidence.
- `tests/domain/tasks.test.ts` — planning order, carry-over without deletion, weekly
  draft capacity warnings, recovery plan.
- `tests/domain/revisions.test.ts` — queue buckets and ordering.
- `tests/domain/reminders.test.ts` — quiet hours, past suppression, dedupe, daily cap.
- `tests/domain/reports.test.ts` — deterministic report facts vs interpretation,
  missing-data wording, limits, stability.
- `tests/domain/schemas.test.ts` — validation bounds (marks ≤ total, minutes, enums).
- `tests/domain/import.test.ts` — CSV/JSON parsing, row errors, duplicate detection.
- `tests/integration/localRepository.test.ts` — per-user isolation, history-safe deletes,
  checklist toggles, curriculum adoption, import rollback, demo seed/remove, export.
- `tests/integration/aiClient.test.ts` — provider wiring, no key leakage, HTTP error
  mapping, malformed AI output rejection.
- `tests/ui/components.test.tsx` — shared UI primitives, accessibility attributes,
  error helpers.
- `tests/ui/appBoot.test.tsx` — real app boot in jsdom: local workspace creation, demo
  seeding, dashboard, navigation, and a render pass over all 13 in-app screens.

RLS tests are separate because they need a database:

```bash
supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
```

They create two auth users, assert cross-user reads/writes fail, that ownership cannot be
forged, that chapter deletion unlinks instead of deleting history, that subject deletion
is restricted while linked records exist, and that audit events are immutable.

---

## 8. Android build

Prerequisites: Node 20+, a JDK 17+, Android Studio with an SDK, and a device or emulator.

```bash
npm install
npm run build
npx cap add android        # first time only
npm run android:sync       # build web + copy into android/
npm run android:open       # open in Android Studio, then Run
```

Configuration lives in `capacitor.config.ts` (`appId: com.mkjstudyos.app`,
`webDir: dist`, `androidScheme: https`, Local Notifications plugin block).

**Honest limitation:** this environment has no JDK/Android SDK, so no APK was built or
installed and native reminder delivery was not verified on a device. The web build
reports that scheduling is unavailable rather than claiming delivery. The app never
marks a reminder “sent” without a platform confirmation.

---

## 9. Architecture decisions

- **One repository interface, two implementations.** `LocalRepository` (browser storage,
  demo mode) and `SupabaseRepository` (anon key + user session, RLS in Postgres).
  Mode is selected by the presence of `VITE_SUPABASE_*`.
- **Pure domain layer.** No database, network or `Date.now()` inside progress/report
  rules: every function takes `today`/`now`, which is why the tests are deterministic.
- **Ratios always carry denominators.** A missing denominator renders “Not recorded”,
  never 0%.
- **Manual time entry by default.** Sessions store a calendar date and minutes; optional
  start/end timestamps exist for a future timer, not to infer dates.
- **AI is an optional interpreter, never the source of truth.** Deterministic report
  first; AI text is validated, labelled, and never used for marks or predictions.
- **Data loss prevention over convenience.** Archive instead of delete; restricted
  deletes; import rollback; export; visible demo markers.

Rules and thresholds are documented in [`docs/PROGRESS_RULES.md`](docs/PROGRESS_RULES.md).

---

## 10. Known limitations

1. **No live Supabase run in this environment.** SQL, RLS tests and Edge Functions are
   written but were not executed here. Run the commands in sections 3 and 7 before
   trusting cloud mode with real data.
2. **No browser-based E2E or device test.** UI is verified by jsdom boot/navigation and
   component tests, not by clicking through a real browser or phone.
3. **Android APK not built** (no JDK/SDK). Reminder delivery on Android is unverified.
4. **AI path not executed** (no provider key/project). Validation and failure handling
   are unit-tested with a fake client; provider behaviour itself is not.
5. **Demo curriculum is placeholder**, not official NCTB content. Replace it with
   verified data; `needs_verification` stays until you do.
6. **No offline write queue.** Local mode works offline by nature; cloud mode requires a
   connection for reads and writes and does not replay queued mutations.
7. **Bundle is not code-split**; Vite warns about a ~1.78 MB main chunk.
8. **No PDF export** — export is JSON. No push notifications server-side; reminders are
   local/native only.
9. **Bangla coverage** is UI labels only; user content is whatever you type, and mixed
   direction text is not specially handled beyond `lang="bn"`.
10. **Bulk import is chapter-level** (subject + chapter + optional lecture target), not a
    full official-syllabus import.

---

## 11. Sensible next steps

1. Run the migrations and RLS tests against a local Supabase, then a staging project.
2. Deploy the Edge Functions with a real key; run one AI report and confirm the stored
   payload and rate limit in the dashboard.
3. `npx cap add android`, build a debug APK, verify local notifications, quiet hours and
   the daily cap on a device.
4. Browser E2E (Playwright) for: sign-up → adopt subject → log lecture → tick checklist →
   create task → generate report.
5. Replace the demo curriculum with verified data and record `source_url` +
   `verification_status`; add a reviewed import path for a full syllabus.
6. Code-split the routes and lazy-load Ionic screens to reduce the initial bundle.
7. Add a background job (pg_cron/Edge Function) for reminder delivery if server-side push
   is wanted; keep the “no fake sent status” rule.

---

## 12. Project layout

```
src/
  app/            providers, routes, navigation
  components/     layout, shared UI primitives
  domain/         pure logic: progress, tasks, revisions, reports, reminders, import
  features/       one folder per screen (dashboard, curriculum, lectures, …)
  hooks/          workspace query + mutation helpers
  i18n/           English/Bangla strings
  services/       repository interface, local + Supabase implementations, auth, AI client, notifications
  styles/         design tokens and layout CSS
  types/          domain types
supabase/
  migrations/     schema + RLS + demo curriculum
  functions/      weekly-summary, delete-account, shared adapter
  tests/          RLS isolation test script
tests/            domain, integration and UI tests
docs/             progress rules and status notes
```

---

Built to be honest about what it knows. Missing records are missing data, not a verdict
on your effort.
