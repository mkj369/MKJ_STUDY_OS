-- ============================================================================
-- DEMO curriculum (structure sample only — NOT official NCTB content)
-- ============================================================================
-- IDs match src/services/seed/demoCurriculum.ts so local demo mode and cloud
-- mode reference identical rows.
--
-- Everything here is marked is_demo = true and verification_status =
-- 'needs_verification'. The UI labels it as demo and the app never presents it
-- as an official syllabus. Replace with verified data via the CSV/JSON import
-- flow or your own migration once you have a trustworthy source.

insert into public.curriculum_versions (
  id, authority, country, education_level, class_grade, stream, academic_year,
  version_label, title, source_url, verification_status, is_demo
) values (
  'd0000000-0000-4000-8000-000000000001',
  'MKJ StudyOS demo',
  'Bangladesh',
  'HSC',
  'Class 11–12',
  'Science',
  '2025–2026',
  'demo-v1',
  'Demo HSC Science structure (not official NCTB content)',
  null,
  'needs_verification',
  true
) on conflict (id) do nothing;

insert into public.curriculum_subjects
  (id, curriculum_version_id, name, paper_label, code, is_compulsory, sort_order)
values
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001', 'Physics', '1st Paper', 'PHY-1st', false, 1),
  ('d0000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000001', 'Physics', '2nd Paper', 'PHY-2nd', false, 2),
  ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000001', 'Chemistry', '1st Paper', 'CHE-1st', false, 3),
  ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000001', 'Chemistry', '2nd Paper', 'CHE-2nd', false, 4),
  ('d0000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000001', 'Higher Mathematics', '1st Paper', 'HIG-1st', false, 5),
  ('d0000000-0000-4000-8000-000000000106', 'd0000000-0000-4000-8000-000000000001', 'Biology', '1st Paper', 'BIO-1st', false, 6),
  ('d0000000-0000-4000-8000-000000000107', 'd0000000-0000-4000-8000-000000000001', 'ICT', null, 'ICT-GEN', true, 7),
  ('d0000000-0000-4000-8000-000000000108', 'd0000000-0000-4000-8000-000000000001', 'Bangla', '1st Paper', 'BAN-1st', true, 8),
  ('d0000000-0000-4000-8000-000000000109', 'd0000000-0000-4000-8000-000000000001', 'English', '1st Paper', 'ENG-1st', true, 9)
on conflict (id) do nothing;

insert into public.curriculum_chapters
  (id, curriculum_subject_id, title, chapter_number, sort_order, verification_status, is_demo)
values
  ('d0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000101', 'Demo chapter 1 — mechanics', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000202', 'd0000000-0000-4000-8000-000000000101', 'Demo chapter 2 — waves', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000203', 'd0000000-0000-4000-8000-000000000102', 'Demo chapter 1 — electricity', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000204', 'd0000000-0000-4000-8000-000000000102', 'Demo chapter 2 — modern physics', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000205', 'd0000000-0000-4000-8000-000000000103', 'Demo chapter 1 — atomic structure', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000206', 'd0000000-0000-4000-8000-000000000103', 'Demo chapter 2 — bonding', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000207', 'd0000000-0000-4000-8000-000000000104', 'Demo chapter 1 — organic chemistry', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000208', 'd0000000-0000-4000-8000-000000000104', 'Demo chapter 2 — quantitative chemistry', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000209', 'd0000000-0000-4000-8000-000000000105', 'Demo chapter 1 — limits', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000210', 'd0000000-0000-4000-8000-000000000105', 'Demo chapter 2 — differentiation', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000211', 'd0000000-0000-4000-8000-000000000106', 'Demo chapter 1 — cell biology', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000212', 'd0000000-0000-4000-8000-000000000106', 'Demo chapter 2 — genetics', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000213', 'd0000000-0000-4000-8000-000000000107', 'Demo chapter 1 — ICT systems', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000214', 'd0000000-0000-4000-8000-000000000107', 'Demo chapter 2 — networking', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000215', 'd0000000-0000-4000-8000-000000000108', 'Demo chapter 1 — prose', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000216', 'd0000000-0000-4000-8000-000000000108', 'Demo chapter 2 — poetry', '2', 2, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000217', 'd0000000-0000-4000-8000-000000000109', 'Demo chapter 1 — reading skills', '1', 1, 'needs_verification', true),
  ('d0000000-0000-4000-8000-000000000218', 'd0000000-0000-4000-8000-000000000109', 'Demo chapter 2 — writing skills', '2', 2, 'needs_verification', true)
on conflict (id) do nothing;
