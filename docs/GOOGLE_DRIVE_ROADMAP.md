# Google Drive backup — status and implementation plan

## Status in v1.0.0

**Not implemented. No Drive button, permission or API call exists in the app.**

The only backup today is the manual JSON export (Settings → Export all data).
There is no automatic transfer between devices, and the app does not ask for any
Google scope beyond what sign-in needs.

## What the app already gives a future integration

- `UserDataBundle` (`src/services/repository.ts`) is a complete, serialisable
  snapshot of every table for one user — the same object the JSON export uses.
- Import/export already round-trips through `src/services/local/localRepository.ts`
  and `src/features/export/ExportPage.tsx`.
- The Android app is a Capacitor WebView, so a future release can use either a
  native Drive plugin or the REST API with an OAuth token.

## Shape of the feature (when it is built)

1. **User-initiated only.** Settings → “Back up to Google Drive” and “Restore”.
   No background upload, no implicit sync.
2. **Scope:** `https://www.googleapis.com/auth/drive.file` — the narrowest scope
   that can create a file the app owns. Never `drive` or `drive.readonly`.
3. **Format:** the same versioned JSON as the export, encrypted at rest is a
   design decision to make before shipping (it would need a user passphrase,
   because a key stored next to the file protects nothing).
4. **Restore is additive and explicit:** show what the file contains, require
   confirmation, and never overwrite newer local rows silently.
5. **Failure is honest:** if the token is missing or the upload fails, say so and
   keep the local data untouched.

## What must be true before it ships

- A real OAuth client (Android or web) with the Drive API enabled, and the
  consent screen configured — see `docs/BACKEND_SETUP.md` for the pattern.
- A tested conflict story for restoring onto a device that already has records.
- A privacy-policy update that names Google Drive and the scope used.
- A release note that says plainly whether the backup is encrypted.

Until all of that exists, the app keeps saying “no automatic backup” rather than
showing a button that cannot work.
