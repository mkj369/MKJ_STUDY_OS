# Privacy policy — MKJ StudyOS

**Version 1.0.0 · last updated 2026-10-30 · contact: minhajkhanjihan.mkj@gmail.com**

The same text ships inside the app (Settings → Read the full privacy policy) so it
is readable offline. This file is the citable copy for the store listing.

## What the app collects

**You enter it, it stays on your phone:**

- study records — subjects, chapters, checklist ticks, lectures, study sessions,
  focus sessions, revision dates, difficult topics, mistakes, tasks, exams,
  notes, resources and reminders;
- your profile — display name, class, group (Classes 9–12 only), language, time
  zone, study availability, appearance settings.

**If — and only if — the build is configured with a Supabase project and you
create an account:** an email address and a password handled by Supabase Auth.
The password is hashed by the provider; MKJ StudyOS never sees it. In a build
without cloud configuration, no email or password exists at all.

**Never collected:** location, contacts, photos, camera, microphone, advertising
identifiers, crash analytics, or usage telemetry. There is no advertising or
tracking SDK in the APK.

## Where the data lives

- **Device workspace (default).** Everything is written to the app's private
  storage on the phone: a versioned local database, mirrored to IndexedDB for
  durability. Android auto-backup is disabled (`android:allowBackup="false"`), so
  the system does not upload it to the user's Google account.
- **Cloud account (optional).** Records you create while signed in are stored in
  the project's Postgres database and protected by row-level security, so one
  account cannot read another's rows.
- **Backups.** None are automatic. “Export all data” writes a JSON file to a
  location you choose.

## How long data is kept

- On the device: until you delete the records, clear the app's storage or
  uninstall the app.
- In a cloud project: until you delete the account (Settings → Delete my
  account, which removes the auth account and its rows) or the project owner
  deletes the data.

## Your choices

| Action | Where |
| --- | --- |
| Export a complete copy | Settings → Export all data, or `/export` |
| Delete every study record on the device | Settings → Delete all my records |
| Delete a cloud account | Settings → Delete my account (cloud builds only) |
| Change the class or the appearance | Settings |
| Stop using the app | Uninstall it; this removes its private storage |

## Deleting your account

Deleting a cloud account is **not** the same as erasing your phone.

- **Cloud account (cloud builds).** Settings → Delete my account removes the
  authentication account and every row that belongs to it on the server. This
  cannot be undone, and the account cannot be restored.
- **Device workspace.** Records on the phone are deliberately **kept** when you
  sign out: they are your work, and signing out is not a request to destroy them.
  The app remembers which workspace this device owns, so signing back in reopens
  the same subjects, chapters, tasks, notes, sessions and theme — the sign-out
  dialog states this before you confirm. To erase them, use Settings → Delete
  all my records, clear the app's storage in Android settings, or uninstall the
  app.
- A cloud account and a device workspace are separate stores in v1.0.0. Nothing
  is uploaded silently and nothing is merged automatically.

## Children

The app is used by school and college students, including minors. It asks only
for a display name and class. There is no public profile, no leaderboard, no
social feed and no messaging, and nothing you record is visible to another
student.

## No third parties

No analytics provider, no advertising network, no crash-reporting service and no
third-party tracker is bundled. The only network calls a configured build can
make are to the project's own Supabase instance (authentication and, if enabled,
AI requests you explicitly trigger).

## Changes

This policy is versioned with the app. Material changes will be described in the
release notes and the version number above will change.

## Contact

minhajkhanjihan.mkj@gmail.com
