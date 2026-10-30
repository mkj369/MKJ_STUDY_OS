# MKJ StudyOS — release notes

## v1.0.0 — first public release

Package `com.mkjstudyos.app` · versionCode `1` · versionName `1.0.0`

### What this release is

A study planner and curriculum tracker for Classes 1–12 in Bangladesh. It runs
entirely on the phone: subjects, chapters, ticks, study time, revisions, tasks,
notes and focus sessions are stored in the app's private storage. No account is
needed to use any of it.

### Curriculum

- Classes 1–12. A study group is asked only where one exists — optional for
  Classes 9–10, required for 11–12, never for 1–8.
- Classes 9–12 ship the official **subject structure** for Science, Humanities
  and Business Studies, including both papers for each HSC science subject
  (HSC Science lists all 13 papers).
- Classes 1–8 have no official subject list loaded. The library says so and
  offers common names as suggestions you can edit.
- Chapters: add one or many (auto-numbered), rename in English or Bengali,
  reorder, mark complete. Renaming keeps the same row, so checklist progress and
  history stay attached.
- Official chapter lists appear only where a source was recovered, and every
  list is labelled “partly verified” or “no chapter list yet”. Nothing is
  presented as complete when it is not.

### Study system

- Dashboard, planner, tasks, sessions, time tracker, Focus mode (25/45/60 or
  custom, pause excluded from the total), revision queue, difficult topics,
  mistakes, exams, notes and formula vault, practice questions, insights, weekly
  report and export.
- Every total is computed from the records you entered, scoped to your active
  class. Switching class never deletes or relabels anything.

### Appearance

- Sky Blue by default, plus Ocean Blue, Violet, Lavender, Emerald, Teal, Rose
  Pink, Sunset Orange, Amber and Graphite; light, dark or follow-the-system.
- Subject colours, Bengali titles with a bundled Noto Sans Bengali font, and a
  contrast audit (15 routes × 6 schemes) with no text below WCAG AA.

### Accounts

- **Device workspace (default):** no email, no password, no network.
- **Cloud account (optional):** email/password or Google, only in a build where
  Supabase is configured. Sign-up collects display name, email, password, class
  and group. Password reset by email works in that build; a device workspace has
  no password, and the reset screen says so.

### Privacy

- No analytics, adverts or trackers. No location, contacts, camera or microphone
  access. Only the `INTERNET` permission is declared, plus the notification
  permission the reminder feature needs.
- Android auto-backup is disabled so study records are not silently uploaded to
  the user's Google Drive.
- Full policy: `docs/PRIVACY.md` and Settings → Read the full privacy policy.

### Data and backups

- Local storage is a versioned document store with an IndexedDB mirror for
  durability, migrated automatically on app update.
- Manual export produces a complete JSON file. **Cloud sync and Google Drive
  backup are not implemented in this release.** Moving to a new phone means
  exporting and importing the JSON yourself.

### Signing out never hides your work

Signing out keeps every subject, chapter, task, note, session and preference on
the device, and reopening the workspace reconnects to that same data instead of
starting a blank one. The confirmation dialog says so before you sign out, and
the welcome screen offers **Continue on this device** rather than pretending to
be a first run.

### Offline behaviour

The app is local-first by construction: reads and writes go to the phone's
storage, and queries are configured to keep working when the device reports no
connection. A subject added in airplane mode appears immediately, survives a
restart, and is never queued behind a network call. (A regression test opens the
curriculum screen, cuts the network, adds a subject and reloads.)

### Known limitations

- Cloud sync is not implemented; a cloud account stores records on the server but
  does not merge with existing device data.
- Google Drive backup is planned, not built — see `docs/GOOGLE_DRIVE_ROADMAP.md`.
- Official chapter lists exist only for the papers listed in
  `docs/CURRICULUM_SOURCES.md`; the rest say so in the app.
- Reminders need the notification permission and fire on Android's schedule
  (inexact unless the user grants exact alarms).
- The APK for this release was **not** built in the development sandbox (no JDK,
  no Android SDK, no access to Google's Maven repository). Build steps and
  verification are in `docs/ANDROID_RELEASE.md`.
