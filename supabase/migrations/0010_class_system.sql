-- ---------------------------------------------------------------------------
-- 0010 — Complete academic class system + skipped chapter status
--
-- Sections: Class 1–5, Class 6–8, SSC, HSC, HSC Admission.
--   * class_1_5 / class_6_8 store a specific class_level ("Class 3").
--   * hsc_admission may store a free-text admission_target ("DU A-unit").
--   * Admission still reuses HSC curriculum rows — nothing duplicated.
--
-- Chapter status gains 'skipped': explicitly out of the student's plan.
-- The app excludes skipped chapters from completion denominators.
--
-- DATA SAFETY
--   * Additive columns; legacy rows keep working (null = not set).
--   * Constraint widen only — every existing value stays valid.
--   * Idempotent: safe to run twice.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists class_level text,
  add column if not exists admission_target text;

comment on column public.profiles.class_level is
  'Specific class for school tracks (Class 1–8). Null for SSC/HSC/Admission.';
comment on column public.profiles.admission_target is
  'Optional admission goal for the HSC Admission track, e.g. "DU A-unit". Free text; never verified claims.';

-- Widen the track check (0008 created it with 3 values; now 5).
alter table public.profiles
  drop constraint if exists profiles_academic_track_check;
alter table public.profiles
  add constraint profiles_academic_track_check
  check (academic_track is null or academic_track in ('class_1_5', 'class_6_8', 'ssc', 'hsc', 'hsc_admission'));

comment on column public.profiles.academic_track is
  'Class 1–5 / Class 6–8 / SSC / HSC / HSC Admission. Admission reuses the HSC curriculum rows; no syllabus duplication.';

-- Community snapshots may show any of the five sections (still opt-in).
alter table public.community_profiles
  drop constraint if exists community_profiles_academic_track_check;
alter table public.community_profiles
  add constraint community_profiles_academic_track_check
  check (academic_track is null or academic_track in ('class_1_5', 'class_6_8', 'ssc', 'hsc', 'hsc_admission'));

-- Widen chapter status with 'skipped'. The 0001 check is unnamed-inline;
-- find and drop it by definition, then add a named one.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.user_chapters'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%not_recorded%'
  loop
    execute format('alter table public.user_chapters drop constraint %I', con.conname);
  end loop;
end
$$;

alter table public.user_chapters
  drop constraint if exists user_chapters_status_check;
alter table public.user_chapters
  add constraint user_chapters_status_check
  check (status in ('not_recorded', 'not_started', 'in_progress', 'needs_practice', 'needs_revision', 'blocked', 'complete', 'skipped'));

comment on column public.user_chapters.status is
  'Declared status. skipped = out of the student''s plan; excluded from completion denominators in the app.';
