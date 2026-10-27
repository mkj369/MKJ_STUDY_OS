/**
 * Deterministic weekly report.
 *
 * Every sentence in `observed_facts` and every gap/recommendation is derived
 * from records. Missing categories are listed as missing *records*, never as
 * "you did not study". This report works with AI switched off and is also the
 * fallback when the AI service is unavailable.
 */
import { addDaysISO, diffDaysISO, weekRange } from '@/domain/dates';
import { computeChapterProgress, type ChapterContext, type ChapterProgress } from '@/domain/progress';
import { isOpenTask, isOverdue } from '@/domain/tasks';
import { buildRevisionQueue } from '@/domain/revisions';
import type {
  ChapterChecklistItem,
  ChapterChecklistProgress,
  DateOnly,
  ExamResult,
  LectureRecord,
  MistakeLog,
  RevisionSession,
  StudySession,
  StudyTask,
  TopicDifficulty,
  UserChapter,
  UserSubject,
} from '@/types/domain';

export interface ReportFact {
  label: string;
  value: string;
  evidence: string[];
}

export interface ReportGap {
  code: string;
  label: string;
  reason: string;
  evidence: string[];
  severity: 'info' | 'attention' | 'high';
}

export interface ReportRecommendation {
  title: string;
  why: string;
  evidence: string[];
  priority: 'low' | 'medium' | 'high';
}

export interface SuggestedTask {
  title: string;
  estimated_minutes: number;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  user_subject_id?: string | null;
  user_chapter_id?: string | null;
}

export interface WeeklyReportPayload {
  summary: string;
  observed_facts: ReportFact[];
  possible_gaps: ReportGap[];
  recommendations: ReportRecommendation[];
  missing_data: string[];
  suggested_tasks: SuggestedTask[];
  generated_at: string;
  week: { start: DateOnly; end: DateOnly };
  /** Present on deterministic reports; AI narratives carry facts instead. */
  metrics?: WeeklyMetrics;
  /** Reminder that AI text must never be treated as an official prediction. */
  disclaimer: string;
  model?: string;
  provider?: string;
}

export interface WeeklyMetrics {
  studyMinutes: number;
  studyMinutesPrevious: number;
  sessionsLogged: number;
  activeDays: number;
  lecturesCompleted: number;
  revisionsLogged: number;
  checklistItemsTicked: number;
  tasksCompleted: number;
  tasksCreated: number;
  tasksOpen: number;
  tasksOverdue: number;
  examsRecorded: number;
  averageExamPercent: number | null;
  difficultiesOpened: number;
  difficultiesResolved: number;
  openHighDifficulties: number;
  chaptersWithRecords: number;
  chaptersWithoutRecords: number;
}

export interface WeeklyReportInput {
  weekStart: DateOnly;
  today: DateOnly;
  subjects: UserSubject[];
  chapters: UserChapter[];
  checklistItems: ChapterChecklistItem[];
  checklistProgress: ChapterChecklistProgress[];
  lectures: LectureRecord[];
  sessions: StudySession[];
  revisions: RevisionSession[];
  difficulties: TopicDifficulty[];
  mistakes: MistakeLog[];
  tasks: StudyTask[];
  exams: ExamResult[];
  generatedAt?: string;
}

export interface WeeklyReportResult {
  payload: WeeklyReportPayload;
  progressByChapter: Map<string, ChapterProgress>;
}

function sessionDate(session: StudySession): DateOnly {
  return session.session_date;
}

function inRange(date: DateOnly, start: DateOnly, end: DateOnly): boolean {
  return date >= start && date <= end;
}

export function subjectLabel(subject: UserSubject | undefined, curriculumName?: string | null, paper?: string | null): string {
  if (!subject) return 'Unassigned';
  if (subject.custom_name) return subject.custom_paper_label ? `${subject.custom_name} (${subject.custom_paper_label})` : subject.custom_name;
  const base = curriculumName ?? 'Subject';
  return paper ? `${base} — ${paper}` : base;
}

export function buildChapterContexts(input: WeeklyReportInput): ChapterContext[] {
  const itemIdsByChapter = new Map<string, ChapterChecklistItem[]>();
  for (const item of input.checklistItems) {
    const list = itemIdsByChapter.get(item.user_chapter_id) ?? [];
    list.push(item);
    itemIdsByChapter.set(item.user_chapter_id, list);
  }
  const progressByItem = new Map(input.checklistProgress.map((p) => [p.checklist_item_id, p]));

  return input.chapters.map((chapter) => {
    const items = itemIdsByChapter.get(chapter.id) ?? [];
    return {
      chapter,
      checklist: items.map((item) => ({ item, progress: progressByItem.get(item.id) ?? null })),
      lectures: input.lectures.filter((l) => l.user_chapter_id === chapter.id),
      sessions: input.sessions.filter((s) => s.user_chapter_id === chapter.id),
      revisions: input.revisions.filter((r) => r.user_chapter_id === chapter.id),
      difficulties: input.difficulties.filter((d) => d.user_chapter_id === chapter.id),
      mistakes: input.mistakes.filter((m) => m.user_chapter_id === chapter.id),
      tasks: input.tasks.filter((t) => t.user_chapter_id === chapter.id),
      exams: input.exams.filter((e) => e.user_subject_id === chapter.user_subject_id),
    };
  });
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReportResult {
  const { start, end } = weekRange(input.weekStart);
  const prevStart = addDaysISO(start, -7);
  const prevEnd = addDaysISO(start, -1);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));
  const chapterById = new Map(input.chapters.map((c) => [c.id, c]));
  const chapterTitle = (id: string | null): string => {
    if (!id) return 'Unassigned chapter';
    const chapter = chapterById.get(id);
    return chapter?.custom_title ?? 'Chapter';
  };

  const sessionsThisWeek = input.sessions.filter((s) => inRange(sessionDate(s), start, end));
  const sessionsPrevious = input.sessions.filter((s) => inRange(sessionDate(s), prevStart, prevEnd));
  const studyMinutes = sessionsThisWeek.reduce((sum, s) => sum + s.duration_minutes, 0);
  const studyMinutesPrevious = sessionsPrevious.reduce((sum, s) => sum + s.duration_minutes, 0);
  const activeDays = new Set(sessionsThisWeek.map(sessionDate)).size;

  const lecturesThisWeek = input.lectures.filter((l) => inRange(l.lecture_date, start, end));
  const lecturesCompleted = lecturesThisWeek.filter((l) => l.is_completed).length;
  const revisionsThisWeek = input.revisions.filter((r) => inRange(r.revised_at, start, end));
  const tasksCompleted = input.tasks.filter(
    (t) => t.status === 'done' && t.completed_at !== null && inRange(t.completed_at.slice(0, 10), start, end),
  );
  const tasksCreated = input.tasks.filter((t) => inRange(t.created_at.slice(0, 10), start, end));
  const openTasks = input.tasks.filter(isOpenTask);
  const overdueTasks = input.tasks.filter((t) => isOverdue(t, input.today));
  const checklistTicks = input.checklistProgress.filter(
    (p) => p.is_done && p.completed_at !== null && inRange(p.completed_at.slice(0, 10), start, end),
  );
  const examsThisWeek = input.exams.filter((e) => inRange(e.exam_date, start, end));
  const examsScored = examsThisWeek.filter((e) => e.total_marks > 0);
  const averageExamPercent =
    examsScored.length > 0
      ? Math.round(
          (examsScored.reduce((sum, e) => sum + (e.marks_obtained / e.total_marks) * 100, 0) / examsScored.length) * 10,
        ) / 10
      : null;
  const difficultiesOpened = input.difficulties.filter((d) => inRange(d.created_at.slice(0, 10), start, end));
  const difficultiesResolved = input.difficulties.filter(
    (d) => d.resolved_at !== null && inRange(d.resolved_at.slice(0, 10), start, end),
  );
  const openHighDifficulties = input.difficulties.filter((d) => d.status !== 'resolved' && d.severity === 'high');

  const contexts = buildChapterContexts(input);
  const progressByChapter = new Map<string, ChapterProgress>();
  for (const ctx of contexts) {
    progressByChapter.set(ctx.chapter.id, computeChapterProgress(ctx, { today: input.today }));
  }
  const chaptersWithRecords = [...progressByChapter.values()].filter((p) => p.hasAnyRecord).length;
  const chaptersWithoutRecords = progressByChapter.size - chaptersWithRecords;

  const metrics: WeeklyMetrics = {
    studyMinutes,
    studyMinutesPrevious,
    sessionsLogged: sessionsThisWeek.length,
    activeDays,
    lecturesCompleted,
    revisionsLogged: revisionsThisWeek.length,
    checklistItemsTicked: checklistTicks.length,
    tasksCompleted: tasksCompleted.length,
    tasksCreated: tasksCreated.length,
    tasksOpen: openTasks.length,
    tasksOverdue: overdueTasks.length,
    examsRecorded: examsThisWeek.length,
    averageExamPercent,
    difficultiesOpened: difficultiesOpened.length,
    difficultiesResolved: difficultiesResolved.length,
    openHighDifficulties: openHighDifficulties.length,
    chaptersWithRecords,
    chaptersWithoutRecords,
  };

  const observedFacts: ReportFact[] = [
    {
      label: 'Study sessions recorded',
      value:
        sessionsThisWeek.length === 0
          ? 'No sessions recorded this week'
          : `${sessionsThisWeek.length} session${sessionsThisWeek.length === 1 ? '' : 's'} · ${studyMinutes} minutes across ${activeDays} day${activeDays === 1 ? '' : 's'}`,
      evidence: sessionsThisWeek.slice(0, 5).map((s) => `${sessionDate(s)} · ${subjectLabel(subjectById.get(s.user_subject_id))} · ${s.duration_minutes} min`),
    },
    {
      label: 'Lectures recorded',
      value:
        lecturesThisWeek.length === 0
          ? 'No lectures recorded this week'
          : `${lecturesThisWeek.length} recorded · ${lecturesCompleted} marked completed`,
      evidence: lecturesThisWeek.slice(0, 5).map((l) => `${l.lecture_date} · ${l.title}${l.is_completed ? ' (completed)' : ' (not completed)'}`),
    },
    {
      label: 'Revisions recorded',
      value:
        revisionsThisWeek.length === 0
          ? 'No revisions recorded this week'
          : `${revisionsThisWeek.length} revision${revisionsThisWeek.length === 1 ? '' : 's'} · confidence ${revisionsThisWeek
              .map((r) => r.confidence_rating)
              .join(', ')}/5`,
      evidence: revisionsThisWeek.slice(0, 5).map((r) => `${r.revised_at} · ${chapterTitle(r.user_chapter_id)} · ${r.method}`),
    },
    {
      label: 'Tasks completed',
      value: `${tasksCompleted.length} completed · ${tasksCreated.length} added${overdueTasks.length > 0 ? ` · ${overdueTasks.length} overdue` : ''}`,
      evidence: tasksCompleted.slice(0, 5).map((t) => `${t.title}${t.completed_at ? ` (${t.completed_at.slice(0, 10)})` : ''}`),
    },
    {
      label: 'Checklist items ticked',
      value:
        checklistTicks.length === 0
          ? 'No checklist items ticked this week'
          : `${checklistTicks.length} item${checklistTicks.length === 1 ? '' : 's'} ticked`,
      evidence: checklistTicks.slice(0, 5).map((p) => {
        const item = input.checklistItems.find((i) => i.id === p.checklist_item_id);
        const chapter = item ? chapterById.get(item.user_chapter_id) : undefined;
        return `${p.completed_at?.slice(0, 10)} · ${chapter?.custom_title ?? 'Chapter'} · ${item?.label ?? 'item'}`;
      }),
    },
    {
      label: 'Exam results entered',
      value:
        examsThisWeek.length === 0
          ? 'No exam results entered this week'
          : `${examsThisWeek.length} exam${examsThisWeek.length === 1 ? '' : 's'}${averageExamPercent !== null ? ` · average ${averageExamPercent}%` : ''}`,
      evidence: examsThisWeek.slice(0, 5).map((e) => `${e.exam_date} · ${e.exam_name} · ${e.marks_obtained}/${e.total_marks}`),
    },
    {
      label: 'Difficult topics',
      value:
        difficultiesOpened.length === 0 && difficultiesResolved.length === 0
          ? 'No difficult topics added or resolved this week'
          : `${difficultiesOpened.length} added · ${difficultiesResolved.length} resolved · ${openHighDifficulties.length} high-severity still open`,
      evidence: [...difficultiesOpened, ...difficultiesResolved].slice(0, 5).map((d) => `${d.topic_name} (${d.status})`),
    },
  ];

  const possibleGaps: ReportGap[] = [];
  for (const [chapterId, progress] of progressByChapter) {
    for (const flag of progress.flags) {
      if (flag.code === 'no_records' || flag.code === 'stale_activity') continue;
      if (possibleGaps.length >= 6) break;
      possibleGaps.push({
        code: flag.code,
        label: `${flag.label} — ${chapterTitle(chapterId)}`,
        reason: flag.reason,
        evidence: [`Chapter: ${chapterTitle(chapterId)}`, `Chapter status: ${progress.status}`],
        severity: flag.severity,
      });
    }
  }
  if (overdueTasks.length > 0) {
    possibleGaps.push({
      code: 'overdue_task',
      label: `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`,
      reason: 'Tasks with a deadline in the past are still open.',
      evidence: overdueTasks.slice(0, 5).map((t) => `${t.title} (due ${t.due_date})`),
      severity: 'attention',
    });
  }

  const missing_data: string[] = [];
  if (sessionsThisWeek.length === 0) missing_data.push('No study sessions recorded for this week.');
  if (lecturesThisWeek.length === 0) missing_data.push('No lecture records for this week.');
  if (revisionsThisWeek.length === 0) missing_data.push('No revision records for this week.');
  if (examsThisWeek.length === 0) missing_data.push('No exam results entered for this week.');
  if (tasksCreated.length === 0) missing_data.push('No tasks created for this week.');
  if (chaptersWithoutRecords > 0) {
    missing_data.push(`${chaptersWithoutRecords} chapter${chaptersWithoutRecords === 1 ? ' has' : 's have'} no records at all.`);
  }
  missing_data.push('Missing records mean "not recorded", not "not studied". Add anything you did outside the app.');

  const recommendations: ReportRecommendation[] = [];
  const suggestedTasks: SuggestedTask[] = [];
  const revisionQueue = buildRevisionQueue(
    contexts.map((ctx) => ({
      userChapterId: ctx.chapter.id,
      userSubjectId: ctx.chapter.user_subject_id,
      chapterTitle: chapterTitle(ctx.chapter.id),
      subjectName: subjectLabel(subjectById.get(ctx.chapter.user_subject_id)),
      revisions: ctx.revisions,
    })),
    input.today,
  );

  const overdueRevision = revisionQueue.find((r) => r.bucket === 'overdue');
  if (overdueRevision) {
    recommendations.push({
      title: `Revise ${overdueRevision.chapterTitle}`,
      why: 'Its next review date has passed and it was scheduled from your own confidence rating.',
      evidence: [`Next review: ${overdueRevision.summary.nextDate}`, `Last confidence: ${overdueRevision.summary.lastConfidence}/5`],
      priority: 'high',
    });
    suggestedTasks.push({
      title: `Revise ${overdueRevision.chapterTitle}`,
      estimated_minutes: 30,
      priority: 'high',
      reason: 'Revision date passed.',
      user_subject_id: overdueRevision.userSubjectId,
      user_chapter_id: overdueRevision.userChapterId,
    });
  }

  const highDifficulty = openHighDifficulties[0];
  if (highDifficulty) {
    recommendations.push({
      title: `Work on “${highDifficulty.topic_name}”`,
      why: `You marked this as a high-severity difficulty and it is still ${highDifficulty.status}.`,
      evidence: [`Logged ${highDifficulty.created_at.slice(0, 10)}`, highDifficulty.reason ?? 'No reason recorded'],
      priority: 'high',
    });
    suggestedTasks.push({
      title: `Revisit difficult topic: ${highDifficulty.topic_name}`,
      estimated_minutes: 30,
      priority: 'high',
      reason: 'Open high-severity difficult topic.',
      user_subject_id: highDifficulty.user_subject_id,
      user_chapter_id: highDifficulty.user_chapter_id,
    });
  }

  if (overdueTasks.length > 0) {
    recommendations.push({
      title: 'Reschedule or shrink overdue tasks',
      why: 'Open tasks passed their deadlines. Rescheduling is supported; nothing is deleted automatically.',
      evidence: overdueTasks.slice(0, 3).map((t) => `${t.title} (due ${t.due_date})`),
      priority: 'medium',
    });
    suggestedTasks.push({
      title: `Reschedule ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`,
      estimated_minutes: 10,
      priority: 'medium',
      reason: 'Overdue tasks need a realistic new date.',
    });
  }

  const practiceGap = [...progressByChapter.values()].find(
    (p) => p.hasAnyRecord && p.practiceSessions === 0 && p.checklist.pendingKinds.includes('practice'),
  );
  if (practiceGap) {
    const chapter = chapterById.get(practiceGap.chapterId);
    const subjectName = subjectLabel(subjectById.get(chapter?.user_subject_id ?? ''));
    recommendations.push({
      title: `Log a practice session for ${chapterTitle(practiceGap.chapterId)}`,
      why: 'The practice checklist item is unticked and no practice session is on record for this chapter.',
      evidence: [`Checklist: ${practiceGap.checklist.done}/${practiceGap.checklist.total} items`, 'No practice session recorded'],
      priority: 'medium',
    });
    suggestedTasks.push({
      title: `Practice ${chapterTitle(practiceGap.chapterId)}`,
      estimated_minutes: 40,
      priority: 'medium',
      reason: `Practice not recorded for ${subjectName}.`,
      user_subject_id: chapter?.user_subject_id ?? null,
      user_chapter_id: chapter?.id ?? null,
    });
  }

  if (sessionsThisWeek.length === 0 && recommendations.length < 5) {
    recommendations.push({
      title: 'Add one record of what you actually did',
      why: 'No study sessions are recorded for this week, so the app cannot show progress. Missing data is not proof of inactivity.',
      evidence: [`Week ${start} → ${end}`],
      priority: 'low',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Keep the current rhythm',
      why: 'No evidence-based gap was flagged from this week’s records.',
      evidence: [`${chaptersWithRecords} chapters with records`, `${tasksCompleted.length} tasks completed`],
      priority: 'low',
    });
  }

  const summaryParts: string[] = [];
  if (sessionsThisWeek.length > 0) {
    summaryParts.push(`You recorded ${studyMinutes} minutes of study across ${activeDays} day${activeDays === 1 ? '' : 's'}`);
  } else {
    summaryParts.push('No study sessions are recorded this week');
  }
  summaryParts.push(
    `${tasksCompleted.length} task${tasksCompleted.length === 1 ? '' : 's'} completed${
      overdueTasks.length > 0 ? `, ${overdueTasks.length} still overdue` : ''
    }`,
  );
  if (examsThisWeek.length > 0) {
    summaryParts.push(
      `and ${examsThisWeek.length} exam result${examsThisWeek.length === 1 ? '' : 's'} entered${
        averageExamPercent !== null ? ` (average ${averageExamPercent}%)` : ''
      }`,
    );
  }
  const summary = `${summaryParts.join(', ')}. ${possibleGaps.length > 0 ? `${possibleGaps.length} evidence-based gap${possibleGaps.length === 1 ? '' : 's'} flagged.` : 'No gaps flagged from recorded data.'}`;

  const payload: WeeklyReportPayload = {
    summary,
    observed_facts: observedFacts,
    possible_gaps: possibleGaps,
    recommendations: recommendations.slice(0, 5),
    missing_data,
    suggested_tasks: suggestedTasks.slice(0, 5),
    generated_at: generatedAt,
    week: { start, end },
    metrics,
    disclaimer:
      'Built only from records you entered. Missing records mean “not recorded”, not “not studied”. This is not an official assessment or an exam-result prediction.',
  };

  return { payload, progressByChapter };
}

export function reportWeekLabel(payload: WeeklyReportPayload): string {
  const days = diffDaysISO(payload.week.start, payload.week.end) + 1;
  return `${payload.week.start} → ${payload.week.end} (${days} days)`;
}
