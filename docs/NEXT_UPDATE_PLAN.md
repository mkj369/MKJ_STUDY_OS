# MKJ StudyOS — Next Update: Audit & Implementation Plan

Date: 2026-11-06 · Branch: `arena/31b61c32-mkj-study-os`

> **Status: executed.** All 13 steps below were implemented and tested; the final
> per-phase report (with honesty labels and exact external-configuration steps) is
> [NEXT_UPDATE_REPORT.md](NEXT_UPDATE_REPORT.md). Final totals: typecheck/lint/build
> clean · **503 unit/integration/DB tests** · **50 browser e2e tests** · `cap sync`
> clean · APK build blocked only by the missing JDK/SDK (preflight reports it).

## Audit findings (before any change)

**Architecture.** React 18 + TypeScript + Vite 6, Ionic React 8, React Router 6
(HashRouter), TanStack Query 5, react-hook-form + Zod, Capacitor 7. Two
repository implementations behind one `Repository` interface: `LocalRepository`
(browser storage, offline) and `SupabaseRepository` (cloud, RLS). Auth:
`LocalAuthClient` + `SupabaseAuthClient`. 28 lazy routes. Domain logic is pure
and unit-tested. Baseline at audit time: **431 tests passing, typecheck clean**.

**Working features (kept):** dashboard, subjects/chapters, 12-item chapter
checklist with progress derivation, lecture log, study sessions, time tracker,
tasks/planner, revisions, mistakes, practice, exams, notes/vault, reports,
reminders, insights, export, settings, demo seeding/removal, RLS-tested schema
(migrations 0001–0007), secret-free client bundle.

**Bugs / gaps found:**

| # | Finding | Fix phase |
| --- | --- | --- |
| 1 | Login page cannot scroll on small screens: `ion-app` is fixed/overflow-hidden and `.auth-shell` has no scroll container | 1 |
| 2 | Password-reset e-mail links to `/reset-password`, a route that does not exist (and without the hash the HashRouter never sees it) | 9 |
| 3 | No Android back-button handling; `@capacitor/app` not installed → Back exits the app | 7 |
| 4 | Focus timer state lives in component state only → lost on navigation/restart; no open-ended mode | 6 |
| 5 | No academic setup; no SSC/HSC/HSC-Admission track model; syllabus tracking starts without setup | 3 |
| 6 | Syllabus UI is a topic matrix, not dashboard → subject → compact chapter rows → chapter detail | 3 |
| 7 | Lectures: no per-lecture checklist, no add/rename from the chapter page | 4 |
| 8 | No weekly/monthly target system | 5 |
| 9 | No offline-first sync for cloud mode (direct writes fail offline; no queue, no conflict handling) | 9 |
| 10 | No community/privacy features; no manual theme toggle; plain spinner loading | 2/8/10/11 |
| 11 | Curriculum: official **subject structure** seeded (70 subjects, `needs_verification`); chapter lists deliberately absent — never invent them | 3 |
| 12 | APK release: Android project + preflight exist; APK never built here (no JDK/SDK in sandbox) | 13 |

## Design decisions

* **Tracks.** `academic_track ∈ {ssc, hsc, hsc_admission}` on the profile.
  `curriculumLevelForTrack()` maps `hsc_admission → HSC`, so Admission reuses the
  exact same `curriculum_versions/subjects/chapters` rows — zero duplication.
* **Setup gate.** The syllabus tracker requires `setup_completed_at`; other
  features keep working (existing users never lose access). The wizard
  pre-selects already-adopted subjects and never deletes anything.
* **Lecture checklist.** One user-owned table `lecture_checklist_items`
  (label, sort_order, is_done, completed_at) — items are per-lecture and
  user-owned, so no separate progress table is needed. Configurable defaults.
* **Targets.** `study_targets` with `period_type weekly|monthly`, optional
  subject/chapter scope, metric `chapters|checklist_items|lectures|minutes`.
  Progress is always computed from real records, never stored as a percentage.
* **Focus.** New timestamp-based engine (`open` and `countdown` modes) persisted
  to device storage per user; elapsed time is always recomputed from
  timestamps, so backgrounding/locking/restarting never loses time. Sessions
  still write `study_sessions` + `focus_sessions` (history unchanged).
* **Sync.** Cloud mode becomes offline-first: reads/writes hit a local cache
  immediately; a write-behind outbox pushes to Supabase with stale-write
  detection (`updated_at` compare, server-wins on conflict), idempotent upserts
  by client UUID, and pull reconciliation. Local demo mode is unchanged.
* **Community.** Opt-in `community_profiles` snapshot (pseudonym, track, group,
  overall %, weekly minutes). Default private; RLS allows reading only rows
  with `sharing_enabled = true`; no contact data ever leaves the device.
* **Honesty rules kept.** No invented chapter names; placeholder data stays
  labelled; cloud features are only called "verified" when actually run against
  a hosted project (not possible from this sandbox — documented per item).

## Execution order (each step: implement → test → review) — all done

1. ✅ Audit + login scroll fix + reset-password route fix
2. ✅ Design system refresh, 5-item bottom nav, theme toggle, branded loading
3. ✅ Academic setup wizard + track mapping + syllabus dashboard + subject detail
4. ✅ Chapter detail: editable checklist labels, chapter notes, lecture management
5. ✅ Weekly/monthly targets (+ dashboard summaries)
6. ✅ Focus redesign (open-ended + countdown, persisted, lifecycle-safe)
7. ✅ Android back button + `@capacitor/app` lifecycle (device run still external)
8. ✅ Branded animated loading + skeletons (with reduced-motion support)
9. ✅ Supabase: migration 0008 (setup fields, targets, lecture checklist,
   community), RLS tests, Google OAuth button, reset-password flow (live cloud external)
10. ✅ Offline-first sync engine + sync status UI (live two-device run external)
11. ✅ Community page + privacy controls
12. ✅ Profile/settings polish, migration-safety tests (v1 data upgrade)
13. ✅ Full QA: unit + integration + DB(RLS) + e2e + build + Android preflight

## External configuration still required (cannot be done from the sandbox)

* Hosted Supabase project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `supabase db push`, e-mail auth settings, Google provider credentials.
* JDK 17 + Android SDK 35 to build the APK (`npm run android:preflight` lists
  exactly what is missing); a real device for lifecycle/back-button testing.
