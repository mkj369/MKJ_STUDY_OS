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
