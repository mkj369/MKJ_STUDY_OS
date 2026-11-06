/**
 * Pure view-model builders. Pages consume these instead of combining raw tables
 * themselves, so a number is computed in exactly one place.
 */
import { todayInZone } from '@/domain/dates';
import {
  computeChapterProgress,
  computeExamSummary,
  computeSubjectProgress,
  type ChapterContext,
  type ChapterProgress,
  type ChecklistEntry,
  type ExamSummary,
  type SubjectProgress,
} from '@/domain/progress';
import { buildRevisionQueue, type RevisionQueueEntry } from '@/domain/revisions';
import { buildChapterCoverage, computeSubjectCoverage, type ChapterCoverage, type SubjectCoverage } from '@/domain/syllabus';
import { analyzeMistakes, type MistakeAnalysis } from '@/domain/mistakes';
import { computeTargetProgress, summariseTargets, type TargetProgress, type TargetProgressInput, type TargetSummary } from '@/domain/targets';
import { buildPracticeQueue, summarizePractice, type PracticeSummary, type ReviewCandidate } from '@/domain/practice';
import { countdownFor, type ExamCountdown } from '@/domain/preparation';
import { summarizeTasks, todayTasks, type TaskCounts } from '@/domain/tasks';
import type { UserDataBundle } from '@/services/repository';
import type {
  ChapterChecklistItem,
  CurriculumChapter,
  CurriculumSubject,
  DateOnly,
  ID,
  LectureChecklistItem,
  Profile,
  StudyTarget,
  UserChapter,
  UserSubject,
  UserTopic,
} from '@/types/domain';

export interface ChapterView {
  chapter: UserChapter;
  title: string;
  number: string | null;
  curriculumChapter: CurriculumChapter | null;
  checklist: ChecklistEntry[];
  progress: ChapterProgress;
  context: ChapterContext;
}

export interface SubjectView {
  subject: UserSubject;
  curriculumSubject: CurriculumSubject | null;
  label: string;
  paperLabel: string | null;
  color: string;
  chapters: ChapterView[];
  progress: SubjectProgress;
}

export interface TargetView {
  target: StudyTarget;
  progress: TargetProgress;
  subjectLabel: string | null;
}

export interface SyllabusOverview {
  chaptersTotal: number;
  chaptersComplete: number;
  chaptersInProgress: number;
  chaptersNotStarted: number;
  /** Explicitly skipped — excluded from the completion denominator. */
  chaptersSkipped: number;
  /** Total minus skipped: the real denominator. */
  chaptersCounted: number;
  /** Counted minus complete: what is left to do. */
  chaptersRemaining: number;
  /** 0–100, complete / (total − skipped). Zero counted → 0. */
  overallPercent: number;
  checklistDone: number;
  checklistTotal: number;
}

export interface WorkspaceView {
  today: DateOnly;
  profile: Profile;
  /** True once the academic setup wizard has been completed. */
  setupCompleted: boolean;
  subjects: SubjectView[];
  chapterById: Map<string, ChapterView>;
  subjectById: Map<string, SubjectView>;
  /** Per-lecture checklist rows keyed by lecture id (sorted). */
  lectureChecklistByLecture: Map<ID, LectureChecklistItem[]>;
  targets: TargetView[];
  targetSummary: TargetSummary;
  syllabusOverview: SyllabusOverview;
  revisionQueue: RevisionQueueEntry[];
  taskCounts: TaskCounts;
  dashboardTasks: UserDataBundle['tasks'];
  examSummary: ExamSummary;
  totals: {
    subjects: number;
    chapters: number;
    chaptersWithRecords: number;
    checklistDone: number;
    checklistTotal: number;
    openDifficulties: number;
    demoRows: number;
  };
  lastRecordDate: DateOnly | null;
  demoActive: boolean;
  phase2: Phase2View;
}

/** Skip-aware chapter completion for a subject card/header. */
export function subjectChapterStats(chapters: ChapterView[]): { complete: number; counted: number; skipped: number; percent: number } {
  const skipped = chapters.filter((c) => c.progress.status === 'skipped').length;
  const complete = chapters.filter((c) => c.progress.status === 'complete').length;
  const counted = chapters.length - skipped;
  return { complete, counted, skipped, percent: counted === 0 ? 0 : Math.round((complete / counted) * 100) };
}

export function subjectDisplayName(subject: UserSubject, curriculumSubject: CurriculumSubject | null): string {
  if (subject.custom_name) return subject.custom_name;
  if (curriculumSubject) {
    return curriculumSubject.paper_label
      ? `${curriculumSubject.name} — ${curriculumSubject.paper_label}`
      : curriculumSubject.name;
  }
  return 'Subject';
}

export function chapterDisplayTitle(chapter: UserChapter, curriculumChapter: CurriculumChapter | null): string {
  if (chapter.custom_title) return chapter.custom_title;
  if (curriculumChapter) return curriculumChapter.title;
  return 'Untitled chapter';
}

export function buildWorkspaceView(bundle: UserDataBundle, todayOverride?: DateOnly): WorkspaceView {
  const today = todayOverride ?? todayInZone(bundle.profile.timezone || 'Asia/Dhaka');
  const curriculumSubjectById = new Map(bundle.curriculum.subjects.map((s) => [s.id, s]));
  const curriculumChapterById = new Map(bundle.curriculum.chapters.map((c) => [c.id, c]));
  const itemsByChapter = new Map<string, ChapterChecklistItem[]>();
  for (const item of bundle.checklistItems) {
    const list = itemsByChapter.get(item.user_chapter_id) ?? [];
    list.push(item);
    itemsByChapter.set(item.user_chapter_id, list);
  }
  const progressByItem = new Map(bundle.checklistProgress.map((p) => [p.checklist_item_id, p]));

  const chaptersBySubject = new Map<string, UserChapter[]>();
  for (const chapter of bundle.chapters) {
    const list = chaptersBySubject.get(chapter.user_subject_id) ?? [];
    list.push(chapter);
    chaptersBySubject.set(chapter.user_subject_id, list);
  }

  const chapterViewsById = new Map<string, ChapterView>();
  const subjects: SubjectView[] = bundle.subjects
    .filter((s) => s.status === 'active')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((subject) => {
      const curriculumSubject = subject.curriculum_subject_id
        ? curriculumSubjectById.get(subject.curriculum_subject_id) ?? null
        : null;
      const rawChapters = (chaptersBySubject.get(subject.id) ?? []).sort((a, b) => {
        const ca = a.curriculum_chapter_id ? curriculumChapterById.get(a.curriculum_chapter_id) : null;
        const cb = b.curriculum_chapter_id ? curriculumChapterById.get(b.curriculum_chapter_id) : null;
        return (ca?.sort_order ?? 0) - (cb?.sort_order ?? 0) || a.created_at.localeCompare(b.created_at);
      });

      const chapterViews: ChapterView[] = rawChapters.map((chapter) => {
        const curriculumChapter = chapter.curriculum_chapter_id
          ? curriculumChapterById.get(chapter.curriculum_chapter_id) ?? null
          : null;
        const items = (itemsByChapter.get(chapter.id) ?? [])
          .filter((i) => !i.is_archived)
          .sort((a, b) => a.sort_order - b.sort_order);
        const checklist: ChecklistEntry[] = items.map((item) => ({
          item,
          progress: progressByItem.get(item.id) ?? null,
        }));
        const context: ChapterContext = {
          chapter,
          checklist,
          lectures: bundle.lectures.filter((l) => l.user_chapter_id === chapter.id),
          sessions: bundle.sessions.filter((s) => s.user_chapter_id === chapter.id),
          revisions: bundle.revisions.filter((r) => r.user_chapter_id === chapter.id),
          difficulties: bundle.difficulties.filter((d) => d.user_chapter_id === chapter.id),
          mistakes: bundle.mistakes.filter((m) => m.user_chapter_id === chapter.id),
          tasks: bundle.tasks.filter((t) => t.user_chapter_id === chapter.id),
          exams: bundle.exams.filter((e) => e.user_subject_id === subject.id),
        };
        const view: ChapterView = {
          chapter,
          title: chapterDisplayTitle(chapter, curriculumChapter),
          number: curriculumChapter?.chapter_number ?? null,
          curriculumChapter,
          checklist,
          progress: computeChapterProgress(context, { today }),
          context,
        };
        chapterViewsById.set(chapter.id, view);
        return view;
      });

      return {
        subject,
        curriculumSubject,
        label: subjectDisplayName(subject, curriculumSubject),
        paperLabel: curriculumSubject?.paper_label ?? subject.custom_paper_label ?? null,
        color: subject.color,
        chapters: chapterViews,
        progress: computeSubjectProgress({
          userSubjectId: subject.id,
          chapters: chapterViews.map((c) => c.context),
          tasks: bundle.tasks,
          today,
        }),
      };
    });

  const revisionQueue = buildRevisionQueue(
    subjects.flatMap((subject) =>
      subject.chapters.map((chapter) => ({
        userChapterId: chapter.chapter.id,
        userSubjectId: subject.subject.id,
        chapterTitle: chapter.title,
        subjectName: subject.label,
        revisions: chapter.context.revisions,
      })),
    ),
    today,
  );

  const demoRows =
    bundle.subjects.filter((s) => s.is_demo).length +
    bundle.chapters.filter((c) => c.is_demo).length +
    bundle.lectures.filter((l) => l.is_demo).length +
    bundle.sessions.filter((s) => s.is_demo).length +
    bundle.tasks.filter((t) => t.is_demo).length +
    bundle.revisions.filter((r) => r.is_demo).length +
    bundle.exams.filter((e) => e.is_demo).length;

  const lastRecordDates = [
    ...bundle.lectures.map((l) => l.lecture_date),
    ...bundle.sessions.map((s) => s.session_date),
    ...bundle.revisions.map((r) => r.revised_at),
    ...bundle.checklistProgress.filter((p) => p.completed_at).map((p) => (p.completed_at as string).slice(0, 10)),
    ...bundle.exams.map((e) => e.exam_date),
  ].sort();

  const checklistDone = subjects.reduce(
    (sum, s) => sum + s.chapters.reduce((acc, c) => acc + c.progress.checklist.done, 0),
    0,
  );
  const checklistTotal = subjects.reduce(
    (sum, s) => sum + s.chapters.reduce((acc, c) => acc + c.progress.checklist.total, 0),
    0,
  );

  const base: Omit<WorkspaceView, 'phase2'> = {
    today,
    profile: bundle.profile,
    setupCompleted: Boolean(bundle.profile.setup_completed_at),
    subjects,
    chapterById: chapterViewsById,
    subjectById: new Map(subjects.map((s) => [s.subject.id, s])),
    lectureChecklistByLecture: buildLectureChecklistMap(bundle.lectureChecklist),
    ...buildTargetsView(bundle, subjects, chapterViewsById, today),
    syllabusOverview: buildSyllabusOverview(subjects, checklistDone, checklistTotal),
    revisionQueue,
    taskCounts: summarizeTasks(bundle.tasks, today),
    dashboardTasks: todayTasks(bundle.tasks, today),
    examSummary: computeExamSummary(bundle.exams.filter((e) => !e.user_subject_id || subjects.some((s) => s.subject.id === e.user_subject_id))),
    totals: {
      subjects: subjects.length,
      chapters: subjects.reduce((sum, s) => sum + s.chapters.length, 0),
      chaptersWithRecords: subjects.reduce(
        (sum, s) => sum + s.chapters.filter((c) => c.progress.hasAnyRecord).length,
        0,
      ),
      checklistDone,
      checklistTotal,
      openDifficulties: bundle.difficulties.filter((d) => d.status !== 'resolved').length,
      demoRows,
    },
    lastRecordDate: lastRecordDates.length > 0 ? (lastRecordDates[lastRecordDates.length - 1] as DateOnly) : null,
    demoActive: demoRows > 0,
  };
  return { ...base, phase2: buildPhase2View(bundle, base) };
}

/** Chapter options for selects, grouped by subject label. */
export function chapterOptions(subjects: SubjectView[]): { value: string; label: string; subjectId: string }[] {
  return subjects.flatMap((subject) =>
    subject.chapters.map((chapter) => ({
      value: chapter.chapter.id,
      label: `${subject.label} · ${chapter.title}`,
      subjectId: subject.subject.id,
    })),
  );
}

export function subjectOptions(subjects: SubjectView[]): { value: string; label: string }[] {
  return subjects.map((s) => ({ value: s.subject.id, label: s.label }));
}

export function findSubjectForChapter(subjects: SubjectView[], chapterId: string | null): SubjectView | null {
  if (!chapterId) return null;
  for (const subject of subjects) {
    if (subject.chapters.some((c) => c.chapter.id === chapterId)) return subject;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Phase 2 view models: syllabus coverage, practice, mistakes, countdowns.    */
/* Built once here so a percentage is never computed twice.                   */
/* ------------------------------------------------------------------------- */

export interface Phase2View {
  topicsByChapter: Map<string, UserTopic[]>;
  coverageByChapter: Map<string, ChapterCoverage>;
  subjectCoverageById: Map<string, SubjectCoverage>;
  mistakeAnalysis: MistakeAnalysis;
  practiceSummary: PracticeSummary;
  practiceQueue: ReviewCandidate[];
  countdowns: ExamCountdown[];
  subjectLabels: Record<string, string>;
  chapterTitles: Record<string, string>;
  /** Recorded study minutes per chapter. */
  chapterMinutes: Map<string, number>;
  availabilityMinutesThisWeek: number;
}

export function buildPhase2View(
  bundle: UserDataBundle,
  view: Pick<WorkspaceView, 'today' | 'subjects' | 'chapterById'>,
): Phase2View {
  const topicsByChapter = new Map<string, UserTopic[]>();
  for (const topic of bundle.topics) {
    const list = topicsByChapter.get(topic.user_chapter_id) ?? [];
    list.push(topic);
    topicsByChapter.set(topic.user_chapter_id, list);
  }

  const coverageByChapter = new Map<string, ChapterCoverage>();
  const subjectCoverageById = new Map<string, SubjectCoverage>();
  const subjectLabels: Record<string, string> = {};
  const chapterTitles: Record<string, string> = {};
  const chapterMinutes = new Map<string, number>();

  for (const subject of view.subjects) {
    subjectLabels[subject.subject.id] = subject.label;
    const coverages: (ChapterCoverage & { status: string })[] = [];
    for (const chapterView of subject.chapters) {
      const chapterId = chapterView.chapter.id;
      chapterTitles[chapterId] = chapterView.title;
      const topics = topicsByChapter.get(chapterId) ?? [];
      const coverage = buildChapterCoverage({
        chapter: chapterView.chapter,
        title: chapterView.title,
        topics,
        checklist: chapterView.checklist,
        lectures: chapterView.context.lectures,
        revisions: chapterView.context.revisions,
        sessions: chapterView.context.sessions,
      });
      coverageByChapter.set(chapterId, coverage);
      coverages.push({ ...coverage, status: chapterView.chapter.status });
      chapterMinutes.set(
        chapterId,
        chapterView.context.sessions.reduce((sum, session) => sum + session.duration_minutes, 0),
      );
    }
    subjectCoverageById.set(
      subject.subject.id,
      computeSubjectCoverage({ subjectId: subject.subject.id, chapterCoverages: coverages }),
    );
  }

  const availability = bundle.profile.study_windows ?? null;
  const availabilityMinutesThisWeek = availability
    ? Object.values(availability).reduce((sum, minutes) => sum + (Number(minutes) || 0), 0)
    : 0;

  return {
    topicsByChapter,
    coverageByChapter,
    subjectCoverageById,
    mistakeAnalysis: analyzeMistakes(bundle.mistakes, bundle.chapters),
    practiceSummary: summarizePractice(bundle.practiceQuestions, bundle.practiceAttempts),
    practiceQueue: buildPracticeQueue(bundle.practiceQuestions, bundle.practiceAttempts, 12),
    countdowns: bundle.examTargets
      .filter((target) => target.status !== 'cancelled')
      .map((target) => countdownFor(target, view.today))
      .sort((a, b) => a.daysRemaining - b.daysRemaining),
    subjectLabels,
    chapterTitles,
    chapterMinutes,
    availabilityMinutesThisWeek,
  };
}

function buildLectureChecklistMap(items: LectureChecklistItem[]): Map<ID, LectureChecklistItem[]> {
  const map = new Map<ID, LectureChecklistItem[]>();
  for (const item of items) {
    const list = map.get(item.lecture_record_id) ?? [];
    list.push(item);
    map.set(item.lecture_record_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
  return map;
}

function buildTargetsView(
  bundle: UserDataBundle,
  subjects: SubjectView[],
  chapterViewsById: Map<string, ChapterView>,
  today: DateOnly,
): { targets: TargetView[]; targetSummary: TargetSummary } {
  const subjectLabelById = new Map(subjects.map((s) => [s.subject.id, s.label]));
  const chapterStatusById = new Map<ID, string>();
  const subjectIdByChapterId = new Map<ID, ID>();
  for (const view of chapterViewsById.values()) {
    chapterStatusById.set(view.chapter.id, view.progress.status);
    subjectIdByChapterId.set(view.chapter.id, view.chapter.user_subject_id);
  }
  const chapterIdByItemId = new Map<ID, ID>(bundle.checklistItems.map((i) => [i.id, i.user_chapter_id]));
  const input: TargetProgressInput = {
    chapters: bundle.chapters,
    chapterStatusById,
    checklistProgress: bundle.checklistProgress,
    chapterIdByItemId,
    subjectIdByChapterId,
    lectures: bundle.lectures,
    sessions: bundle.sessions,
  };
  const targets: TargetView[] = bundle.studyTargets
    .map((target) => ({
      target,
      progress: computeTargetProgress(target, input, today),
      subjectLabel: target.user_subject_id ? subjectLabelById.get(target.user_subject_id) ?? null : null,
    }))
    .sort((a, b) => {
      // Overdue first, then active, then upcoming, then completed; newest window first.
      const rank = { overdue: 0, active: 1, upcoming: 2, completed: 3 } as const;
      return (
        rank[a.progress.state] - rank[b.progress.state] ||
        b.progress.window.start.localeCompare(a.progress.window.start) ||
        a.target.created_at.localeCompare(b.target.created_at)
      );
    });
  return { targets, targetSummary: summariseTargets(targets.map((t) => t.progress)) };
}

function buildSyllabusOverview(subjects: SubjectView[], checklistDone: number, checklistTotal: number): SyllabusOverview {
  let chaptersComplete = 0;
  let chaptersInProgress = 0;
  let chaptersNotStarted = 0;
  let chaptersSkipped = 0;
  let chaptersTotal = 0;
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      chaptersTotal += 1;
      if (chapter.progress.status === 'skipped') chaptersSkipped += 1;
      else if (chapter.progress.status === 'complete') chaptersComplete += 1;
      else if (chapter.progress.status === 'not_started' || chapter.progress.status === 'not_recorded') chaptersNotStarted += 1;
      else chaptersInProgress += 1;
    }
  }
  const chaptersCounted = chaptersTotal - chaptersSkipped;
  return {
    chaptersTotal,
    chaptersComplete,
    chaptersInProgress,
    chaptersNotStarted,
    chaptersSkipped,
    chaptersCounted,
    chaptersRemaining: chaptersCounted - chaptersComplete,
    overallPercent: chaptersCounted === 0 ? 0 : Math.round((chaptersComplete / chaptersCounted) * 100),
    checklistDone,
    checklistTotal,
  };
}
