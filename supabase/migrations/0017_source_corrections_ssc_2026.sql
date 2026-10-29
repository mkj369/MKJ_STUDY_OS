-- ---------------------------------------------------------------------------
-- 0017 — The SSC ২০২৬ textbook list renders after all, and the ২০২৬-২৭ HSC
--        list now renders too. Both were recorded as blank pages.
--
-- WHY THIS EXISTS
--   Two `curriculum_pending_requirements` notes in this repository say a page
--   "renders only navigation". Re-read on 2026-10-30, both pages render their
--   tables in full through the same proxy that has always been used. The notes
--   were wrong in the direction that makes the project look more blocked than
--   it is, which is its own kind of dishonesty and worth correcting on the
--   record.
--
--     1. SSC ২০২৬ — https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612
--        Full table: 29 books, Bangla and English versions, each with a Google
--        Drive link and an egovcloud mirror. This is a complete SSC subject
--        inventory for ২০২৬.
--
--     2. HSC ২০২৬-২৭ — .../o4phi6-6ae03d7be0cf994829342115
--        Five rows, all compulsory: সাহিত্যপাঠ, সহপাঠ, English for Today,
--        তথ্য ও যোগাযোগ প্রযুক্তি, তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন).
--        Identical in scope to ২০২৫-২৬: **NCTB publishes no group-wise or
--        elective HSC textbook list for either year, and no HSC Science book
--        link at all.**
--
-- WHAT THIS MEANS FOR THE HSC SCIENCE MISSION
--   The finding is now conclusive rather than provisional. The eight required
--   HSC Science paper-level curricula (Physics 1st/2nd, Chemistry 1st/2nd,
--   Biology 1st/2nd, Higher Mathematics 1st/2nd) cannot be sourced from NCTB
--   for ২০২৬-২৭ because:
--     * the only HSC book list NCTB publishes lists 5 compulsory books;
--     * the only two ২০২৬-২৭ exam syllabi with a text layer are Bangla ১ম and
--       English ১st — no science subject has a published syllabus yet;
--     * the textbook links that do exist point at Google Drive, which serves a
--       virus-scan interstitial instead of the bytes (see 0016).
--   Nothing here fabricates a chapter to fill that gap.
--
-- WHAT CHANGES IN THE DATA
--   Notes and statuses only. No chapter, no subject, no topic, no verification
--   upgrade. Counts stay at 86 subjects · 41 chapters · 0 official topics.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Requirement 2: the SSC ২০২৬ list is readable
-- ---------------------------------------------------------------------------

update public.curriculum_pending_requirements
   set status = 'awaiting_publication',
       note = 'CORRECTED 2026-10-30: this page RENDERS IN FULL through the proxy — the earlier "renders only navigation" note was wrong. It lists 29 books for ২০২৬, each in Bangla and English with a Google Drive link and an egovcloud mirror: বাংলা সাহিত্য, বাংলা সহপাঠ, বাংলা ভাষার ব্যাকরণ ও নির্মিতি, English For Today, English Grammar and Composition, গণিত/Mathematics, তথ্য ও যোগাযোগ প্রযুক্তি, বিজ্ঞান/Science, পদার্থবিজ্ঞান/Physics, রসায়ন/Chemistry, জীববিজ্ঞান/Biology, উচ্চতর গণিত/Higher Mathematics, ভূগোল ও পরিবেশ, অর্থনীতি, কৃষিশিক্ষা, গার্হস্থ্যবিজ্ঞান, পৌরনীতি ও নাগরিকতা, হিসাববিজ্ঞান, ফিন্যান্স ও ব্যাংকিং and the rest. Carried as awaiting_publication, not source_blocked: the list is readable, but the seeder still holds the ২০২৫ SSC subject structure, and swapping a ২০২৬ inventory in would need a full re-verification of every SSC row and every student progress link. Recorded so the next pass starts from the real inventory instead of hunting a phantom bug.'
 where education_level = 'SSC'
   and stream = 'all'
   and academic_year = '2026'
   and requirement = 'Complete SSC subject inventory for the 2026 academic year';

-- ---------------------------------------------------------------------------
-- 2. Requirement 16: the ২০২৬-২৭ list renders, and it still has no Science book
-- ---------------------------------------------------------------------------

update public.curriculum_pending_requirements
   set status = 'awaiting_publication',
       note = 'CONFIRMED 2026-10-30: the ২০২৬-২৭ HSC textbook page now renders in full, and it settles the question. It lists five books and all five are compulsory: সাহিত্যপাঠ, সহপাঠ, English for Today, তথ্য ও যোগাযোগ প্রযুক্তি, তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন). There is no Science, Humanities or Business Studies section — not on this page and not on the ২০২৫-২৬ one. So NCTB does not publish a group-wise HSC textbook list at all, and no HSC Science book link exists to follow. The ১৩/১৪/৯ seeded elective lists therefore stay needs_verification permanently until a different official document (a printed distribution list, or a school-issued book list) is supplied.'
 where education_level = 'HSC'
   and stream = 'all'
   and academic_year = '2026–2027'
   and requirement = 'Group-wise textbook list (Science / Humanities / Business Studies) from NCTB';

-- ---------------------------------------------------------------------------
-- 3. Requirement 17: still three syllabi, still no science
-- ---------------------------------------------------------------------------

update public.curriculum_pending_requirements
   set status = 'awaiting_publication',
       note = 'RE-CHECKED 2026-10-30: the ২০২৬-২৭ HSC syllabus notice (published ০১-১০-২০২৬) still carries exactly three attachments — বাংলা প্রথম পত্র, English 1st Paper, and তথ্য ও যোগাযোগ প্রযুক্তি. No science subject has a published ২০২৬-২৭ syllabus. Physics, Chemistry, Biology and Higher Mathematics will each need their syllabus before even an exam-scope record can be made, separate from the textbook contents this project actually wants.'
 where education_level = 'HSC'
   and stream = 'all'
   and academic_year = '2026–2027'
   and requirement = 'Textbook contents pages for the three subjects whose 2026–27 syllabus is published';

-- ---------------------------------------------------------------------------
-- 4. Provenance: the two pages re-read, and the ICT file that does download
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://nctb.gov.bd/pages/static-pages/695b99afc4774958d7b70612',
   '২০২৬ শিক্ষাবর্ষের মাধ্যমিক স্তরের নবম দশম শ্রেণির পাঠ্যপুস্তক',
   'NCTB', 'textbook_list', 'SSC', '2026', 'rendered', '2026-10-30',
   'Rendered in full on 2026-10-30: 29 books, Bangla and English versions, each with a Google Drive link and an egovcloud mirror. This is a complete SSC ২০২৬ inventory and replaces the 2025 row as the authority for the SSC subject list once the seeder is migrated. Nothing was imported this round.'),

  ('https://nctb.gov.bd/pages/static-pages/২০২৬-২৭-শিক্ষাবর্ষের-উচ্চ-মাধ্যমিক-স্তরের-একাদশ-দ্বাদশ-শ্রেণির-পাঠ্যপুস্তক-o4phi6-6ae03d7be0cf994829342115',
   '২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক স্তরের একাদশ-দ্বাদশ শ্রেণির পাঠ্যপুস্তক',
   'NCTB', 'textbook_list', 'HSC', '2026–2027', 'rendered', '2026-10-30',
   'Renders in full as of 2026-10-30 (it was empty on 2026-10-28, so the page was filled in between). Five rows, all compulsory: সাহিত্যপাঠ, সহপাঠ, English for Today, তথ্য ও যোগাযোগ প্রযুক্তি, তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন). No Science, Humanities or Business Studies book appears — which is the definitive answer to requirement 16, not a reading failure.'),

  ('https://drive.google.com/file/d/1MKVd6iyIwt9-4frohPbmw9aodZ2FEDkj/view',
   'ICT 11-12 (২০২৬-২৭) — তথ্য ও যোগাযোগ প্রযুক্তি textbook, Google Drive',
   'NCTB — hosted on Google Drive', 'textbook', 'HSC', '2026–2027', 'partial', '2026-10-30',
   'The one HSC book link that resolves without the virus-scan wall this round: the filename is "ICT 11-12 All pdf for website-2027Com.pdf" and the Drive thumbnail renders the cover, which confirms it is the ICT textbook for the ২০২৭ session. Only the link and cover were verified — the PDF itself was not parsed here, so no contents page is claimed. Useful because it is the only confirmed-reachable HSC book file, and a reminder that the drive lane works when the file is small enough for Google to scan.')
on conflict (url, document_type) do update set
  title         = excluded.title,
  authority     = excluded.authority,
  access_state  = excluded.access_state,
  academic_year = excluded.academic_year,
  checked_at    = excluded.checked_at,
  note          = excluded.note;
