# Backend setup checklist (optional cloud accounts)

The APK works with no backend at all: a device workspace stores everything on the
phone. This page is only needed if you want email/Google sign-in and server-side
storage for a build you distribute.

Nothing here is configured in the sandbox that produced this repository. The
cloud code path has **never been executed against a live project** — it is
covered by unit tests and a type-checked client, not by a deployed run.

## 1. Create the project

1. <https://supabase.com> → New project (free tier is enough to start).
2. Copy **Project URL** and **anon public key** from Settings → API.

## 2. Apply the schema

The repository has 19 additive migrations in `supabase/migrations/`.

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push          # applies 0001 … 0019 in order
```

They are safe to re-run: the database tests apply the whole set twice on PGlite
before any release.

## 3. Turn on email auth

Authentication → Providers → **Email**: enable.

- For a private beta, “Confirm email” on is recommended.
- Authentication → URL Configuration → Site URL: `https://your.domain`
  (or `http://localhost:5173` while developing).
- Redirect URLs must include the URLs the app sends people back to:
  - `https://your.domain/#/reset-password`
  - `http://localhost:4173/#/reset-password` (only for local testing)

The app builds the reset link as `<origin>/#/reset-password`. If the URL is not
in the allow-list, Supabase reports `redirect_mismatch`, and the app turns that
into a sentence that names Authentication → URL Configuration.

## 4. Google sign-in (optional)

1. Google Cloud Console → OAuth consent screen (External) → create.
2. Create an OAuth client of type **Web application** with:
   - Authorised JavaScript origin: `https://YOUR_PROJECT_REF.supabase.co`
   - Authorised redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google: enable, paste client ID and
   secret.
4. Add the app URLs to Supabase → Authentication → URL Configuration as above.

Without step 3 the button is still shown, and pressing it produces the honest
message “Google sign-in is not enabled for this project yet” — never a silent
failure. In a build with no Supabase configuration the Google button is not
rendered at all.

## 5. Account deletion function

Settings → Delete my account calls the `delete-account` Edge Function, which must
be deployed:

```bash
supabase functions deploy delete-account
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   # server-side only
```

The service-role key never appears in the app bundle; `tests/bundle` scans the
built assets for it.

## 6. Build a cloud-enabled APK

```bash
cp .env.example .env.local
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run android:sync
npm run android:bundle:release
```

Both values are compiled into the APK. That is expected: the anon key is public
by design and row-level security is what protects the data. A **service-role**
key, database password or AI provider key must never be added to `.env.local`.

## 7. Verify

```bash
npm run verify:cloud        # connection + RLS smoke check, needs the env vars
```

Two accounts created in the dashboard, each with one row, is the quickest manual
check that RLS denies cross-account reads.

## What is still pending

- The Supabase repository has not been run against a hosted project here, so the
  PostgREST/GoTrue/Storage wiring is unproven outside the tests.
- Cloud sync of an existing **device** workspace is not implemented in v1.0.0.
  A cloud account starts empty on the server; export/import JSON is the manual
  bridge. Do not market multi-device sync until that is built and tested.
