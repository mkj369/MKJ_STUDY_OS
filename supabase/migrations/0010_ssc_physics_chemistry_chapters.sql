-- ---------------------------------------------------------------------------
-- 0010 — first real chapter data: SSC Physics and Chemistry
--
-- WHERE THIS CAME FROM
--   Two scans of the official NCTB textbooks (Bangla version), both hosted on
--   the Internet Archive with a Tesseract Bengali OCR text layer:
--
--     Physics    https://archive.org/details/physics-class-9-10-com-opt
--     Chemistry  https://archive.org/details/chemistry-class-9-10-com-opt
--
--   Both carry the same imprint: প্রথম প্রকাশ সেপ্টেম্বর ২০১২, পরিমার্জিত
--   সংস্করণ সেপ্টেম্বর ২০১৭, পুনঃমুদ্রণ ২০২২. The chapter list was read from
--   the সূচিপত্র page of each scan, not from a summary or a coaching site.
--
-- WHY `partially_verified` AND NOT `verified`
--   Three reasons, all of which a later human pass can clear:
--     1. The source is an OCR text layer, not the publisher's digital PDF.
--     2. The scan is a 2022 reprint; the app's SSC version is 2025. The chapter
--        list is identical across reprints of the same 2012 curriculum, but
--        nobody has opened the 2025 file to say so.
--     3. OCR damaged three titles. The garbled forms were "চতুথ … শন্তি",
--        "তরঙ্া" and "রসায়ন ও শন্তি"; the printed words are "চতুর্থ", "শক্তি"
--        and "তরঙ্গ ও শব্দ". The corrections are listed in docs/CURRICULUM.md
--        rather than silently applied.
--
-- WHAT IS NOT HERE
--   * Topics. Not one. The scans contain section headings (1.1, 1.2, …) but
--     extracting them reliably needs the whole book, not the contents page, and
--     a half-extracted topic list is worse than none.
--   * The other 80 subjects. Their textbooks were not available as readable
--     text in this environment; they stay at zero chapters, explicitly.
--
-- STUDENT DATA
--   Insert-or-update only, keyed on (subject, chapter_number). No delete, no
--   truncate, and no student table is touched. A student who already adopted
--   "Physics" keeps every record; the chapters simply appear underneath.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Chapter rows
-- ---------------------------------------------------------------------------

insert into public.curriculum_chapters
  (id, curriculum_subject_id, title, title_bn, chapter_number, sort_order,
   source_url, source_document, source_checked_at, verification_status, is_demo)
values
  -- SSC Science · Physics (a0000000-0000-4000-8000-000000001111)
  ('b0000000-0000-4000-8000-000000001001', 'a0000000-0000-4000-8000-000000001111', 'ভৌত রাশি এবং পরিমাপ', null, '1', 1, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001002', 'a0000000-0000-4000-8000-000000001111', 'গতি', null, '2', 2, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001003', 'a0000000-0000-4000-8000-000000001111', 'বল', null, '3', 3, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001004', 'a0000000-0000-4000-8000-000000001111', 'কাজ, ক্ষমতা ও শক্তি', null, '4', 4, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র; OCR original: \"চতুথ … শন্তি\"', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001005', 'a0000000-0000-4000-8000-000000001111', 'পদার্থের অবস্থা ও চাপ', null, '5', 5, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001006', 'a0000000-0000-4000-8000-000000001111', 'বস্তুর ওপর তাপের প্রভাব', null, '6', 6, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001007', 'a0000000-0000-4000-8000-000000001111', 'তরঙ্গ ও শব্দ', null, '7', 7, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র; OCR original: \"তরঙ্া ও শব্দ\"', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001008', 'a0000000-0000-4000-8000-000000001111', 'আলোর প্রতিফলন', null, '8', 8, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001009', 'a0000000-0000-4000-8000-000000001111', 'আলোর প্রতিসরণ', null, '9', 9, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001010', 'a0000000-0000-4000-8000-000000001111', 'স্থির বিদ্যুৎ', null, '10', 10, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001011', 'a0000000-0000-4000-8000-000000001111', 'চল বিদ্যুৎ', null, '11', 11, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001012', 'a0000000-0000-4000-8000-000000001111', 'বিদ্যুতের চৌম্বক ক্রিয়া', null, '12', 12, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001013', 'a0000000-0000-4000-8000-000000001111', 'আধুনিক পদার্থবিজ্ঞান ও ইলেকট্রনিকস', null, '13', 13, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000001014', 'a0000000-0000-4000-8000-000000001111', 'জীবন বাঁচাতে পদার্থবিজ্ঞান', null, '14', 14, 'https://archive.org/details/physics-class-9-10-com-opt', 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),

  -- SSC Science · Chemistry (a0000000-0000-4000-8000-000000001112)
  ('b0000000-0000-4000-8000-000000002001', 'a0000000-0000-4000-8000-000000001112', 'রসায়নের ধারণা', null, '1', 1, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002002', 'a0000000-0000-4000-8000-000000001112', 'পদার্থের অবস্থা', null, '2', 2, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002003', 'a0000000-0000-4000-8000-000000001112', 'পদার্থের গঠন', null, '3', 3, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002004', 'a0000000-0000-4000-8000-000000001112', 'পর্যায় সারণি', null, '4', 4, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002005', 'a0000000-0000-4000-8000-000000001112', 'রাসায়নিক বন্ধন', null, '5', 5, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002006', 'a0000000-0000-4000-8000-000000001112', 'মোলের ধারণা ও রাসায়নিক গণনা', null, '6', 6, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002007', 'a0000000-0000-4000-8000-000000001112', 'রাসায়নিক বিক্রিয়া', null, '7', 7, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002008', 'a0000000-0000-4000-8000-000000001112', 'রসায়ন ও শক্তি', null, '8', 8, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র; OCR original: "রসায়ন ও শন্তি"', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002009', 'a0000000-0000-4000-8000-000000001112', 'এসিড-ক্ষারক সমতা', null, '9', 9, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002010', 'a0000000-0000-4000-8000-000000001112', 'খনিজ সম্পদ: ধাতু-অধাতু', null, '10', 10, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002011', 'a0000000-0000-4000-8000-000000001112', 'খনিজ সম্পদ: জীবাশ্ম', null, '11', 11, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000002012', 'a0000000-0000-4000-8000-000000001112', 'আমাদের জীবনে রসায়ন', null, '12', 12, 'https://archive.org/details/chemistry-class-9-10-com-opt', 'NCTB রসায়ন নবম-দশম শ্রেণি, পরিমার্জিত সংস্করণ সেপ্টেম্বর ২০১৭ (পুনঃমুদ্রণ ২০২২) — সূচিপত্র', '2026-10-28'::date, 'partially_verified', false)
on conflict (curriculum_subject_id, chapter_number) where chapter_number is not null
do update set
  title               = excluded.title,
  title_bn            = excluded.title_bn,
  sort_order          = excluded.sort_order,
  source_url          = excluded.source_url,
  source_document     = excluded.source_document,
  source_checked_at   = excluded.source_checked_at,
  verification_status = excluded.verification_status;

-- ---------------------------------------------------------------------------
-- 2. The two subjects are now partly verified, not fully
-- ---------------------------------------------------------------------------

update public.curriculum_subjects
   set verification_status = 'partially_verified',
       source_url = 'https://archive.org/details/physics-class-9-10-com-opt',
       source_document = 'NCTB পদার্থবিজ্ঞান নবম-দশম শ্রেণি (২০১৭ পরিমার্জিত সংস্করণ, ২০২২ পুনঃমুদ্রণ) — সূচিপত্র OCR'
 where id = 'a0000000-0000-4000-8000-000000001111';

update public.curriculum_subjects
   set verification_status = 'partially_verified',
       source_url = 'https://archive.org/details/chemistry-class-9-10-com-opt',
       source_document = 'NCTB রসায়ন নবম-দশম শ্রেণি (২০১৭ পরিমার্জিত সংস্করণ, ২০২২ পুনঃমুদ্রণ) — সূচিপত্র OCR'
 where id = 'a0000000-0000-4000-8000-000000001112';

-- ---------------------------------------------------------------------------
-- 3. Provenance: register the two scans
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://archive.org/details/physics-class-9-10-com-opt',
   'NCTB Physics Class 9–10 (Bangla), scan with Bengali OCR',
   'NCTB — scan hosted by Internet Archive', 'textbook', 'SSC', '2022 reprint', 'rendered', '2026-10-28',
   'Contents page read in full: 14 chapters. Imprint: first published Sept 2012, revised Sept 2017, reprinted 2022. OCR damaged three titles (চতুথ→চতুর্থ, শন্তি→শক্তি, তরঙ্া→তরঙ্গ); corrections documented, not silent.'),

  ('https://archive.org/details/chemistry-class-9-10-com-opt',
   'NCTB Chemistry Class 9–10 (Bangla), scan with Bengali OCR',
   'NCTB — scan hosted by Internet Archive', 'textbook', 'SSC', '2022 reprint', 'rendered', '2026-10-28',
   'Contents page read in full: 12 chapters. Same imprint as the Physics scan. OCR rendered "শক্তি" as "শন্তি" in chapter 8.')
on conflict (url, document_type) do update set
  title           = excluded.title,
  authority       = excluded.authority,
  education_level = excluded.education_level,
  academic_year   = excluded.academic_year,
  access_state    = excluded.access_state,
  checked_at      = excluded.checked_at,
  note            = excluded.note;

-- ---------------------------------------------------------------------------
-- 4. Keep the SSC chapter blocker honest: it is a 71-subject problem now
-- ---------------------------------------------------------------------------

-- The requirement itself is unchanged — 55 of 57 SSC subjects still need a
-- contents page — so only its note is updated. Renaming the row would have been
-- a mistake: `requirement` is part of the table's unique key, and migration 0009
-- re-inserts the original text on every run, so a rename collides on the second
-- application. Annotate, never rename.
update public.curriculum_pending_requirements
   set note = 'Physics and Chemistry chapter lists are imported from OCR scans of the official 2017/2022 books and are partially_verified. The remaining 55 SSC subjects, and every topic list, still need the contents page of the official textbook. Each NCTB PDF is roughly 100 MB behind a Drive virus-scan interstitial.'
 where education_level = 'SSC' and academic_year = '2025' and stream = 'all'
   and requirement = 'Chapter and topic lists for every SSC subject (textbook tables of contents)';

insert into public.curriculum_pending_requirements
  (education_level, stream, academic_year, requirement, status, source_url, note)
values
  ('SSC', 'all', '2025',
   'Confirm the imported Physics and Chemistry chapter lists against the 2025 digital edition',
   'awaiting_source',
   'https://nctb.gov.bd/pages/static-pages/6922e0c0933eb65569e28767',
   'The imported lists come from 2022 reprints of the same 2012-curriculum books, read by OCR. The paper edition is what matters and the 2025 file has not been opened. Comparing the two contents pages would let both subjects move from partially_verified to verified.'),

  ('SSC', 'all', '2025',
   'Topic-level breakdown for Physics and Chemistry',
   'source_blocked',
   'https://archive.org/details/physics-class-9-10-com-opt',
   'Chapter titles are recorded; section-level topics (1.1, 1.2, …) are not. They run through the body of each book rather than its contents page, so they need the full text, not one page.')
on conflict (education_level, academic_year, stream, requirement) do update set
  status     = excluded.status,
  source_url = excluded.source_url,
  note       = excluded.note;
