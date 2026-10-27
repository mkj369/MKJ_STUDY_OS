/**
 * Domain types for MKJ StudyOS.
 *
 * Field names intentionally mirror the PostgreSQL columns (snake_case) so that
 * rows from Supabase, the local repository and the domain calculations are the
 * same shape. All *date-only* values are `YYYY-MM-DD` strings; all *timestamps*
 * are full ISO-8601 strings in UTC.
 */

import type { WeeklyReportPayload } from '@/domain/reports';

export type ID = string;
/** Calendar date, `YYYY-MM-DD`, no time zone. */
export type DateOnly = string;
/** Full ISO-8601 timestamp. */
export type Timestamp = string;

export type Locale = 'en' | 'bn';

/* -------------------------------------------------------------------------- */
/* Enums (also used to build select options)                                   */
/* -------------------------------------------------------------------------- */

export const CHAPTER_STATUSES = [
  'not_recorded',
  'not_started',
  'in_progress',
  'needs_practice',
  'needs_revision',
  'blocked',
  'complete',
] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const CHECKLIST_KINDS = [
  'reading',
  'lecture',
  'notes_review',
  'concept_book',
  'practice',
  'board_questions',
  'admission_questions',
  'mcq',
  'written',
  'self_test',
  'error_correction',
  'final_revision',
  'custom',
] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

export const LECTURE_SOURCES = ['live', 'recorded', 'offline', 'coaching', 'other'] as const;
export type LectureSource = (typeof LECTURE_SOURCES)[number];

export const ACTIVITY_TYPES = [
  'reading',
  'notes',
  'concept_review',
  'practice',
  'board_questions',
  'admission_questions',
  'mcq',
  'written',
  'test',
  'other',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const REVISION_METHODS = ['recall', 'notes_reread', 'practice', 'flashcards', 'mock'] as const;
export type RevisionMethod = (typeof REVISION_METHODS)[number];

export const DIFFICULTY_SEVERITIES = ['low', 'medium', 'high'] as const;
export type DifficultySeverity = (typeof DIFFICULTY_SEVERITIES)[number];

export const DIFFICULTY_STATUSES = ['open', 'working', 'resolved'] as const;
export type DifficultyStatus = (typeof DIFFICULTY_STATUSES)[number];

export const MISTAKE_CATEGORIES = [
  'concept_gap',
  'formula_recall',
  'calculation',
  'careless_error',
  'time_management',
  'question_interpretation',
  'incomplete_answer',
  'other',
] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_ORIGINS = ['manual', 'rule', 'ai', 'recovery'] as const;
export type TaskOrigin = (typeof TASK_ORIGINS)[number];

export const EXAM_TYPES = ['school', 'coaching', 'board', 'admission', 'mock', 'other'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const RESOURCE_TYPES = ['book', 'pdf', 'video', 'link', 'coaching', 'other'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const VERIFICATION_STATUSES = ['draft', 'needs_verification', 'verified', 'retired'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const REMINDER_TYPES = [
  'task_due',
  'task_overdue',
  'revision_due',
  'weekly_planning',
  'incomplete_goal',
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_STATUSES = ['scheduled', 'sent', 'failed', 'skipped'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REPORT_SOURCES = ['deterministic', 'ai'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

/* -------------------------------------------------------------------------- */
/* Records                                                                     */
/* -------------------------------------------------------------------------- */

export interface Profile {
  id: ID;
  display_name: string;
  locale: Locale;
  timezone: string;
  academic_level: string | null;
  /** Minutes available per weekday, keys "0" (Sun) … "6" (Sat). */
  study_windows: Record<string, number> | null;
  onboarded_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CurriculumVersion {
  id: ID;
  authority: string;
  country: string;
  education_level: string;
  class_grade: string;
  stream: string | null;
  academic_year: string;
  version_label: string;
  title: string;
  source_url: string | null;
  verification_status: VerificationStatus;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CurriculumSubject {
  id: ID;
  curriculum_version_id: ID;
  name: string;
  name_bn: string | null;
  code: string | null;
  paper_label: string | null;
  is_compulsory: boolean;
  sort_order: number;
  created_at: Timestamp;
}

export interface CurriculumChapter {
  id: ID;
  curriculum_subject_id: ID;
  parent_id: ID | null;
  title: string;
  title_bn: string | null;
  chapter_number: string | null;
  sort_order: number;
  source_url: string | null;
  verification_status: VerificationStatus;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface UserSubject {
  id: ID;
  user_id: ID;
  curriculum_subject_id: ID | null;
  curriculum_version_id: ID | null;
  custom_name: string | null;
  custom_paper_label: string | null;
  status: 'active' | 'archived';
  color: string;
  sort_order: number;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UserChapter {
  id: ID;
  user_id: ID;
  user_subject_id: ID;
  curriculum_chapter_id: ID | null;
  curriculum_version_id: ID | null;
  custom_title: string | null;
  status: ChapterStatus;
  lecture_target_count: number | null;
  import_batch_id: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ChapterChecklistItem {
  id: ID;
  user_id: ID;
  user_chapter_id: ID;
  kind: ChecklistKind;
  label: string;
  sort_order: number;
  is_archived: boolean;
  created_at: Timestamp;
}

export interface ChapterChecklistProgress {
  id: ID;
  user_id: ID;
  checklist_item_id: ID;
  is_done: boolean;
  completed_at: Timestamp | null;
  note: string | null;
  updated_at: Timestamp;
}

export interface LectureRecord {
  id: ID;
  user_id: ID;
  user_subject_id: ID;
  user_chapter_id: ID | null;
  title: string;
  lecture_number: number | null;
  source: LectureSource;
  platform: string | null;
  instructor: string | null;
  lecture_date: DateOnly;
  duration_minutes: number | null;
  is_completed: boolean;
  notes: string | null;
  follow_up: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StudySession {
  id: ID;
  user_id: ID;
  user_subject_id: ID;
  user_chapter_id: ID | null;
  activity_type: ActivityType;
  /** Optional topic the session covered. */
  user_topic_id: ID | null;
  /** Optional task the session was working on (focus/planner link). */
  user_task_id: ID | null;
  /** How the row was created; timers are idempotent through client_entry_id. */
  source: 'manual' | 'timer' | 'focus';
  client_entry_id: string | null;
  /** Calendar date the study happened. Manual entry always sets this. */
  session_date: DateOnly;
  /** Optional precise start/end for a timer; null for manual entries. */
  started_at: Timestamp | null;
  ended_at: Timestamp | null;
  duration_minutes: number;
  focus_rating: number | null;
  result: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RevisionSession {
  id: ID;
  user_id: ID;
  user_subject_id: ID;
  user_chapter_id: ID | null;
  revised_at: DateOnly;
  method: RevisionMethod;
  confidence_rating: number;
  questions_attempted: number | null;
  questions_correct: number | null;
  next_review_date: DateOnly | null;
  notes: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TopicDifficulty {
  id: ID;
  user_id: ID;
  user_subject_id: ID;
  user_chapter_id: ID | null;
  topic_name: string;
  reason: string | null;
  severity: DifficultySeverity;
  status: DifficultyStatus;
  source_ref: string | null;
  attempted_solution: string | null;
  corrected_concept: string | null;
  follow_up_date: DateOnly | null;
  resolved_at: Timestamp | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MistakeLog {
  id: ID;
  user_id: ID;
  user_subject_id: ID;
  user_chapter_id: ID | null;
  exam_result_id: ID | null;
  /** Optional link to the practice question this mistake came from (migration 0005). */
  practice_question_id: ID | null;
  category: MistakeCategory;
  question_ref: string | null;
  what_went_wrong: string;
  /** What the student actually wrote/said before the correction. */
  attempted_answer: string | null;
  correction: string | null;
  /** One-sentence takeaway to revisit later. */
  lesson_learned: string | null;
  occurred_at: DateOnly;
  is_resolved: boolean;
  resolved_at: Timestamp | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StudyTask {
  id: ID;
  user_id: ID;
  title: string;
  description: string | null;
  user_subject_id: ID | null;
  user_chapter_id: ID | null;
  estimated_minutes: number;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: DateOnly | null;
  planned_date: DateOnly | null;
  origin: TaskOrigin;
  source_report_id: ID | null;
  gap_reason: string | null;
  carried_over_count: number;
  completed_at: Timestamp | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ExamResult {
  id: ID;
  user_id: ID;
  exam_name: string;
  exam_type: ExamType;
  exam_date: DateOnly;
  user_subject_id: ID | null;
  coverage_note: string | null;
  marks_obtained: number;
  total_marks: number;
  duration_minutes: number | null;
  source: string | null;
  analysis: string | null;
  strengths: string | null;
  weak_areas: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StudyResource {
  id: ID;
  user_id: ID;
  title: string;
  resource_type: ResourceType;
  user_subject_id: ID | null;
  user_chapter_id: ID | null;
  url: string | null;
  storage_path: string | null;
  description: string | null;
  tags: string[] | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export const TOPIC_STATUSES = ['not_recorded', 'in_progress', 'needs_revision', 'complete'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const DAY_BLOCK_CATEGORIES = [
  'college',
  'class',
  'exam',
  'homework',
  'sleep',
  'break',
  'personal',
  'commute',
  'prayer',
  'custom',
] as const;
export type DayBlockCategory = (typeof DAY_BLOCK_CATEGORIES)[number];

export const NOTE_KINDS = ['note', 'formula', 'definition', 'bookmark'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const PRACTICE_SOURCES = ['user', 'imported', 'ai'] as const;
export type PracticeSource = (typeof PRACTICE_SOURCES)[number];

export const PRACTICE_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type PracticeDifficulty = (typeof PRACTICE_DIFFICULTIES)[number];

/** Curriculum reference topic under a chapter (read-only in the app). */
export interface CurriculumTopic {
  id: ID;
  curriculum_chapter_id: ID;
  title: string;
  title_bn: string | null;
  sort_order: number;
  source_url: string | null;
  verification_status: VerificationStatus;
  is_demo: boolean;
  created_at: Timestamp;
}

/** The student's own topic, adopted from the curriculum or typed by hand. */
export interface UserTopic {
  id: ID;
  user_id: ID;
  user_chapter_id: ID;
  curriculum_topic_id: ID | null;
  custom_title: string | null;
  status: TopicStatus;
  notes: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * A non-study block on the daily timeline. Study time lives in study_sessions so
 * the same minute is never counted twice.
 */
export interface DailyBlock {
  id: ID;
  user_id: ID;
  entry_date: DateOnly;
  category: DayBlockCategory;
  custom_label: string | null;
  user_subject_id: ID | null;
  user_chapter_id: ID | null;
  started_at: Timestamp | null;
  ended_at: Timestamp | null;
  duration_minutes: number;
  source: 'manual' | 'timer';
  client_entry_id: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FocusSession {
  id: ID;
  user_id: ID;
  user_task_id: ID | null;
  user_subject_id: ID | null;
  user_chapter_id: ID | null;
  focus_minutes: number;
  break_minutes: number;
  planned_intervals: number;
  completed_intervals: number;
  started_at: Timestamp;
  ended_at: Timestamp | null;
  status: 'running' | 'completed' | 'abandoned';
  study_session_id: ID | null;
  notes: string | null;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface ExamTarget {
  id: ID;
  user_id: ID;
  title: string;
  exam_type: ExamType;
  exam_date: DateOnly;
  user_subject_id: ID | null;
  coverage_note: string | null;
  priority: TaskPriority;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PracticeQuestion {
  id: ID;
  user_id: ID;
  user_subject_id: ID | null;
  user_chapter_id: ID | null;
  question_text: string;
  answer_text: string | null;
  explanation: string | null;
  source: PracticeSource;
  difficulty: PracticeDifficulty;
  tags: string[];
  is_archived: boolean;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PracticeAttempt {
  id: ID;
  user_id: ID;
  practice_question_id: ID;
  attempted_at: Timestamp;
  answer_given: string | null;
  is_correct: boolean | null;
  needs_review: boolean;
  time_spent_minutes: number | null;
  notes: string | null;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface StudyNote {
  id: ID;
  user_id: ID;
  title: string;
  body: string;
  user_subject_id: ID | null;
  user_chapter_id: ID | null;
  kind: NoteKind;
  tags: string[];
  is_pinned: boolean;
  is_demo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface WeeklySummary {
  id: ID;
  user_id: ID;
  week_start: DateOnly;
  week_end: DateOnly;
  source: ReportSource;
  status: 'complete' | 'fallback' | 'failed';
  payload: WeeklyReportPayload;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  error_code: string | null;
  created_at: Timestamp;
}

export interface ReminderPreferences {
  user_id: ID;
  timezone: string;
  reminders_enabled: boolean;
  task_due_enabled: boolean;
  task_overdue_enabled: boolean;
  revision_due_enabled: boolean;
  weekly_planning_enabled: boolean;
  incomplete_goal_enabled: boolean;
  weekly_planning_day: number; // 0 = Sunday … 6 = Saturday
  weekly_planning_time: string; // HH:mm
  quiet_hours_start: string; // HH:mm
  quiet_hours_end: string; // HH:mm
  max_per_day: number;
  channel: 'in_app' | 'local_notification';
  updated_at: Timestamp;
}

export interface ReminderEvent {
  id: ID;
  user_id: ID;
  reminder_key: string;
  reminder_type: ReminderType;
  scheduled_for: Timestamp;
  status: ReminderStatus;
  channel: 'in_app' | 'local_notification';
  title: string;
  body: string;
  related_entity_type: string | null;
  related_entity_id: ID | null;
  error_message: string | null;
  created_at: Timestamp;
}

export interface AuditEvent {
  id: ID;
  user_id: ID;
  entity_type: string;
  entity_id: ID;
  action: 'create' | 'update' | 'delete' | 'undo';
  metadata: Record<string, unknown> | null;
  created_at: Timestamp;
}

/* -------------------------------------------------------------------------- */
/* Table registry — one place used by repositories, hooks and tests             */
/* -------------------------------------------------------------------------- */

export interface TableMap {
  profiles: Profile;
  curriculum_versions: CurriculumVersion;
  curriculum_subjects: CurriculumSubject;
  curriculum_chapters: CurriculumChapter;
  curriculum_topics: CurriculumTopic;
  user_subjects: UserSubject;
  user_chapters: UserChapter;
  user_topics: UserTopic;
  daily_blocks: DailyBlock;
  focus_sessions: FocusSession;
  exam_targets: ExamTarget;
  practice_questions: PracticeQuestion;
  practice_attempts: PracticeAttempt;
  chapter_checklist_items: ChapterChecklistItem;
  chapter_checklist_progress: ChapterChecklistProgress;
  lecture_records: LectureRecord;
  study_sessions: StudySession;
  revision_sessions: RevisionSession;
  topic_difficulties: TopicDifficulty;
  mistake_logs: MistakeLog;
  study_tasks: StudyTask;
  exam_results: ExamResult;
  study_resources: StudyResource;
  notes: StudyNote;
  weekly_summaries: WeeklySummary;
  reminder_preferences: ReminderPreferences;
  reminder_events: ReminderEvent;
  audit_events: AuditEvent;
}

export type TableName = keyof TableMap;

/** Tables whose rows are owned by a single user and protected by RLS. */
export const USER_OWNED_TABLES = [
  'profiles',
  'user_subjects',
  'user_chapters',
  'user_topics',
  'daily_blocks',
  'focus_sessions',
  'exam_targets',
  'practice_questions',
  'practice_attempts',
  'chapter_checklist_items',
  'chapter_checklist_progress',
  'lecture_records',
  'study_sessions',
  'revision_sessions',
  'topic_difficulties',
  'mistake_logs',
  'study_tasks',
  'exam_results',
  'study_resources',
  'notes',
  'weekly_summaries',
  'reminder_events',
  'audit_events',
] as const satisfies readonly TableName[];

/** Public curriculum content: readable by authenticated users, seeded server-side. */
export const CURRICULUM_TABLES = [
  'curriculum_versions',
  'curriculum_subjects',
  'curriculum_chapters',
  'curriculum_topics',
] as const satisfies readonly TableName[];

export const REPOSITORY_TABLES = [
  ...CURRICULUM_TABLES,
  ...USER_OWNED_TABLES,
  'reminder_preferences',
] as const satisfies readonly TableName[];

export type RepositoryTable = (typeof REPOSITORY_TABLES)[number];
