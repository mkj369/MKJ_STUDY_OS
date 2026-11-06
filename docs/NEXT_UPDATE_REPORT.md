# MKJ StudyOS — Next Update: Final Report

Date: **2026-11-07** · Branch: `arena/31b61c32-mkj-study-os` · Plan of record: [NEXT_UPDATE_PLAN.md](NEXT_UPDATE_PLAN.md)

Status labels (same meaning as README §1):

| Label | Means |
| --- | --- |
| **Implemented** | Code exists and typechecks; behaviour described honestly below |
| **Tested** | Executed here: unit / integration / DB (PGlite) / browser (Playwright, production bundle) |
| **Requires external configuration** | Cannot be proven from this sandbox; exact unblock steps listed |
| **Not implemented** | Deliberately absent; never claimed |

## Verification totals (all executed on the final code)

```
npm run typecheck   → clean
npm run lint        → clean (0 errors, 0 warnings)
npm run build       → clean (only the known Ionic-vendor size warning)
npm test            → 46 files, 517 passed, 0 failed
                      (dist/ present ⇒ the 4 bundle-secret assertions ran too)
npm run test:db     → 58 passed: migrations 0001–0010 applied twice, RLS,
                      community privacy, targets FKs, lecture checklist,
                      imported-syllabus parity + progress-safe re-import
npm run test:e2e    → 54 passed (Chromium, production preview build)
npx cap sync android→ 2 plugins (@capacitor/app 7.1.2, local-notifications 7.0.7)
npm run android:preflight → JDK 21 missing, Android SDK missing (reported, not faked)
```

Baseline before this update: 431 passed | 4 skipped. No working feature was removed;
all baseline behaviours still pass (counts updated only where the new curriculum
version or JDK requirement legitimately changed them).

---

## Requirement re-review — **Done**

Every earlier requirement was re-checked against the real screens, schema and
interactions, not the old report. Gaps found and fixed in this pass:

- Academic system had only 3 tracks → now **5 sections** (below).
- HSC Science had **no chapters** → the complete accessible reference dataset is now
  imported (below), with provenance and a repeatable pipeline.
- No `Skipped` chapter status → implemented end-to-end (UI, domain, Zod, SQL, tests).
- Syllabus dashboard lacked activity history → **Study activity** card added.
- Chapter page lacked time analytics → **Time spent** from linked sessions added.
- Android `versionName` was "2.0" → **2.0.0**; signing wiring + CI build added.
- Preflight/docs claimed JDK 17 → corrected to **JDK 21** (Capacitor 7 compiles with
  Java 21; verified from `@capacitor/android`'s own build.gradle).

## Academic system — **Tested (unit + DB + browser)**

- Five sections: **Class 1–5** (classes 1..5), **Class 6–8** (6, 7, 8), **SSC**
  (group/board/exam batch), **HSC** (Science / Humanities / Business Studies,
  paper-split subjects, batch), **HSC Admission** (personal admission target;
  **reuses the exact HSC curriculum rows — no duplicate syllabus**, unit-tested).
- School classes get a class picker and an honest "add your own subjects" path —
  no curriculum is invented for them; a verified one can be seeded later without
  touching student progress.
- `profiles.class_level` / `profiles.admission_target` added (migration `0010`,
  idempotent, DB-tested); both track CHECK constraints now accept the five values;
  legacy v1 levels map without guessing (`trackFromLegacyLevel`, unit-tested).
- Setup is editable later; changing section/class/group deletes nothing
  (integration-tested). Settings shows Section / Class / Admission target.

## Reference syllabus import — **Imported + parity-tested; scope stated honestly**

- Source: `https://hscstudytracker.lovable.app/` — the **only** permitted reference.
  The complete public dataset was captured from its bundled store
  (`/assets/store-tnJ8g9ek.js`) on **2026-11-07**: **13 paper-split subjects,
  128 chapters**, names/order/papers preserved verbatim (Bangla titles included).
- **What the source does NOT contain** (so was not imported, and nothing was
  invented): topics, SSC, other HSC groups, school classes, exam batches.
  This is a **complete import of everything publicly accessible**, not a claim
  that the site had more.
- Provenance (`source_url`, `source_checked_at`, authority, `needs_verification`)
  on the version and every row; snapshot in
  `src/services/seed/data/referenceSyllabus.json`; generator
  `scripts/generate-reference-syllabus.mjs` → TypeScript seed + SQL `0009`.
- Repeatable + safe: stable chapter ids; re-running updates in place. DB suite
  proves SQL == TypeScript == captured JSON field-for-field, and that a re-import
  with linked user progress duplicates nothing and orphans nothing.
- Picking a subject in setup auto-adopts its chapters (e2e: Physics 1st Paper → 10
  chapters; Admission → same rows). No source code, branding or user data copied.

## Syllabus tracker — **Tested (browser + unit)**

- Dashboard: overall % + completed / in progress / not started / **skipped** /
  remaining, per-subject compact cards, **Study activity** (today + this-week
  minutes, 7-day bars, recent sessions, full-history link) — all from recorded
  `study_sessions`, never estimated. Daily/weekly progress and session history
  pages unchanged and working.
- Chapter detail: 12 configurable checklist items (editable labels), notes,
  per-chapter lectures, %, derived + declared status, **Time spent** (sum of
  linked sessions), revision status.
- Statuses: Not Started / In Progress / Completed / **Skipped**. Skipped never
  lowers any completion % (dashboard, subject cards, subject header, avg
  checklist, community snapshot), raises no attention alerts, keeps every record,
  and un-skips cleanly. Unit + e2e tested; rule written into
  [PROGRESS_RULES.md](PROGRESS_RULES.md).

## Lectures — **Tested (browser + integration)**

- Add / rename / complete / notes / per-lecture configurable checklists; estimated
  lecture counts are **per chapter and editable** (never hardcoded identical);
  progress derives from stored rows; everything persists across reload.

## Targets — **Tested (browser + unit)**

- Independent weekly + monthly goals; subject/chapter scope; chapters, checklist
  items, lectures or minutes; edit/delete; progress always computed from real
  records; overdue shown honestly.

## Focus v2 — **Tested (browser + unit); device delivery pending**

- Open-ended + preset/custom countdown; pause/resume; timestamp-based engine
  survives reload/lock/restart; completion notification via
  @capacitor/local-notifications (device delivery unverified — no device);
  optional subject + chapter; finishing writes a real `study_sessions` row, which
  feeds chapter **Time spent** and the activity card. History persisted.

## UI polish — **Tested (browser)**

- Dashboard-first shell, bottom nav (Home · Syllabus · Planner · Focus · More),
  drawer for the rest, light/dark/system with no flash, responsive down to small
  phones (no sideways overflow, e2e), accessible names + landmarks on every route
  (e2e sweep), branded loader/skeletons, first-launch onboarding via the setup gate.

## Android behaviour — **Implemented; device run pending**

- Back order: modal/alert → drawer → router history → exit confirm at root.
- `adjustResize`, notification/alarm permissions with web fallbacks, safe areas,
  branded splash config + skeletons. Physical-device checklist lives in
  [ANDROID_APK.md](ANDROID_APK.md) — **not executed** (no device in the sandbox).

## Supabase — **DB-tested; live cloud requires external configuration**

- Migrations `0001–0010` (incl. targets, lecture checklists, community, reference
  syllabus, class system) applied **twice** in PGlite; RLS/grants/FKs verified.
- Auth email/reset/session flows implemented; offline-first sync engine
  (write-behind outbox, coalescing, server-wins conflicts, tombstones, silent
  reads) integration-tested (13 tests). No credentials exist here, so **no live
  deploy and no two-account cloud test was performed — not claimed**. Exact
  unblock steps below.

## Community — **Tested (DB + browser)**

- Private by default; opt-in pseudonymous snapshot with explicit field selection
  (name, section, group, counted-chapter total, overall %, weekly minutes);
  contact info rejected; RLS reads only opted-in rows (two-user DB test); no DMs,
  no discovery, no public notes/email/phone.

## Profile / settings — **Tested (browser + integration)**

- Section, class, group, board, batch, admission target, theme, notifications,
  privacy shortcut, sync card, demo-data controls, version display (2.0.0).
  Academic edits preserve all progress.

## Migration safety — **Tested (integration + browser)**

- v1 → v2 local upgrade keeps every row (explicit regression test); fresh install
  goes through onboarding; export JSON/CSV works. **Restore: not implemented**
  (documented decision, unchanged).

## Android release — **CI configured; sandbox build blocked (exact reasons)**

- `applicationId com.mkjstudyos.app` unchanged; **versionCode 2, versionName
  "2.0.0"** → v1 installs upgrade in place.
- Signing: `android/app/build.gradle` reads an **existing** key from
  `android/keystore.properties` (git-ignored) or `MKJ_KEYSTORE_*` env vars.
  **No key exists in the repo, so none was generated**; without one, release is
  unsigned and debug is debug-signed. Exact signing steps:
  [ANDROID_APK.md §4.1](ANDROID_APK.md).
- **This sandbox cannot build the APK**: no JDK/SDK installed; every required host
  unreachable (probed: `services.gradle.org`, `downloads.gradle.org`,
  `dl.google.com`, `maven.google.com`, `repo.maven.apache.org`, `repo1.maven.org`,
  `plugins.gradle.org`, `api.adoptium.net`, `cdn.azul.com`,
  `objects.githubusercontent.com` → connection blocked; the only reachable JDK
  package, PyPI `jdk4py`, is a JRE without `javac`).
- Therefore `.github/workflows/android.yml` builds on GitHub's runners (Temurin 21,
  SDK 35): `npm ci` → `android:sync` → `assembleDebug assembleRelease` → verifies
  package id / versionCode / versionName / signature / size / SHA-256 (aapt +
  apksigner) → uploads `mkj-studyos-apks` artifact → posts the verification report
  as a commit comment. It triggers on pushes to `arena/**` and manual dispatch.
  Optional repository secrets sign the release with an existing key; signing
  material is deleted after the build. **Check the Actions tab for the run on this
  commit** — the APK, its size and SHA-256 are in the artifact and commit comment.
- **No physical device is attached, so no device QA was performed — not claimed.**

---

## Remaining work / external configuration (exact)

1. **APK signing key**: none exists in the repo. To ship signed upgrades, add the
   existing keystore via `android/keystore.properties` locally or the four
   `MKJ_KEYSTORE_*` repository secrets for CI (ANDROID_APK.md §4.1). Until then
   use the CI **debug APK** for personal installs.
2. **Supabase project**: set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`,
   `supabase db push` (0001–0010), enable email auth (+ Google if wanted), run
   `npm run verify:cloud`, then the two-account spot check incl. offline sync.
3. **Device QA**: install the CI APK and walk the checklist (back button,
   keyboard, notifications, lock/background timer, restart) in ANDROID_APK.md §6.
4. **Curriculum verification**: the 128 imported chapters are community-tracker
   data marked `needs_verification`; check them against NCTB textbooks. SSC /
   other HSC groups / school classes still need a verified source — nothing was
   invented for them.
5. **Not implemented (by decision)**: backup restore, community DMs/contact
   discovery/location (forbidden by the privacy requirements), any copied
   branding or code from the reference site.
