-- ---------------------------------------------------------------------------
-- 0014 — Topic records: the columns a source-backed topic list actually needs
--
-- WHY THIS EXISTS
--   `curriculum_topics` (0003) was built for demo content and has exactly what
--   a demo needs: a title and a sort order. A topic list transcribed from a
--   textbook needs three more things, and without them "we have 0 topics" can
--   never become "we have N topics we can defend":
--
--   1. `topic_number` — the number the book prints (১.১, ১.২, 1.1 …). The
--      natural key today is (chapter, title), which cannot tell a missed
--      section from a re-worded heading, and cannot prove the list is
--      unbroken. Chapters already have `chapter_number` for exactly this
--      reason; topics were the gap.
--   2. `source_page` — the printed page the section starts on. "Retain page
--      references where possible" is not possible without a column.
--   3. `source_document` — which file the row came from, matching the columns
--      chapters already carry since 0008.
--
--   Nothing is backfilled and nothing is deleted: the eight demo topics keep
--   null numbers and null pages, which is the truth about them.
--
-- WHAT THIS IS NOT
--   No topic rows are added. The topic count stays at 0 official topics; this
--   migration only makes a defensible topic import possible.
-- ---------------------------------------------------------------------------

alter table public.curriculum_topics
  add column if not exists topic_number text,
  add column if not exists source_page integer,
  add column if not exists source_document text;

-- A page reference is either absent or a real page. 0 and negatives are how a
-- placeholder sneaks into a source column and later reads as evidence.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'curriculum_topics_source_page_positive'
      and conrelid = 'public.curriculum_topics'::regclass
  ) then
    alter table public.curriculum_topics
      add constraint curriculum_topics_source_page_positive
      check (source_page is null or source_page > 0);
  end if;
end
$$;

-- The printed section number is unique inside a chapter. Partial index, like
-- chapters: a topic with no number is still storable, it just cannot be
-- de-duplicated by one.
create unique index if not exists curriculum_topics_chapter_number_key
  on public.curriculum_topics (curriculum_chapter_id, topic_number)
  where topic_number is not null;

comment on column public.curriculum_topics.topic_number is
  'Section number as printed in the book (১.১, 2.3). Null for demo or custom topics. Natural key for idempotent topic imports.';
comment on column public.curriculum_topics.source_page is
  'Printed page the section starts on. Null when the source did not carry a page number. Never a placeholder.';
