-- ---------------------------------------------------------------------------
-- 0018 — Classes 1–12, student-owned subjects and generated chapters.
--
-- WHY
--   The curriculum was modelled as "official versions, one per academic year",
--   and every student subject had to hang off one of those versions. That works
--   for imported official data and is hopeless for the thing students actually
--   do: pick their class, add Physics, generate twelve chapters, rename them.
--
--   This migration keeps the official model intact and adds the small amount of
--   structure the personal model needs. Nothing is dropped, nothing is recreated,
--   and no existing row changes identity.
--
-- THE OWNERSHIP SPLIT (explicit, because it is a security property)
--   curriculum_*   shared reference data. Read-only to students. Seeded.
--   user_*         owned by one student, RLS-scoped on user_id. One student's
--                  subject, chapter, colour or theme can never alter another's.
--   profiles       one row per student; now also carries theme preferences.
--
-- WHAT IS ADDED
--   user_subjects.class_level   1–12, nullable for rows created before this
--                               migration (they keep working, grouped as
--                               "unassigned" until the student moves them).
--   user_chapters.chapter_number, chapter_title_bn, sort_order
--                               so a generated chapter can be numbered, titled
--                               and reordered without touching curriculum rows.
--   profiles.theme_mode, theme_preset, theme_accent
--                               per-user appearance. Never global.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Class level on student subjects
-- ---------------------------------------------------------------------------

alter table public.user_subjects
  add column if not exists class_level integer;

-- A personal subject can carry a Bengali name. Official subjects already have
-- one on the curriculum row; this column is for subjects the student typed.
alter table public.user_subjects
  add column if not exists name_bn text;

-- Any value outside 1–12 is a bug, not a level. Same guard as the app.
alter table public.user_subjects
  drop constraint if exists user_subjects_class_level_check;
alter table public.user_subjects
  add constraint user_subjects_class_level_check
  check (class_level is null or (class_level between 1 and 12));

comment on column public.user_subjects.class_level is
  '1–12. Null only for rows created before 0018; the UI groups those as unassigned rather than guessing a class.';

create index if not exists user_subjects_class_idx
  on public.user_subjects (user_id, class_level, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Student-owned chapter numbering and titles
-- ---------------------------------------------------------------------------

alter table public.user_chapters
  add column if not exists chapter_number integer;

alter table public.user_chapters
  add column if not exists chapter_title_bn text;

alter table public.user_chapters
  add column if not exists sort_order integer not null default 0;

comment on column public.user_chapters.chapter_number is
  'Student-visible number. Copied from the official chapter when one is attached, otherwise generated 1..N. Renaming never changes it unless the student asks.';
comment on column public.user_chapters.chapter_title_bn is
  'Optional Bengali title the student typed. Never machine-translated, never inferred.';
comment on column public.user_chapters.sort_order is
  'Manual order. Reordering rewrites this column only, so progress and history stay attached to the same row.';

create index if not exists user_chapters_subject_order_idx
  on public.user_chapters (user_subject_id, sort_order, chapter_number);

-- Backfill existing rows from whatever they already point at, so a student who
-- adopted official chapters before this migration sees the same numbering they
-- saw yesterday. Purely additive: no row is inserted, updated-in-place is safe
-- to re-run because it is idempotent by construction.
update public.user_chapters uc
   set chapter_number = coalesce(uc.chapter_number, cc.chapter_number::integer)
  from public.curriculum_chapters cc
 where cc.id = uc.curriculum_chapter_id
   and uc.chapter_number is null
   and cc.chapter_number ~ '^[0-9]+$';

update public.user_chapters
   set sort_order = coalesce(nullif(sort_order, 0), chapter_number, 0)
 where sort_order = 0;

-- ---------------------------------------------------------------------------
-- 3. Per-student appearance
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists theme_mode text not null default 'system';

alter table public.profiles
  add column if not exists theme_preset text not null default 'sky';

alter table public.profiles
  add column if not exists theme_accent text;

alter table public.profiles
  drop constraint if exists profiles_theme_mode_check;
alter table public.profiles
  add constraint profiles_theme_mode_check
  check (theme_mode in ('light', 'dark', 'system'));

-- An accent override is a hex colour or nothing. Rejecting anything else here
-- means a bad value cannot reach a CSS custom property on the client.
alter table public.profiles
  drop constraint if exists profiles_theme_accent_check;
alter table public.profiles
  add constraint profiles_theme_accent_check
  check (theme_accent is null or theme_accent ~ '^#[0-9a-fA-F]{6}$');

comment on column public.profiles.theme_mode is
  'light | dark | system. Stored per user so appearance follows the student, not the device.';
comment on column public.profiles.theme_preset is
  'Palette key (sky, ocean, violet, …). The client maps it to CSS variables; the database only stores the choice.';

-- The old green colour was baked into every subject row's default. New subjects
-- should start neutral and inherit the active accent instead of fighting it.
alter table public.user_subjects
  alter column color set default '#38BDF8';

-- ---------------------------------------------------------------------------
-- 4. Active class on the profile
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists active_class integer;

alter table public.profiles
  drop constraint if exists profiles_active_class_check;
alter table public.profiles
  add constraint profiles_active_class_check
  check (active_class is null or (active_class between 1 and 12));

comment on column public.profiles.active_class is
  'The class the curriculum screen opens on. Purely a view preference — switching it never deletes anything.';
