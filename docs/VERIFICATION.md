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
npm run build               # tsc -b && vite build    -> built in 5.49s
npx vitest run              # 42 files, 490 tests passed
npx playwright test         # 40 tests passed (Chromium, production bundle)
```

`npm run verify` runs typecheck → lint → build → `vitest run`. Build before tests
matters: `tests/bundle/secrets.test.ts` skips four assertions when `dist/` is absent,
because it greps the real bundle for leaked keys. Without a build you get
`486 passed | 4 skipped` — not a failure, but it has not checked the secrets.

### Test suite composition (490)

| Area | Files | What it proves |
| --- | --- | --- |
| `tests/domain` | 19 | Progress denominators, revision spacing, planner packing, reports, imports, curriculum filters/coverage, per-level/group coverage maths, official-import validation and idempotency planning, AI payload keys, and the shipped chapter rows (41, every one sourced, none `verified`) |
| `tests/db` | 6 | Migrations `0001`–`0012` apply in order **and twice** (idempotency), RLS isolates two users, official curriculum SQL matches its TypeScript twin **chapter for chapter**, a student chapter keeps its link through a reseed, the import guarantees hold (duplicate chapter numbers rejected, `verified` without a source rejected, progress preserved across two re-imports), and the real imports are asserted: 14 SSC Physics + 12 SSC Chemistry + 15 HSC Physics 2nd Paper chapters, numbering 1…n with no gaps, `partially_verified`, source named, `title_bn` null where the scan could not supply it, zero topics invented; the Accounting and Business Organisation scans are registered with their read state and still have zero chapters, and the third-party slide decks are registered as rejected rather than as textbooks |
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

Journey C now asserts the imported data end-to-end: filtering SSC/Science by `পদার্থ`
surfaces Physics with "Chapter list partly recorded", "14 chapter row(s)", and the page
reports 41 chapters of which 0 are verified.

Journey C3 asserts the HSC-first ordering and the paper split: the Level filter offers
`All levels, HSC, SSC` in that order, the group table starts with HSC and carries the
VERIFIED / PARTLY / NO CHAPTERS columns, and per-subject coverage shows
`Physics · 2nd Paper · 15` beside `Physics · 1st Paper · No chapter list yet`.

A separate scripted session (Chromium, local workspace, not part of CI) walked the new
coverage → syllabus path: add SSC Physics from the coverage table, land on Subjects &
Chapters with the 14 real titles (গতি, বল, তরঙ্গ ও শব্দ …), record a topic against
তরঙ্গ ও শব্দ through the existing dialog, reload, and find the topic and the chapter
link intact.

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

### 2.4 NCTB textbook PDFs

**Corrected 2026-10-28.** The earlier note here said the site was unreachable and that
only search-engine snippets exposed its content. That was wrong, and acting on it would
have blocked the curriculum work unnecessarily.

What is actually true:

- `nctb.gov.bd` is a client-rendered Payload CMS. Fetching `/pages/static-pages/<id>`
  or `/api/...` directly returns navigation boilerplate or an error page.
- Reading the same URL through a rendering proxy — `https://r.jina.ai/<url>` — returns
  the real page body. The 2025 SSC textbook list and both National Curriculum 2012 PDFs
  were read this way.
- Some pages still render nothing: the 2026 SSC list is a `পাতা` sub-page widget that
  never resolves, so it yields only navigation.
- The remaining hard blocker is the **textbook PDFs**, not the site. They are hosted on
  Google Drive and `drive.egovcloud.gov.bd`; Drive serves a virus-scan interstitial for
  files over ~100 MB, the egovcloud mirror returns HTTP 500 on `/download`, and this
  sandbox cannot reach either host (`curl` → `000`). `pdftotext` and `pypdf` are also
  absent here.

**Superseded 2026-10-28.** Scans of the printed books exist on the Internet Archive
with a Tesseract Bengali OCR text layer, and their সূচিপত্র pages are readable. Two were
imported (migration `0010`): SSC Physics, 14 chapters, and SSC Chemistry, 12 chapters,
both `partially_verified` from 2022 reprints of the 2017-revised books.

**Superseded again, same day.** One HSC contents page was recoverable — Physics 2nd
Paper, 15 chapters, English gloss only (migration `0011`). Six HSC archive.org items were
inspected in total: one readable, two legacy-font scans with no English gloss, three
empty or unreachable. The HSC ২০২৫-২৬ textbook list, which is the authority for the HSC
inventory and electives, renders as an unresolved পাতা widget over both a direct fetch
and a rendering proxy.

The remaining blocker is narrower than before but still real: 83 of 86 subjects have no
readable contents page here, no readable HSC Physics 1st Paper / Chemistry / Biology /
Higher Mathematics textbook exists on the Internet Archive, and nothing at all exists
for topic-level breakdowns. The scanned books are photographed editions, not the 2025
files, which is exactly why every import stops at `partially_verified`.

```bash
# what did work: read the OCR text layer of a scanned printed copy
curl -s 'https://archive.org/metadata/<item-id>' | jq -r '.files[].name'
curl -s 'https://archive.org/download/<item-id>/<exact-filename>_djvu.txt' | head -200

# to unblock the other 80 subjects, fetch any NCTB textbook PDF with normal
# internet access and read its সূচিপত্র page
curl -L -o physics-class-9-10.pdf 'https://drive.google.com/uc?export=download&id=<ID>'
pdftotext -f 1 -l 12 physics-class-9-10.pdf - | head -100
```

**Lesson recorded the hard way:** `_djvu.txt` only resolves with the exact
`files[].name` from the metadata endpoint. Guessing `physics-class-9-10-com-opt_djvu.txt`
404s; the real file is `Physics Class 9-10 Com Opt_djvu.txt`.

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
