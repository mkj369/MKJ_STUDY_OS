-- ---------------------------------------------------------------------------
-- 0006 — curriculum provenance
--
-- Adds the metadata the curriculum review needs, without touching any student
-- record:
--   * `scope` distinguishes a full textbook table of contents from an
--     exam-only (revised/"short") syllabus or a bare subject structure. These
--     are different artefacts and must never be presented as the same thing.
--   * `source_checked_at` / `source_note` record when and how a human last
--     compared the rows with the cited source.
--   * subjects gain their own verification status, because a version can be
--     partially checked (subject list confirmed, chapter list not).
--
-- Every statement is idempotent: `add column if not exists` plus guarded
-- constraint creation, so re-running the migration set stays safe.
-- ---------------------------------------------------------------------------

alter table public.curriculum_versions
  add column if not exists scope text,
  add column if not exists source_checked_at date,
  add column if not exists source_note text;

-- Legacy rows predate `scope`. Default them to the honest reading:
-- unknown provenance is treated as a subject structure, not a full textbook.
update public.curriculum_versions
  set scope = 'subject_structure'
  where scope is null;

alter table public.curriculum_versions
  alter column scope set default 'subject_structure';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'curriculum_versions_scope_check'
      and conrelid = 'public.curriculum_versions'::regclass
  ) then
    alter table public.curriculum_versions
      add constraint curriculum_versions_scope_check
      check (scope in ('textbook', 'exam_syllabus', 'subject_structure'));
  end if;
end
$$;

alter table public.curriculum_subjects
  add column if not exists verification_status text,
  add column if not exists source_url text;

update public.curriculum_subjects
  set verification_status = 'needs_verification'
  where verification_status is null;

alter table public.curriculum_subjects
  alter column verification_status set default 'needs_verification';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'curriculum_subjects_verification_status_check'
      and conrelid = 'public.curriculum_subjects'::regclass
  ) then
    alter table public.curriculum_subjects
      add constraint curriculum_subjects_verification_status_check
      check (verification_status in ('draft', 'needs_verification', 'verified', 'retired'));
  end if;
end
$$;

-- Filtering the picker by level → group → year is the common path.
create index if not exists curriculum_versions_level_group_idx
  on public.curriculum_versions (education_level, stream, academic_year);

-- Curriculum reference data stays readable by any signed-in student and is
-- never writable from the client; the policies below restate that so a later
-- migration cannot silently widen it.
drop policy if exists "curriculum versions readable" on public.curriculum_versions;
create policy "curriculum versions readable" on public.curriculum_versions
  for select to authenticated using (true);

drop policy if exists "curriculum subjects readable" on public.curriculum_subjects;
create policy "curriculum subjects readable" on public.curriculum_subjects
  for select to authenticated using (true);
