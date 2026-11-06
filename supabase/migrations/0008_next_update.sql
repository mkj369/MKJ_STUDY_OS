-- ============================================================================
-- 0008 — Next update: academic setup, targets, lecture checklists, community
-- ============================================================================
-- Additive only. No existing column is dropped or retyped; v1 rows keep their
-- ids and progress. Every statement is idempotent (safe to re-apply).
--
-- New surfaces:
--   * profiles: academic track / group / session / board + setup gate
--   * study_targets: weekly & monthly goals (progress computed client-side)
--   * lecture_checklist_items: per-lecture configurable checklist
--   * community_profiles: opt-in pseudonymous progress snapshot (default private)
--   * user_preferences: theme + UI preferences
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Profiles: academic setup (additive; legacy rows stay valid)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists academic_track text,
  add column if not exists study_group text,
  add column if not exists academic_session text,
  add column if not exists board text,
  add column if not exists setup_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_academic_track_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_academic_track_check
      check (academic_track is null or academic_track in ('ssc', 'hsc', 'hsc_admission'));
  end if;
end
$$;

comment on column public.profiles.academic_track is
  'SSC / HSC / HSC Admission. Admission reuses the HSC curriculum rows; no syllabus duplication.';
comment on column public.profiles.setup_completed_at is
  'Set when syllabus setup finishes. Null = tracker shows the setup wizard.';

-- Chapter-level free notes (checklist items already have their own notes).
alter table public.user_chapters
  add column if not exists notes text;

comment on column public.user_chapters.notes is
  'Student-authored chapter notes. Private: own-RLS only, never shared.';

-- ---------------------------------------------------------------------------
-- Study targets (weekly / monthly)
-- ---------------------------------------------------------------------------

create table if not exists public.study_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  metric text not null check (metric in ('chapters', 'checklist_items', 'lectures', 'minutes')),
  target_value integer not null check (target_value > 0 and target_value <= 100000),
  user_subject_id uuid,
  chapter_ids jsonb not null default '[]'::jsonb,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_targets_subject_owner_fk
    foreign key (user_subject_id, user_id)
    references public.user_subjects (id, user_id) on delete set null (user_subject_id)
);

create index if not exists study_targets_user_period_idx
  on public.study_targets (user_id, period_type, period_start);

drop trigger if exists study_targets_touch_updated_at on public.study_targets;
create trigger study_targets_touch_updated_at
  before update on public.study_targets
  for each row execute function public.touch_updated_at();

alter table public.study_targets enable row level security;

drop policy if exists "study targets select own" on public.study_targets;
create policy "study targets select own" on public.study_targets
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "study targets insert own" on public.study_targets;
create policy "study targets insert own" on public.study_targets
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "study targets update own" on public.study_targets;
create policy "study targets update own" on public.study_targets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "study targets delete own" on public.study_targets;
create policy "study targets delete own" on public.study_targets
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Lecture checklist items
-- ---------------------------------------------------------------------------

-- Composite FK target: a checklist item may only reference a lecture its own
-- user owns. lecture_records predates this pattern, so add the unique pair.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lecture_records_id_user_unique') then
    alter table public.lecture_records add constraint lecture_records_id_user_unique unique (id, user_id);
  end if;
end;
$$;

create table if not exists public.lecture_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_record_id uuid not null,
  label text not null check (char_length(label) between 1 and 120),
  sort_order integer not null default 0,
  is_done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lecture_checklist_lecture_owner_fk
    foreign key (lecture_record_id, user_id)
    references public.lecture_records (id, user_id) on delete cascade
);

create index if not exists lecture_checklist_lecture_idx
  on public.lecture_checklist_items (lecture_record_id, sort_order);

drop trigger if exists lecture_checklist_items_touch_updated_at on public.lecture_checklist_items;
create trigger lecture_checklist_items_touch_updated_at
  before update on public.lecture_checklist_items
  for each row execute function public.touch_updated_at();

alter table public.lecture_checklist_items enable row level security;

drop policy if exists "lecture checklist select own" on public.lecture_checklist_items;
create policy "lecture checklist select own" on public.lecture_checklist_items
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "lecture checklist insert own" on public.lecture_checklist_items;
create policy "lecture checklist insert own" on public.lecture_checklist_items
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "lecture checklist update own" on public.lecture_checklist_items;
create policy "lecture checklist update own" on public.lecture_checklist_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "lecture checklist delete own" on public.lecture_checklist_items;
create policy "lecture checklist delete own" on public.lecture_checklist_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Community profiles (opt-in, pseudonymous, aggregate only)
-- ---------------------------------------------------------------------------

create table if not exists public.community_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pseudonym text not null check (char_length(pseudonym) between 2 and 40),
  academic_track text check (academic_track is null or academic_track in ('ssc', 'hsc', 'hsc_admission')),
  study_group text,
  sharing_enabled boolean not null default false,
  share_academic_info boolean not null default false,
  overall_percent integer not null default 0 check (overall_percent between 0 and 100),
  chapters_completed integer not null default 0 check (chapters_completed >= 0),
  chapters_total integer not null default 0 check (chapters_total >= 0),
  weekly_minutes integer not null default 0 check (weekly_minutes >= 0),
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.community_profiles is
  'Opt-in public snapshot. No email, notes, locations or per-chapter records. Default private (sharing_enabled=false).';

drop trigger if exists community_profiles_touch_updated_at on public.community_profiles;
create trigger community_profiles_touch_updated_at
  before update on public.community_profiles
  for each row execute function public.touch_updated_at();

alter table public.community_profiles enable row level security;

-- A row is visible to others ONLY while its owner keeps sharing on.
drop policy if exists "community profiles select shared or own" on public.community_profiles;
create policy "community profiles select shared or own" on public.community_profiles
  for select to authenticated
  using (sharing_enabled = true or user_id = (select auth.uid()));
drop policy if exists "community profiles insert own" on public.community_profiles;
create policy "community profiles insert own" on public.community_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "community profiles update own" on public.community_profiles;
create policy "community profiles update own" on public.community_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "community profiles delete own" on public.community_profiles;
create policy "community profiles delete own" on public.community_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- User preferences (theme, UI flags)
-- ---------------------------------------------------------------------------

create table if not exists public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  community_opt_in_seen boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists user_preferences_touch_updated_at on public.user_preferences;
create trigger user_preferences_touch_updated_at
  before update on public.user_preferences
  for each row execute function public.touch_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists "user preferences select own" on public.user_preferences;
create policy "user preferences select own" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "user preferences insert own" on public.user_preferences;
create policy "user preferences insert own" on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "user preferences update own" on public.user_preferences;
create policy "user preferences update own" on public.user_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "user preferences delete own" on public.user_preferences;
create policy "user preferences delete own" on public.user_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (RLS still gates every row; grants only open the table to the role)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.study_targets,
  public.lecture_checklist_items,
  public.community_profiles,
  public.user_preferences
to authenticated;
