-- ---------------------------------------------------------------------------
-- 0011 — HSC first: two-paper subjects, and the one HSC contents page that
--        survived
--
-- WHY THIS EXISTS
--   The person using this app is an HSC student, and until now every HSC
--   Science subject was a single row called "Physics" / "Chemistry" / … That is
--   wrong in a way that matters: HSC science subjects are examined as two
--   separate books — ১ম পত্র and ২য় পত্র — with two separate papers, and a
--   student revising "Physics 2nd Paper" cannot see that half of their syllabus
--   under a single flat "Physics".
--
-- THE SPLIT IS APPEND-ONLY
--   The existing four rows keep their ids and simply gain `paper_label =
--   '1st Paper'`. Four new rows are appended after them. A student who adopted
--   "Physics" yesterday still points at the same subject id today; renaming or
--   renumbering would have orphaned that link. This mirrors migration 0009.
--
-- WHAT WAS ACTUALLY READ FOR THE CHAPTERS
--   Item: https://archive.org/details/hsc-nctb-book-physics-2nd-part
--         ("physics 2nd paper", 151 scanned pages, official NCTB book)
--
--   That scan's OCR layer is ABBYY over a *legacy single-byte Bengali font*.
--   The Bengali glyphs come out as noise (`1. fe vt)[vB^ (Electrostatics or
--   Static Electricity)`), and no converter can recover them safely because OCR
--   has already mangled the byte values. Claiming a Bengali title from that
--   would be reconstruction, not reading.
--
--   What does survive is the English gloss printed in parentheses inside each
--   Bengali title on the book's own সূচিপত্র. Those fifteen glosses are
--   transcribed below **verbatim**, one per printed chapter, 1–15, in order.
--   `title_bn` is left null on every row because it was not readable — not
--   because it does not exist.
--
-- WHY `partially_verified`
--   * the source is OCR of a scan, not the publisher's file;
--   * the Bengali half of each title is unrecoverable from this artefact;
--   * the scan carries no legible imprint page, so its edition is unknown.
--   Each of those is listed in `curriculum_pending_requirements`.
--
-- WHAT IS NOT HERE
--   Physics 1st Paper (no readable scan exists — the four "hsc-nctb-book-
--   physics" items on the Internet Archive contain **no files at all**, only
--   metadata), Chemistry, Biology and Higher Mathematics (their scans are in
--   the same legacy encoding with no English gloss on the contents page), and
--   the HSC Humanities / Business Studies inventories.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The existing four HSC Science subjects become 1st Paper
-- ---------------------------------------------------------------------------

update public.curriculum_subjects
   set paper_label = '1st Paper'
 where id in (
   'a0000000-0000-4000-8000-000000002104', -- Physics
   'a0000000-0000-4000-8000-000000002105', -- Chemistry
   'a0000000-0000-4000-8000-000000002106', -- Biology
   'a0000000-0000-4000-8000-000000002107'  -- Higher Mathematics
 );

-- ---------------------------------------------------------------------------
-- 2. The 2nd Paper companions, appended so no id shifts
-- ---------------------------------------------------------------------------

insert into public.curriculum_subjects
  (id, curriculum_version_id, name, name_bn, paper_label, is_compulsory, sort_order,
   verification_status, source_url, source_document)
values
  ('a0000000-0000-4000-8000-000000002110', 'a0000000-0000-4000-8000-000000000021',
   'Physics', 'পদার্থবিজ্ঞান', '2nd Paper', false, 10,
   'partially_verified',
   'https://archive.org/details/hsc-nctb-book-physics-2nd-part',
   'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র (OCR; English gloss only)'),
  ('a0000000-0000-4000-8000-000000002111', 'a0000000-0000-4000-8000-000000000021',
   'Chemistry', 'রসায়ন', '2nd Paper', false, 11,
   'needs_verification',
   'https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
   null),
  ('a0000000-0000-4000-8000-000000002112', 'a0000000-0000-4000-8000-000000000021',
   'Biology', 'জীববিজ্ঞান', '2nd Paper', false, 12,
   'needs_verification',
   'https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
   null),
  ('a0000000-0000-4000-8000-000000002113', 'a0000000-0000-4000-8000-000000000021',
   'Higher Mathematics', 'উচ্চতর গণিত', '2nd Paper', false, 13,
   'needs_verification',
   'https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
   null)
on conflict (id) do update set
  paper_label     = excluded.paper_label,
  sort_order      = excluded.sort_order,
  source_url      = excluded.source_url,
  source_document = excluded.source_document;

-- ---------------------------------------------------------------------------
-- 3. Physics 2nd Paper: fifteen chapters, as printed
-- ---------------------------------------------------------------------------

insert into public.curriculum_chapters
  (id, curriculum_subject_id, title, title_bn, chapter_number, sort_order,
   source_url, source_document, source_checked_at, verification_status, is_demo)
values
  ('b0000000-0000-4000-8000-000000003001', 'a0000000-0000-4000-8000-000000002110', 'Electrostatics or Static Electricity', null, '1', 1, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ১; Bengali glyphs unreadable in the ABBYY scan of the legacy font, so the printed English gloss is recorded alone', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003002', 'a0000000-0000-4000-8000-000000002110', 'Electric Current and Circuit', null, '2', 2, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ২; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003003', 'a0000000-0000-4000-8000-000000002110', 'Heating & Chemical Effect of Electric Current', null, '3', 3, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ৩; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003004', 'a0000000-0000-4000-8000-000000002110', 'Magnetic Effect of Electric Current', null, '4', 4, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ৪; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003005', 'a0000000-0000-4000-8000-000000002110', 'Magnetic Material Terrestrial Magnetism', null, '5', 5, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ৫; English gloss only, reproduced as printed', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003006', 'a0000000-0000-4000-8000-000000002110', 'Electromagnetic Induction and Alternating Current', null, '6', 6, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ৬; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003007', 'a0000000-0000-4000-8000-000000002110', 'Electromagnetic Wave', null, '7', 7, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ৭; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003008', 'a0000000-0000-4000-8000-000000002110', 'Reflection Of light', null, '8', 8, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ৮; English gloss only, reproduced as printed', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003009', 'a0000000-0000-4000-8000-000000002110', 'Refraction of Light', null, '9', 9, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ৯; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003010', 'a0000000-0000-4000-8000-000000002110', 'Optical Instrument', null, '10', 10, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ১০; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003011', 'a0000000-0000-4000-8000-000000002110', 'Wave Theory Of Light', null, '11', 11, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ১১; English gloss only, reproduced as printed', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003012', 'a0000000-0000-4000-8000-000000002110', 'Electron And Photon', null, '12', 12, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ১২; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003013', 'a0000000-0000-4000-8000-000000002110', 'Atom', null, '13', 13, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ১৩; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003014', 'a0000000-0000-4000-8000-000000002110', 'Electronics', null, '14', 14, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ১৪; English gloss only', '2026-10-28'::date, 'partially_verified', false),
  ('b0000000-0000-4000-8000-000000003015', 'a0000000-0000-4000-8000-000000002110', 'Theory Of Relativity And Astro Physics', null, '15', 15, 'https://archive.org/details/hsc-nctb-book-physics-2nd-part', 'NCTB HSC পদার্থবিজ্ঞান ২য় পত্র — সূচিপত্র, Chapter ১৫; English gloss only', '2026-10-28'::date, 'partially_verified', false)
on conflict (curriculum_subject_id, chapter_number) where chapter_number is not null
do update set
  title               = excluded.title,
  sort_order          = excluded.sort_order,
  source_url          = excluded.source_url,
  source_document     = excluded.source_document,
  source_checked_at   = excluded.source_checked_at,
  verification_status = excluded.verification_status;

-- ---------------------------------------------------------------------------
-- 4. Provenance
-- ---------------------------------------------------------------------------

insert into public.curriculum_sources
  (url, title, authority, document_type, education_level, academic_year,
   access_state, checked_at, note)
values
  ('https://archive.org/details/hsc-nctb-book-physics-2nd-part',
   'NCTB HSC Physics 2nd Paper (Bangla), 151-page scan',
   'NCTB — scan hosted by Internet Archive', 'textbook', 'HSC', 'edition unknown', 'partial', '2026-10-28',
   'Contents page read: 15 numbered chapters, English glosses legible. Bengali titles are unrecoverable — the scan was OCRed over a legacy single-byte font. No legible imprint page, so the edition cannot be recorded and the subject stays partially_verified.'),
  ('https://archive.org/details/hsc-nctb-book-biology',
   'NCTB HSC Biology 1st Paper (Bangla), 53-page scan',
   'NCTB — scan hosted by Internet Archive', 'textbook', 'HSC', 'edition unknown', 'blocked', '2026-10-28',
   'Same legacy-font problem with no English gloss in the chapter headings: the OCR of the contents page is unreadable and nothing was imported from it.'),
  ('https://archive.org/details/hsc-nctb-book-physics',
   'hsc-nctb-book-physics (Internet Archive item)',
   'Internet Archive upload, not verified as NCTB', 'textbook', 'HSC', 'unknown', 'unreachable', '2026-10-28',
   'The four items named hsc-nctb-book-physics* contain no book files at all — only metadata, an empty item. Recorded so nobody re-checks them expecting a PDF.')
on conflict (url, document_type) do update set
  title           = excluded.title,
  access_state    = excluded.access_state,
  academic_year   = excluded.academic_year,
  checked_at      = excluded.checked_at,
  note            = excluded.note;

-- ---------------------------------------------------------------------------
-- 5. What is still outstanding for HSC, stated plainly
-- ---------------------------------------------------------------------------

insert into public.curriculum_pending_requirements
  (education_level, stream, academic_year, requirement, status, source_url, note)
values
  ('HSC', 'Science', '2026–2027',
   'Bengali titles for the 15 Physics 2nd Paper chapters',
   'source_blocked',
   'https://archive.org/details/hsc-nctb-book-physics-2nd-part',
   'The printed English gloss is recorded; the Bengali half of each title is not, because the scan was OCRed over a legacy single-byte font and no converter can recover mangled bytes. A photograph or PDF of the book''s সূচিপত্র page would settle it, and would also supply the edition.'),

  ('HSC', 'Science', '2026–2027',
   'Physics 1st Paper, Chemistry, Biology and Higher Mathematics chapter lists',
   'source_blocked',
   'https://nctb.gov.bd/pages/files/6922dbc6933eb65569e0c702',
   'No readable HSC science textbook is available in this environment: the Internet Archive items that exist are either empty (hsc-nctb-book-physics*) or legacy-font scans with unreadable contents pages. The NCTB higher-secondary curriculum PDF is the right document but is itself a legacy single-byte PDF, and the 2025–26 HSC textbook list page renders as an unresolved পাতা widget.'),

  ('HSC', 'all', '2026–2027',
   'Elective and optional subject lists per stream (only the core 7/12/7 are seeded)',
   'source_blocked',
   'https://nctb.gov.bd/pages/static-pages/6922e145933eb65569e2b37b',
   'The ২০২৫-২৬ HSC textbook list is published, but its body is a পাতা sub-page widget that returns navigation only — the same failure as the 2026 SSC list. So the seeded elective lists remain unverified and must not be read as the complete HSC inventory.')
on conflict (education_level, academic_year, stream, requirement) do update set
  status     = excluded.status,
  source_url = excluded.source_url,
  note       = excluded.note;
