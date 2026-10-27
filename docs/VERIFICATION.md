# Verification record

What has actually been executed in this repository, on what, and what is still
outstanding. Nothing here is marked verified because code exists; each row names the
command that produced it.

Last updated: 2026-10-27, branch `arena/78adb9f2-mkj-study-os`.

Verification tiers used below:

| Tier | Meaning |
| --- | --- |
| **Local demo** | The real app in a browser, local storage, no server |
| **Compatible DB** | Real migration SQL executed in PGlite (PostgreSQL 18/WASM) |
| **Hosted** | A real Supabase project (PostgREST, GoTrue, Edge Functions) |
| **Device** | Installed on Android hardware/emulator |

---

## 1. Results matrix

| Verification area | Exact command or procedure | Actual result | Evidence / artifact | Status |
| --- | --- | --- | --- | --- |
| Type check | `npm run typecheck` | No errors | `tsc -b` output | **PASS** |
| Lint | `npm run lint` | No errors, no warnings | `eslint .` output | **PASS** |
| Unit + integration + DB + UI tests | `npm test` (`vitest run`) | 33 files, 386 tests passed | `tests/**` | **PASS** |
| Production build | `npm run build` | Built in ~5.5 s; 27 route chunks + 4 vendor chunks | `dist/` | **PASS** |
| Browser E2E (local demo) | `npx playwright test` | 37 passed in Chromium against `vite preview` of the production build (50.2 s) | `tests/e2e/*.spec.ts` | **PASS** |
| Accessibility sweep (local demo) | `npx playwright test tests/e2e/a11y.spec.ts` | 25 routes: one `main`, one `h1`, named controls, labelled inputs, icons render inline | `tests/e2e/a11y.spec.ts` | **PASS** |
| PostgreSQL migrations | `npx vitest run tests/db` → PGlite applies `0001`–`0005` | All five migrations apply in order | `tests/db/schema.test.ts` | **PASS** (compatible DB) |
| Migration re-apply safety | `npx vitest run tests/db/idempotency.test.ts` | `0001`–`0005` applied **twice** to one PGlite database; no error, table count unchanged, `0005` column present | `tests/db/idempotency.test.ts` | **PASS** (compatible DB) |
| Client bundle secret scan | `npx vitest run tests/bundle/secrets.test.ts` (after `npm run build`) | `dist/` contains no `service_role`, no `x-goog-api-key`, no `AIza…`/`sk-…`/`sk-ant-…` key, no service-role JWT, no `Deno.env` | same | **PASS** |
| Cloud permission-failure messages | `npx vitest run tests/integration/cloudErrorMapping.test.ts` | RLS rejection → `forbidden`, FK → `foreign_key`, duplicate → `duplicate`; no SQL text reaches the UI | same | **PASS** (stubbed client) |
| Loading / error / retry states | `npx vitest run tests/ui/workspaceStates.test.tsx` | Gate shows loading, then the real error message with Retry; retry refetches and recovers on attempt 3 | same | **PASS** |
| RLS / account isolation | Same suite: two `auth.users`, `set role authenticated`, forged `user_id`, cross-user reads/writes | 32 assertions pass, including composite FKs and `on delete set null` | `tests/db/schema.test.ts` | **PASS** (compatible DB) |
| Schema ↔ TypeScript drift | `npx vitest run tests/db/tableSync.test.ts` | Every migrated table has a type and vice versa | same | **PASS** |
| Local repository isolation | `npx vitest run tests/integration` | Separate workspaces cannot read or delete each other's rows | `localRepository.test.ts`, `deleteAll.test.ts` | **PASS** |
| Session persistence | `smoke.spec.ts` reload assertion + `localAuth.test.ts` | Workspace survives reload; legacy and corrupt sessions handled | same | **PASS** |
| Mistake → practice question link | Migration `0005` + `mistakePracticeLink.test.ts` + browser journey E | Link stored, foreign question rejected, delete clears link, mistake kept; the link is a **working deep link** that opens that question's attempt form and saves an attempt | same | **PASS** (compatible DB + local demo) |
| AI adapter logic | `npx vitest run tests/integration/aiFunction.test.ts` | 16 tests: request construction, key confined to header, schema rejection, invented-number rejection, 401/5xx/timeout mapping, retry policy | same | **PASS** (no live provider) |
| Real AI provider request | `node scripts/verify-cloud.mjs --ai` on a configured project | **Not executed** — no provider key, and `generativelanguage.googleapis.com` / `api.openai.com` are unreachable from this sandbox | — | **BLOCKED** |
| Hosted Supabase integration | `node scripts/verify-cloud.mjs --apply-migrations` | **Not executed** — no project, no CLI, `supabase.com` unreachable | `scripts/verify-cloud.mjs` | **BLOCKED** |
| Hosted RLS run | `psql "$DB_URL" -f supabase/tests/rls.test.sql` | **Not executed** — no `psql`, no database | `supabase/tests/rls.test.sql` | **BLOCKED** |
| Android project configuration | `npx cap add android`, `npx cap sync android`, `npx vitest run tests/android` | Project generated, plugin synced, 8 config assertions pass | `android/`, `tests/android/config.test.ts` | **PASS** (config only) |
| Android debug APK | `npm run android:build` (`./gradlew assembleDebug`) | **Not executed** — no JDK, no Android SDK, `dl.google.com` unreachable | — | **BLOCKED** |
| Device / emulator test | Install APK, exercise auth, navigation, persistence, reminders | **Not executed** — no device, no emulator, no APK | — | **BLOCKED** |
| Curriculum accuracy | Inspection of `0002_demo_curriculum.sql`, `0004_demo_topics.sql`, `/syllabus` notice | Demo only, `needs_verification`, no NCTB content invented | migrations | **PASS** (honest placeholder) |

---

## 2. What each blocked item needs

### 2.1 Hosted Supabase

```bash
# once, on a machine with the Supabase CLI
supabase login
supabase link --project-ref YOUR_TEST_PROJECT_REF
supabase db push                       # 0001 → 0005, in order

# RLS at the SQL level (the same script the repo ships for local Supabase)
psql "$SUPABASE_DB_URL" -f supabase/tests/rls.test.sql

# Full application-level check: users, RLS, composite FKs, function endpoints
export SUPABASE_URL="https://YOUR_TEST_PROJECT.supabase.co"
export SUPABASE_ANON_KEY="..."           # dashboard → Settings → API
export SUPABASE_SERVICE_ROLE_KEY="..."   # server-side only; used to create/delete test users
node scripts/verify-cloud.mjs --dry-run  # prints the plan, writes nothing
node scripts/verify-cloud.mjs            # live: creates 2 users, asserts isolation, deletes them
```

`verify-cloud.mjs` refuses URLs containing `prod`, never prints a key, and deletes both
throwaway users in a `finally` block. Its guard paths (missing env, malformed URL,
production URL, dry run) were executed here and behave as documented; the live path has
never run.

Then verify the app in cloud mode:

```bash
# .env.local
VITE_SUPABASE_URL=https://YOUR_TEST_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
npm run dev
# sign in with two different accounts and confirm each sees only its own data
```

### 2.2 Real AI provider request

```bash
supabase secrets set AI_PROVIDER=gemini          # or openai
supabase secrets set AI_API_KEY=YOUR_KEY         # never in a VITE_* variable
supabase secrets set AI_MODEL=gemini-2.0-flash
supabase secrets set AI_TIMEOUT_MS=20000
supabase secrets set AI_MAX_REQUESTS_PER_HOUR=20
supabase functions deploy weekly-summary
supabase functions deploy delete-account

# status endpoint (no cost)
node scripts/verify-cloud.mjs

# one real generation, schema-checked by the server
node scripts/verify-cloud.mjs --ai
```

A successful run prints `provider=… model=…` and asserts that `generated_at`,
`provider` and `model` were stamped server-side. If the provider returns prose with a
number that is not in the week's facts, the function must answer
`{ ok: false, code: 'invalid_response' }` — that path is unit-tested, not yet observed
against a live model.

### 2.3 Android APK and device test

The native project is now committed (`android/`), so no `cap add` is needed.

```bash
# prerequisites: JDK 17+, Android Studio + SDK 35, ANDROID_HOME set
npm run android:sync        # build web assets + copy into android/
npm run android:build       # → android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# or open the project
npm run android:open
```

On the device, check in this order:

1. first launch → “Start local workspace” → dashboard renders (icons visible);
2. sign in with cloud credentials (if `VITE_SUPABASE_*` was set before `android:sync`);
3. create a subject + log a session, kill the app, relaunch → data persists;
4. Settings → notifications permitted; schedule a reminder a few minutes ahead;
5. confirm the notification arrives with the `ic_stat_studyos` status icon;
6. lock the device, wait, confirm the reminder still fires (inexact alarm on Android 12+,
   see §3.3);
7. clear notifications, reboot, confirm scheduled reminders are restored by the plugin's
   boot receiver.

Nothing above has been observed; the repository only proves the project *builds into*
`android/` with a consistent manifest.

---

## 3. Honest limitations found while verifying

1. **Reminder timing may drift.** `@capacitor/local-notifications` calls
   `canScheduleExactAlarms()` and falls back to an inexact alarm when the app may not
   schedule exact ones (Android 12+). The app does not declare `SCHEDULE_EXACT_ALARM`, so
   reminders can land a few minutes late. Acceptable for study reminders, unverified on a
   device.
2. **The notification icon was missing.** The template referenced
   `ic_stat_icon_config_sample`, which does not exist in `res/drawable`; the plugin would
   silently fall back to the launcher icon. Added `ic_stat_studyos.xml` and a test that
   fails if the reference and the file drift apart.
3. **Android test stubs asserted the wrong package.** The generated
   `ExampleUnitTest`/`ExampleInstrumentedTest` used the Capacitor placeholder package, so
   `./gradlew test` would have failed on a renamed app. Fixed and asserted.
4. **Cloud paths are written, never executed.** `SupabaseRepository`,
   `removeDemoData`, `deleteAllUserData` and both Edge Functions are covered by unit tests
   and review only.
5. **Local mode is single-workspace.** Multi-user isolation is a database property; it is
   proven in PGlite, not in the browser.

### 3.1 Defects found and fixed during this pass

The audit was not a read-through; these were reproduced with failing checks first.

| # | Defect | How it was found | Fix | Regression guard |
| --- | --- | --- | --- | --- |
| 1 | `0001` and `0003` were **not** re-appliable despite the README promising they were: `create trigger` and `create policy` were unguarded (21 triggers, 58 policies, 44 of them generated in a `do $$` loop) | New test applied every migration twice to one database and failed on `trigger "profiles_touch_updated_at" already exists` | Added `drop trigger/policy if exists` before every `create` (plus drops inside the loop) | `tests/db/idempotency.test.ts` |
| 2 | The mistake book's "Practice question" was a plain link to `/practice`, so it could not take you to the linked question | Manual walkthrough of the mistake → practice workflow | `?question=<id>` deep link opens that question's attempt form once, then removes the parameter; a missing/archived question shows a warning instead of a dead dialog | browser journey E |
| 3 | Cloud permission failures had no test; an RLS rejection could have reached the UI as raw SQL text | Wrote the test first against a fake PostgREST client | Mapping was correct; behaviour is now pinned (`forbidden`, `foreign_key`, `duplicate`) | `tests/integration/cloudErrorMapping.test.ts` |
| 4 | Nothing checked that server-only secrets stay out of the shipped bundle | Wrote a scan of `dist/` | No leak found; the scan is now permanent | `tests/bundle/secrets.test.ts` |

Migration files were edited directly **because no environment ever applied them** (no
Supabase project has been created for this repository). The edits only add `if exists`
drops, which are non-breaking for an existing database. If `0001`–`0005` ever reach a real
project, treat them as immutable from that point and add corrective migrations.

---

## 4. Reproducing this table

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test          # builds + serves dist with vite preview
```

The browser suite needs no network: the packaged Chromium is resolved by
`scripts/playwright-browser.mjs`.
