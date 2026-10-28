-- ---------------------------------------------------------------------------
-- 0009 — SSC / HSC inventory: paper splits, source registry, open gaps
--
-- WHAT THIS ADDS
--   12 subject rows: Bangla 2nd Paper and English 2nd Paper for each of the
--   six versions. Neither NCTB level publishes Bangla or English as a single
--   book — the official 2025 Class 9–10 list carries বাংলা সাহিত্য, বাংলা
--   সহপাঠ and বাংলা ভাষার ব্যাকরণ ও নির্মিতি (Paper 1 and Paper 2), and
--   English for Today plus English Grammar and Composition. Recording them as
--   one subject forced every student to track two papers as a single chapter
--   list, which is not how they are examined.
--
--   It also marks the two existing rows `paper_label = '1st Paper'` and fills
--   the source registry and the outstanding-requirement table.
--
-- WHAT THIS DOES NOT ADD
--   No chapter rows and no topic rows. Zero. The chapter titles live in the
--   per-subject textbook PDFs; the SSC Physics book was located on two
--   official hosts and is 105 MB, and neither could be read here (see the
--   registry rows below). Nothing is guessed to fill the gap.
--
-- STUDENT DATA
--   No student table is read or written. The two rows whose `paper_label`
--   changes keep their existing ids, so every `user_subjects`,
--   `user_chapters`, note and revision record still points at the same
--   curriculum subject it did before this migration ran.
--
-- IDS
--   `a0000000-0000-4000-8000-0000000VVVNN` where VVV is the version (110/120/
--   130 for SSC Science/Humanities/Business, 210/220/230 for HSC) and NN is
--   the 1-based position. The new rows take the next positions after the
--   existing ones — appending, never renumbering, because renumbering would
--   change the primary keys and orphan progress.
--
-- VERIFICATION
--   SSC rows: 'partially_verified'. The book is confirmed in the official,
--   machine-read 2025 textbook list; the *paper number* printed on the cover
--   was not independently read, so the row is honest about being partial
--   rather than claiming 'verified'.
--   HSC rows: 'needs_verification'. No HSC textbook list could be rendered
--   here, so the split follows the documented HSC structure but is unconfirmed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Existing Bangla / English rows become Paper 1
-- ---------------------------------------------------------------------------

update public.curriculum_subjects
set paper_label = '1st Paper',
    source_document = case
      when curriculum_version_id in (
        'a0000000-0000-4000-8000-000000000011',
        'a0000000-0000-4000-8000-000000000012',
        'a0000000-0000-4000-8000-000000000013'
      ) then 'NCTB ২০২৫ শিক্ষাবর্ষের নবম-দশম শ্রেণির পাঠ্যপুস্তক তালিকা'
      else source_document
    end
where paper_label is null
  and name in ('Bangla', 'English')
  and curriculum_version_id in (
    'a0000000-0000-4000-8000-000000000011',
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000013',
    'a0000000-0000-4000-8000-000000000021',
    'a0000000-0000-4000-8000-000000000022',
    'a0000000-0000-4000-8000-000000000023'
  );

-- ---------------------------------------------------------------------------
-- 2. Paper 2 rows
-- ---------------------------------------------------------------------------

insert into public.curriculum_subjects
  (id, curriculum_version_id, name, name_bn, code, paper_label, is_compulsory,
   sort_order, verification_status, source_url, source_document)
values
  -- SSC Science
  ('a0000000-0000-4000-8000-000000001116', 'a0000000-0000-4000-8000-000000000011', 'Bangla', 'বাংলা', null, '2nd Paper', true, 16, 'partially_verified',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'NCTB ২০২৫ নবম-দশম পাঠ্যপুস্তক তালিকা — বাংলা ভাষার ব্যাকরণ ও নির্মিতি'),
  ('a0000000-0000-4000-8000-000000001117', 'a0000000-0000-4000-8000-000000000011', 'English', 'ইংরেজি', null, '2nd Paper', true, 17, 'partially_verified',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'NCTB ২০২৫ নবম-দশম পাঠ্যপুস্তক তালিকা — English Grammar and Composition'),
  -- SSC Humanities
  ('a0000000-0000-4000-8000-000000001216', 'a0000000-0000-4000-8000-000000000012', 'Bangla', 'বাংলা', null, '2nd Paper', true, 16, 'partially_verified',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'NCTB ২০২৫ নবম-দশম পাঠ্যপুস্তক তালিকা — বাংলা ভাষার ব্যাকরণ ও নির্মিতি'),
  ('a0000000-0000-4000-8000-000000001217', 'a0000000-0000-4000-8000-000000000012', 'English', 'ইংরেজি', null, '2nd Paper', true, 17, 'partially_verified',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'NCTB ২০২৫ নবম-দশম পাঠ্যপুস্তক তালিকা — English Grammar and Composition'),
  -- SSC Business Studies
  ('a0000000-0000-4000-8000-000000001315', 'a0000000-0000-4000-8000-000000000013', 'Bangla', 'বাংলা', null, '2nd Paper', true, 15, 'partially_verified',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'NCTB ২০২৫ নবম-দশম পাঠ্যপুস্তক তালিকা — বাংলা ভাষার ব্যাকরণ ও নির্মিতি'),
  ('a0000000-0000-4000-8000-000000001316', 'a0000000-0000-4000-8000-000000000013', 'English', 'ইংরেজি', null, '2nd Paper', true, 16, 'partially_verified',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767', 'NCTB ২০২৫ নবম-দশম পাঠ্যপুস্তক তালিকা — English Grammar and Composition'),
  -- HSC Science
  ('a0000000-0000-4000-8000-000000002108', 'a0000000-0000-4000-8000-000000000021', 'Bangla', 'বাংলা', null, '2nd Paper', true, 8, 'needs_verification',
   'https://nctb.gov.bd/pages/notices/', null),
  ('a0000000-0000-4000-8000-000000002109', 'a0000000-0000-4000-8000-000000000021', 'English', 'ইংরেজি', null, '2nd Paper', true, 9, 'needs_verification',
   'https://nctb.gov.bd/pages/notices/', null),
  -- HSC Humanities
  ('a0000000-0000-4000-8000-000000002213', 'a0000000-0000-4000-8000-000000000022', 'Bangla', 'বাংলা', null, '2nd Paper', true, 13, 'needs_verification',
   'https://nctb.gov.bd/pages/notices/', null),
  ('a0000000-0000-4000-8000-000000002214', 'a0000000-0000-4000-8000-000000000022', 'English', 'ইংরেজি', null, '2nd Paper', true, 14, 'needs_verification',
   'https://nctb.gov.bd/pages/notices/', null),
  -- HSC Business Studies
  ('a0000000-0000-4000-8000-000000002308', 'a0000000-0000-4000-8000-000000000023', 'Bangla', 'বাংলা', null, '2nd Paper', true, 8, 'needs_verification',
   'https://nctb.gov.bd/pages/notices/', null),
  ('a0000000-0000-4000-8000-000000002309', 'a0000000-0000-4000-8000-000000000023', 'English', 'ইংরেজি', null, '2nd Paper', true, 9, 'needs_verification',
   'https://nctb.gov.bd/pages/notices/', null)
on conflict (id) do update set
  curriculum_version_id = excluded.curriculum_version_id,
  name                  = excluded.name,
  name_bn               = excluded.name_bn,
  paper_label           = excluded.paper_label,
  is_compulsory         = excluded.is_compulsory,
  sort_order            = excluded.sort_order,
  verification_status   = excluded.verification_status,
  source_url            = excluded.source_url,
  source_document       = excluded.source_document;

-- ---------------------------------------------------------------------------
-- 3. Source registry — what was actually opened, and what came out
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767',
   '২০২৫ শিক্ষাবর্ষের মাধ্যমিক স্তরের নবম-দশম শ্রেণির পাঠ্যপুস্তক (SSC textbook list 2025)',
   'NCTB', 'textbook_list', 'SSC', '2025', 'rendered', '2026-10-28',
   'All 33 books listed in Bangla and English with two download links each (Google Drive + drive.egovcloud.gov.bd). This is the authority for the SSC subject inventory.'),

  ('https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612',
   '২০২৬ শিক্ষাবর্ষের মাধ্যমিক স্তরের নবম-দশম শ্রেণির পাঠ্যপুস্তক (SSC textbook list 2026)',
   'NCTB', 'textbook_list', 'SSC', '2026', 'blocked', '2026-10-28',
   'Page exists and its title lists the 2026 books, but the content block is a "পাতা" (sub-page) widget that never resolves: the rendered body contains only navigation, a share bar and the accessibility menu. No subject rows could be extracted.'),

  ('https://drive.google.com/file/d/121GCSD2909n-ETowJfdtzqOoVcdAe9Fx/view',
   'Physics Class 9-10 BV book full pdf_compressed.pdf (SSC Physics textbook, Bangla version)',
   'NCTB', 'textbook', 'SSC', '2025', 'blocked', '2026-10-28',
   'Linked from the SSC 2025 list. Google reports the file as 105 MB and serves a virus-scan interstitial instead of the bytes; the egovcloud mirror returns HTTP 500. The table of contents inside this file is the only legitimate source for SSC Physics chapter titles.'),

  ('https://drive.egovcloud.gov.bd/index.php/s/QciQ1yYNg2c6Jmf',
   'Government Cloud Drive mirror — Physics Class 9-10 BV book full pdf_compressed.pdf',
   'NCTB / Bangladesh Government Cloud', 'textbook', 'SSC', '2025', 'blocked', '2026-10-28',
   'Share page renders and confirms the same 104.9 MB file, but /download returns HTTP 500 to this environment.'),

  ('https://nctb.gov.bd/pages/files/6922db5b933eb65569e09a2c',
   'মাধ্যমিক স্তরের শিক্ষাক্রম, প্রকাশকাল ২০১২ (National Curriculum 2012, secondary)',
   'NCTB', 'curriculum', 'SSC', '2012', 'partial', '2026-10-28',
   '93-page PDF. Text extracts, but it is encoded in the legacy Bijoy/ANSI single-byte font mapping, so the output is unusable without a Bijoy→Unicode converter.'),

  ('https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
   'জাতীয় শিক্ষাক্রম ২০১২ — একাদশ ও দ্বাদশ শ্রেণি (National Curriculum 2012, higher secondary)',
   'NCTB', 'curriculum', 'HSC', '2012', 'partial', '2026-10-28',
   '43-page PDF. Same Bijoy/ANSI encoding problem as the secondary curriculum document.'),

  ('https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292',
   'এসএসসি ও এইচএসসি পরীক্ষার পুনর্বিন্যাসকৃত পাঠ্যসূচি ও বিষয় কাঠামো / নম্বর বিভাজন',
   'NCTB', 'subject_structure', 'SSC', '2012', 'not_attempted', null,
   'Cited by migration 0007 as the source for group structure. Not re-opened in this pass.'),

  ('https://nctb.gov.bd/pages/notices/',
   'নোটিশ — ২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক ও সমমান শ্রেণির নির্ধারিত পাঠ্যসূচি',
   'NCTB', 'notice', 'HSC', '2026–2027', 'not_attempted', null,
   'Cited by migration 0007 as the HSC source. Not re-opened in this pass; no HSC textbook list has been rendered.')
on conflict (url, document_type) do update set
  title          = excluded.title,
  authority      = excluded.authority,
  education_level = excluded.education_level,
  academic_year  = excluded.academic_year,
  access_state   = excluded.access_state,
  checked_at     = excluded.checked_at,
  note           = excluded.note;

-- ---------------------------------------------------------------------------
-- 4. Outstanding requirements
--
-- These are the rows the coverage report turns into "awaiting source
-- material". Each one names a specific artefact, not a vague intention.
-- ---------------------------------------------------------------------------

insert into public.curriculum_pending_requirements
  (education_level, stream, academic_year, requirement, status, source_url, note)
values
  ('SSC', 'all', '2025',
   'Chapter and topic lists for every SSC subject (textbook tables of contents)',
   'source_blocked',
   'https://drive.google.com/file/d/121GCSD2909n-ETowJfdtzqOoVcdAe9Fx/view',
   'Each NCTB textbook PDF is roughly 100 MB and is served behind a Drive virus-scan interstitial; the egovcloud mirror returns HTTP 500. Reading the contents page of each book is the only acceptable source. A screenshot or PDF of that page per subject is enough to import from.'),

  ('SSC', 'all', '2026',
   'Complete SSC subject inventory for the 2026 academic year',
   'source_blocked',
   'https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612',
   'The 2026 list page is identified but renders only navigation — the book table lives in a sub-page widget that does not resolve. Needs the page transcribed by hand, or a rendered copy.'),

  ('SSC', 'all', '2027',
   'Complete SSC subject inventory for the 2027 academic year',
   'awaiting_publication',
   null,
   'NCTB had not published a 2027 Class 9–10 textbook list as of 2026-10-28. Nothing is seeded for this year; inventing it would be worse than an empty column.'),

  ('SSC', 'all', '2028',
   'Complete SSC subject inventory for the 2028 academic year',
   'awaiting_publication',
   null,
   'Not published by NCTB as of 2026-10-28.'),

  ('SSC', 'all', '2029',
   'Complete SSC subject inventory for the 2029 academic year',
   'awaiting_publication',
   null,
   'Not published by NCTB as of 2026-10-28.'),

  ('SSC', 'all', '2025',
   'Group applicability of optional subjects (Arts & Crafts, Music, Arabic, Sanskrit, Pali)',
   'awaiting_source',
   'https://nctb.gov.bd/pages/static-pages/6922df50933eb65569e21292',
   'These books appear in the official 2025 Class 9–10 list, but a textbook list is group-agnostic. Which group may take which optional subject comes from the subject-structure/marks table, which has not been read here.'),

  ('HSC', 'all', '2026–2027',
   'Chapter and topic lists for every HSC subject (textbook tables of contents)',
   'source_blocked',
   'https://nctb.gov.bd/pages/notices/',
   'Same blocker as SSC: the chapter titles are inside the per-subject textbook PDFs, none of which could be retrieved here.'),

  ('HSC', 'all', '2026–2027',
   'Elective and optional subject lists per stream (only the core 7/12/7 are seeded)',
   'awaiting_source',
   'https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
   'The higher-secondary curriculum PDF is the right artefact but is Bijoy/ANSI encoded, so its subject tables cannot be read without a converter. Until then the seeded elective lists must be treated as incomplete rather than authoritative.'),

  ('HSC', 'all', '2026–2027',
   'Confirmation that every seeded elective is recorded as 1st and 2nd Paper',
   'awaiting_source',
   'https://nctb.gov.bd/pages/notices/',
   'Only Bangla and English are split into papers here, and those are marked needs_verification because no HSC textbook list could be rendered. HSC electives are two-paper subjects as well.')
on conflict (education_level, academic_year, stream, requirement) do update set
  status     = excluded.status,
  source_url = excluded.source_url,
  note       = excluded.note;
