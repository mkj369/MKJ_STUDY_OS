-- ============================================================================
-- MKJ StudyOS — Phase 1 schema
-- ============================================================================
-- Apply with:  supabase db push
-- Safe to run on a fresh project. No destructive statements.
--
-- Design notes
--  * Every user-owned table has an unambiguous ownership path via user_id and
--    a composite FK to its parent (id, user_id) so a user cannot attach a row to
--    someone else's parent even if they guessed the UUID.
--  * Historical records keep their chapter link nullable: deleting a chapter
--    unlinks records instead of deleting them. Deleting a subject is RESTRICTed
--    while linked records exist; the UI offers Archive instead.
--  * Public curriculum tables are readable by authenticated users but have no
--    client write policies (service role / migrations only).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Student' check (char_length(display_name) between 1 and 60),
  locale text not null default 'en' check (locale in ('en', 'bn')),
  timezone text not null default 'Asia/Dhaka',
  academic_level text,
  study_windows jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.study_windows is
  'Minutes available per weekday: {"0":120,...} with 0 = Sunday. Never assumed by the app.';

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Curriculum (public, versioned, verified-status aware)
-- ---------------------------------------------------------------------------

create table if not exists public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  authority text not null,
  country text not null,
  education_level text not null,
  class_grade text not null,
  stream text,
  academic_year text not null,
  version_label text not null,
  title text not null,
  source_url text,
  verification_status text not null default 'needs_verification'
    check (verification_status in ('draft', 'needs_verification', 'verified', 'retired')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (authority, class_grade, stream, academic_year, version_label)
);

create trigger curriculum_versions_touch_updated_at
  before update on public.curriculum_versions
  for each row execute function public.touch_updated_at();

create table if not exists public.curriculum_subjects (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references public.curriculum_versions (id) on delete cascade,
  name text not null,
  name_bn text,
  code text,
  paper_label text,
  is_compulsory boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (curriculum_version_id, name, paper_label)
);

create index if not exists curriculum_subjects_version_idx
  on public.curriculum_subjects (curriculum_version_id, sort_order);

create table if not exists public.curriculum_chapters (
  id uuid primary key default gen_random_uuid(),
  curriculum_subject_id uuid not null references public.curriculum_subjects (id) on delete cascade,
  parent_id uuid references public.curriculum_chapters (id) on delete cascade,
  title text not null,
  title_bn text,
  chapter_number text,
  sort_order integer not null default 0,
  source_url text,
  verification_status text not null default 'needs_verification'
    check (verification_status in ('draft', 'needs_verification', 'verified', 'retired')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists curriculum_chapters_subject_idx
  on public.curriculum_chapters (curriculum_subject_id, sort_order);

-- ---------------------------------------------------------------------------
-- User subjects and chapters
-- ---------------------------------------------------------------------------

create table if not exists public.user_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  curriculum_subject_id uuid references public.curriculum_subjects (id) on delete set null,
  curriculum_version_id uuid references public.curriculum_versions (id) on delete set null,
  custom_name text,
  custom_paper_label text,
  status text not null default 'active' check (status in ('active', 'archived')),
  color text not null default '#0f5132' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (curriculum_subject_id is not null or custom_name is not null),
  unique (id, user_id)
);

create unique index if not exists user_subjects_curriculum_unique
  on public.user_subjects (user_id, curriculum_subject_id)
  where curriculum_subject_id is not null;

create index if not exists user_subjects_user_idx on public.user_subjects (user_id, sort_order);

create trigger user_subjects_touch_updated_at
  before update on public.user_subjects
  for each row execute function public.touch_updated_at();

create table if not exists public.user_chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_subject_id uuid not null,
  curriculum_chapter_id uuid references public.curriculum_chapters (id) on delete set null,
  curriculum_version_id uuid references public.curriculum_versions (id) on delete set null,
  custom_title text,
  status text not null default 'not_recorded'
    check (status in ('not_recorded', 'not_started', 'in_progress', 'needs_practice', 'needs_revision', 'blocked', 'complete')),
  lecture_target_count integer check (lecture_target_count is null or (lecture_target_count >= 0 and lecture_target_count <= 500)),
  import_batch_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (curriculum_chapter_id is not null or custom_title is not null),
  unique (id, user_id),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete cascade
);

create unique index if not exists user_chapters_curriculum_unique
  on public.user_chapters (user_id, curriculum_chapter_id)
  where curriculum_chapter_id is not null;

create index if not exists user_chapters_subject_idx on public.user_chapters (user_subject_id);
create index if not exists user_chapters_batch_idx on public.user_chapters (import_batch_id);

create trigger user_chapters_touch_updated_at
  before update on public.user_chapters
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Chapter checklist
-- ---------------------------------------------------------------------------

create table if not exists public.chapter_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_chapter_id uuid not null,
  kind text not null check (kind in (
    'reading', 'lecture', 'notes_review', 'concept_book', 'practice', 'board_questions',
    'admission_questions', 'mcq', 'written', 'self_test', 'error_correction', 'final_revision', 'custom'
  )),
  label text not null check (char_length(label) between 1 and 80),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete cascade
);

create index if not exists checklist_items_chapter_idx on public.chapter_checklist_items (user_chapter_id, sort_order);

create trigger checklist_items_touch_updated_at
  before update on public.chapter_checklist_items
  for each row execute function public.touch_updated_at();

create table if not exists public.chapter_checklist_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checklist_item_id uuid not null,
  is_done boolean not null default false,
  completed_at timestamptz,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, checklist_item_id),
  foreign key (checklist_item_id, user_id)
    references public.chapter_checklist_items (id, user_id) on delete cascade
);

create index if not exists checklist_progress_item_idx on public.chapter_checklist_progress (checklist_item_id);

create trigger checklist_progress_touch_updated_at
  before update on public.chapter_checklist_progress
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Lecture records
-- ---------------------------------------------------------------------------

create table if not exists public.lecture_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_subject_id uuid not null,
  user_chapter_id uuid,
  title text not null check (char_length(title) between 1 and 120),
  lecture_number integer check (lecture_number is null or (lecture_number >= 0 and lecture_number <= 1000)),
  source text not null default 'live' check (source in ('live', 'recorded', 'offline', 'coaching', 'other')),
  platform text,
  instructor text,
  lecture_date date not null,
  duration_minutes integer check (duration_minutes is null or (duration_minutes >= 0 and duration_minutes <= 1440)),
  is_completed boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 2000),
  follow_up text check (follow_up is null or char_length(follow_up) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete restrict,
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists lecture_records_user_date_idx on public.lecture_records (user_id, lecture_date desc);
create index if not exists lecture_records_subject_idx on public.lecture_records (user_subject_id);
create index if not exists lecture_records_chapter_idx on public.lecture_records (user_chapter_id);

create trigger lecture_records_touch_updated_at
  before update on public.lecture_records
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Study sessions
-- ---------------------------------------------------------------------------

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_subject_id uuid not null,
  user_chapter_id uuid,
  activity_type text not null check (activity_type in (
    'reading', 'notes', 'concept_review', 'practice', 'board_questions',
    'admission_questions', 'mcq', 'written', 'test', 'other'
  )),
  session_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer not null check (duration_minutes >= 1 and duration_minutes <= 1440),
  focus_rating integer check (focus_rating is null or (focus_rating between 1 and 5)),
  result text check (result is null or char_length(result) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete restrict,
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists study_sessions_user_date_idx on public.study_sessions (user_id, session_date desc);
create index if not exists study_sessions_chapter_idx on public.study_sessions (user_chapter_id);

create trigger study_sessions_touch_updated_at
  before update on public.study_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Revisions
-- ---------------------------------------------------------------------------

create table if not exists public.revision_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_subject_id uuid not null,
  user_chapter_id uuid,
  revised_at date not null,
  method text not null default 'recall' check (method in ('recall', 'notes_reread', 'practice', 'flashcards', 'mock')),
  confidence_rating integer not null check (confidence_rating between 1 and 5),
  questions_attempted integer check (questions_attempted is null or questions_attempted >= 0),
  questions_correct integer check (questions_correct is null or questions_correct >= 0),
  next_review_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (questions_attempted is null or questions_correct is null or questions_correct <= questions_attempted),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete restrict,
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists revision_sessions_user_date_idx on public.revision_sessions (user_id, revised_at desc);
create index if not exists revision_sessions_next_idx on public.revision_sessions (next_review_date);

create trigger revision_sessions_touch_updated_at
  before update on public.revision_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Difficult topics
-- ---------------------------------------------------------------------------

create table if not exists public.topic_difficulties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_subject_id uuid not null,
  user_chapter_id uuid,
  topic_name text not null check (char_length(topic_name) between 1 and 120),
  reason text check (reason is null or char_length(reason) <= 1000),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'working', 'resolved')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 200),
  attempted_solution text check (attempted_solution is null or char_length(attempted_solution) <= 1000),
  corrected_concept text check (corrected_concept is null or char_length(corrected_concept) <= 1000),
  follow_up_date date,
  resolved_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete restrict,
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists topic_difficulties_user_idx on public.topic_difficulties (user_id, status, severity);
create index if not exists topic_difficulties_chapter_idx on public.topic_difficulties (user_chapter_id);

create trigger topic_difficulties_touch_updated_at
  before update on public.topic_difficulties
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Exam results (created before mistake_logs, which may reference an exam)
-- ---------------------------------------------------------------------------

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam_name text not null check (char_length(exam_name) between 1 and 120),
  exam_type text not null default 'school' check (exam_type in ('school', 'coaching', 'board', 'admission', 'mock', 'other')),
  exam_date date not null,
  user_subject_id uuid,
  coverage_note text check (coverage_note is null or char_length(coverage_note) <= 300),
  marks_obtained numeric(6, 2) not null check (marks_obtained >= 0),
  total_marks numeric(6, 2) not null check (total_marks > 0),
  duration_minutes integer check (duration_minutes is null or (duration_minutes >= 0 and duration_minutes <= 600)),
  source text check (source is null or char_length(source) <= 120),
  analysis text check (analysis is null or char_length(analysis) <= 2000),
  strengths text check (strengths is null or char_length(strengths) <= 500),
  weak_areas text check (weak_areas is null or char_length(weak_areas) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (marks_obtained <= total_marks),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id)
);

create index if not exists exam_results_user_date_idx on public.exam_results (user_id, exam_date desc);
create index if not exists exam_results_subject_idx on public.exam_results (user_subject_id);

create trigger exam_results_touch_updated_at
  before update on public.exam_results
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Mistake log
-- ---------------------------------------------------------------------------

create table if not exists public.mistake_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_subject_id uuid not null,
  user_chapter_id uuid,
  exam_result_id uuid references public.exam_results (id) on delete set null,
  category text not null check (category in (
    'concept_gap', 'formula_recall', 'calculation', 'careless_error',
    'time_management', 'question_interpretation', 'incomplete_answer', 'other'
  )),
  question_ref text check (question_ref is null or char_length(question_ref) <= 200),
  what_went_wrong text not null check (char_length(what_went_wrong) between 1 and 1000),
  correction text check (correction is null or char_length(correction) <= 1000),
  occurred_at date not null,
  is_resolved boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete restrict,
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists mistake_logs_user_idx on public.mistake_logs (user_id, occurred_at desc);
create index if not exists mistake_logs_chapter_idx on public.mistake_logs (user_chapter_id);

create trigger mistake_logs_touch_updated_at
  before update on public.mistake_logs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Weekly summaries (deterministic and AI)
-- ---------------------------------------------------------------------------

create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  source text not null check (source in ('deterministic', 'ai')),
  status text not null default 'complete' check (status in ('complete', 'fallback', 'failed')),
  payload jsonb not null,
  provider text,
  model text,
  prompt_version text,
  error_code text,
  created_at timestamptz not null default now(),
  check (week_end >= week_start)
);

create index if not exists weekly_summaries_user_idx on public.weekly_summaries (user_id, week_start desc);
create index if not exists weekly_summaries_created_idx on public.weekly_summaries (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Study tasks
-- ---------------------------------------------------------------------------

create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  description text check (description is null or char_length(description) <= 1000),
  user_subject_id uuid,
  user_chapter_id uuid,
  estimated_minutes integer not null default 30 check (estimated_minutes between 5 and 720),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'blocked', 'cancelled')),
  due_date date,
  planned_date date,
  origin text not null default 'manual' check (origin in ('manual', 'rule', 'ai', 'recovery')),
  source_report_id uuid references public.weekly_summaries (id) on delete set null,
  gap_reason text check (gap_reason is null or char_length(gap_reason) <= 500),
  carried_over_count integer not null default 0 check (carried_over_count >= 0),
  completed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists study_tasks_user_status_idx on public.study_tasks (user_id, status, due_date);
create index if not exists study_tasks_planned_idx on public.study_tasks (user_id, planned_date);
create index if not exists study_tasks_chapter_idx on public.study_tasks (user_chapter_id);

create trigger study_tasks_touch_updated_at
  before update on public.study_tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Resources and notes
-- ---------------------------------------------------------------------------

create table if not exists public.study_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  resource_type text not null default 'link' check (resource_type in ('book', 'pdf', 'video', 'link', 'coaching', 'other')),
  user_subject_id uuid,
  user_chapter_id uuid,
  url text,
  storage_path text,
  description text check (description is null or char_length(description) <= 1000),
  tags text[],
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (url is not null or storage_path is not null or resource_type in ('book', 'coaching', 'other')),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists study_resources_user_idx on public.study_resources (user_id);
create index if not exists study_resources_subject_idx on public.study_resources (user_subject_id);

create trigger study_resources_touch_updated_at
  before update on public.study_resources
  for each row execute function public.touch_updated_at();

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 20000),
  user_subject_id uuid,
  user_chapter_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id),
  foreign key (user_chapter_id, user_id)
    references public.user_chapters (id, user_id) on delete set null (user_chapter_id)
);

create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);

create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Reminder preferences and events
-- ---------------------------------------------------------------------------

create table if not exists public.reminder_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Dhaka',
  reminders_enabled boolean not null default true,
  task_due_enabled boolean not null default true,
  task_overdue_enabled boolean not null default true,
  revision_due_enabled boolean not null default true,
  weekly_planning_enabled boolean not null default true,
  incomplete_goal_enabled boolean not null default false,
  weekly_planning_day integer not null default 5 check (weekly_planning_day between 0 and 6),
  weekly_planning_time text not null default '18:00' check (weekly_planning_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_hours_start text not null default '22:00' check (quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_hours_end text not null default '07:00' check (quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  max_per_day integer not null default 3 check (max_per_day between 1 and 20),
  channel text not null default 'in_app' check (channel in ('in_app', 'local_notification')),
  updated_at timestamptz not null default now()
);

create trigger reminder_preferences_touch_updated_at
  before update on public.reminder_preferences
  for each row execute function public.touch_updated_at();

create table if not exists public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reminder_key text not null,
  reminder_type text not null check (reminder_type in ('task_due', 'task_overdue', 'revision_due', 'weekly_planning', 'incomplete_goal')),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'skipped')),
  channel text not null default 'in_app' check (channel in ('in_app', 'local_notification')),
  title text not null,
  body text not null,
  related_entity_type text,
  related_entity_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  unique (user_id, reminder_key)
);

create index if not exists reminder_events_user_idx on public.reminder_events (user_id, scheduled_for);

-- ---------------------------------------------------------------------------
-- Audit log (immutable to the client)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete', 'undo')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_user_idx on public.audit_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- New-user provisioning
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Student'
    )
  )
  on conflict (id) do nothing;

  insert into public.reminder_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.curriculum_subjects enable row level security;
alter table public.curriculum_chapters enable row level security;
alter table public.user_subjects enable row level security;
alter table public.user_chapters enable row level security;
alter table public.chapter_checklist_items enable row level security;
alter table public.chapter_checklist_progress enable row level security;
alter table public.lecture_records enable row level security;
alter table public.study_sessions enable row level security;
alter table public.revision_sessions enable row level security;
alter table public.topic_difficulties enable row level security;
alter table public.mistake_logs enable row level security;
alter table public.exam_results enable row level security;
alter table public.study_tasks enable row level security;
alter table public.study_resources enable row level security;
alter table public.notes enable row level security;
alter table public.weekly_summaries enable row level security;
alter table public.reminder_preferences enable row level security;
alter table public.reminder_events enable row level security;
alter table public.audit_events enable row level security;

-- Profiles: own row only
create policy "profiles select own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles delete own" on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

-- Curriculum: read-only reference data for signed-in users
create policy "curriculum versions readable" on public.curriculum_versions
  for select to authenticated using (true);
create policy "curriculum subjects readable" on public.curriculum_subjects
  for select to authenticated using (true);
create policy "curriculum chapters readable" on public.curriculum_chapters
  for select to authenticated using (true);

-- User-owned tables: full CRUD, always scoped to the authenticated user
create policy "user_subjects select own" on public.user_subjects
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_subjects insert own" on public.user_subjects
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_subjects update own" on public.user_subjects
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_subjects delete own" on public.user_subjects
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "user_chapters select own" on public.user_chapters
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_chapters insert own" on public.user_chapters
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_chapters update own" on public.user_chapters
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_chapters delete own" on public.user_chapters
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "checklist items select own" on public.chapter_checklist_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "checklist items insert own" on public.chapter_checklist_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "checklist items update own" on public.chapter_checklist_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "checklist items delete own" on public.chapter_checklist_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "checklist progress select own" on public.chapter_checklist_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy "checklist progress insert own" on public.chapter_checklist_progress
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "checklist progress update own" on public.chapter_checklist_progress
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "checklist progress delete own" on public.chapter_checklist_progress
  for delete to authenticated using (user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'lecture_records', 'study_sessions', 'revision_sessions', 'topic_difficulties',
    'mistake_logs', 'exam_results', 'study_tasks', 'study_resources', 'notes',
    'weekly_summaries', 'reminder_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || ' select own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || ' insert own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || ' update own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || ' delete own', t
    );
  end loop;
end;
$$;

create policy "reminder preferences select own" on public.reminder_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "reminder preferences insert own" on public.reminder_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reminder preferences update own" on public.reminder_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reminder preferences delete own" on public.reminder_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- Audit log: append-only for the client
create policy "audit select own" on public.audit_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "audit insert own" on public.audit_events
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies)
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select on public.curriculum_versions, public.curriculum_subjects, public.curriculum_chapters to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.user_subjects,
  public.user_chapters,
  public.chapter_checklist_items,
  public.chapter_checklist_progress,
  public.lecture_records,
  public.study_sessions,
  public.revision_sessions,
  public.topic_difficulties,
  public.mistake_logs,
  public.exam_results,
  public.study_tasks,
  public.study_resources,
  public.notes,
  public.weekly_summaries,
  public.reminder_preferences,
  public.reminder_events
to authenticated;

grant select, insert on public.audit_events to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket for future file notes (per-user folder policies)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('study-files', 'study-files', false)
on conflict (id) do nothing;

create policy "study files read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "study files insert own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "study files update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "study files delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
