-- ============================================================================
-- Demo syllabus topics (structure sample only — NOT official NCTB content)
-- ============================================================================
-- Two topics per demo chapter, so the Syllabus Tracker can demonstrate the
-- topic layer. Everything is is_demo = true and needs_verification, matching
-- 0002_demo_curriculum.sql.

insert into public.curriculum_topics
  (id, curriculum_chapter_id, title, sort_order, verification_status, is_demo)
values
  ('d0000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000201', 'Demo topic — scalars and vectors', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000302', 'd0000000-0000-4000-8000-000000000201', 'Demo topic — equations of motion', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000303', 'd0000000-0000-4000-8000-000000000202', 'Demo topic — wave properties', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000304', 'd0000000-0000-4000-8000-000000000202', 'Demo topic — superposition', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000305', 'd0000000-0000-4000-8000-000000000203', 'Demo topic — current and resistance', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000306', 'd0000000-0000-4000-8000-000000000205', 'Demo topic — atomic models', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000307', 'd0000000-0000-4000-8000-000000000207', 'Demo topic — functional groups', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000308', 'd0000000-0000-4000-8000-000000000209', 'Demo topic — limit rules', 1, 'needs_verification', true)
on conflict (id) do nothing;
