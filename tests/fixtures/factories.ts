import type {
  ChapterChecklistItem,
  ChapterChecklistProgress,
  DateOnly,
  ExamResult,
  LectureRecord,
  MistakeLog,
  Profile,
  ReminderPreferences,
  RevisionSession,
  StudySession,
  StudyTask,
  TopicDifficulty,
  UserChapter,
  UserSubject,
} from '@/types/domain';

export const TODAY = '2026-10-27';
export const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let counter = 0;
export function id(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

const STAMP = `${TODAY}T10:00:00.000Z`;

export function makeSubject(overrides: Partial<UserSubject> = {}): UserSubject {
  return {
    id: id(),
    user_id: USER_ID,
    curriculum_subject_id: null,
    curriculum_version_id: null,
    custom_name: 'Physics',
    custom_paper_label: '1st Paper',
    status: 'active',
    color: '#0f5132',
    sort_order: 1,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeChapter(overrides: Partial<UserChapter> = {}): UserChapter {
  return {
    id: id(),
    user_id: USER_ID,
    user_subject_id: 'subject-1',
    curriculum_chapter_id: null,
    curriculum_version_id: null,
    custom_title: 'Motion',
    status: 'not_recorded',
    lecture_target_count: null,
    import_batch_id: null,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeChecklistItem(overrides: Partial<ChapterChecklistItem> = {}): ChapterChecklistItem {
  return {
    id: id(),
    user_id: USER_ID,
    user_chapter_id: 'chapter-1',
    kind: 'reading',
    label: 'Main book reading',
    sort_order: 1,
    is_archived: false,
    created_at: STAMP,
    ...overrides,
  };
}

export function makeProgress(overrides: Partial<ChapterChecklistProgress> = {}): ChapterChecklistProgress {
  return {
    id: id(),
    user_id: USER_ID,
    checklist_item_id: 'item-1',
    is_done: true,
    completed_at: STAMP,
    note: null,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeLecture(overrides: Partial<LectureRecord> = {}): LectureRecord {
  return {
    id: id(),
    user_id: USER_ID,
    user_subject_id: 'subject-1',
    user_chapter_id: 'chapter-1',
    title: 'Lecture 1',
    lecture_number: 1,
    source: 'live',
    platform: null,
    instructor: null,
    lecture_date: TODAY,
    duration_minutes: 50,
    is_completed: true,
    notes: null,
    follow_up: null,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: id(),
    user_id: USER_ID,
    user_subject_id: 'subject-1',
    user_chapter_id: 'chapter-1',
    activity_type: 'practice',
    session_date: TODAY,
    started_at: null,
    ended_at: null,
    duration_minutes: 30,
    focus_rating: 3,
    result: null,
    notes: null,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeRevision(overrides: Partial<RevisionSession> = {}): RevisionSession {
  return {
    id: id(),
    user_id: USER_ID,
    user_subject_id: 'subject-1',
    user_chapter_id: 'chapter-1',
    revised_at: TODAY,
    method: 'recall',
    confidence_rating: 3,
    questions_attempted: null,
    questions_correct: null,
    next_review_date: null,
    notes: null,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeDifficulty(overrides: Partial<TopicDifficulty> = {}): TopicDifficulty {
  return {
    id: id(),
    user_id: USER_ID,
    user_subject_id: 'subject-1',
    user_chapter_id: 'chapter-1',
    topic_name: 'Projectile range',
    reason: 'Confused the angle term',
    severity: 'medium',
    status: 'open',
    source_ref: null,
    attempted_solution: null,
    corrected_concept: null,
    follow_up_date: null,
    resolved_at: null,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeMistake(overrides: Partial<MistakeLog> = {}): MistakeLog {
  return {
    id: id(),
    user_id: USER_ID,
    user_subject_id: 'subject-1',
    user_chapter_id: 'chapter-1',
    exam_result_id: null,
    category: 'calculation',
    question_ref: null,
    what_went_wrong: 'Forgot to square time',
    correction: null,
    occurred_at: TODAY,
    is_resolved: false,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<StudyTask> = {}): StudyTask {
  return {
    id: id(),
    user_id: USER_ID,
    title: 'Practise numericals',
    description: null,
    user_subject_id: 'subject-1',
    user_chapter_id: 'chapter-1',
    estimated_minutes: 30,
    priority: 'medium',
    status: 'todo',
    due_date: null,
    planned_date: null,
    origin: 'manual',
    source_report_id: null,
    gap_reason: null,
    carried_over_count: 0,
    completed_at: null,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeExam(overrides: Partial<ExamResult> = {}): ExamResult {
  return {
    id: id(),
    user_id: USER_ID,
    exam_name: 'Unit test',
    exam_type: 'school',
    exam_date: TODAY,
    user_subject_id: 'subject-1',
    coverage_note: null,
    marks_obtained: 35,
    total_marks: 50,
    duration_minutes: 60,
    source: null,
    analysis: null,
    strengths: null,
    weak_areas: null,
    is_demo: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: USER_ID,
    display_name: 'Test Student',
    locale: 'en',
    timezone: 'Asia/Dhaka',
    academic_level: 'HSC',
    study_windows: { '0': 60, '1': 60, '2': 60, '3': 60, '4': 60, '5': 30, '6': 0 },
    onboarded_at: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

export function makePreferences(overrides: Partial<ReminderPreferences> = {}): ReminderPreferences {
  return {
    user_id: USER_ID,
    timezone: 'Asia/Dhaka',
    reminders_enabled: true,
    task_due_enabled: true,
    task_overdue_enabled: true,
    revision_due_enabled: true,
    weekly_planning_enabled: false,
    incomplete_goal_enabled: false,
    weekly_planning_day: 5,
    weekly_planning_time: '18:00',
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    max_per_day: 3,
    channel: 'in_app',
    updated_at: STAMP,
    ...overrides,
  };
}

export function day(offset: number): DateOnly {
  const base = new Date(`${TODAY}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}
