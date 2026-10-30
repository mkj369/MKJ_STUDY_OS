-- ---------------------------------------------------------------------------
-- 0019 — the study group a student picked during onboarding.
--
-- WHY
--   Class 1–12 landed in 0018. The group (Science / Humanities / Business
--   Studies) only exists for Classes 9–12, and it decides which official
--   template list is relevant. It belongs on the profile, next to active_class,
--   and it is a view preference: switching it never moves or deletes a subject.
--
-- SAFETY
--   Additive only. Existing rows keep working with `active_group = null`, which
--   the app reads as "no group filter". The CHECK accepts nothing but the three
--   real groups or null, so a typo cannot reach the client.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists active_group text;

alter table public.profiles
  drop constraint if exists profiles_active_group_check;
alter table public.profiles
  add constraint profiles_active_group_check
  check (active_group is null or active_group in ('science', 'humanities', 'business_studies'));

comment on column public.profiles.active_group is
  'science | humanities | business_studies, only meaningful for Classes 9–12. Null means no group filter.';

-- A student can switch class without losing anything: subjects keep their own
-- class_level, and this index keeps that lookup cheap.
create index if not exists user_subjects_user_class_idx
  on public.user_subjects (user_id, class_level);
