-- 0005 — link a mistake to the practice question it came from.
--
-- Phase 2 (0003) added practice questions and attempts. A mistake could only carry a
-- free-text question reference, so the mistake book could not open the question that
-- produced it. The link is optional: mistakes logged from an exam, a class or a book
-- stay valid without it.
--
-- Ownership is enforced in the database with a composite foreign key (id, user_id),
-- exactly like practice_attempts, so a student cannot attach another student's
-- question to their own mistake row.

alter table public.mistake_logs
  add column if not exists practice_question_id uuid;

alter table public.mistake_logs
  drop constraint if exists mistake_logs_practice_question_fk;

alter table public.mistake_logs
  add constraint mistake_logs_practice_question_fk
  foreign key (practice_question_id, user_id)
    references public.practice_questions (id, user_id)
    on delete set null (practice_question_id);

create index if not exists mistake_logs_practice_question_idx
  on public.mistake_logs (practice_question_id)
  where practice_question_id is not null;

comment on column public.mistake_logs.practice_question_id is
  'Optional link to the practice question this mistake came from. NULL = logged from another source.';
