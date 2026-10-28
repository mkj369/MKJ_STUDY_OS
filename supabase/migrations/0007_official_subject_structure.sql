-- ---------------------------------------------------------------------------
-- 0007 — SSC / HSC official subject structure (NCTB)
--
-- WHAT THIS INSERTS
--   Six curriculum versions — SSC and HSC × Science, Humanities, Business
--   Studies — with the official subject names in English and Bangla, and the
--   compulsory/elective flag. 70 subject rows in total.
--
-- WHAT THIS DOES NOT INSERT
--   Chapter rows. Not one. Chapter titles live inside NCTB's per-subject
--   textbook PDFs, which could not be opened and parsed while this migration
--   was written. Inventing them would poison every downstream progress record,
--   so the chapter lists are simply absent and the UI says so.
--
-- VERIFICATION STATUS
--   Versions: 'needs_verification'. Subjects: 'needs_verification'.
--   `scope` is 'subject_structure', which is a different artefact from a
--   textbook table of contents or an exam-only revised syllabus. Nothing here
--   may be labelled "complete" or "verified" until a human compares it with
--   the cited source and says so.
--
-- DATA SAFETY
--   * Idempotent: every row has a deterministic UUID and is written with
--     `on conflict (id) do update`, so re-running cannot duplicate anything.
--     The shipped `unique (curriculum_version_id, name, paper_label)` would
--     NOT have worked for this: Postgres treats NULLs as distinct, and every
--     subject here has a NULL `paper_label`.
--   * No student table is touched. `user_subjects`, `user_chapters`,
--     `chapter_progress`, notes, revision history and sessions are untouched,
--     so existing progress keeps pointing at the same chapter ids.
--   * `is_demo` is false; the demo rows from 0002/0004 keep their own ids and
--     are left exactly as they were.
--
-- SOURCES
--   SSC  https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767
--   SSC  https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292
--   HSC  https://nctb.gov.bd/pages/notices/
--   See docs/CURRICULUM.md for exactly what was and was not confirmed.
-- ---------------------------------------------------------------------------

insert into public.curriculum_versions
  (id, authority, country, education_level, class_grade, stream, academic_year,
   version_label, title, source_url, scope, source_checked_at, source_note,
   verification_status, is_demo)
values
-- versions
  ('a0000000-0000-4000-8000-000000000011', 'National Curriculum and Textbook Board (NCTB)', 'Bangladesh', 'SSC', 'Class 9–10', 'Science', '2025', 'ssc-2025-subject-structure', 'SSC Science — official subject structure (2025)', 'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'subject_structure', '2026-10-28'::date, 'Subject names and group structure cross-checked against the official NCTB 2025 Class 9–10 textbook list and the National Curriculum 2012 subject-structure/marks table. Chapter lists are NOT included: they require the per-subject textbook table of contents, which has not been compared yet.', 'needs_verification', false),
  ('a0000000-0000-4000-8000-000000000012', 'National Curriculum and Textbook Board (NCTB)', 'Bangladesh', 'SSC', 'Class 9–10', 'Humanities', '2025', 'ssc-2025-subject-structure', 'SSC Humanities — official subject structure (2025)', 'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'subject_structure', '2026-10-28'::date, 'Subject names and group structure cross-checked against the official NCTB 2025 Class 9–10 textbook list and the National Curriculum 2012 subject-structure/marks table. Chapter lists are NOT included: they require the per-subject textbook table of contents, which has not been compared yet.', 'needs_verification', false),
  ('a0000000-0000-4000-8000-000000000013', 'National Curriculum and Textbook Board (NCTB)', 'Bangladesh', 'SSC', 'Class 9–10', 'Business Studies', '2025', 'ssc-2025-subject-structure', 'SSC Business Studies — official subject structure (2025)', 'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'subject_structure', '2026-10-28'::date, 'Subject names and group structure cross-checked against the official NCTB 2025 Class 9–10 textbook list and the National Curriculum 2012 subject-structure/marks table. Chapter lists are NOT included: they require the per-subject textbook table of contents, which has not been compared yet.', 'needs_verification', false),
  ('a0000000-0000-4000-8000-000000000021', 'National Curriculum and Textbook Board (NCTB)', 'Bangladesh', 'HSC', 'Class 11–12', 'Science', '2026–2027', 'hsc-2026-subject-structure', 'HSC Science — official subject structure (2026–2027)', 'https://nctb.gov.bd/pages/notices/', 'subject_structure', '2026-10-28'::date, 'Six-stream structure (Science, Humanities, Business Studies, Islamic Studies, Home Science, Music) with 3 compulsory + 3 elective + 1 optional subjects, per the NCTB 2026–27 HSC syllabus notice and the revised Class 11–12 subject structure published 8 September 2025. Only Science, Humanities and Business Studies streams are seeded here. Chapter lists are NOT included: they require the per-subject textbook table of contents, which has not been compared yet.', 'needs_verification', false),
  ('a0000000-0000-4000-8000-000000000022', 'National Curriculum and Textbook Board (NCTB)', 'Bangladesh', 'HSC', 'Class 11–12', 'Humanities', '2026–2027', 'hsc-2026-subject-structure', 'HSC Humanities — official subject structure (2026–2027)', 'https://nctb.gov.bd/pages/notices/', 'subject_structure', '2026-10-28'::date, 'Six-stream structure (Science, Humanities, Business Studies, Islamic Studies, Home Science, Music) with 3 compulsory + 3 elective + 1 optional subjects, per the NCTB 2026–27 HSC syllabus notice and the revised Class 11–12 subject structure published 8 September 2025. Only Science, Humanities and Business Studies streams are seeded here. Chapter lists are NOT included: they require the per-subject textbook table of contents, which has not been compared yet.', 'needs_verification', false),
  ('a0000000-0000-4000-8000-000000000023', 'National Curriculum and Textbook Board (NCTB)', 'Bangladesh', 'HSC', 'Class 11–12', 'Business Studies', '2026–2027', 'hsc-2026-subject-structure', 'HSC Business Studies — official subject structure (2026–2027)', 'https://nctb.gov.bd/pages/notices/', 'subject_structure', '2026-10-28'::date, 'Six-stream structure (Science, Humanities, Business Studies, Islamic Studies, Home Science, Music) with 3 compulsory + 3 elective + 1 optional subjects, per the NCTB 2026–27 HSC syllabus notice and the revised Class 11–12 subject structure published 8 September 2025. Only Science, Humanities and Business Studies streams are seeded here. Chapter lists are NOT included: they require the per-subject textbook table of contents, which has not been compared yet.', 'needs_verification', false)
on conflict (id) do update set
  authority           = excluded.authority,
  country             = excluded.country,
  education_level     = excluded.education_level,
  class_grade         = excluded.class_grade,
  stream              = excluded.stream,
  academic_year       = excluded.academic_year,
  version_label       = excluded.version_label,
  title               = excluded.title,
  source_url          = excluded.source_url,
  scope               = excluded.scope,
  source_checked_at   = excluded.source_checked_at,
  source_note         = excluded.source_note,
  verification_status = excluded.verification_status,
  is_demo             = excluded.is_demo,
  updated_at          = now();

insert into public.curriculum_subjects
  (id, curriculum_version_id, name, name_bn, code, paper_label, is_compulsory,
   sort_order, verification_status, source_url)
values
  ('a0000000-0000-4000-8000-000000001101', 'a0000000-0000-4000-8000-000000000011', 'Bangla', 'বাংলা', null, null, true, 1, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001102', 'a0000000-0000-4000-8000-000000000011', 'English', 'ইংরেজি', null, null, true, 2, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001103', 'a0000000-0000-4000-8000-000000000011', 'Mathematics', 'গণিত', null, null, true, 3, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001104', 'a0000000-0000-4000-8000-000000000011', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', null, null, true, 4, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001105', 'a0000000-0000-4000-8000-000000000011', 'Career Education', 'ক্যারিয়ার শিক্ষা', null, null, true, 5, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001106', 'a0000000-0000-4000-8000-000000000011', 'Physical Education, Health Science & Sports', 'শারীরিক শিক্ষা, স্বাস্থ্যবিজ্ঞান ও খেলাধুলা', null, null, true, 6, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001107', 'a0000000-0000-4000-8000-000000000011', 'Islam & Moral Education', 'ইসলাম ও নৈতিক শিক্ষা', null, null, true, 7, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001108', 'a0000000-0000-4000-8000-000000000011', 'Hindu Religion & Moral Education', 'হিন্দু ধর্ম ও নৈতিক শিক্ষা', null, null, true, 8, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001109', 'a0000000-0000-4000-8000-000000000011', 'Buddhist Religion & Moral Education', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', null, null, true, 9, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001110', 'a0000000-0000-4000-8000-000000000011', 'Christian Religion & Moral Education', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', null, null, true, 10, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001111', 'a0000000-0000-4000-8000-000000000011', 'Physics', 'পদার্থবিজ্ঞান', null, null, false, 11, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001112', 'a0000000-0000-4000-8000-000000000011', 'Chemistry', 'রসায়ন', null, null, false, 12, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001113', 'a0000000-0000-4000-8000-000000000011', 'Biology', 'জীববিজ্ঞান', null, null, false, 13, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001114', 'a0000000-0000-4000-8000-000000000011', 'Higher Mathematics', 'উচ্চতর গণিত', null, null, false, 14, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001115', 'a0000000-0000-4000-8000-000000000011', 'Bangladesh & Global Studies', 'বাংলাদেশ ও বিশ্বপরিচয়', null, null, true, 15, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001201', 'a0000000-0000-4000-8000-000000000012', 'Bangla', 'বাংলা', null, null, true, 1, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001202', 'a0000000-0000-4000-8000-000000000012', 'English', 'ইংরেজি', null, null, true, 2, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001203', 'a0000000-0000-4000-8000-000000000012', 'Mathematics', 'গণিত', null, null, true, 3, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001204', 'a0000000-0000-4000-8000-000000000012', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', null, null, true, 4, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001205', 'a0000000-0000-4000-8000-000000000012', 'Career Education', 'ক্যারিয়ার শিক্ষা', null, null, true, 5, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001206', 'a0000000-0000-4000-8000-000000000012', 'Physical Education, Health Science & Sports', 'শারীরিক শিক্ষা, স্বাস্থ্যবিজ্ঞান ও খেলাধুলা', null, null, true, 6, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001207', 'a0000000-0000-4000-8000-000000000012', 'Islam & Moral Education', 'ইসলাম ও নৈতিক শিক্ষা', null, null, true, 7, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001208', 'a0000000-0000-4000-8000-000000000012', 'Hindu Religion & Moral Education', 'হিন্দু ধর্ম ও নৈতিক শিক্ষা', null, null, true, 8, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001209', 'a0000000-0000-4000-8000-000000000012', 'Buddhist Religion & Moral Education', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', null, null, true, 9, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001210', 'a0000000-0000-4000-8000-000000000012', 'Christian Religion & Moral Education', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', null, null, true, 10, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001211', 'a0000000-0000-4000-8000-000000000012', 'History of Bangladesh & World Civilization', 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা', null, null, true, 11, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001212', 'a0000000-0000-4000-8000-000000000012', 'Geography & Environment', 'ভূগোল ও পরিবেশ', null, null, true, 12, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001213', 'a0000000-0000-4000-8000-000000000012', 'Economics', 'অর্থনীতি', null, null, false, 13, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001214', 'a0000000-0000-4000-8000-000000000012', 'Civics & Citizenship', 'পৌরনীতি ও নাগরিকতা', null, null, false, 14, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001215', 'a0000000-0000-4000-8000-000000000012', 'Science', 'বিজ্ঞান', null, null, true, 15, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001301', 'a0000000-0000-4000-8000-000000000013', 'Bangla', 'বাংলা', null, null, true, 1, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001302', 'a0000000-0000-4000-8000-000000000013', 'English', 'ইংরেজি', null, null, true, 2, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001303', 'a0000000-0000-4000-8000-000000000013', 'Mathematics', 'গণিত', null, null, true, 3, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001304', 'a0000000-0000-4000-8000-000000000013', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', null, null, true, 4, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001305', 'a0000000-0000-4000-8000-000000000013', 'Career Education', 'ক্যারিয়ার শিক্ষা', null, null, true, 5, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001306', 'a0000000-0000-4000-8000-000000000013', 'Physical Education, Health Science & Sports', 'শারীরিক শিক্ষা, স্বাস্থ্যবিজ্ঞান ও খেলাধুলা', null, null, true, 6, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001307', 'a0000000-0000-4000-8000-000000000013', 'Islam & Moral Education', 'ইসলাম ও নৈতিক শিক্ষা', null, null, true, 7, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001308', 'a0000000-0000-4000-8000-000000000013', 'Hindu Religion & Moral Education', 'হিন্দু ধর্ম ও নৈতিক শিক্ষা', null, null, true, 8, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001309', 'a0000000-0000-4000-8000-000000000013', 'Buddhist Religion & Moral Education', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', null, null, true, 9, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001310', 'a0000000-0000-4000-8000-000000000013', 'Christian Religion & Moral Education', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', null, null, true, 10, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001311', 'a0000000-0000-4000-8000-000000000013', 'Business Entrepreneurship', 'ব্যবসায় উদ্যোগ', null, null, true, 11, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001312', 'a0000000-0000-4000-8000-000000000013', 'Accounting', 'হিসাববিজ্ঞান', null, null, true, 12, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001313', 'a0000000-0000-4000-8000-000000000013', 'Finance & Banking', 'ফিন্যান্স ও ব্যাংকিং', null, null, true, 13, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000001314', 'a0000000-0000-4000-8000-000000000013', 'Science', 'বিজ্ঞান', null, null, true, 14, 'needs_verification', 'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292'),
  ('a0000000-0000-4000-8000-000000002101', 'a0000000-0000-4000-8000-000000000021', 'Bangla', 'বাংলা', null, null, true, 1, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002102', 'a0000000-0000-4000-8000-000000000021', 'English', 'ইংরেজি', null, null, true, 2, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002103', 'a0000000-0000-4000-8000-000000000021', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', null, null, true, 3, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002104', 'a0000000-0000-4000-8000-000000000021', 'Physics', 'পদার্থবিজ্ঞান', null, null, false, 4, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002105', 'a0000000-0000-4000-8000-000000000021', 'Chemistry', 'রসায়ন', null, null, false, 5, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002106', 'a0000000-0000-4000-8000-000000000021', 'Biology', 'জীববিজ্ঞান', null, null, false, 6, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002107', 'a0000000-0000-4000-8000-000000000021', 'Higher Mathematics', 'উচ্চতর গণিত', null, null, false, 7, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002201', 'a0000000-0000-4000-8000-000000000022', 'Bangla', 'বাংলা', null, null, true, 1, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002202', 'a0000000-0000-4000-8000-000000000022', 'English', 'ইংরেজি', null, null, true, 2, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002203', 'a0000000-0000-4000-8000-000000000022', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', null, null, true, 3, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002204', 'a0000000-0000-4000-8000-000000000022', 'History', 'ইতিহাস', null, null, false, 4, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002205', 'a0000000-0000-4000-8000-000000000022', 'Islamic History & Culture', 'ইসলামের ইতিহাস ও সংস্কৃতি', null, null, false, 5, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002206', 'a0000000-0000-4000-8000-000000000022', 'Geography', 'ভূগোল', null, null, false, 6, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002207', 'a0000000-0000-4000-8000-000000000022', 'Economics', 'অর্থনীতি', null, null, false, 7, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002208', 'a0000000-0000-4000-8000-000000000022', 'Civics & Good Governance', 'পৌরনীতি ও সুশাসন', null, null, false, 8, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002209', 'a0000000-0000-4000-8000-000000000022', 'Sociology', 'সমাজবিজ্ঞান', null, null, false, 9, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002210', 'a0000000-0000-4000-8000-000000000022', 'Social Work', 'সমাজকর্ম', null, null, false, 10, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002211', 'a0000000-0000-4000-8000-000000000022', 'Psychology', 'মনোবিজ্ঞান', null, null, false, 11, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002212', 'a0000000-0000-4000-8000-000000000022', 'Logic', 'যুক্তিবিদ্যা', null, null, false, 12, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002301', 'a0000000-0000-4000-8000-000000000023', 'Bangla', 'বাংলা', null, null, true, 1, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002302', 'a0000000-0000-4000-8000-000000000023', 'English', 'ইংরেজি', null, null, true, 2, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002303', 'a0000000-0000-4000-8000-000000000023', 'Information & Communication Technology', 'তথ্য ও যোগাযোগ প্রযুক্তি', null, null, true, 3, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002304', 'a0000000-0000-4000-8000-000000000023', 'Accounting', 'হিসাববিজ্ঞান', null, null, false, 4, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002305', 'a0000000-0000-4000-8000-000000000023', 'Business Organization & Management', 'ব্যবসায় সংগঠন ও ব্যবস্থাপনা', null, null, false, 5, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002306', 'a0000000-0000-4000-8000-000000000023', 'Finance, Banking & Insurance', 'ফিন্যান্স, ব্যাংকিং ও বিমা', null, null, false, 6, 'needs_verification', 'https://nctb.gov.bd/pages/notices/'),
  ('a0000000-0000-4000-8000-000000002307', 'a0000000-0000-4000-8000-000000000023', 'Production Management & Marketing', 'উৎপাদন ব্যবস্থাপনা ও বিপণন', null, null, false, 7, 'needs_verification', 'https://nctb.gov.bd/pages/notices/')
on conflict (id) do update set
  curriculum_version_id = excluded.curriculum_version_id,
  name                  = excluded.name,
  name_bn               = excluded.name_bn,
  code                  = excluded.code,
  -- Migration 0009 adds the 1st/2nd Paper split that this seed does not know
  -- about. A NULL in the seed must therefore mean "leave the stored value
  -- alone", not "reset to NULL": re-running this file alone (a repair, which
  -- `db push` skips but the README's paste-in-order path does not) would
  -- otherwise silently drop the paper labels and, with them, the distinction
  -- between two subjects a student tracks separately.
  paper_label           = coalesce(excluded.paper_label, public.curriculum_subjects.paper_label),
  is_compulsory         = excluded.is_compulsory,
  sort_order            = excluded.sort_order,
  verification_status   = excluded.verification_status,
  source_url            = excluded.source_url;

-- Chapters are deliberately not seeded. This block documents the intent for a
-- future migration and is a no-op today.
-- insert into public.curriculum_chapters (...) select ... where source_confirmed;
