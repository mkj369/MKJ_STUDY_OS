import { describe, expect, it } from 'vitest';
import {
  examSchema,
  lectureSchema,
  profileSchema,
  reminderPreferencesSchema,
  revisionSchema,
  signUpSchema,
  studySessionSchema,
  taskSchema,
  userChapterSchema,
  userSubjectSchema,
} from '@/domain/schemas';

const ids = {
  subject: '11111111-1111-4111-8111-111111111111',
  chapter: '22222222-2222-4222-8222-222222222222',
};

describe('auth schemas', () => {
  it('requires a real-looking email and a 6 character password', () => {
    expect(signUpSchema.safeParse({ email: 'not-an-email', password: 'longenough', displayName: 'Rafi' }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'short', displayName: 'Rafi' }).success).toBe(false);
    expect(
      signUpSchema.safeParse({ email: 'student@example.com', password: 'correct horse', displayName: 'Rafi' }).success,
    ).toBe(true);
  });

  it('requires a display name on sign-up', () => {
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'longenough' }).success).toBe(false);
    expect(
      signUpSchema.safeParse({ email: 'a@b.co', password: 'longenough', displayName: '   ' }).success,
    ).toBe(false);
  });
});

describe('profile and preferences', () => {
  it('requires a valid IANA timezone', () => {
    expect(profileSchema.safeParse({ display_name: 'Rafi', timezone: 'Asia/Dhaka', locale: 'en' }).success).toBe(true);
    expect(profileSchema.safeParse({ display_name: 'Rafi', timezone: 'Mars/Olympus', locale: 'en' }).success).toBe(false);
    expect(profileSchema.safeParse({ display_name: 'R', timezone: 'Asia/Dhaka', locale: 'en' }).success).toBe(false);
  });

  it('rejects identical quiet hours and caps daily reminders', () => {
    const base = {
      reminders_enabled: true,
      task_due_enabled: true,
      task_overdue_enabled: true,
      revision_due_enabled: true,
      weekly_planning_enabled: true,
      incomplete_goal_enabled: false,
      weekly_planning_day: 5,
      weekly_planning_time: '18:00',
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      max_per_day: 3,
      channel: 'in_app',
      timezone: 'Asia/Dhaka',
    };
    expect(reminderPreferencesSchema.safeParse(base).success).toBe(true);
    expect(
      reminderPreferencesSchema.safeParse({ ...base, quiet_hours_start: '07:00', quiet_hours_end: '07:00' }).success,
    ).toBe(false);
    expect(reminderPreferencesSchema.safeParse({ ...base, max_per_day: 0 }).success).toBe(false);
    expect(reminderPreferencesSchema.safeParse({ ...base, max_per_day: 21 }).success).toBe(false);
  });
});

describe('subject and chapter schemas', () => {
  it('requires a curriculum subject or a custom name', () => {
    expect(userSubjectSchema.safeParse({ mode: 'curriculum' }).success).toBe(false);
    expect(
      userSubjectSchema.safeParse({ mode: 'curriculum', curriculum_subject_id: ids.subject }).success,
    ).toBe(true);
    expect(userSubjectSchema.safeParse({ mode: 'custom', custom_name: 'My Physics' }).success).toBe(true);
    expect(userSubjectSchema.safeParse({ mode: 'custom' }).success).toBe(false);
  });

  it('accepts a chapter without a lecture target and a real target otherwise', () => {
    const withoutTarget = userChapterSchema.safeParse({
      user_subject_id: ids.subject,
      status: 'not_recorded',
      title: 'Motion',
    });
    expect(withoutTarget.success).toBe(true);
    if (withoutTarget.success) expect(withoutTarget.data.lecture_target_count).toBeNull();

    const withTarget = userChapterSchema.safeParse({
      user_subject_id: ids.subject,
      status: 'not_recorded',
      title: 'Motion',
      lecture_target_count: '12',
    });
    expect(withTarget.success).toBe(true);
    if (withTarget.success) expect(withTarget.data.lecture_target_count).toBe(12);
    expect(userChapterSchema.safeParse({ user_subject_id: ids.subject, title: '   ' }).success).toBe(false);
    expect(
      userChapterSchema.safeParse({
        user_subject_id: ids.subject,
        title: 'Motion',
        lecture_target_count: 501,
      }).success,
    ).toBe(false);
  });
});

describe('record schemas', () => {
  it('rejects impossible study durations', () => {
    const base = {
      user_subject_id: ids.subject,
      activity_type: 'practice',
      session_date: '2026-10-27',
      duration_minutes: 30,
    };
    expect(studySessionSchema.safeParse(base).success).toBe(true);
    expect(studySessionSchema.safeParse({ ...base, duration_minutes: 0 }).success).toBe(false);
    expect(studySessionSchema.safeParse({ ...base, duration_minutes: 2000 }).success).toBe(false);
    expect(studySessionSchema.safeParse({ ...base, session_date: '27-10-2026' }).success).toBe(false);
  });

  it('rejects correct answers above attempted questions', () => {
    const base = {
      user_subject_id: ids.subject,
      revised_at: '2026-10-27',
      method: 'recall',
      confidence_rating: 3,
    };
    expect(revisionSchema.safeParse({ ...base, questions_attempted: 10, questions_correct: 8 }).success).toBe(true);
    const invalid = revisionSchema.safeParse({ ...base, questions_attempted: 5, questions_correct: 9 });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues[0]?.message).toContain('cannot exceed');
  });

  it('rejects more marks than the paper total', () => {
    const base = {
      exam_name: 'Unit test',
      exam_type: 'school',
      exam_date: '2026-10-27',
      marks_obtained: 40,
      total_marks: 50,
    };
    expect(examSchema.safeParse(base).success).toBe(true);
    const invalid = examSchema.safeParse({ ...base, marks_obtained: 60 });
    expect(invalid.success).toBe(false);
    expect(examSchema.safeParse({ ...base, total_marks: 0 }).success).toBe(false);
  });

  it('requires a sensible lecture target-free lecture', () => {
    const base = {
      user_subject_id: ids.subject,
      title: 'Kinematics 1',
      source: 'live',
      lecture_date: '2026-10-27',
    };
    expect(lectureSchema.safeParse(base).success).toBe(true);
    expect(lectureSchema.safeParse({ ...base, title: '' }).success).toBe(false);
    expect(lectureSchema.safeParse({ ...base, source: 'youtube' }).success).toBe(false);
  });

  it('keeps task estimates bounded and status enum-only', () => {
    const base = { title: 'Practise', estimated_minutes: 30, priority: 'medium' };
    expect(taskSchema.safeParse(base).success).toBe(true);
    expect(taskSchema.safeParse({ ...base, estimated_minutes: 2 }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, status: 'abandoned' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, priority: 'urgent' }).success).toBe(false);
  });
});
