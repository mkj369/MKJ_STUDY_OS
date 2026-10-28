-- ============================================================================
-- RLS cross-user isolation tests
-- ============================================================================
-- Run against a LOCAL Supabase database after migrations:
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls.test.sql
--
-- The script creates two temporary auth users, exercises reads/writes as each
-- user with `set local role authenticated` + JWT claims, raises an exception on
-- any violation, and rolls back everything at the end.
-- ============================================================================

begin;

-- Deterministic test users (removed by rollback at the end).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-user-a@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"User A"}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-user-b@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"User B"}', now(), now())
on conflict (id) do nothing;

-- The auth trigger must have provisioned profiles and reminder preferences.
do $$
begin
  if not exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL: profile was not provisioned for user A';
  end if;
  if not exists (select 1 from public.reminder_preferences where user_id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL: reminder preferences were not provisioned for user B';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- User A creates a subject + chapter + lecture.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

insert into public.user_subjects (id, curriculum_subject_id, curriculum_version_id, color)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'd0000000-0000-4000-8000-000000000101',
  'd0000000-0000-4000-8000-000000000001',
  '#0f5132'
);

insert into public.user_chapters (id, user_subject_id, curriculum_chapter_id, curriculum_version_id)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'd0000000-0000-4000-8000-000000000201',
  'd0000000-0000-4000-8000-000000000001'
);

insert into public.lecture_records (user_subject_id, user_chapter_id, title, lecture_date)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'A private lecture', current_date);

do $$
declare
  visible int;
begin
  select count(*) into visible from public.lecture_records;
  if visible <> 1 then
    raise exception 'FAIL: user A cannot see their own lecture (saw %)', visible;
  end if;
  if not exists (select 1 from public.curriculum_versions where is_demo) then
    raise exception 'FAIL: authenticated user cannot read curriculum reference data';
  end if;
end;
$$;

-- Curriculum writes must be denied to normal users.
do $$
begin
  begin
    insert into public.curriculum_versions (authority, country, education_level, class_grade, academic_year, version_label, title)
    values ('attacker', 'Bangladesh', 'HSC', 'Class 12', '2030', 'x', 'Injected');
    raise exception 'FAIL: curriculum write was allowed for a normal user';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- User B cannot read or modify A's rows.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

do $$
declare
  visible int;
begin
  select count(*) into visible from public.user_subjects;
  if visible <> 0 then raise exception 'FAIL: user B can read user A subjects (%)', visible; end if;

  select count(*) into visible from public.lecture_records;
  if visible <> 0 then raise exception 'FAIL: user B can read user A lectures (%)', visible; end if;

  select count(*) into visible from public.profiles where id = '11111111-1111-4111-8111-111111111111';
  if visible <> 0 then raise exception 'FAIL: user B can read user A profile'; end if;

  -- Cannot update A's lecture through the API.
  update public.lecture_records set title = 'hijacked';
  if found then raise exception 'FAIL: user B updated user A lecture'; end if;

  -- Cannot delete A's subject.
  delete from public.user_subjects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if found then raise exception 'FAIL: user B deleted user A subject'; end if;
end;
$$;

-- Forging another user's id must fail the WITH CHECK clause.
do $$
begin
  begin
    insert into public.user_subjects (user_id, custom_name, curriculum_subject_id)
    values ('11111111-1111-4111-8111-111111111111', 'forged', null);
    raise exception 'FAIL: user B inserted a row owned by user A';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
end;
$$;

-- Referencing A's subject from B's lecture must fail the composite FK.
do $$
begin
  begin
    insert into public.lecture_records (user_subject_id, title, lecture_date)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'stolen link', current_date);
    raise exception 'FAIL: user B linked a lecture to user A subject';
  exception
    when foreign_key_violation then null;
    when insufficient_privilege then null;
  end;
end;
$$;

-- B's own rows still work (RLS is not simply blocking everything).
insert into public.user_subjects (custom_name, color) values ('B subject', '#1d4ed8');
insert into public.study_tasks (title, estimated_minutes)
values ('B task', 30);

do $$
declare
  subjects int;
  tasks int;
begin
  select count(*) into subjects from public.user_subjects;
  if subjects <> 1 then raise exception 'FAIL: user B should see exactly 1 own subject (%)', subjects; end if;
  select count(*) into tasks from public.study_tasks;
  if tasks <> 1 then raise exception 'FAIL: user B should see exactly 1 own task (%)', tasks; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deletion behaviour: chapter delete unlinks records, subject delete is blocked
-- while linked records exist.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

delete from public.user_chapters where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';

do $$
declare
  chapter_link uuid;
  lecture_count int;
begin
  select user_chapter_id into chapter_link from public.lecture_records where title = 'A private lecture';
  select count(*) into lecture_count from public.lecture_records where title = 'A private lecture';
  if lecture_count <> 1 then raise exception 'FAIL: deleting a chapter deleted the lecture record'; end if;
  if chapter_link is not null then raise exception 'FAIL: chapter link was not cleared'; end if;
end;
$$;

do $$
begin
  begin
    delete from public.user_subjects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL: subject with linked records was deleted';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

-- Checklist ownership chain: progress rows cannot point at another user's item.
insert into public.user_subjects (custom_name, color) values ('A second subject', '#b45309');
insert into public.user_chapters (id, user_subject_id, custom_title)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac', id, 'A chapter'
from public.user_subjects where custom_name = 'A second subject';
insert into public.chapter_checklist_items (id, user_chapter_id, kind, label)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac', 'reading', 'Main book');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.chapter_checklist_progress (checklist_item_id, is_done)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad', true);
    raise exception 'FAIL: user B wrote progress for user A checklist item';
  exception
    when foreign_key_violation then null;
    when insufficient_privilege then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log is append-only for users.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.audit_events (entity_type, entity_id, action) values ('study_tasks', gen_random_uuid(), 'create');
  begin
    update public.audit_events set action = 'delete';
    raise exception 'FAIL: audit events were mutable by a user';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
end;
$$;

reset role;

do $$
begin
  raise notice 'RLS tests passed: cross-user isolation, forged ownership, composite foreign keys, chapter unlinking, subject delete restriction, audit immutability.';
end;
$$;

rollback;
