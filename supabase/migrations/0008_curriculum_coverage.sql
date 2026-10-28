-- ---------------------------------------------------------------------------
-- 0008 — curriculum verification states, idempotent import keys & coverage
--
-- WHY
--   The SSC/HSC inventory is growing from a single subject list into a
--   multi-year, multi-document reference set. Three things were missing:
--
--   1. `partially_verified` as a real state. The old constraint forced every
--      row into one of four values, so a subject whose *existence* is confirmed
--      by an official book list but whose *paper attribution* is inferred had
--      to be recorded as fully unverified — which understates real work — or
--      as verified — which is a lie. `partially_verified` is the honest middle.
--
--   2. A natural key for chapters and topics. Re-running an import has to
--      update the existing row instead of inserting a duplicate. Postgres
--      treats NULLs as distinct, so the shipped
--      `unique (curriculum_version_id, name, paper_label)` never fired for
--      subjects without a paper. Chapters and topics had no key at all.
--
--   3. A place to record what we looked at and what is still missing. A
--      coverage report that only counts rows cannot distinguish "we never
--      looked" from "the source is blocked" from "NCTB has not published it".
--
-- WHAT THIS DOES NOT DO
--   * It inserts no chapter or topic rows. Not one title is invented here.
--   * It does not touch a single student table. Progress, notes, revision
--     history and sessions are untouched, and no delete is issued against any
--     curriculum row that a user record may point at.
--   * It does not widen `curriculum_versions_scope_check`.
--
-- IDEMPOTENCY
--   Every statement is guarded (`if not exists`, `drop ... if exists` before
--   `add`, `create or replace`, `on conflict`), so the whole set can be applied
--   twice. tests/db/idempotency.test.ts enforces that.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `partially_verified`
--
-- Postgres auto-names a column-level check `<table>_<column>_check`, which is
-- what 0001 and 0003 produced. 0006 named the subjects constraint explicitly.
-- All four are rebuilt under the same names so a re-run replaces cleanly.
-- ---------------------------------------------------------------------------

alter table public.curriculum_versions
  drop constraint if exists curriculum_versions_verification_status_check;
alter table public.curriculum_versions
  add constraint curriculum_versions_verification_status_check
  check (verification_status in ('draft', 'needs_verification', 'partially_verified', 'verified', 'retired'));

alter table public.curriculum_subjects
  drop constraint if exists curriculum_subjects_verification_status_check;
alter table public.curriculum_subjects
  add constraint curriculum_subjects_verification_status_check
  check (verification_status in ('draft', 'needs_verification', 'partially_verified', 'verified', 'retired'));

alter table public.curriculum_chapters
  drop constraint if exists curriculum_chapters_verification_status_check;
alter table public.curriculum_chapters
  add constraint curriculum_chapters_verification_status_check
  check (verification_status in ('draft', 'needs_verification', 'partially_verified', 'verified', 'retired'));

alter table public.curriculum_topics
  drop constraint if exists curriculum_topics_verification_status_check;
alter table public.curriculum_topics
  add constraint curriculum_topics_verification_status_check
  check (verification_status in ('draft', 'needs_verification', 'partially_verified', 'verified', 'retired'));

-- ---------------------------------------------------------------------------
-- 2. Provenance columns for the import format
--
-- `source_document` names the artefact the row was transcribed from (e.g.
-- "NCTB Physics Class 9–10, 2025 — table of contents, p. 7"). A URL alone does
-- not survive a re-upload, and "which book, which page" is what a human needs
-- to re-check the row later.
-- ---------------------------------------------------------------------------

alter table public.curriculum_chapters
  add column if not exists source_document text,
  add column if not exists source_checked_at date;

alter table public.curriculum_topics
  add column if not exists source_document text,
  add column if not exists source_checked_at date;

alter table public.curriculum_subjects
  add column if not exists source_document text;

-- A row may not claim to be verified without saying what it was verified
-- against. This is the constraint that makes "never mark unverified data as
-- verified" structural instead of a code-review habit.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'curriculum_chapters_verified_needs_source'
      and conrelid = 'public.curriculum_chapters'::regclass
  ) then
    alter table public.curriculum_chapters
      add constraint curriculum_chapters_verified_needs_source
      check (verification_status <> 'verified' or source_url is not null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'curriculum_topics_verified_needs_source'
      and conrelid = 'public.curriculum_topics'::regclass
  ) then
    alter table public.curriculum_topics
      add constraint curriculum_topics_verified_needs_source
      check (verification_status <> 'verified' or source_url is not null);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Natural keys — the reason an import can be re-run
--
-- Chapters are keyed by (subject, chapter number); topics by (chapter, title).
-- Both are partial indexes so NULL keys stay allowed: a chapter with no printed
-- number is still importable, it simply cannot be de-duplicated by number.
-- Deleting a chapter is never part of an import — the user's `user_chapters`
-- row has `on delete set null`, so a delete would silently orphan progress.
-- ---------------------------------------------------------------------------

create unique index if not exists curriculum_chapters_subject_number_key
  on public.curriculum_chapters (curriculum_subject_id, chapter_number)
  where chapter_number is not null;

create unique index if not exists curriculum_topics_chapter_title_key
  on public.curriculum_topics (curriculum_chapter_id, title);

-- ---------------------------------------------------------------------------
-- 4. Source registry
--
-- One row per official document actually opened, with what came out of it.
-- `access_state` records the environment's experience of the document, not a
-- claim about the document's quality:
--   rendered     — full text extracted here
--   partial      — some sections extracted
--   blocked      — identified, but the content could not be retrieved
--   unreachable  — host not reachable from this environment
--   not_attempted— known to exist, no attempt made yet
-- ---------------------------------------------------------------------------

create table if not exists public.curriculum_sources (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null,
  authority text not null default 'NCTB',
  document_type text not null
    check (document_type in (
      'textbook', 'textbook_list', 'curriculum', 'exam_syllabus',
      'subject_structure', 'notice', 'other'
    )),
  education_level text,
  academic_year text,
  access_state text not null default 'not_attempted'
    check (access_state in ('rendered', 'partial', 'blocked', 'unreachable', 'not_attempted')),
  checked_at date,
  note text,
  created_at timestamptz not null default now(),
  unique (url, document_type)
);

alter table public.curriculum_sources enable row level security;

drop policy if exists "curriculum sources readable" on public.curriculum_sources;
create policy "curriculum sources readable" on public.curriculum_sources
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 5. Outstanding requirements
--
-- The coverage report needs to say "awaiting source material" and mean
-- something specific. Each row is one concrete, checkable gap: which level,
-- which group (or 'all'), which year, what is missing, and where it should
-- come from. `stream` is NOT NULL with a default so the unique key works —
-- a nullable column would make every row unique and let duplicates in.
-- ---------------------------------------------------------------------------

create table if not exists public.curriculum_pending_requirements (
  id uuid primary key default gen_random_uuid(),
  education_level text not null check (education_level in ('SSC', 'HSC')),
  stream text not null default 'all',
  academic_year text not null,
  curriculum_version_id uuid references public.curriculum_versions (id) on delete cascade,
  curriculum_subject_id uuid references public.curriculum_subjects (id) on delete cascade,
  requirement text not null,
  status text not null default 'awaiting_source'
    check (status in ('awaiting_publication', 'awaiting_source', 'source_blocked', 'source_identified')),
  source_url text,
  note text,
  created_at timestamptz not null default now(),
  unique (education_level, academic_year, stream, requirement)
);

create index if not exists curriculum_pending_level_year_idx
  on public.curriculum_pending_requirements (education_level, academic_year, stream);

alter table public.curriculum_pending_requirements enable row level security;

drop policy if exists "curriculum pending readable" on public.curriculum_pending_requirements;
create policy "curriculum pending readable" on public.curriculum_pending_requirements
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 6. Coverage view
--
-- Counts are scalar subqueries rather than a join: joining chapters and topics
-- in one query multiplies the chapter count by the number of topics, and a
-- coverage report that overstates itself is worse than no report.
--
-- `security_invoker = true` keeps row-level security evaluated as the caller.
-- Without it the view would run as its owner and quietly bypass RLS.
-- ---------------------------------------------------------------------------

create or replace view public.curriculum_coverage
with (security_invoker = true) as
select
  v.id                       as curriculum_version_id,
  v.education_level,
  v.stream,
  v.academic_year,
  v.version_label,
  v.scope,
  v.verification_status      as version_status,
  v.is_demo                  as version_is_demo,
  s.id                       as curriculum_subject_id,
  s.name                     as subject_name,
  s.name_bn                  as subject_name_bn,
  s.code                     as subject_code,
  s.paper_label,
  s.is_compulsory,
  s.sort_order,
  s.verification_status      as subject_status,
  (select count(*) from public.curriculum_chapters c
     where c.curriculum_subject_id = s.id)::int                       as chapter_count,
  (select count(*) from public.curriculum_chapters c
     where c.curriculum_subject_id = s.id
       and c.verification_status = 'verified')::int                   as verified_chapters,
  (select count(*) from public.curriculum_chapters c
     where c.curriculum_subject_id = s.id
       and c.verification_status = 'partially_verified')::int         as partial_chapters,
  (select count(*) from public.curriculum_chapters c
     where c.curriculum_subject_id = s.id
       and c.verification_status = 'needs_verification')::int         as unverified_chapters,
  (select count(*) from public.curriculum_topics t
     join public.curriculum_chapters c2 on c2.id = t.curriculum_chapter_id
     where c2.curriculum_subject_id = s.id)::int                      as topic_count
from public.curriculum_versions v
join public.curriculum_subjects s on s.curriculum_version_id = v.id;

grant select on public.curriculum_sources,
               public.curriculum_pending_requirements,
               public.curriculum_coverage
  to authenticated;

-- Reference data is read-only from the client. Restated here so a later
-- migration cannot widen it by accident.
revoke insert, update, delete on public.curriculum_sources from authenticated;
revoke insert, update, delete on public.curriculum_pending_requirements from authenticated;
revoke insert, update, delete on public.curriculum_coverage from authenticated;
