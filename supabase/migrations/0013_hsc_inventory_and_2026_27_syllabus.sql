-- ---------------------------------------------------------------------------
-- 0013 — The ২০২৫-২৬ HSC textbook page finally renders. It lists five books.
--
-- WHY THIS EXISTS
--   Two claims in this repository were wrong, and both were wrong in the
--   direction that makes the data look more finished than it is:
--
--   1. `curriculum_pending_requirements` (0009) says the ২০২৫-২৬ HSC textbook
--      list "returns navigation only". It does not — through the rendering
--      proxy the page returns its table. This migration corrects the note.
--   2. With the page readable, the actual content can be recorded: NCTB
--      publishes **five** HSC books for ২০২৫-২৬, and every one of them is a
--      compulsory subject.
--
--   That second point is the important one. The honest statement is not "we
--   could not read the HSC inventory"; it is "the page we can read contains no
--   group-specific or elective subject at all". Those are different blockers
--   and only one of them is a failure of this environment.
--
-- WHAT WAS READ
--   https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b
--   Title: ২০২৫-২৬ শিক্ষাবর্ষের উচ্চ মাধ্যমিক স্তরের একাদশ-দ্বাদশ শ্রেণির
--          পাঠ্যপুস্তক
--   Table, complete, five rows, each with two download links:
--     ১ সাহিত্যপাঠ
--     ২ সহপাঠ
--     ৩ English for Today
--     ৪ তথ্য ও যোগাযোগ প্রযুক্তি
--     ৫ তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন)
--   The page ends there. There is no Science, Humanities or Business Studies
--   section, and no elective title anywhere on it.
--
--   So the seeded 13/14/9 group lists still rest on the 2026–27 curriculum
--   notice and **nothing in this repository may treat them as confirmed**.
--   This migration keeps them `needs_verification` and says why.
--
-- WHAT ELSE WAS OPENED (and what it did or did not prove)
--   * The ২০২৬-২৭ HSC syllabus notice (০১-১০-২০২৬) carries three attached
--     PDFs. All three have a real text layer and were read:
--       – বাংলা প্রথম পত্র — সাহিত্যপাঠ গদ্য ১২ + কবিতা ১২, সহপাঠ উপন্যাস
--         লালসালু, নাটক সিরাজ-উ-দ্দোলা
--       – English 1st Paper (Subject Code 107) — 12 units, lessons listed
--       – তথ্য ও যোগাযোগ প্রযুক্তি — six chapters, Bengali titles
--     These are **exam syllabuses** (`scope = 'exam_syllabus'`), not textbook
--     contents. Nothing from them is imported as a chapter, because the
--     standing rule forbids swapping a syllabus for a book's contents page.
--     What they *do* establish, officially and for ২০২৬-২৭, is that Bangla and
--     English are examined as separate papers and that English 1st Paper
--     carries subject code 107 — the first subject codes this project has from
--     an official source.
--     They also show the syllabus has been published for **three** subjects so
--     far. A student cannot be told their whole HSC syllabus is published.
--   * The HSC curriculum PDF (৪৩ পৃষ্ঠা) is still a legacy Bijoy single-byte
--     file: `RvZxq wkÿvμg` where `জাতীয় শিক্ষাক্রম` belongs. Unchanged blocker,
--     re-confirmed rather than assumed.
--   * `hsc-physics-1st-paper-supplement-2026` (Internet Archive) is a
--     commercial exam question bank — অধ্যায়ভিত্তিক প্রশ্ন ও উত্তর by Lecture
--     Publications, listing board questions back to ২০১৫. Its OCR is Unicode
--     and perfectly readable, which makes it tempting. It is **not** an NCTB
--     textbook and its chapter list is not the textbook's contents page, so it
--     is registered as rejected rather than used.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   No chapters, no subjects, no topics, no verification upgrades. The counts
--   are unchanged: 86 subjects, 41 chapters, 0 topics, 0 verified.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Correct the note that claimed the page did not render
-- ---------------------------------------------------------------------------

update public.curriculum_pending_requirements
   set note = 'CORRECTED 2026-10-28: this page does render through the proxy — the earlier "পাতা widget returns navigation only" note was wrong. The table it renders lists exactly five books for ২০২৫-২৬, all compulsory: সাহিত্যপাঠ, সহপাঠ, English for Today, তথ্য ও যোগাযোগ প্রযুক্তি and its English version. It contains no Science, Humanities or Business Studies subject, so it cannot confirm the seeded elective lists, and they stay needs_verification.'
 where education_level = 'HSC'
   and stream = 'all'
   and academic_year = '2026–2027'
   and requirement = 'Elective and optional subject lists per stream (only the core 7/12/7 are seeded)';

-- ---------------------------------------------------------------------------
-- 2. Provenance for everything opened this round
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b',
   '২০২৫-২৬ শিক্ষাবর্ষের উচ্চ মাধ্যমিক স্তরের একাদশ-দ্বাদশ শ্রেণির পাঠ্যপুস্তক',
   'NCTB', 'textbook_list', 'HSC', '2025–2026', 'rendered', '2026-10-28',
   'RENDERED IN FULL. The table has exactly five rows, all compulsory: ১ সাহিত্যপাঠ, ২ সহপাঠ, ৩ English for Today, ৪ তথ্য ও যোগাযোগ প্রযুক্তি, ৫ তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন), each with two download links. Nothing group-specific and no elective appears. This is the page that was described as unreadable in 0009; the description was wrong, the emptiness is not.'),

  ('https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nctb/2026/9/5be8f27e-5220-4c2f-8cf6-7bb42c7d2648.pdf',
   '২০২৬-২০২৭ শিক্ষাবর্ষে উচ্চ মাধ্যমিক ও সমমান শ্রেণির জন্য নির্ধারিত পাঠ্যসূচি — বাংলা প্রথম পত্র',
   'NCTB', 'exam_syllabus', 'HSC', '2026–2027', 'rendered', '2026-10-28',
   'Text layer readable. Lists সাহিত্যপাঠ গদ্য ১২ ও কবিতা ১২, and সহপাঠ উপন্যাস লালসালু + নাটক সিরাজ-উ-দ্দোলা. An EXAM SYLLABUS: it names the pieces to be examined, not the textbook question set or its chapter numbering, so nothing was imported as chapters.'),

  ('https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nctb/2026/9/82c3294f-8f1d-4ab0-a85f-993766ded7bb.pdf',
   '২০২৬-২০২৭ শিক্ষাবর্ষে উচ্চ মাধ্যমিক ও সমমান শ্রেণির জন্য নির্ধারিত পাঠ্যসূচি — English 1st Paper',
   'NCTB', 'exam_syllabus', 'HSC', '2026–2027', 'rendered', '2026-10-28',
   'Text layer readable. Twelve units (Myths and Literature … Peace and Conflict) with their lessons, plus a Reading for Pleasure section. The document states "Subject : English 1st Paper (Subject Code- 107)" — the first official subject code recorded anywhere in this project. Exam syllabus, not textbook contents; nothing imported as chapters.'),

  ('https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nctb/2026/9/78491622-b852-466c-af8b-783718732428.pdf',
   '২০২৬-২০২৭ শিক্ষাবর্ষে উচ্চ মাধ্যমিক ও সমমান শ্রেণির জন্য নির্ধারিত পাঠ্যসূচি — তথ্য ও যোগাযোগ প্রযুক্তি',
   'NCTB', 'exam_syllabus', 'HSC', '2026–2027', 'rendered', '2026-10-28',
   'Text layer readable. Six chapters with Bengali titles: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত; কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং; সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস; ওয়েব ডিজাইন পরিচিতি এবং HTML; প্রোগ্রামিং ভাষা; ডেটাবেজ ম্যানেজমেন্ট সিস্টেম. Recorded as the syllabus it is — the ICT textbook contents page has not been read, and the two are not the same document.'),

  ('https://archive.org/details/hsc-physics-1st-paper-supplement-2026',
   'Hsc Physics 1st Paper Supplement 2026 (Lecture Publications) — third-party question bank',
   'Lecture Publications — third party, not NCTB', 'other', 'HSC', '2026 supplement', 'blocked', '2026-10-28',
   'Rejected. This is the most readable HSC Physics artefact found so far — 337 pages, Unicode Bengali OCR — and it is exactly what must not be used: a commercial chapter-wise question bank ("NCTB প্রদত্ত পূর্ণাঙ্গ সিলেবাস ও মানবন্টনের আলোকে", board questions ২০১৫-২০২৫). Its chapter headings are the publisher''s, not the textbook contents page. Registered so the next search does not mistake readability for authority.')
on conflict (url, document_type) do update set
  title           = excluded.title,
  authority       = excluded.authority,
  access_state    = excluded.access_state,
  academic_year   = excluded.academic_year,
  checked_at      = excluded.checked_at,
  note            = excluded.note;

-- ---------------------------------------------------------------------------
-- 3. Two new, sharper gaps
-- ---------------------------------------------------------------------------

insert into public.curriculum_pending_requirements
  (education_level, stream, academic_year, requirement, status, source_url, note)
values
  ('HSC', 'all', '2026–2027',
   'Group-wise textbook list (Science / Humanities / Business Studies) from NCTB',
   'source_blocked',
   'https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b',
   'The ২০২৫-২৬ HSC textbook page renders and lists five books, all compulsory — no group or elective title appears on it. So the inventory question is now precise: NCTB does not publish a group-wise HSC textbook list at that address, and the ১৩/১৪/৯ seeded lists are still unconfirmed. What would settle it: a rendered group-wise HSC book list (any year from ২০২৩ onward) or the printed ২০২৬-২৭ textbook distribution list.'),

  ('HSC', 'all', '2026–2027',
   'Textbook contents pages for the three subjects whose 2026–27 syllabus is published',
   'source_blocked',
   'https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nctb/2026/9/78491622-b852-466c-af8b-783718732428.pdf',
   'বাংলা প্রথম পত্র, English 1st Paper and ICT now have an official ২০২৬-২৭ exam syllabus with a readable text layer. None of them has a read textbook contents page, so no chapter row may claim these titles. The syllabus and the book must stay separate records; the ICT six-chapter list in particular is a syllabus, and treating it as the book would be the substitution this project forbids.')
on conflict (education_level, academic_year, stream, requirement) do update set
  status     = excluded.status,
  source_url = excluded.source_url,
  note       = excluded.note;
