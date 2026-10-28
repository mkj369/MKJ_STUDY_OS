# Verification log

What was actually executed, when, and what refused to run. `README.md` §1 gives the
summary table; this file is the evidence behind it and the exact commands to reproduce
each line.

This file used to be a full copy of `README.md`, which meant the status table existed
twice and drifted. It is now only the log; the README is the single place that states
current status.

Last run: **2026-10-28**, Node v22.22.3, npm 10.9.8, Vite 6.4.5, Linux sandbox.

---

## 1. Commands run on this commit

```bash
npm ci                      # 397 packages, lockfile respected
npm run typecheck           # tsc -b --pretty false   -> no output (clean)
npm run lint                # eslint .                -> no output (clean)
npm run build               # tsc -b && vite build    -> built in 5.7s
npx vitest run              # 38 files, 435 tests passed
npx playwright test         # 39 tests passed (Chromium, production bundle)
```

`npm run verify` runs typecheck → lint → build → `vitest run`. Build before tests
matters: `tests/bundle/secrets.test.ts` skips four assertions when `dist/` is absent,
because it greps the real bundle for leaked keys. Without a build you get
`431 passed | 4 skipped` — not a failure, but it has not checked the secrets.

### Test suite composition (435)

| Area | Files | What it proves |
| --- | --- | --- |
| `tests/domain` | 17 | Progress denominators, revision spacing, planner packing, reports, imports, curriculum filters/coverage, AI payload keys |
| `tests/db` | 4 | Migrations `0001`–`0007` apply in order **and twice** (idempotency), RLS isolates two users, official curriculum SQL matches its TypeScript twin, a student chapter keeps its link through a reseed |
| `tests/integration` | — | Local repository behaviour: per-user isolation, history-safe deletes, curriculum seed reruns leaving progress and notes untouched |
| `tests/ui` | — | jsdom rendering of shared components and pages, single `<h1>` per route |
| `tests/bundle` | 1 | No service-role key or AI provider key in the built assets |
| `tests/functions`, `tests/android` | — | Weekly-summary function with a stubbed provider (no live call), Capacitor config assertions |

### Browser suite (39)

`npx playwright test` runs against `npm run build && npm run preview --port 4173`
(baseURL `http://127.0.0.1:4173`), one worker, real localStorage. Covers:

- smoke boot in local demo mode, mobile shell with no sideways overflow;
- journeys A/B (syllabus → checklist tick survives reload), C (curriculum filters by
  level, group and Bangla subject name), C2 (checklist tick survives a reseed), D
  (create/complete/reschedule a task), E (mistake → practice question link survives
  reload), G/I (insights separate facts from guesses; export downloads real rows);
- phase-2 flows: time block on the timeline, practice question attempted and graded,
  focus session writing a study session;
- accessibility: named controls and landmarks on every route, exactly one `<h1>`,
  icons rendered from inline SVG (no runtime font fetch).

Chromium in this sandbox comes from `scripts/playwright-browser.mjs`
(`@sparticuz/chromium` + extracted NSS/NSPR libs in `/tmp`). On a normal machine use
`npx playwright install chromium` and ignore the shim.

---

## 2. Blocked in this environment — with the exact command to unblock

Nothing below was faked or claimed as passing.

### 2.1 Hosted Supabase

No project, no credentials. `.env.local` is absent and must stay out of Git.

```bash
# once a project exists:
supabase link --project-ref YOUR_PROJECT_REF
supabase db push                     # applies 0001..0007
npm run verify:cloud                 # scripts/verify-cloud.mjs checks connection + RLS
npm run dev                          # app switches to the sign-in screen
```

What remains unproven until then: PostgREST/GoTrue wiring, Storage policies against
the real service, and the Supabase repository implementation, which has **never been
executed against a live project**. The local repository is the one under test.

### 2.2 Live AI narrative

No provider key, and provider hosts are unreachable from this sandbox (only
`api.github.com`, npm and PyPI answer).

```bash
supabase secrets set AI_API_KEY=... AI_MODEL=...
supabase functions deploy weekly-summary
```

The function is tested end-to-end with a stubbed provider, including rejection of
invented numbers and mapping of 401/5xx/timeout. A live call is still unverified, and
the app must keep working with AI off — it does.

### 2.3 Android APK

No JDK, no Android SDK, and gradle/google/maven/adoptium/debian hosts all fail from
here. `npm run android:preflight` reports what is missing.

```bash
npm run android:preflight   # says exactly which of java/sdk/adb is absent
npm run android:sync        # needs the web build first
npm run android:open        # then build in Android Studio, or:
cd android && ./gradlew assembleDebug
```

The project (`android/`, minSdk 23, target 35, `com.mkjstudyos.app`) is generated and
config-tested; the APK has **not** been built, installed or run. See
[docs/ANDROID_APK.md](ANDROID_APK.md).

### 2.4 nctb.gov.bd

The site is a JS-rendered Payload CMS. `fetch` of `/pages/static-pages/<id>`,
`/pages/files/<id>` and `/api/pages` returns navigation boilerplate or an error page,
and `curl` cannot reach the host at all. Only search-engine snippets expose content.

Consequence, recorded in [docs/CURRICULUM.md](CURRICULUM.md): subject names and group
structure are seeded and sourced; **chapter titles are not**, because they live inside
PDFs that could not be read here. They must be added by a human from the official
textbook, not inferred.

---

## 3. How to read the status labels

| Label | Means |
| --- | --- |
| **Written** | Code exists but was not executed here |
| **Unit-tested** | Deterministic tests, `npx vitest run` |
| **Integration-tested** | Repository/auth in Node with in-memory storage |
| **DB-tested** | Migrations applied and RLS asserted in PGlite (Postgres 18/WASM) |
| **Browser-tested** | Playwright on the production bundle: real UI, real storage, real downloads |
| **Cloud-verified** | Against a hosted Supabase project — **not done** |
| **Device-verified** | On Android hardware/emulator — **not done** |

PGlite is real Postgres compiled to WASM, so the DDL, constraints and policies are
genuinely executed — but Supabase-specific services (PostgREST, GoTrue, Storage) are
not, and that gap is why cloud mode stays labelled **Written**.

---

## 4. Re-running this log

```bash
npm ci && npm run build && npm run typecheck && npm run lint && npx vitest run && npx playwright test
```

Update the date at the top, and do not upgrade a row in README §1 without a command
above that actually produced the claimed result.
