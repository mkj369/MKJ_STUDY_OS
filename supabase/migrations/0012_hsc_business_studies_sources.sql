-- ---------------------------------------------------------------------------
-- 0012 — HSC Business Studies: two more official books found, neither
--        importable, and saying exactly why
--
-- WHY THIS EXISTS
--   Until now the HSC Business Studies group had no source rows at all: the
--   nine subjects were seeded from the curriculum notice and nothing had been
--   opened to check whether their books even exist online.
--
--   They do. Two more official NCTB scans are on the Internet Archive:
--
--     * HSC Business Organisation and Management — 246 pages, ABBYY OCR
--     * HSC Accounting — 441 pages, ABBYY OCR
--
--   Both were opened in full. Neither produced an importable chapter list, and
--   this migration records what each one gave up rather than leaving the gap
--   looking unexplored.
--
-- WHAT WAS READ, EXACTLY
--   * Accounting: the সূচিপত্র prints each chapter's English title in the body
--     of the row. Ten of them are legible end to end:
--       INTRODUCTION TO ACCOUNTING · BOOKS OF ACCOUNTS ·
--       BANK RECONCILIATION STATEMENT · TRIAL BALANCE ·
--       PRINCIPLES OF ACCOUNTING · ACCOUNTING FOR RECEIVABLES · WORKSHEET ·
--       ACCOUNTING FOR TANGIBLE AND INTANGIBLE ASSETS ·
--       FINANCIAL STATEMENTS · SINGLE ENTRY SYSTEM
--     The Bengali title column and the chapter-number column are printed in
--     Bengali digits, which the legacy single-byte font destroys: `১.` comes
--     out as `\s`, `৩.` as `8.`, and so on with no stable mapping. So the
--     titles exist but the *numbers* do not. Numbering them 1…10 by their
--     order on the page would be an inference, and a wrong inference shifts
--     every later chapter — so nothing is imported.
--     (Physics 2nd Paper was importable precisely because its chapter numbers
--     are printed in Latin digits and survived.)
--   * Business Organisation and Management: no English gloss anywhere on the
--     contents page. Titles and numbers are both mojibake. Nothing to import.
--
--   A third finding, recorded to stop the search repeating: the three
--   "…pdf-by-10-minute-school" items are not NCTB textbooks. Their text layer
--   is a coaching slide deck (slide headers, "10 Minute School" footers,
--   topic lists), so they cannot serve as evidence for a textbook's contents
--   even though their Bengali OCR is clean. They are registered as rejected.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   It adds no chapters, no subjects, no topics, and changes no verification
--   status. The HSC Business Studies group still has 9 subjects and 0
--   chapters.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Provenance
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://archive.org/details/hsc-nctb-book-accounting',
   'NCTB HSC Accounting (Bangla), 441-page scan',
   'NCTB — scan hosted by Internet Archive', 'textbook', 'HSC', 'edition unknown', 'partial', '2026-10-28',
   'Contents page opened. Ten English chapter titles are legible verbatim (INTRODUCTION TO ACCOUNTING … SINGLE ENTRY SYSTEM); the Bengali titles and the chapter numbers are unreadable because both are printed in Bengali digits over a legacy single-byte font. Nothing imported: numbering the rows by their order would be inference, not reading.'),

  ('https://archive.org/details/hsc-nctb-book-business-organisation-and-management',
   'NCTB HSC Business Organisation and Management (Bangla), 246-page scan',
   'NCTB — scan hosted by Internet Archive', 'textbook', 'HSC', 'edition unknown', 'blocked', '2026-10-28',
   'Contents page opened. The chapter rows carry no English gloss, so both the titles and the numbers are mojibake. Nothing imported. English section headings do appear inside the body, but mapping them back to chapter numbers would be reconstruction.'),

  ('https://archive.org/details/hsc-physics-1st-and-2nd-pdf-by-10-minute-school',
   'HSC Physics 1st and 2nd PDF by 10 Minute School (third-party upload)',
   '10 Minute School — third party, not NCTB', 'other', 'HSC', '2021 upload', 'blocked', '2026-10-28',
   'Rejected as evidence, not "unavailable". The scan OCRs cleanly because it is a born-digital slide deck, but it is a coaching class handout, not the NCTB textbook: no official সূচিপত্র, no imprint page, no chapter numbering. The same applies to its Chemistry and Biology siblings. Using it would replace the textbook contents with a third party''s syllabus — exactly what this project must not do.')
on conflict (url, document_type) do update set
  title           = excluded.title,
  authority       = excluded.authority,
  access_state    = excluded.access_state,
  academic_year   = excluded.academic_year,
  checked_at      = excluded.checked_at,
  note            = excluded.note;

-- ---------------------------------------------------------------------------
-- 2. What is still outstanding for HSC Business Studies
-- ---------------------------------------------------------------------------

insert into public.curriculum_pending_requirements
  (education_level, stream, academic_year, requirement, status, source_url, note)
values
  ('HSC', 'Business Studies', '2026–2027',
   'Chapter numbers and Bengali titles for the ten legible Accounting chapters',
   'source_blocked',
   'https://archive.org/details/hsc-nctb-book-accounting',
   'The English titles survived the OCR; the Bengali titles and the chapter numbers did not, because they are printed in Bengali digits over a legacy single-byte font. A photograph or PDF of the সূচিপত্র page (and the imprint page, for the edition) would make this subject importable in one pass.'),

  ('HSC', 'Business Studies', '2026–2027',
   'Chapter list for Business Organisation and Management',
   'source_blocked',
   'https://archive.org/details/hsc-nctb-book-business-organisation-and-management',
   'The only official scan available has a contents page with no English gloss: every title and number is mojibake. Needs the printed সূচিপত্র page, or a born-digital edition of the book.')
on conflict (education_level, academic_year, stream, requirement) do update set
  status     = excluded.status,
  source_url = excluded.source_url,
  note       = excluded.note;
