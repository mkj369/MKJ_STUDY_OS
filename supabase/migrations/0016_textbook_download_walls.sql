-- ---------------------------------------------------------------------------
-- 0016 — Why the textbook PDFs are unreachable even when the link is found.
--
-- WHY THIS EXISTS
--   Two more walls were hit while looking for an HSC Science সূচিপত্র. Both
--   are worth a row because either one, discovered next round, would look
--   like an untried idea.
--
--   1. Google Drive, the destination of every NCTB textbook link, does not
--      serve the bytes. Following the ২০২৫-২৬ HSC list's সাহিত্যপাঠ link
--      returns Google's virus-scan interstitial, not the PDF:
--        "সাহিত্য পাঠ(একাদশ-দ্বাদশ শ্রেণি-2026 .pdf (620M) is too large for
--         Google to scan for viruses. Would you still like to download this
--         file?"
--      The "still download" step needs a per-request confirm token and a
--      cookie jar; this environment gets the warning page and nothing else.
--      So the size is not a bandwidth problem, it is an access problem, and
--      it applies to every HSC textbook on that host — including the Science
--      books the moment their links are published.
--
--   2. The older "all levels" archive pages do not hold the list either. The
--      ২০২১ page was opened as a fallback for a group-wise HSC inventory and
--      renders heading → "কন্টেন্ট: পাতা" → share bar, exactly like the
--      ২০২৬ pages in 0015. The archive is not a way around the empty ২০২৬-২৭
--      page.
--
-- WHAT THIS CHANGES
--   Nothing in the curriculum data. No chapter, no topic, no status upgrade.
--   These rows exist so that "NCTB does not publish a readable HSC Science
--   contents page in a form this environment can open" is a documented
--   finding with named walls, rather than a sentence someone has to trust.
--
-- WHAT WOULD STILL UNBLOCK IT (unchanged, now with the cost stated)
--   A supplied PDF or photographs of one chapter of an HSC Science book, with
--   the imprint page. A 620 MB scan of a whole book is not required — 10–30
--   pages of one chapter is enough to start the topic workflow in
--   docs/TOPIC_EXTRACTION.md.
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://drive.google.com/file/d/1Bfyt8NADDsRtpNt--mdDDzc29EV5Nnsu/view',
   'সাহিত্যপাঠ (একাদশ-দ্বাদশ শ্রেণি ২০২৬) — HSC Bangla textbook PDF on Google Drive',
   'NCTB — hosted on Google Drive', 'textbook', 'HSC', '2026', 'blocked', '2026-10-28',
   'Every NCTB textbook link points here and the bytes do not arrive: Google answers with the virus-scan interstitial — "সাহিত্য পাঠ(একাদশ-দ্বাদশ শ্রেণি-2026 .pdf (620M) is too large for Google to scan for viruses" — instead of the file. The confirm-token step needs a cookie jar this environment does not have. Recorded because it is the same wall that will face the HSC Science books once their links exist, and because 620 MB is not the reason: access is.'),

  ('https://nctb.gov.bd/pages/static-pages/6922dbc9933eb65569e0c85a',
   '২০২১ শিক্ষাবর্ষের সকল স্তরের পাঠ্যপুস্তকের তালিকা (archive, opened as a group-wise fallback)',
   'NCTB', 'textbook_list', 'HSC', '2021', 'blocked', '2026-10-28',
   'Opened hoping an older all-levels list would at least name the HSC Science books. It renders heading → "কন্টেন্ট: পাতা" → share bar with no rows, the same shape as the ২০২৬ pages in 0015. The archive is not a route around the empty ২০২৬-২৭ page.')
on conflict (url, document_type) do update set
  title         = excluded.title,
  authority     = excluded.authority,
  access_state  = excluded.access_state,
  academic_year = excluded.academic_year,
  checked_at    = excluded.checked_at,
  note          = excluded.note;
