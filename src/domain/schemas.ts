/**
 * Runtime validation. These schemas are the single source of truth for form
 * validation *and* for normalising payloads before they reach Supabase, so a
 * bad value can never silently reach the database from the UI.
 */
import { z } from 'zod';
import { isDateOnly } from '@/domain/dates';
import {
  ACTIVITY_TYPES,
  CHAPTER_STATUSES,
  DAY_BLOCK_CATEGORIES,
  NOTE_KINDS,
  PRACTICE_DIFFICULTIES,
  PRACTICE_SOURCES,
  CHECKLIST_KINDS,
  DIFFICULTY_SEVERITIES,
  DIFFICULTY_STATUSES,
  EXAM_TYPES,
  LECTURE_SOURCES,
  MISTAKE_CATEGORIES,
  REMINDER_TYPES,
  RESOURCE_TYPES,
  REVISION_METHODS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TOPIC_STATUSES,
} from '@/types/domain';

export const dateOnly = z
  .string()
  .trim()
  .refine((v) => isDateOnly(v), { message: 'Use a real calendar date (YYYY-MM-DD).' });

export const optionalDateOnly = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isDateOnly(v), { message: 'Use a real calendar date.' });

export const trimmedText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

const hhmm = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 19:30.');

const uuidLike = z.string().min(1);

/* -------------------------------- auth ----------------------------------- */

export const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

export const signUpSchema = signInSchema.extend({
  displayName: trimmedText(60).min(2, 'Tell us what to call you.'),
});

/* ------------------------------- profile --------------------------------- */

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const profileSchema = z.object({
  display_name: trimmedText(60).min(2, 'Display name is required.'),
  locale: z.enum(['en', 'bn']),
  timezone: z.string().min(1, 'Choose a time zone.').refine(isIanaTimeZone, 'Choose a valid time zone.'),
  academic_level: z.string().trim().max(60).optional(),
});

export const studyWindowSchema = z.object({
  day: z.coerce.number().int().min(0).max(6),
  minutes: z.coerce.number().int().min(0).max(960),
});

/* ------------------------------ curriculum ------------------------------- */

export const userSubjectSchema = z
  .object({
    mode: z.enum(['curriculum', 'custom']),
    curriculum_subject_id: uuidLike.optional(),
    custom_name: trimmedText(80).optional(),
    custom_paper_label: trimmedText(40).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #38BDF8.')
      .default('#38BDF8'),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'curriculum' && !value.curriculum_subject_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['curriculum_subject_id'], message: 'Choose a subject.' });
    }
    if (value.mode === 'custom' && !value.custom_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['custom_name'], message: 'Name your subject.' });
    }
  });

export const userChapterSchema = z.object({
  user_subject_id: uuidLike,
  title: trimmedText(120).min(1, 'Chapter title is required.'),
  chapter_number: trimmedText(20).optional(),
  lecture_target_count: z
    .union([z.coerce.number().int().min(0).max(500), z.literal(''), z.undefined(), z.null()])
    .transform((v) => (v === '' || v === undefined || v === null ? null : Number(v))),
  status: z.enum(CHAPTER_STATUSES).default('not_recorded'),
});

export const chapterStatusSchema = z.object({ status: z.enum(CHAPTER_STATUSES) });

export const checklistItemSchema = z.object({
  user_chapter_id: uuidLike,
  kind: z.enum(CHECKLIST_KINDS),
  label: trimmedText(80).min(1, 'A label is required.'),
});

/* -------------------------------- lectures ------------------------------- */

export const lectureSchema = z.object({
  user_subject_id: uuidLike,
  user_chapter_id: z.string().optional().or(z.literal('')),
  title: trimmedText(120).min(1, 'Lecture title is required.'),
  lecture_number: z
    .union([z.coerce.number().int().min(0).max(1000), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  source: z.enum(LECTURE_SOURCES),
  platform: optionalText(80),
  instructor: optionalText(80),
  lecture_date: dateOnly,
  duration_minutes: z
    .union([z.coerce.number().int().min(0).max(1440), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  is_completed: z.boolean().default(true),
  notes: optionalText(2000),
  follow_up: optionalText(500),
});

/* ----------------------------- study sessions ---------------------------- */

export const studySessionSchema = z.object({
  user_subject_id: uuidLike,
  user_chapter_id: z.string().optional().or(z.literal('')),
  activity_type: z.enum(ACTIVITY_TYPES),
  session_date: dateOnly,
  duration_minutes: z.coerce.number().int().min(1, 'At least 1 minute.').max(1440, 'That is more than a day.'),
  focus_rating: z
    .union([z.coerce.number().int().min(1).max(5), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  result: optionalText(200),
  notes: optionalText(1000),
});

/* -------------------------------- revisions ------------------------------ */

export const revisionSchema = z.object({
  user_subject_id: uuidLike,
  user_chapter_id: z.string().optional().or(z.literal('')),
  revised_at: dateOnly,
  method: z.enum(REVISION_METHODS),
  confidence_rating: z.coerce.number().int().min(1).max(5),
  questions_attempted: z
    .union([z.coerce.number().int().min(0).max(1000), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  questions_correct: z
    .union([z.coerce.number().int().min(0).max(1000), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  next_review_date: optionalDateOnly,
  notes: optionalText(1000),
}).superRefine((value, ctx) => {
  if (
    value.questions_attempted !== null &&
    value.questions_correct !== null &&
    value.questions_correct > value.questions_attempted
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['questions_correct'],
      message: 'Correct answers cannot exceed questions attempted.',
    });
  }
});

/* ------------------------------- difficulties ---------------------------- */

export const difficultySchema = z.object({
  user_subject_id: uuidLike,
  user_chapter_id: z.string().optional().or(z.literal('')),
  topic_name: trimmedText(120).min(1, 'Which topic is difficult?'),
  reason: optionalText(1000),
  severity: z.enum(DIFFICULTY_SEVERITIES),
  status: z.enum(DIFFICULTY_STATUSES).default('open'),
  source_ref: optionalText(200),
  attempted_solution: optionalText(1000),
  corrected_concept: optionalText(1000),
  follow_up_date: optionalDateOnly,
});

/* --------------------------------- mistakes ------------------------------ */

export const mistakeSchema = z.object({
  user_subject_id: uuidLike,
  user_chapter_id: z.string().optional().or(z.literal('')),
  practice_question_id: z.string().optional().or(z.literal('')),
  category: z.enum(MISTAKE_CATEGORIES),
  question_ref: optionalText(200),
  what_went_wrong: trimmedText(1000).min(1, 'Describe the mistake.'),
  attempted_answer: optionalText(2000),
  correction: optionalText(1000),
  lesson_learned: optionalText(1000),
  occurred_at: dateOnly,
  is_resolved: z.boolean().default(false),
});

/* ------------------------------- exam results ---------------------------- */

export const examSchema = z
  .object({
    exam_name: trimmedText(120).min(1, 'Exam name is required.'),
    exam_type: z.enum(EXAM_TYPES),
    exam_date: dateOnly,
    user_subject_id: z.string().optional().or(z.literal('')),
    coverage_note: optionalText(300),
    marks_obtained: z.coerce.number().min(0, 'Marks cannot be negative.').max(1000),
    total_marks: z.coerce.number().positive('Total marks must be greater than 0.').max(1000),
    duration_minutes: z
      .union([z.coerce.number().int().min(0).max(600), z.literal(''), z.undefined()])
      .transform((v) => (v === '' || v === undefined ? null : Number(v))),
    source: optionalText(120),
    analysis: optionalText(2000),
    strengths: optionalText(500),
    weak_areas: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.marks_obtained > value.total_marks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['marks_obtained'],
        message: 'Marks obtained cannot exceed total marks.',
      });
    }
  });

/* --------------------------------- tasks --------------------------------- */

export const taskSchema = z.object({
  title: trimmedText(140).min(1, 'Task title is required.'),
  description: optionalText(1000),
  user_subject_id: z.string().optional().or(z.literal('')),
  user_chapter_id: z.string().optional().or(z.literal('')),
  estimated_minutes: z.coerce.number().int().min(5, 'At least 5 minutes.').max(720),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES).default('todo'),
  due_date: optionalDateOnly,
  planned_date: optionalDateOnly,
});

export const taskStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });

/* --------------------------------- notes --------------------------------- */

const tagList = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10),
  );

export const noteSchema = z.object({
  title: trimmedText(120).min(1, 'Title is required.'),
  body: z.string().trim().min(1, 'Write something in the note.').max(20000),
  user_subject_id: z.string().optional().or(z.literal('')),
  user_chapter_id: z.string().optional().or(z.literal('')),
  kind: z.enum(NOTE_KINDS).default('note'),
  tags: tagList,
  is_pinned: z.boolean().default(false),
});

export const resourceSchema = z
  .object({
    title: trimmedText(120).min(1, 'Title is required.'),
    resource_type: z.enum(RESOURCE_TYPES),
    user_subject_id: z.string().optional().or(z.literal('')),
    user_chapter_id: z.string().optional().or(z.literal('')),
    url: z.string().trim().url('Enter a full URL starting with https://').optional().or(z.literal('')),
    description: optionalText(1000),
    tags: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.resource_type === 'link' || value.resource_type === 'video' || value.resource_type === 'pdf') && !value.url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'A link is required for this type.' });
    }
  });

/* --------------------------- syllabus topics ----------------------------- */

export const userTopicSchema = z
  .object({
    user_chapter_id: uuidLike,
    curriculum_topic_id: z.string().optional().or(z.literal('')),
    custom_title: trimmedText(160).optional(),
    status: z.enum(TOPIC_STATUSES).default('not_recorded'),
    notes: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (!value.curriculum_topic_id && !value.custom_title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['custom_title'],
        message: 'Choose a curriculum topic or type a title.',
      });
    }
  });

export const topicStatusSchema = z.object({ status: z.enum(TOPIC_STATUSES) });

/* ----------------------------- daily blocks ------------------------------ */

export const dailyBlockSchema = z
  .object({
    entry_date: dateOnly,
    category: z.enum(DAY_BLOCK_CATEGORIES),
    custom_label: optionalText(80),
    user_subject_id: z.string().optional().or(z.literal('')),
    user_chapter_id: z.string().optional().or(z.literal('')),
    duration_minutes: z.coerce.number().int().min(1, 'At least 1 minute.').max(1440, 'That is more than a day.'),
    started_time: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 19:30.')
      .optional()
      .or(z.literal('')),
    notes: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (value.category === 'custom' && !value.custom_label) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['custom_label'], message: 'Name the custom block.' });
    }
  });

/* ------------------------------ focus mode ------------------------------- */

export const focusPlanSchema = z.object({
  user_task_id: z.string().optional().or(z.literal('')),
  user_subject_id: z.string().optional().or(z.literal('')),
  user_chapter_id: z.string().optional().or(z.literal('')),
  focus_minutes: z.coerce.number().int().min(5, 'At least 5 minutes.').max(120, 'Keep a block under 120 minutes.'),
  break_minutes: z.coerce.number().int().min(0).max(30),
  planned_intervals: z.coerce.number().int().min(1).max(8),
});

/* ------------------------------ exam targets ----------------------------- */

export const examTargetSchema = z.object({
  title: trimmedText(120).min(1, 'Exam name is required.'),
  exam_type: z.enum(EXAM_TYPES),
  exam_date: dateOnly,
  user_subject_id: z.string().optional().or(z.literal('')),
  coverage_note: optionalText(500),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).default('planned'),
});

/* --------------------------- practice questions -------------------------- */

export const practiceQuestionSchema = z.object({
  question_text: trimmedText(4000).min(1, 'Write the question.'),
  answer_text: optionalText(4000),
  explanation: optionalText(4000),
  source: z.enum(PRACTICE_SOURCES).default('user'),
  difficulty: z.enum(PRACTICE_DIFFICULTIES).default('medium'),
  user_subject_id: z.string().optional().or(z.literal('')),
  user_chapter_id: z.string().optional().or(z.literal('')),
  tags: tagList,
});

export const practiceAttemptSchema = z.object({
  practice_question_id: uuidLike,
  answer_given: optionalText(4000),
  is_correct: z.boolean().default(false),
  needs_review: z.boolean().default(false),
  time_spent_minutes: z
    .union([z.coerce.number().int().min(0).max(600), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
  notes: optionalText(1000),
});

/* ------------------------------- reminders ------------------------------- */

export const reminderPreferencesSchema = z
  .object({
    reminders_enabled: z.boolean(),
    task_due_enabled: z.boolean(),
    task_overdue_enabled: z.boolean(),
    revision_due_enabled: z.boolean(),
    weekly_planning_enabled: z.boolean(),
    incomplete_goal_enabled: z.boolean(),
    weekly_planning_day: z.coerce.number().int().min(0).max(6),
    weekly_planning_time: hhmm,
    quiet_hours_start: hhmm,
    quiet_hours_end: hhmm,
    max_per_day: z.coerce.number().int().min(1).max(20),
    channel: z.enum(['in_app', 'local_notification']),
    timezone: z.string().min(1),
  })
  .refine((v) => v.quiet_hours_start !== v.quiet_hours_end, {
    message: 'Quiet hours start and end must differ.',
    path: ['quiet_hours_end'],
  });

/* --------------------------------- import -------------------------------- */

export const importRowSchema = z.object({
  subject: trimmedText(80).min(1, 'Subject is required.'),
  chapter: trimmedText(120).min(1, 'Chapter is required.'),
  lecture_target: z
    .union([z.coerce.number().int().min(0).max(500), z.literal(''), z.undefined()])
    .transform((v) => (v === '' || v === undefined ? null : Number(v))),
});

export const importPayloadSchema = z.array(importRowSchema).min(1, 'The file has no rows.').max(500, 'Import at most 500 rows at a time.');

export const reportSchema = z.object({
  summary: z.string(),
  observed_facts: z.array(z.object({ label: z.string(), value: z.string(), evidence: z.array(z.string()).default([]) })),
  possible_gaps: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      reason: z.string(),
      evidence: z.array(z.string()).default([]),
      severity: z.enum(['info', 'attention', 'high']),
    }),
  ),
  recommendations: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      evidence: z.array(z.string()).default([]),
      priority: z.enum(['low', 'medium', 'high']),
    }),
  ),
  missing_data: z.array(z.string()),
  suggested_tasks: z
    .array(
      z.object({
        title: z.string(),
        estimated_minutes: z.number().int().min(5).max(720),
        priority: z.enum(['low', 'medium', 'high']),
        reason: z.string(),
        user_subject_id: z.string().nullable().optional(),
        user_chapter_id: z.string().nullable().optional(),
      }),
    )
    .max(8),
  generated_at: z.string(),
  model: z.string().optional(),
  provider: z.string().optional(),
  week: z.object({ start: z.string(), end: z.string() }).optional(),
  metrics: z.record(z.unknown()).optional(),
  disclaimer: z.string().optional(),
});

/** Reminder types kept in one list so the AI/report layer can reason about them. */
export const reminderTypeSchema = z.enum(REMINDER_TYPES);

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type LectureValues = z.infer<typeof lectureSchema>;
export type StudySessionValues = z.infer<typeof studySessionSchema>;
export type RevisionValues = z.infer<typeof revisionSchema>;
export type DifficultyValues = z.infer<typeof difficultySchema>;
export type MistakeValues = z.infer<typeof mistakeSchema>;
export type ExamValues = z.infer<typeof examSchema>;
export type TaskValues = z.infer<typeof taskSchema>;
export type NoteValues = z.infer<typeof noteSchema>;
export type ResourceValues = z.infer<typeof resourceSchema>;
export type ReminderPreferencesValues = z.infer<typeof reminderPreferencesSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
export type ChapterFormValues = z.infer<typeof userChapterSchema>;
export type UserTopicValues = z.infer<typeof userTopicSchema>;
export type DailyBlockValues = z.infer<typeof dailyBlockSchema>;
export type FocusPlanValues = z.infer<typeof focusPlanSchema>;
export type ExamTargetValues = z.infer<typeof examTargetSchema>;
export type PracticeQuestionValues = z.infer<typeof practiceQuestionSchema>;
export type PracticeAttemptValues = z.infer<typeof practiceAttemptSchema>;
export type SubjectFormValues = z.infer<typeof userSubjectSchema>;
