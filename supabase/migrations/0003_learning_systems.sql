-- ============================================================================
-- MKJ StudyOS — Phase 2: syllabus topics, time tracking, focus, practice
-- ============================================================================
-- Additive only: no existing column is dropped, no existing row is rewritten.
-- Apply after 0001_init.sql (and 0002 demo curriculum) with `supabase db push`.
--
-- Design rules preserved from Phase 1:
--  * every user table carries user_id and a composite FK to its parent so a
--    guessed UUID cannot attach a row to someone else's data;
--  * study_sessions stays the single source of truth for *study* time;
--  * daily_blocks holds non-study day blocks, so time is never double counted;
--  * deleting a chapter unlinks history instead of deleting it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Syllabus topics (curriculum reference layer)
-- ---------------------------------------------------------------------------

create table if not exists public.curriculum_topics (
  id uuid primary key default gen_random_uuid(),
  curriculum_chapter_id uuid not null references public.curriculum_chapters (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  title_bn text,
  sort_order integer not null default 0,
  source_url text,
  verification_status text not null default 'needs_verification'
    check (verification_status in ('draft', 'needs_verification', 'verified', 'retired')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists curriculum_topics_chapter_idx
  on public.curriculum_topics (curriculum_chapter_id, sort_order);

alter table public.curriculum_topics enable row level security;

drop policy if exists "curriculum topics readable" on public.curriculum_topics;
create policy "curriculum topics readable" on public.curriculum_topics
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- A. The student's own topics (adopted from the curriculum or custom)
-- ---------------------------------------------------------------------------

create table if not exists public.user_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_chapter_id uuid not null,
  curriculum_topic_id uuid references public.curriculum_topics (id) on delete set null,
  custom_title text,
  status text not null default 'not_recorded'
    check (status in ('not_recorded', 'in_progress', 'needs_revision', 'complete')),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (curriculum_topic_id is not null or custom_title is not null),
  check (custom_title is null or char_length(custom_title) between 1 and 160),
  unique (id, user_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete cascade
);

create unique index if not exists user_topics_curriculum_unique
  on public.user_topics (user_id, curriculum_topic_id)
  where curriculum_topic_id is not null;
create index if not exists user_topics_chapter_idx on public.user_topics (user_chapter_id, created_at);

-- re-apply safe: Postgres has no "create trigger if not exists"
drop trigger if exists user_topics_touch_updated_at on public.user_topics;
create trigger user_topics_touch_updated_at
  before update on public.user_topics
  for each row execute function public.touch_updated_at();

alter table public.user_topics enable row level security;

drop policy if exists "user topics select own" on public.user_topics;
create policy "user topics select own" on public.user_topics
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "user topics insert own" on public.user_topics;
create policy "user topics insert own" on public.user_topics
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "user topics update own" on public.user_topics;
create policy "user topics update own" on public.user_topics
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "user topics delete own" on public.user_topics;
create policy "user topics delete own" on public.user_topics
  for delete to authenticated using (user_id = (select auth.uid()));

-- Parents referenced by composite (id, user_id) foreign keys need a matching
-- unique key. `id` alone is already the primary key, so this is purely additive.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'study_tasks_id_user_unique') then
    alter table public.study_tasks add constraint study_tasks_id_user_unique unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'study_sessions_id_user_unique') then
    alter table public.study_sessions add constraint study_sessions_id_user_unique unique (id, user_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Link study sessions to a topic / task, record their origin, and make timer
-- submissions idempotent (a double-tap cannot create two identical sessions).
-- ---------------------------------------------------------------------------

alter table public.study_sessions
  add column if not exists user_topic_id uuid,
  add column if not exists user_task_id uuid,
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'timer', 'focus')),
  add column if not exists client_entry_id text
    check (client_entry_id is null or char_length(client_entry_id) between 8 and 80);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_sessions_topic_fk'
  ) then
    alter table public.study_sessions
      add constraint study_sessions_topic_fk
      foreign key (user_topic_id, user_id)
      references public.user_topics (id, user_id) on delete set null (user_topic_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'study_sessions_task_fk'
  ) then
    alter table public.study_sessions
      add constraint study_sessions_task_fk
      foreign key (user_task_id, user_id)
      references public.study_tasks (id, user_id) on delete set null (user_task_id);
  end if;
end;
$$;

create unique index if not exists study_sessions_client_entry_unique
  on public.study_sessions (user_id, client_entry_id)
  where client_entry_id is not null;

create index if not exists study_sessions_topic_idx on public.study_sessions (user_topic_id);
create index if not exists study_sessions_task_idx on public.study_sessions (user_task_id);

-- ---------------------------------------------------------------------------
-- B. Daily time tracker: non-study blocks only
-- ---------------------------------------------------------------------------
-- Study / problem solving / revision time lives in study_sessions. This table
-- holds the rest of the day (college, classes, sleep, breaks, personal…), so
-- the two sources never overlap and a total is never counted twice.

create table if not exists public.daily_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date date not null,
  category text not null check (category in (
    'college', 'class', 'exam', 'homework', 'sleep', 'break', 'personal',
    'commute', 'prayer', 'custom'
  )),
  custom_label text check (custom_label is null or char_length(custom_label) between 1 and 80),
  user_subject_id uuid,
  user_chapter_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  source text not null default 'manual' check (source in ('manual', 'timer')),
  client_entry_id text check (client_entry_id is null or char_length(client_entry_id) between 8 and 80),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  check (category <> 'custom' or custom_label is not null),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists daily_blocks_user_date_idx on public.daily_blocks (user_id, entry_date desc);
create unique index if not exists daily_blocks_client_entry_unique
  on public.daily_blocks (user_id, client_entry_id)
  where client_entry_id is not null;

-- re-apply safe: Postgres has no "create trigger if not exists"
drop trigger if exists daily_blocks_touch_updated_at on public.daily_blocks;
create trigger daily_blocks_touch_updated_at
  before update on public.daily_blocks
  for each row execute function public.touch_updated_at();

alter table public.daily_blocks enable row level security;

drop policy if exists "daily blocks select own" on public.daily_blocks;
create policy "daily blocks select own" on public.daily_blocks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "daily blocks insert own" on public.daily_blocks;
create policy "daily blocks insert own" on public.daily_blocks
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "daily blocks update own" on public.daily_blocks;
create policy "daily blocks update own" on public.daily_blocks
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "daily blocks delete own" on public.daily_blocks;
create policy "daily blocks delete own" on public.daily_blocks
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- I. Focus sessions
-- ---------------------------------------------------------------------------

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_task_id uuid,
  user_subject_id uuid,
  user_chapter_id uuid,
  focus_minutes integer not null check (focus_minutes between 1 and 180),
  break_minutes integer not null default 5 check (break_minutes between 0 and 60),
  planned_intervals integer not null default 1 check (planned_intervals between 1 and 12),
  completed_intervals integer not null default 0 check (completed_intervals between 0 and 12),
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'abandoned')),
  study_session_id uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  foreign key (user_task_id, user_id)
    references public.study_tasks (id, user_id) on delete set null (user_task_id),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id),
  foreign key (study_session_id, user_id)
    references public.study_sessions (id, user_id) on delete set null (study_session_id)
);

create index if not exists focus_sessions_user_started_idx
  on public.focus_sessions (user_id, started_at desc);

alter table public.focus_sessions enable row level security;

drop policy if exists "focus sessions select own" on public.focus_sessions;
create policy "focus sessions select own" on public.focus_sessions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "focus sessions insert own" on public.focus_sessions;
create policy "focus sessions insert own" on public.focus_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "focus sessions update own" on public.focus_sessions;
create policy "focus sessions update own" on public.focus_sessions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "focus sessions delete own" on public.focus_sessions;
create policy "focus sessions delete own" on public.focus_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- E. Mistake book: capture what was attempted and the lesson learned
-- ---------------------------------------------------------------------------

alter table public.mistake_logs
  add column if not exists attempted_answer text
    check (attempted_answer is null or char_length(attempted_answer) <= 2000),
  add column if not exists lesson_learned text
    check (lesson_learned is null or char_length(lesson_learned) <= 1000),
  add column if not exists resolved_at timestamptz;

-- ---------------------------------------------------------------------------
-- F. Exam countdown / preparation targets
-- ---------------------------------------------------------------------------

create table if not exists public.exam_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  exam_type text not null default 'school'
    check (exam_type in ('school', 'coaching', 'board', 'admission', 'mock', 'other')),
  exam_date date not null,
  user_subject_id uuid,
  coverage_note text check (coverage_note is null or char_length(coverage_note) <= 500),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed', 'cancelled')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id)
);

create index if not exists exam_targets_user_date_idx on public.exam_targets (user_id, exam_date);

-- re-apply safe: Postgres has no "create trigger if not exists"
drop trigger if exists exam_targets_touch_updated_at on public.exam_targets;
create trigger exam_targets_touch_updated_at
  before update on public.exam_targets
  for each row execute function public.touch_updated_at();

alter table public.exam_targets enable row level security;

drop policy if exists "exam targets select own" on public.exam_targets;
create policy "exam targets select own" on public.exam_targets
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "exam targets insert own" on public.exam_targets;
create policy "exam targets insert own" on public.exam_targets
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "exam targets update own" on public.exam_targets;
create policy "exam targets update own" on public.exam_targets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "exam targets delete own" on public.exam_targets;
create policy "exam targets delete own" on public.exam_targets
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- G. Formula vault + practice questions
-- ---------------------------------------------------------------------------

alter table public.notes
  add column if not exists kind text not null default 'note'
    check (kind in ('note', 'formula', 'definition', 'bookmark')),
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists is_pinned boolean not null default false;

create index if not exists notes_kind_idx on public.notes (user_id, kind, updated_at desc);

create table if not exists public.practice_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_subject_id uuid,
  user_chapter_id uuid,
  question_text text not null check (char_length(question_text) between 1 and 4000),
  answer_text text check (answer_text is null or char_length(answer_text) <= 4000),
  explanation text check (explanation is null or char_length(explanation) <= 4000),
  source text not null default 'user' check (source in ('user', 'imported', 'ai')),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  tags text[] not null default '{}'::text[],
  is_archived boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists practice_questions_user_idx
  on public.practice_questions (user_id, is_archived, created_at desc);

-- re-apply safe: Postgres has no "create trigger if not exists"
drop trigger if exists practice_questions_touch_updated_at on public.practice_questions;
create trigger practice_questions_touch_updated_at
  before update on public.practice_questions
  for each row execute function public.touch_updated_at();

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  practice_question_id uuid not null,
  attempted_at timestamptz not null default now(),
  answer_given text check (answer_given is null or char_length(answer_given) <= 4000),
  is_correct boolean,
  needs_review boolean not null default false,
  time_spent_minutes integer check (time_spent_minutes is null or time_spent_minutes between 0 and 600),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (practice_question_id, user_id)
    references public.practice_questions (id, user_id) on delete cascade
);

create index if not exists practice_attempts_question_idx
  on public.practice_attempts (practice_question_id, attempted_at desc);
create index if not exists practice_attempts_user_idx
  on public.practice_attempts (user_id, attempted_at desc);

alter table public.practice_questions enable row level security;
alter table public.practice_attempts enable row level security;

drop policy if exists "practice questions select own" on public.practice_questions;
create policy "practice questions select own" on public.practice_questions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "practice questions insert own" on public.practice_questions;
create policy "practice questions insert own" on public.practice_questions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "practice questions update own" on public.practice_questions;
create policy "practice questions update own" on public.practice_questions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "practice questions delete own" on public.practice_questions;
create policy "practice questions delete own" on public.practice_questions
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "practice attempts select own" on public.practice_attempts;
create policy "practice attempts select own" on public.practice_attempts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "practice attempts insert own" on public.practice_attempts;
create policy "practice attempts insert own" on public.practice_attempts
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "practice attempts update own" on public.practice_attempts;
create policy "practice attempts update own" on public.practice_attempts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "practice attempts delete own" on public.practice_attempts;
create policy "practice attempts delete own" on public.practice_attempts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies; the reference table is read-only)
-- ---------------------------------------------------------------------------

grant select on public.curriculum_topics to authenticated;

grant select, insert, update, delete on
  public.user_topics,
  public.daily_blocks,
  public.focus_sessions,
  public.exam_targets,
  public.practice_questions,
  public.practice_attempts
to authenticated;
