#!/usr/bin/env node
/**
 * Hosted Supabase verification harness.
 *
 * The repository's database and RLS behaviour is exercised locally in PGlite
 * (`npm run test:db`), but that cannot prove a real Supabase project behaves the same
 * way — PostgREST, GoTrue, the JWT plumbing and the Edge Function runtime only exist
 * there. This script runs the missing verification against a **disposable test
 * project** and then deletes everything it created.
 *
 * Usage
 *   SUPABASE_URL=https://PROJECT.supabase.co \
 *   SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/verify-cloud.mjs --dry-run
 *
 *   # same env, no --dry-run, and optionally:
 *   node scripts/verify-cloud.mjs --apply-migrations --ai
 *
 * Flags
 *   --dry-run            validate configuration and print the plan; changes nothing
 *   --apply-migrations   run `npx supabase db push` first (needs the CLI + linked project)
 *   --ai                 call the weekly-summary function for real (costs one request)
 *
 * Safety
 *   - Refuses to run against a project whose URL contains "prod" or "production".
 *   - Creates two throwaway users, uses only those, and deletes them in a finally block
 *     (auth.users cascade removes their rows).
 *   - Never prints a key, and never prints row contents beyond ids and counts.
 *   - Service-role key is used only from this local script, never in the browser bundle.
 *
 * Exit codes: 0 = all checks passed, 1 = a check failed, 2 = configuration missing.
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const APPLY_MIGRATIONS = args.has('--apply-migrations');
const RUN_AI = args.has('--ai');

const url = process.env.SUPABASE_URL ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const results = [];
let failures = 0;

function record(name, status, detail) {
  results.push({ name, status, detail });
  if (status === 'FAIL') failures += 1;
  const icon = status === 'PASS' ? '✔' : status === 'SKIP' ? '–' : '✘';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(message) {
  console.error(`\n${message}`);
  printSummary();
  process.exit(2);
}

function printSummary() {
  if (results.length === 0) return;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  console.log(`\n${passed} passed · ${skipped} skipped · ${failures} failed`);
}

/* ------------------------------ configuration ----------------------------- */

const missing = [
  ['SUPABASE_URL', url],
  ['SUPABASE_ANON_KEY', anonKey],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.error(`Missing configuration: ${missing.join(', ')}`);
  console.error(`
Set the three variables for a DISPOSABLE Supabase test project, e.g.:

  export SUPABASE_URL="https://your-test-project.supabase.co"
  export SUPABASE_ANON_KEY="..."                 # dashboard → Project Settings → API
  export SUPABASE_SERVICE_ROLE_KEY="..."         # same page; server-side only, never in a VITE_ var

Then:
  node scripts/verify-cloud.mjs --dry-run        # validates config, prints the plan
  node scripts/verify-cloud.mjs --apply-migrations --ai

The service-role key lets this script create and delete the two throwaway users.
Do not run it against production, and do not commit the key.`);
  process.exit(2);
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  fail(`SUPABASE_URL does not look like a Supabase project URL (got a ${url.length}-character string).`);
}
if (/prod/i.test(url)) {
  fail('Refusing to run: the project URL looks like production. Use a disposable test project.');
}

const PLAN = [
  APPLY_MIGRATIONS ? '0. supabase db push (apply 0001–0005)' : '0. migrations skipped (pass --apply-migrations)',
  '1. create two throwaway users (A, B) with confirmed emails',
  '2. A creates a subject, chapter, practice question and a mistake linked to it',
  '3. B cannot read A rows (RLS), cannot forge user_id, cannot update A rows',
  '4. B cannot attach an attempt or mistake to A\'s practice question (composite FK)',
  '5. deleting the question clears the mistake link instead of deleting history (0005)',
  '6. weekly-summary status endpoint answers for an authenticated user',
  RUN_AI ? '7. weekly-summary generate: one real AI request, schema-checked' : '7. AI generate skipped (pass --ai)',
  '8. both users deleted; no test rows remain',
];

console.log(`Target: ${url}`);
console.log(`Mode:   ${DRY_RUN ? 'dry run (no writes)' : 'live verification'}`);
console.log('\nPlan:');
for (const step of PLAN) console.log(`  ${step}`);
console.log('');

if (DRY_RUN) {
  console.log('Dry run complete. Configuration is present and the target does not look like production.');
  process.exit(0);
}

/* --------------------------------- helpers -------------------------------- */

const stamp = Date.now().toString(36);
const emailA = `mkj-verify-a-${stamp}@example.test`;
const emailB = `mkj-verify-b-${stamp}@example.test`;
const password = `Verify-${stamp}-${Math.random().toString(36).slice(2)}!`;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function describeError(error) {
  if (!error) return 'no error';
  return `${error.code ?? 'error'}: ${String(error.message ?? '').slice(0, 120)}`;
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, 'PASS', detail);
    return true;
  } catch (error) {
    record(name, 'FAIL', describeError(error) === 'no error' ? String(error) : describeError(error));
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* ----------------------------------- run ---------------------------------- */

let userAId = null;
let userBId = null;

try {
  if (APPLY_MIGRATIONS) {
    console.log('Applying migrations with the Supabase CLI…');
    try {
      execFileSync('npx', ['supabase', 'db', 'push'], { stdio: 'inherit' });
      record('migrations applied (supabase db push)', 'PASS', '0001–0005');
    } catch (error) {
      record('migrations applied (supabase db push)', 'FAIL', 'CLI missing or not linked; run it manually');
      throw error;
    }
  } else {
    record('migrations applied', 'SKIP', 'pass --apply-migrations, or run `supabase db push` yourself');
  }

  const createdA = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Verify A' },
  });
  assert(!createdA.error && createdA.data.user, `could not create user A (${describeError(createdA.error)})`);
  userAId = createdA.data.user.id;

  const createdB = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Verify B' },
  });
  assert(!createdB.error && createdB.data.user, `could not create user B (${describeError(createdB.error)})`);
  userBId = createdB.data.user.id;
  record('two throwaway users created', 'PASS', 'emails are @example.test');

  const clientA = userClient();
  const clientB = userClient();
  const signInA = await clientA.auth.signInWithPassword({ email: emailA, password });
  assert(!signInA.error, `user A could not sign in (${describeError(signInA.error)})`);
  const signInB = await clientB.auth.signInWithPassword({ email: emailB, password });
  assert(!signInB.error, `user B could not sign in (${describeError(signInB.error)})`);
  record('email/password sign-in works', 'PASS', 'two sessions');

  await check('profile + reminder preferences provisioned by the auth trigger', async () => {
    const profile = await clientA.from('profiles').select('id, locale, timezone').maybeSingle();
    assert(!profile.error, describeError(profile.error));
    assert(profile.data, 'no profile row for a new user');
    const prefs = await clientA.from('reminder_preferences').select('user_id').maybeSingle();
    assert(!prefs.error, describeError(prefs.error));
    assert(prefs.data, 'no reminder preferences row');
    return 'profiles and reminder_preferences both present';
  });

  let subjectId = null;
  await check('A can create and read an owned subject', async () => {
    const insert = await clientA
      .from('user_subjects')
      .insert({ custom_name: 'Verify Physics', status: 'active', color: '#1d4ed8', sort_order: 1, is_demo: false })
      .select('id, user_id')
      .single();
    assert(!insert.error, describeError(insert.error));
    assert(insert.data.user_id === userAId, 'user_id was not defaulted to the caller');
    subjectId = insert.data.id;
    const read = await clientA.from('user_subjects').select('id').eq('id', subjectId);
    assert(!read.error, describeError(read.error));
    assert(read.data.length === 1, 'A cannot read back its own row');
    return `subject ${subjectId.slice(0, 8)}…`;
  });

  await check('B cannot read A rows (RLS)', async () => {
    const read = await clientB.from('user_subjects').select('id').eq('id', subjectId);
    assert(!read.error, describeError(read.error));
    assert(read.data.length === 0, `RLS LEAK: B can see ${read.data.length} of A's subjects`);
    const all = await clientB.from('user_subjects').select('id');
    assert(!all.error, describeError(all.error));
    assert(all.data.length === 0, `RLS LEAK: B sees ${all.data.length} subject rows`);
    return 'zero rows visible';
  });

  await check('B cannot forge ownership with an explicit user_id', async () => {
    const forged = await clientB
      .from('user_subjects')
      .insert({ user_id: userAId, custom_name: 'Forged', status: 'active', color: '#000000', sort_order: 2, is_demo: false })
      .select('id');
    assert(forged.error, 'RLS LEAK: B inserted a row owned by A');
    return `rejected (${forged.error.code ?? 'error'})`;
  });

  await check('B cannot update or delete A rows', async () => {
    const update = await clientB.from('user_subjects').update({ color: '#ffffff' }).eq('id', subjectId).select('id');
    assert(!update.error || (update.data ?? []).length === 0, describeError(update.error));
    assert((update.data ?? []).length === 0, 'RLS LEAK: B updated a row owned by A');
    const removed = await clientB.from('user_subjects').delete().eq('id', subjectId).select('id');
    assert((removed.data ?? []).length === 0, 'RLS LEAK: B deleted a row owned by A');
    const verify = await clientA.from('user_subjects').select('color').eq('id', subjectId).single();
    assert(!verify.error, describeError(verify.error));
    assert(verify.data.color === '#1d4ed8', 'A row changed after B attempted an update');
    return 'no rows affected; A data unchanged';
  });

  let questionId = null;
  await check('A can create a practice question', async () => {
    const insert = await clientA
      .from('practice_questions')
      .insert({ question_text: 'Verify: state the SI unit of force.', source: 'user', difficulty: 'easy' })
      .select('id')
      .single();
    assert(!insert.error, describeError(insert.error));
    questionId = insert.data.id;
    return `question ${questionId.slice(0, 8)}…`;
  });

  await check("B cannot attach an attempt to A's question (composite FK)", async () => {
    const attempt = await clientB
      .from('practice_attempts')
      .insert({ practice_question_id: questionId, is_correct: true })
      .select('id');
    assert(attempt.error, 'LEAK: B recorded an attempt against a question it does not own');
    return `rejected (${attempt.error.code ?? 'error'})`;
  });

  await check('0005: mistake links to a question, survives its deletion, keeps the mistake', async () => {
    const mistake = await clientA
      .from('mistake_logs')
      .insert({
        user_subject_id: subjectId,
        category: 'concept_gap',
        what_went_wrong: 'Verify: forgot the unit',
        occurred_at: new Date().toISOString().slice(0, 10),
        practice_question_id: questionId,
      })
      .select('id, practice_question_id')
      .single();
    assert(!mistake.error, describeError(mistake.error));
    assert(mistake.data.practice_question_id === questionId, 'link was not stored');

    const del = await clientA.from('practice_questions').delete().eq('id', questionId);
    assert(!del.error, describeError(del.error));

    const after = await clientA.from('mistake_logs').select('id, practice_question_id').eq('id', mistake.data.id).single();
    assert(!after.error, describeError(after.error));
    assert(after.data.practice_question_id === null, 'ON DELETE SET NULL did not clear the link');
    return 'link stored and cleared, mistake kept';
  });

  await check('weekly-summary status endpoint answers for an authenticated user', async () => {
    const status = await clientA.functions.invoke('weekly-summary', { body: { action: 'status' } });
    assert(!status.error, describeError(status.error));
    assert(status.data && typeof status.data === 'object', 'empty response from the function');
    assert(typeof status.data.available === 'boolean', 'status payload missing "available"');
    return status.data.available ? 'AI configured on the server' : 'AI not configured (expected)';
  });

  await check('weekly-summary rejects an unauthenticated call', async () => {
    const anon = userClient();
    const call = await anon.functions.invoke('weekly-summary', { body: { action: 'status' } });
    assert(call.error || call.data?.error, 'unauthenticated call was not rejected');
    return 'rejected without a session';
  });

  if (RUN_AI) {
    await check('weekly-summary generate: one real AI request', async () => {
      const today = new Date();
      const weekEnd = today.toISOString().slice(0, 10);
      const start = new Date(today.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
      const call = await clientA.functions.invoke('weekly-summary', {
        body: { action: 'generate', week_start: start, week_end: weekEnd, timezone: 'Asia/Dhaka', locale: 'en' },
      });
      assert(!call.error, describeError(call.error));
      assert(call.data?.ok === true, `generate failed: ${JSON.stringify(call.data?.error ?? call.data).slice(0, 160)}`);
      assert(call.data.payload?.summary, 'missing summary');
      assert(call.data.provider && call.data.model, 'provider/model must be stamped by the server');
      assert(call.data.payload.generated_at, 'generated_at must be stamped by the server');
      return `provider=${call.data.provider} model=${call.data.model}`;
    });
  } else {
    record('weekly-summary generate (real AI request)', 'SKIP', 'pass --ai to spend one request');
  }
} catch (error) {
  if (failures === 0) record('verification run', 'FAIL', String(error).slice(0, 200));
} finally {
  for (const [label, id] of [
    ['user A', userAId],
    ['user B', userBId],
  ]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    record(`cleanup: delete ${label}`, error ? 'FAIL' : 'PASS', error ? describeError(error) : 'rows cascade');
  }

  if (userAId) {
    const leftover = await admin
      .from('user_subjects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userAId);
    record(
      'cleanup: no test rows remain',
      (leftover.count ?? 0) === 0 ? 'PASS' : 'FAIL',
      leftover.count ? `${leftover.count} rows left` : 'verified empty',
    );
  }
}

printSummary();
process.exit(failures === 0 ? 0 : 1);
