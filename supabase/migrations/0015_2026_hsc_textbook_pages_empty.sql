-- ---------------------------------------------------------------------------
-- 0015 — The ২০২৬ HSC textbook pages exist. Both are empty.
--
-- WHY THIS EXISTS
--   Round 5's report would otherwise leave two wrong impressions:
--
--   1. That no ২০২৬-২৭ HSC textbook page exists. One does. It was created and
--      last touched on **২৭ অক্টোবর ২০২৬** — the day before this migration —
--      and its body is empty: the render ends at "কন্টেন্ট: পাতা" and goes
--      straight to the share bar. The page is not blocked by this environment;
--      it has nothing in it yet.
--   2. That the HSC Science blocker is 'we have not looked'. We have. This
--      migration records what came back, so the next round starts from the
--      actual walls instead of repeating the search.
--
-- WHAT WAS OPENED (2026-10-28)
--   a. https://nctb.gov.bd/pages/static-pages/…-9c77c1-695b98afc4774958d7b7044c
--      "২০২৬ শিক্ষাবর্ষের মাধ্যমিক স্তর ও উচ্চ মাধ্যমিক স্তরের পাঠ্যপুস্তকের
--      তালিকা" — heading + "কন্টেন্ট: পাতা", no table. Last updated
--      ২৭ অক্টোবর ২০২৬ ০৫:০০ PM.
--   b. https://nctb.gov.bd/pages/static-pages/…-o4phi6-6ae03d7be0cf994829342115
--      "২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক স্তরের একাদশ-দ্বাদশ শ্রেণির
--      পাঠ্যপুস্তক" — heading + "কন্টেন্ট: পাতা", no table. Last updated
--      ২৭ অক্টোবর ২০২৬ ১২:১০ PM.
--      Both were read through the same rendering proxy that successfully
--      returns the ২০২৫-২৬ page's five-row table, so the proxying is not the
--      cause: the two ২০২৬ pages are genuinely unfilled.
--   c. https://archive.org/details/hsc-nctb-book-biology (+ its _djvu.txt)
--      53 pages at 600 ppi, ABBYY FineReader 11 text layer, description
--      "HSC Biology 1st paper". It is a partial scan that starts mid-book at
--      chapter ১ (Cell and Cell Structure) — there is no সূচিপত্র page in it —
--      and the text layer is legacy single-byte: "CELL AND CELL STRUCTURE"
--      survives as a Latin heading while the Bengali becomes
--      "C^1^: C^RiM^ C#®'S". Unusable, and not the full book either way.
--   d. Object-listing on the Oracle bucket that serves NCTB's born-digital
--      PDFs:
--        GET …/n/axvjbnqprylg/b/V2Ministry/o?prefix=office-nctb/2026/9/
--        → {"code":"BucketNotFound", …not authorized…}
--      Individual object URLs work (that is how the three syllabi were read)
--      but the bucket cannot be enumerated, so textbook PDFs there can only be
--      found by their published links, not by search.
--
-- WHAT IT MEANS
--   Requirement 16 ("group-wise HSC textbook list") is not answered by the new
--   page yet — it is answered by nothing at all. Status stays `source_blocked`,
--   but the note now says the page is published and empty rather than missing,
--   which is a different thing to wait for and a different thing to chase.
--   Requirement 13 ("Physics 1st Paper, Chemistry, Biology and Higher
--   Mathematics chapter lists") carried a sentence repeated from 0009 that the
--   ২০২৫-২৬ HSC list "renders as an unresolved পাতা widget". That sentence was
--   already known to be false (0013 corrected the same claim on requirement 8);
--   this migration corrects it here too and replaces it with the real walls.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   No chapters, no topics, no verification changes. Counts stay at
--   86 subjects · 41 chapters · 0 official topics · 0 verified subjects.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Correct the stale claim on the HSC Science requirement
-- ---------------------------------------------------------------------------

update public.curriculum_pending_requirements
   set note = 'CORRECTED 2026-10-28: the ২০২৫-২৬ HSC textbook page renders — an earlier version of this note said it did not. It renders five books, all compulsory, and none of them is a Science subject. What actually blocks this requirement, checked this round: (1) the ২০২৬-২৭ HSC textbook page exists but its body is empty (published ২৭ অক্টোবর ২০২৬, no table); (2) archive.org hsc-nctb-book-biology is a 53-page partial whose legacy-font OCR layer is unusable and which contains no সূচিপত্র page; (3) NCTB''s Oracle bucket refuses object listing (BucketNotFound), so its textbook PDFs cannot be enumerated, only opened by a published link; (4) the higher-secondary curriculum PDF is still legacy Bijoy. Still needed: one readable Physics 1st Paper, Chemistry, Biology or Higher Mathematics সূচিপত্র, with its edition.',
   status = 'source_blocked',
   source_url = 'https://nctb.gov.bd/pages/static-pages/6922dbc6933eb65569e0c702'
 where education_level = 'HSC'
   and stream = 'Science'
   and academic_year = '2026–2027'
   and requirement = 'Physics 1st Paper, Chemistry, Biology and Higher Mathematics chapter lists';

-- ---------------------------------------------------------------------------
-- 2. Requirement 16: the page is published, and it is empty
-- ---------------------------------------------------------------------------

update public.curriculum_pending_requirements
   set note = 'UPDATED 2026-10-28: the page that would answer this now exists — "২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক স্তরের একাদশ-দ্বাদশ শ্রেণির পাঠ্যপুস্তক" (nctb.gov.bd, last updated ২৭ অক্টোবর ২০২৬) — but its body is empty: the render ends at "কন্টেন্ট: পাতা" with no table. The ২০২৬ combined "মাধ্যমিক স্তর ও উচ্চ মাধ্যমিক স্তরের পাঠ্যপুস্তকের তালিকা" page is empty in the same way. So the blocker is now "published but not yet filled", not "not published" and not "unreadable". The ১৩/১৪/৯ seeded lists remain unconfirmed and must stay needs_verification until one of those pages is filled or an official group-wise list is supplied.',
   source_url = 'https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b'
 where education_level = 'HSC'
   and stream = 'all'
   and academic_year = '2026–2027'
   and requirement = 'Group-wise textbook list (Science / Humanities / Business Studies) from NCTB';

-- ---------------------------------------------------------------------------
-- 3. Provenance for the three documents opened in this pass
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://nctb.gov.bd/pages/static-pages/6922dd35933eb65569e13f12',
   '২০২৩ শিক্ষাবর্ষের সকল স্তরের পাঠ্যপুস্তক (archive index, opened for a group-wise HSC list)',
   'NCTB', 'textbook_list', 'HSC', '2023', 'blocked', '2026-10-28',
   'Opened as a fallback: an older all-levels list would at least document the ২০২৩ HSC Science subjects. The rendered body stops at "কন্টেন্ট: পাতা" — no book rows. Not used, and its year would not have answered a ২০২৬-২৭ question even if it had.'),

  ('https://nctb.gov.bd/pages/static-pages/২০২৬-শিক্ষাবর্ষের-মাধ্যমিক-স্তর-ও-উচ্চ-মাধ্যমিক-স্তরের-9c77c1-695b98afc4774958d7b7044c',
   '২০২৬ শিক্ষাবর্ষের মাধ্যমিক স্তর ও উচ্চ মাধ্যমিক স্তরের পাঠ্যপুস্তকের তালিকা',
   'NCTB', 'textbook_list', 'HSC', '2026', 'blocked', '2026-10-28',
   'Exists and is titled correctly; body is an unfilled পাতা widget. Rendered: heading → "কন্টেন্ট: পাতা" → share bar. Last updated ২৭ অক্টোবর ২০২৬, ০৫:০০ PM. Would answer requirement 16 if filled.'),

  ('https://nctb.gov.bd/pages/static-pages/২০২৬-২৭-শিক্ষাবর্ষের-উচ্চ-মাধ্যমিক-স্তরের-একাদশ-দ্বাদশ-শ্রেণির-পাঠ্যপুস্তক-o4phi6-6ae03d7be0cf994829342115',
   '২০২৬-২৭ শিক্ষাবর্ষের উচ্চ মাধ্যমিক স্তরের একাদশ-দ্বাদশ শ্রেণির পাঠ্যপুস্তক',
   'NCTB', 'textbook_list', 'HSC', '2026–2027', 'blocked', '2026-10-28',
   'The ২০২৬-২৭ HSC textbook list page itself. Published ২৭ অক্টোবর ২০২৬, ১২:১০ PM, and empty: heading, "কন্টেন্ট: পাতা", share bar, nothing between. Read through the same proxy that returns the ২০২৫-২৬ page in full, so the emptiness is the page''s, not the proxy''s. This is the single document whose publication would settle the HSC inventory.'),

  ('https://archive.org/details/hsc-nctb-book-biology',
   'hsc-nctb-book-biology — partial scan described as "HSC Biology 1st paper"',
   'Internet Archive upload (third party)', 'textbook', 'HSC', 'edition unknown', 'partial', '2026-10-28',
   'Re-read 2026-10-28: 53 pages at 600 ppi, ABBYY FineReader 11 layer, 3.7 MB PDF. The scan begins mid-book at chapter ১ (Cell and Cell Structure) — there is no সূচিপত্র and no imprint page in it at all. The text layer is legacy single-byte, so the Bengali is mojibake while Latin headings survive. Nothing imported.')
on conflict (url, document_type) do update set
  title         = excluded.title,
  authority     = excluded.authority,
  access_state  = excluded.access_state,
  academic_year = excluded.academic_year,
  checked_at    = excluded.checked_at,
  note          = excluded.note;
