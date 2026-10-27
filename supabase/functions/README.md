# Supabase Edge Functions

| Function | Purpose | Secrets used |
| --- | --- | --- |
| `weekly-summary` | Builds a bounded weekly context, calls the AI provider, validates strict JSON, stores the report, returns it. `{action:"status"}` reports whether AI is configured. | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_REQUESTS_PER_HOUR`, `ALLOW_ORIGIN` |
| `delete-account` | Permanently deletes the signed-in user's account (rows cascade). Requires `{ "confirm": "DELETE" }`. | `SUPABASE_SERVICE_ROLE_KEY` (auto), `ALLOW_ORIGIN` |

Both functions verify the caller's JWT with the anon client; the AI provider key
and service-role key never reach the browser or the Android bundle.

## Deploy

```bash
# once
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy weekly-summary
supabase functions deploy delete-account

# server-side secrets (never in .env.local / never VITE_*)
supabase secrets set AI_PROVIDER=gemini AI_API_KEY=YOUR_KEY AI_MODEL=gemini-2.0-flash
supabase secrets set AI_TIMEOUT_MS=20000 AI_MAX_REQUESTS_PER_HOUR=20
supabase secrets set ALLOW_ORIGIN=https://your-web-app.example
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
to functions by the Supabase runtime automatically.

## Local development

```bash
supabase start
supabase functions serve weekly-summary --env-file ./supabase/.env.local
supabase functions serve delete-account --env-file ./supabase/.env.local
```

`supabase/.env.local` is git-ignored; put only local test keys there.

## Behaviour and limits

- Rate limit: number of AI reports for the user in the last hour, capped by
  `AI_MAX_REQUESTS_PER_HOUR` (default 20). Returns HTTP 429.
- Timeout: `AI_TIMEOUT_MS` (default 20 000 ms) with one retry.
- Validation: the model must return the exact JSON shapes in
  `_shared/ai.ts`. Anything else returns 422 and is not stored.
- Anti-hallucination: numbers written by the model must already exist in the
  facts payload. Otherwise the response is rejected.
- Context minimisation: only the requested week's agreed fields are sent, with
  hard array caps. Notes bodies, passwords and tokens are never sent.
- Cost: each call sends a few KB of JSON and asks for ≤1 600 output tokens.
  Provider pricing changes; check your provider's current rates. Gemini free
  tiers and OpenAI free tiers are not guaranteed and may be withdrawn.
- AI is optional: with no `AI_API_KEY` the app continues to produce the
  deterministic report and every other workflow works.
