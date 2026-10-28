# Progress, flagging and report rules

Everything here is deterministic, testable, and visible in the UI. The guiding rule:

> A missing record is missing information. It is never treated as proof that the
> student did not study, and the app never invents a denominator to make a
> percentage look complete.

All functions take `today` (a `YYYY-MM-DD` date) or `now` explicitly; there is no hidden
clock, random number or network call in this layer.

---

## 1. Checklist completion

- Denominator = active checklist items for the chapter (archived items are ignored).
- A missing progress row means **not done**, and is shown as pending, not as a failure.
- No items → `percent = null` → UI renders “Not recorded”.
- Completing every item is **completion of the checklist**, not mastery of the chapter.

## 2. Lecture counts

- `logged` = lecture rows for the chapter, `completed` = rows with `is_completed`.
- A percentage is only computed when the student set a lecture target
  (`lecture_target_count > 0`). Otherwise the UI shows “N lectures completed · no target
  set”. The app never infers a total from a book, a rumour or an AI answer.

## 3. Revision schedule

- Each revision records a date, a method and a confidence rating 1–5.
- If the student entered a `next_review_date`, that date wins (the earliest recorded
  future date is used when several exist).
- Otherwise the app suggests a date from the confidence rating, and labels it
  **suggested**:

  | Confidence | Interval |
  | --- | --- |
  | 1–2 (could not / barely recall) | 1 day |
  | 3 (partly recalled) | 3 days |
  | 4 (mostly solid) | 7 days |
  | 5 (easy recall) | 14 days |

- `dueState`: `overdue` (date passed), `due_today`, `not_due`, or `none` (no revisions).
- A chapter with no revisions is **not** listed as due. It is simply not recorded.

## 4. Exams

- `percent = obtained / total`, `null` when total is 0 (never a division by zero).
- Summary includes count, average, latest, best and a trend: improving / declining when
  the latest result differs from the previous by ≥ 5 percentage points, otherwise flat.
- Results are recorded facts. The app never predicts a future mark or rank.

## 5. Chapter status

The student can always set a status manually. When they have not, the engine derives one
in this order:

1. Declared `blocked` → **Blocked** (human statement wins).
2. Declared `complete` → **Complete** (human statement wins, and the UI says so).
3. **Evidenced mastery** → **Complete**: checklist 100 % **and** latest exam ≥ 80 % **and**
   no open difficulty **and** no unresolved mistake.
4. No records at all → **Not recorded** (or **Not started** only if the student declared it).
5. Open difficulty, unresolved mistake, or a practice item ticked without any practice
   session → **Needs practice**.
6. Next revision overdue, or last revision older than 21 days → **Needs revision**.
7. Otherwise → **In progress**.

If the declared status differs from the derived one, the UI keeps the declared status and
states what the records would suggest.

## 6. Flags ("why is this chapter flagged?")

Each flag carries a code, a kind (`missing_data` or `evidence`), a severity and a reason
written in plain language. Current codes:

| Code | Kind | Trigger |
| --- | --- | --- |
| `no_records` | missing data | no records at all for the chapter |
| `practice_unchecked` | evidence / missing | practice ticked without a session, or practice not ticked while checklist exists |
| `difficulty_open` | evidence | one or more difficulties not resolved |
| `mistakes_unresolved` | evidence | mistakes not marked corrected |
| `revision_overdue` | evidence | the recorded/suggested review date passed |
| `revision_stale` | evidence | last revision older than 21 days |
| `lecture_target_unmet` | evidence | completed lectures below the target the student set |
| `low_exam_result` | evidence | most recent entered result below 50 % |
| `overdue_task` | evidence | linked open task past its due date |
| `stale_activity` | missing data | no records for 21 days while checklist remains open |

The UI always shows the evidence next to the flag and never uses shaming wording.
Streak-loss warnings and comparisons with other students are deliberately absent.

## 7. Subject attention score

Used only to order subjects on the dashboard. Each item names its evidence:

| Item | Points |
| --- | --- |
| Chapter with an open high-severity difficulty | 4 each |
| Overdue revision | 3 each |
| Overdue task | 3 each |
| Latest result below 50 % | 2 each |
| Open tasks but none overdue | 1 (once) |

With no evidence-based gaps the reason text is “No evidence-based gaps flagged”.

## 8. Weekly plan

- The draft fills the remaining days of the current week using the study windows the
  student entered. Days already in the past are never used.
- Tasks already planned on a visible day keep that day (locked).
- Remaining tasks are ordered: overdue → due soonest → priority → carried-over count →
  shorter first.
- If nothing fits, the task stays in `unscheduled`; it is never deleted.
- Warnings are explicit: no study time entered, plan exceeds capacity, tasks that do not
  fit, tasks carried forward. “Accept plan” only writes days that still exist.
- The recovery option keeps what fits and defers the rest; it never deletes work.

## 9. Reminder planning

- Reminders are planned in the student's IANA time zone.
- Quiet hours (default 22:00–07:00) move a reminder to the end of the quiet window.
- Anything whose instant is already in the past is skipped and counted as suppressed.
- Duplicate `reminder_key` values are skipped (no double reminders).
- The daily cap (default 3, max 20) counts existing non-failed events for that local day.
- Status starts as `scheduled`. It becomes `sent` only after the platform confirms.
  Failures are `failed` with an error message; skipped items are `skipped`.
- The web build cannot schedule native notifications and says so instead of pretending.

## 10. Weekly report

Deterministic report (always available):

- **Observed facts** are counts and sums from this week only, each with evidence rows.
- **Possible gaps** come from chapter flags plus overdue tasks, capped at 6, each with
  evidence.
- **Missing data** lists the kinds of records not entered and states that missing data
  is not proof of inactivity.
- **Recommendations** are specific and capped at 5, each backed by a record.
- **Suggested tasks** are capped at 5, 5–180 minutes, and only exist when a
  recommendation justifies them.
- Comparisons use the previous week's total only when a previous total exists.

AI narrative (optional):

- Uses only the facts payload for the requested week.
- Must return strict JSON matching the report schema; unknown shapes are rejected.
- Numbers in prose must also appear in the facts payload; invented numbers reject the
  whole response.
- The server always overwrites `generated_at`, `week`, `metrics`, `disclaimer`,
  `provider` and `model`; the model cannot claim these.
- Failure (timeout, rate limit, provider error, invalid output) leaves the deterministic
  report untouched and the UI reports the reason.

## 11. Import

- CSV or JSON; headers are optional for CSV but aliases are recognised
  (`subject`, `subject name`, `chapter`, `chapter title`, `lecture target`, …).
- Rows are validated one by one: `ready`, `duplicate` (already in the workspace or
  repeated in the file) or `invalid` with a row number and a message.
- Nothing is written before the student confirms the preview.
- Each import creates a batch id; rollback removes only the chapters in that batch and
  unlinks (never deletes) records attached to them.
- A subject is never deleted by an import rollback.

---

# Part 2 — syllabus, time, planning, revision, mistakes and insights

The same rule applies throughout: **recorded evidence is shown, missing evidence is
labelled “Not recorded”, and no percentage is ever invented.** Phase 2 adds columns to the
existing tables (`supabase/migrations/0003_learning_systems.sql`) and reads the Phase 1
records rather than duplicating them.

## 12. Syllabus tracker

- Eleven activities are tracked **independently** per chapter: book reading, lectures,
  notes, formula sheet / concept book, practice, board questions, admission questions,
  MCQs, written questions, revision and self test. Ticking “lectures” never ticks
  “practice”.
- Checklist items drive ten of them. **Revision** is evidenced by revision rows (a
  revision can happen without a checklist item), so it is counted separately.
- Topic progress: denominator = topics the student created for that chapter. A chapter
  with no topics returns `null` and renders “No topics recorded”, never 0 %.
- Chapter coverage = **completed** activities ÷ 11 (the number of activity types that have
  any record is shown separately). Subject coverage is computed from its chapters; an empty
  subject is “Not recorded”, not 0 %.
- Each chapter is classified as **demo**, **custom** (`curriculum_chapter_id = null`) or
  **official**. A curriculum version carries `authority`, `education_level`,
  `academic_year` and `verification_status`; the demo seed stays `needs_verification`
  and the UI repeats that until a real source is imported.
- Completion estimates use the student's own recorded minutes per completed chapter. With
  fewer than two completed samples the app falls back to a 120-minute planning figure and
  says so in its assumptions. With no weekly availability it returns “add your study
  availability” instead of a date. Every estimate is labelled **estimate**, lists its
  assumptions and is never presented as a promise.

## 13. Daily time tracking

- There is **one** source of study minutes: `study_sessions` (Phase 1). The timeline adds
  `daily_blocks` for non-study time only (college, sleep, breaks, personal…). A block can
  never be a second copy of a study session, so totals cannot double count.
- A manual entry stores a date, a category and minutes. Start/end timestamps are
  optional and are only used for ordering and overlap checks.
- **Overlap**: two entries that both have start/end timestamps and share wall-clock
  minutes are reported, with the overlapping minutes. Neither entry is silently edited.
- **Duplicates**: same day, same category, same minutes (and same start when both are
  timed) is shown as a *warning* before saving; the student decides.
- **Timer**: `timerResult` caps a running timer at 180 minutes and reports
  `exceededMax` so the UI can ask what really happened instead of inflating the day.
  The timer is foreground-only — there is no background tracking and no claim to it.
- **Planned vs actual**: planned minutes come from tasks/blocks; actual comes from
  records. Differences are shown as arithmetic, not as a judgement.
- Rest days are explicit: a day with no planned study window is labelled “Rest day” and
  is never counted as a missed goal. There are no streaks to break.
- Time zones: dates are local calendar dates; ISO timestamps are stored in UTC. Nothing
  is inferred across a midnight boundary.

## 14. Smart planner and guilt-free recovery

- **Suggested plan ≠ accepted plan.** Suggestions are derived from revision due dates,
  overdue tasks, unresolved mistakes and remaining syllabus; only a suggestion the
  student accepts becomes a task (`suggestionToTask`).
- A suggestion carries its evidence list, so the student can see *why* it appeared.
- Large tasks are split into steps of 5–90 minutes; the student can accept, split,
  reschedule, postpone or reject.
- **Recovery** (`buildRecoverySuggestion`) is deliberately non-punitive: it picks the
  smallest set of steps that restores the schedule and drops the rest without
  labelling the student “behind” or “lazy”. Nothing is auto-deleted; postponed work is
  carried over with a new date.

## 15. Smart revision

- The spaced baseline is the Phase 1 confidence interval table (1–2 → 1 day, 3 → 3 days,
  4 → 7 days, 5 → 14 days). A student-entered `next_review_date` always wins.
- Queue buckets: `overdue`, `due_today`, `this_week`, `later`. Chapters with no
  revisions are **not** due — they are “not recorded”.
- Revision history, last/next revision and exam results are shown together, but a
  revision count is **never** converted into a mastery score.
- “Revision Due Today” on the dashboard is the same queue, filtered — one source of
  truth.
- Recall results (a revision's confidence) affect only the next suggested date.

## 16. Mistake book and weakness analyzer

- A mistake stores category, what went wrong, the attempted answer, the correction and
  the lesson learned. It links to a subject and chapter, optionally to an exam result and
  optionally to the practice question that produced it (migration `0005`). Linkage to
  revision is through the chapter, because revisions are recorded per chapter.
- **Recurring** requires the same category on **different days** (and at least two
  records). A single mistake is never called a pattern.
- Weakness = ranking of categories and chapters by unresolved, recurring mistakes with
  the affected subjects named. The analyzer only reports what the records support; it
  never diagnoses a student's ability.
- Marking a mistake resolved stamps `resolved_at`; it stays in the history.
- Weakness is not inferred from marks alone and never from missing data.

## 17. Exam countdown and preparation mode

- `daysRemaining` is calendar arithmetic from the local date. An exam today shows
  “today”, a past exam is archived rather than showing negative days.
- Coverage = syllabus items with evidence ÷ items in scope, restricted to the chapters
  the student linked to that exam.
- The draft preparation plan lists outstanding syllabus, due revisions and weak areas,
  each with its evidence, and proposes tasks. **No predicted mark, rank or grade is ever
  produced.**

## 18. Notes, formula vault and question practice

- Notes carry a kind (`note`, `formula`, `definition`, `bookmark`), tags and a pinned
  flag; search covers title, body and tags. The formula vault filters the same rows by
  kind — there is no second copy of the data.
- Practice questions have a source: `user`, `imported` or `ai`. An AI-sourced question
  is labelled on the question, in the queue and in the export, and is never described as
  official or NCTB.
- Accuracy = correct ÷ attempts, and is `null` for an untried question (“Not recorded”).
  “Needs review” is set by the student or by an incorrect attempt, not guessed.
- Attempts must reference a question that belongs to the student (composite FK in
  Postgres); the local repository applies the same rule.

## 19. Progress insights and AI coach

Four bands, always in this order:

1. **Observed** — counts and sums from records, each with evidence.
2. **Calculated** — arithmetic with the formula named, so it can be checked by hand.
3. **Interpretations** — labelled low/medium confidence, each with evidence and a caveat.
4. **Missing** — what is not recorded, phrased as missing data, never as idleness.

Recommendations (deterministic next steps) are capped and evidence-backed. AI
recommendations are additional, labelled, and optional: with no provider configured the
page still renders bands 1–4.

## 20. Focus mode

- A focus session is a foreground timer linked to an optional task/subject/chapter.
- `FOCUS_LIMITS`: 5–120 minute focus blocks, ≤ 30 minute breaks, ≤ 8 intervals.
- Pause/resume bank the elapsed seconds; a paused session does not drift.
- Finishing writes **one** `study_sessions` row and one `focus_sessions` row, so time
  appears in the Time Tracker exactly once.
- The break timer is optional and a skipped break never breaks anything. There are no
  punitive streaks.

## 21. Export and academic history

- Export produces a JSON backup (every table the app reads, plus `exported_at`, `mode`,
  `profile`, `demo_active`) and CSV for one selected table. Demo rows are included and
  keep `is_demo = true`, so an export can be audited.
- History survives curriculum changes: archiving a subject/chapter keeps its sessions,
  revisions, mistakes and notes; deleting a chapter unlinks rather than deletes records.
- Deleting a subject is blocked while linked records exist (Phase 1 rule, still true).
- Backup = export. **Restoring a JSON backup is not implemented yet**; the only import is
  the reviewed chapter import, which is a different feature. Account deletion is handled
  by the `delete-account` Edge Function in cloud mode; in demo mode “Delete all my
  records” clears the workspace rows (the profile stays).

---

# Part 2 — how the study-system features decide things

These rules are implemented in `src/domain/*` and covered by `tests/domain/*` (plus the
browser journeys in `tests/e2e/journeys.spec.ts`). Every function takes `today`/`now` as
an argument, so the same input always produces the same output.

## 12. Syllabus tracker

- The syllabus is browsed by class grade → stream → version → subject → chapter → topic.
  Filters change **what you browse**, never what you have recorded.
- Eleven activities are tracked independently per chapter: book reading, lectures, notes,
  formula sheet, practice, board questions, admission questions, MCQs, written questions,
  revision and self test. Ticking “book reading” cannot tick “practice”.
- Checklist-backed activities use their own items; revision uses revision rows and
  lectures use lecture rows. A missing row is “not recorded”, not “not done”.
- Chapter coverage = completed activities ÷ 11, shown next to the number of activity types
  that have any record. Topic progress = completed topics ÷ topics you created; no topics
  means “not recorded”.
- Custom chapters and topics are marked *custom*; rows copied from the demo curriculum
  keep the Demo badge. Browsing a version shows its `authority`, `academic_year`,
  `version_label` and `verification_status`, and says so when a source URL is missing.
- The finish estimate uses your own recorded minutes per completed chapter; with fewer
  than two samples it uses a 120-minute planning figure and names that assumption. It
  returns “not enough data” or “add availability” rather than inventing a date. It is
  always labelled an estimate and never used for marks.

## 13. Daily time tracker

- **Study minutes have one home:** `study_sessions`. The daily timeline *also* shows
  non-study blocks stored in `daily_blocks` (college, class, exam, homework, sleep, break,
  personal, commute, custom). The two sets are disjoint by category, so a day’s totals
  cannot double count.
- A block records a date, a category and minutes. Start/end timestamps are optional and
  are used only for ordering, overlap checking and the stopwatch.
- **Overlap:** two timed entries sharing wall-clock minutes are reported with the overlap
  in minutes. Nothing is silently rewritten; you decide which entry is wrong.
- **Duplicates:** same day + category + minutes (+ same start when timed) is a warning
  before saving. It never auto-deletes or auto-merges.
- **Stopwatch:** elapsed time comes from timestamps, so a sleeping tab does not lose time.
  It is clamped at 180 minutes and the clamp is reported. The stopwatch is foreground-only;
  it never claims to track while the app is closed.
- **Planned vs actual** compares your profile study windows with recorded study minutes
  **per day**. A day with no planned window is labelled “Rest day” and is not a missed
  goal. There are no streaks.
- End-of-day summary lists totals by category and by subject and states what is still
  missing instead of guessing.

## 14. Smart planner and recovery

- Suggestions are derived from revision due dates, overdue tasks, unresolved mistakes and
  remaining syllabus, and each one carries its evidence. A suggestion is **not** a task
  until you accept it.
- Accepting turns the suggestion into a task (`study_tasks`) with the same source label;
  splitting, rescheduling and postponing are recorded on the task, not on the suggestion.
- Recovery is guilt-free: it proposes the smallest set of steps that restores the plan and
  lists what it would drop. Nothing is deleted and nothing is described as “falling
  behind”; carried-over work keeps a carry-over count for transparency.

## 15. Smart revision

- Spaced baseline: confidence 1–2 → 1 day, 3 → 3 days, 4 → 7 days, 5 → 14 days. A next
  date you enter yourself always wins.
- The queue buckets are overdue → today → this week → later, sorted by date. Chapters with
  no revision are **not** due; they are simply unrecorded.
- Recall results (1–5) only change the next suggested date. Revision count is **not**
  mastery, and the UI says so beside the number.
- Exam results, last/next revision and revision history are shown for context; none of
  them produces a predicted mark.

## 16. Mistake book and weakness analyzer

- A mistake records: subject, chapter (optional), category, what went wrong, what you
  answered, the correction, the lesson, an optional exam result and an optional practice
  question (migration `0005`, composite FK so it must be your question).
- A pattern is reported only when the same category on the same chapter appears on at
  least two **different dates**. One mistake is never called a trend.
- Deleted practice questions unlink the mistake (`on delete set null`); the mistake and its
  lesson survive.
- Weakness ranking uses unresolved mistakes only, with the chapter named, and lists the
  evidence. Missing chapters are “unassigned”, never a verdict on ability.

## 17. Question practice

- A question belongs to you, optionally to a subject/chapter, with a source
  (`user`, `imported`, `ai`), difficulty, tags and an archive flag. AI-sourced questions
  are labelled and are never described as official or NCTB.
- Accuracy = correct attempts ÷ attempts for that question; with no attempts the UI shows
  “Not recorded”. “Needs review” is set by you or by an incorrect attempt.
- Attempts store the answer, correctness, review flag, time spent and notes, and can only
  reference a question that belongs to the same user (enforced by a composite FK).

## 18. Exam countdown and preparation

- Days remaining are calendar-day differences in your local date. Today shows “today”;
  past exams are archived rather than displaying negative days.
- Coverage is measured only on chapters linked to that exam target. Due revisions and weak
  areas come from the same queues as the rest of the app.
- The draft preparation plan lists the outstanding chapters, due revisions and weak areas
  with evidence and proposes tasks. **No predicted mark, grade or rank is produced.**

## 19. Progress insights and the AI coach

Insights are always shown in four bands: **observed** (counts from records), **calculated**
(arithmetic with the denominator named), **interpretation** (labelled low/medium confidence
with a caveat and evidence) and **missing** (what is not recorded). Next steps are
deterministic, capped, and each names the record that produced it.

The AI coach only adds text on top of that. With no provider configured the page shows the
four bands and a clear “AI not configured” note; the deterministic weekly report remains
complete. AI prose never changes a number and never becomes a grade.

## 20. Focus mode

- A focus session is a foreground timer with 5–120 minute focus blocks, breaks up to 30
  minutes and at most 8 intervals. Pausing/resuming banks the elapsed seconds.
- Finishing writes exactly one `study_sessions` row (so the time appears once in the
  tracker and the report) plus a `focus_sessions` row for the interval history.
- Breaks are optional and skipping one is never punished. There are no punitive streaks.

## 21. Export and academic history

- `/export` and Settings produce a JSON backup (`exported_at`, `mode`, `profile`,
  `demo_active`, `tables`) and a per-table CSV. Rows keep `user_id`, `is_demo` and their
  curriculum references, so an export can be audited and demo rows identified.
- History survives curriculum changes: archiving keeps records, deleting a chapter unlinks
  them, deleting a subject with records is blocked.
- Restoring a JSON backup is **not implemented**; only the reviewed chapter import writes
  data from a file. Account deletion runs through the `delete-account` function, which
  refuses to act without a valid session.
