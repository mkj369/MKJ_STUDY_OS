# Verification log

What was actually executed, when, and what refused to run. `README.md` §1 gives the
summary table; this file is the evidence behind it and the exact commands to reproduce
each line. The per-phase report for the 2026-11 next update lives in
[NEXT_UPDATE_REPORT.md](NEXT_UPDATE_REPORT.md).

Last run: **2026-11-06**, Node v22.22.3, npm 10.9.8, Vite 6.4.5, Linux sandbox.

---

## 1. Commands run on this commit

```bash
npm ci                      # lockfile respected
npm run typecheck           # tsc -b --pretty false   -> no output (clean)
npm run lint                # eslint .                -> no output (clean)
npm run build               # tsc -b && vite build    -> built in ~6 s
npx vitest run              # 46 files, 517 tests passed, 0 failed
npx vitest run tests/db     # 58 tests passed (subset of the above)
npx playwright test         # 54 tests passed (Chromium, production bundle, ~1.5 min)
npx cap sync android        # 2 plugins: @capacitor/app, @capacitor/local-notifications
npm run android:preflight   # reports JDK 21 + Android SDK missing (see §2.3)
```

`npm run verify` runs typecheck → lint → build → `vitest run`. Build before tests
matters: `tests/bundle/secrets.test.ts` skips four assertions when `dist/` is absent,
because it greps the real bundle for leaked keys. The 517 figure above includes
those four (dist/ was present).

### Test suite composition (517)

| Area | What it proves |
| --- | --- |
| `tests/domain` | Progress denominators, revision spacing, planner packing, reports, imports, curriculum filters/coverage, AI payload keys, **track→curriculum mapping (5 sections, class levels, Admission reuses HSC, reference version preferred)**,
  **skipped-status math (denominators, attention, all-skipped edge)**, **target progress from real records**, **timestamp-based focus engine (open + countdown, pause/resume, restore)** |
| `tests/db` (58) | Migrations `0001`–`0010` apply in order **and twice** (idempotency), RLS isolates two users, official curriculum SQL matches its TypeScript twin, chapter links survive a reseed, **0008: targets FKs, lecture checklist ownership, community privacy**, **0009: imported reference syllabus matches the captured JSON verbatim (13 subjects / 128 chapters), source + date on every row, re-run keeps user progress linked**, **0010: five-track checks + skipped status accepted** |
| `tests/integration` | Local repository behaviour, per-user isolation, history-safe deletes, curriculum reseeds leaving progress intact, **setup/lectures/targets repository methods**, **v1 → next-update storage upgrade (no data loss, write-after-upgrade safe)**, **sync engine (13 tests: outbox coalescing, offline queue survival, server-wins conflicts, post-push version adoption, silent pure reads, tombstones, curriculum keep-seed, retry after error)** |
| `tests/ui` | jsdom rendering of shared components and pages, single `<h1>` per route |
| `tests/bundle` | No service-role key or AI provider key in the built assets (ran: dist present) |
| `tests/functions`, `tests/android` | Weekly-summary function with a stubbed provider (no live call), Capacitor config assertions |

### Android CI build (executed)

`.github/workflows/android.yml` ran on commit `03a10af` and **passed**
([run 42281176999](https://github.com/mkj369/MKJ_STUDY_OS/actions/runs/42281176999)):
Temurin 21 + SDK 35 → `npm ci` → `android:sync` → `assembleDebug assembleRelease` →
aapt/apksigner verification. Results (also a commit comment on `03a10af`):
`app-debug.apk` 4,809,172 B, sha256 `8022787c4154d4aa723f04751b0dae92f126b3c1855cc5d35421485e27f54a8a`,
signature VERIFIED; `app-release-unsigned.apk` 3,733,960 B, sha256
`0f7f13dd1ff4623c54d41fad06aac0325c9a1cb7393db585a2d23684f9e2a36f`, UNSIGNED.
Both `com.mkjstudyos.app`, versionCode 2, versionName 2.0.0. The artifact zip lives on
the run page (the sandbox's artifact-storage host is blocked, so it was not downloaded
here). No device install was performed.

### Browser suite (54)

`npx playwright test` runs against `npm run build && npm run preview --port 4173`
(baseURL `http://127.0.0.1:4173`), one worker, real localStorage. Covers:

- smoke boot in local demo mode; mobile shell scrolls, drawer opens, no sideways overflow;
- journeys A/B (syllabus → checklist tick survives reload), C (curriculum filters),
  C2 (subject card → subject detail → chapter; tick survives reseed), D (tasks),
  E (mistake → practice link), G/I (insights bands; export downloads real rows);
- phase-2 flows: time block on the timeline, practice question attempted and graded,
  **focus v2 start/pause/resume/finish + reload persistence + countdown arm/discard**;
- **next-update flows (12)**: fresh-workspace setup gate end-to-end (HSC Science now
  resolves the imported 128-chapter reference syllabus; picking Physics 1st Paper
  brings its 10 chapters), compact chapter rows expand/tick/persist, per-chapter
  lecture add + checklist + notes + completion persist, chapter notes persist,
  weekly + monthly targets create/edit/reload, community private-by-default +
  local-mode notice + contact-info rejection, theme switch persists,
  **Class 1–5 school setup (honest manual subjects, class persists in Settings),
  HSC Admission setup (same HSC rows + admission target persisted), skipped chapter
  (label persists, subject denominator excludes it), study-activity card renders**;
- accessibility: named controls and landmarks on every route (incl. `/setup`,
  `/targets`, `/community`, `/syllabus/topics`), exactly one `<h1>`, inline SVG icons.

Chromium comes from `scripts/playwright-browser.mjs`: the `@sparticuz/chromium`
devDependency (an npm-hosted Linux binary, so no Playwright-CDN download is needed)
plus its bundled NSS/NSPR libs extracted to `/tmp`. On Windows/macOS, install the
packaged browser (`npx playwright install chromium`) and drop the shim's
`executablePath`/`env` from `playwright.config.ts`.

---

## 2. Blocked in this environment — with the exact command to unblock

Nothing below was faked or claimed as passing.

### 2.1 Hosted Supabase (auth, cloud repository, live sync, community)

No project, no credentials. `.env.local` is absent and must stay out of Git.
The **sync engine itself is integration-tested** (13 tests against a fake remote
that models `updated_at` touch triggers and failures); the Supabase adapter and
GoTrue flows have **never run against a live project**.

```bash
# once a project exists:
supabase link --project-ref YOUR_PROJECT_REF
supabase db push                     # applies 0001..0008
npm run verify:cloud                 # scripts/verify-cloud.mjs checks connection + RLS
npm run dev                          # app switches to the sign-in screen
```

Then spot-check with two accounts: register/login/reset, edit offline → reconnect →
badge drains the queue, edit the same row on two devices → conflict surfaced (newer
server row wins), community opt-in visible to the other account only after enabling.

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

### 2.3 Android APK + device behaviour

No JDK, no Android SDK; gradle/google/maven hosts are unreachable from here.
`npm run android:preflight` reports exactly what is missing (it exits non-zero).
`npx cap sync android` succeeded: web assets + both plugins are in `android/`.

```bash
npm run android:preflight   # says exactly which of java/sdk is absent
npm run android:sync        # build + cap sync
npm run android:open        # build in Android Studio, or:
cd android && ./gradlew assembleDebug
```

The project (`android/`, minSdk 23, target 35, `com.mkjstudyos.app`) is generated and
config-tested; the manifest adds `adjustResize`, `SCHEDULE_EXACT_ALARM` and the
plugin-merged notification permissions. The APK has **not** been built, installed or
run — back-button order, keyboard resize, notification delivery and lock-screen timer
restore need the device checklist in [ANDROID_APK.md](ANDROID_APK.md).

### 2.4 nctb.gov.bd

The site is a JS-rendered Payload CMS; chapter lists live in PDFs that could not be
read here. Consequence, recorded in [CURRICULUM.md](CURRICULUM.md): subject names and
group structure are seeded and sourced; **chapter titles are not**, because they must
be transcribed by a human from the official textbook, not inferred.

---

## 3. How to read the status labels

| Label | Means |
| --- | --- |
| **Written** | Code exists but was not executed here |
| **Unit-tested** | Deterministic tests, `npx vitest run` |
| **Integration-tested** | Repository/auth/sync in Node with in-memory storage and a fake remote |
| **DB-tested** | Migrations applied and RLS asserted in PGlite (Postgres 18/WASM) |
| **Browser-tested** | Playwright on the production bundle: real UI, real storage, real downloads |
| **Cloud-verified** | Against a hosted Supabase project — **not done** |
| **Device-verified** | On Android hardware/emulator — **not done** |

PGlite is real Postgres compiled to WASM, so the DDL, constraints and policies are
genuinely executed — but Supabase-specific services (PostgREST, GoTrue, Storage) are
not, and that gap is why live cloud mode stays labelled **Written**.

---

## 4. Re-running this log

```bash
npm ci && npm run build && npm run typecheck && npm run lint && npx vitest run && npx playwright test
```

Update the date at the top, and do not upgrade a row in README §1 without a command
above that actually produced the claimed result.
