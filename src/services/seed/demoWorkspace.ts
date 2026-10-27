/**
 * Demo workspace builder.
 *
 * Produces a fully-linked set of clearly-labelled demo rows (every row that has
 * an `is_demo` column sets it to true). Dates are relative to "today" so the
 * demo never looks stale. The ICT subject deliberately has no records at all so
 * the UI demonstrates the "Not recorded" (≠ "not studied") state.
 */
import { addDaysISO, todayISO } from '@/domain/dates';
import type { DateOnly, Timestamp } from '@/types/domain';
import { DEMO_SUBJECT_IDS, DEMO_CHAPTERS } from './demoCurriculum';
import { DEFAULT_CHECKLIST } from './checklistDefaults';

export interface DemoWorkspaceRows {
  subjects: Record<string, unknown>[];
  chapters: Record<string, unknown>[];
  checklistItems: Record<string, unknown>[];
  checklistProgress: Record<string, unknown>[];
  lectures: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  revisions: Record<string, unknown>[];
  difficulties: Record<string, unknown>[];
  mistakes: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  exams: Record<string, unknown>[];
  resources: Record<string, unknown>[];
  notes: Record<string, unknown>[];
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function chapterIdFor(curriculumChapterIndex1: number): string {
  return DEMO_CHAPTERS[curriculumChapterIndex1 - 1]?.id ?? '';
}

export function buildDemoWorkspace(today: DateOnly = todayISO()): DemoWorkspaceRows {
  const nowIso = new Date().toISOString() as Timestamp;
  const stamp = (daysAgo: number): string => `${addDaysISO(today, -daysAgo)}T12:00:00.000Z`;

  const subjects = [
    {
      id: newId(),
      curriculum_subject_id: DEMO_SUBJECT_IDS.physics1,
      curriculum_version_id: DEMO_CHAPTERS[0]?.id ? 'd0000000-0000-4000-8000-000000000001' : null,
      custom_name: null,
      custom_paper_label: null,
      status: 'active',
      color: '#1d4ed8',
      sort_order: 1,
      is_demo: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: newId(),
      curriculum_subject_id: DEMO_SUBJECT_IDS.chemistry1,
      curriculum_version_id: 'd0000000-0000-4000-8000-000000000001',
      custom_name: null,
      custom_paper_label: null,
      status: 'active',
      color: '#b45309',
      sort_order: 2,
      is_demo: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: newId(),
      curriculum_subject_id: DEMO_SUBJECT_IDS.ict,
      curriculum_version_id: 'd0000000-0000-4000-8000-000000000001',
      custom_name: null,
      custom_paper_label: null,
      status: 'active',
      color: '#0f766e',
      sort_order: 3,
      is_demo: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
  const [physics, chemistry, ict] = subjects as [
    (typeof subjects)[number],
    (typeof subjects)[number],
    (typeof subjects)[number],
  ];

  const chapterSeed = [
    {
      id: newId(),
      user_subject_id: physics.id,
      curriculum_chapter_id: chapterIdFor(1),
      custom_title: null,
      status: 'in_progress',
      lecture_target_count: 5,
      title: 'Demo chapter 1 — mechanics',
      number: '1',
    },
    {
      id: newId(),
      user_subject_id: physics.id,
      curriculum_chapter_id: chapterIdFor(2),
      custom_title: null,
      status: 'not_recorded',
      lecture_target_count: null,
      title: 'Demo chapter 2 — waves',
      number: '2',
    },
    {
      id: newId(),
      user_subject_id: chemistry.id,
      curriculum_chapter_id: chapterIdFor(5),
      custom_title: null,
      status: 'not_recorded',
      lecture_target_count: 4,
      title: 'Demo chapter 1 — atomic structure',
      number: '1',
    },
    {
      id: newId(),
      user_subject_id: ict.id,
      curriculum_chapter_id: chapterIdFor(13),
      custom_title: null,
      status: 'not_recorded',
      lecture_target_count: null,
      title: 'Demo chapter 1 — ICT systems',
      number: '1',
    },
  ];

  const chapters = chapterSeed.map((c) => ({
    id: c.id,
    user_subject_id: c.user_subject_id,
    curriculum_chapter_id: c.curriculum_chapter_id,
    curriculum_version_id: 'd0000000-0000-4000-8000-000000000001',
    custom_title: c.custom_title,
    status: c.status,
    lecture_target_count: c.lecture_target_count,
    import_batch_id: null,
    is_demo: true,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const checklistItems: Record<string, unknown>[] = [];
  const checklistProgress: Record<string, unknown>[] = [];
  for (const chapter of chapterSeed) {
    DEFAULT_CHECKLIST.forEach((template, index) => {
      const itemId = newId();
      checklistItems.push({
        id: itemId,
        user_chapter_id: chapter.id,
        kind: template.kind,
        label: template.label,
        sort_order: index + 1,
        is_archived: false,
        created_at: nowIso,
        updated_at: nowIso,
      });
      const doneKindsForMechanics = ['reading', 'lecture', 'notes_review', 'concept_book'];
      const doneKindsForChemistry = ['reading', 'lecture'];
      const isDone =
        (chapter.id === chapterSeed[0]?.id && doneKindsForMechanics.includes(template.kind)) ||
        (chapter.id === chapterSeed[2]?.id && doneKindsForChemistry.includes(template.kind));
      if (isDone) {
        checklistProgress.push({
          id: newId(),
          checklist_item_id: itemId,
          is_done: true,
          completed_at: stamp(9),
          note: null,
          created_at: stamp(9),
          updated_at: stamp(9),
        });
      }
    });
  }

  const [mechanics, waves, atomic] = chapterSeed as [
    (typeof chapterSeed)[number],
    (typeof chapterSeed)[number],
    (typeof chapterSeed)[number],
  ];

  const lectures = [
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      title: 'Lecture 1 — scalars, vectors and units',
      lecture_number: 1,
      source: 'live',
      platform: 'College class',
      instructor: 'Class teacher',
      lecture_date: addDaysISO(today, -12),
      duration_minutes: 55,
      is_completed: true,
      notes: 'Demo record: vector addition rules.',
      follow_up: null,
    },
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      title: 'Lecture 2 — projectile motion',
      lecture_number: 2,
      source: 'recorded',
      platform: 'YouTube',
      instructor: null,
      lecture_date: addDaysISO(today, -7),
      duration_minutes: 72,
      is_completed: true,
      notes: 'Demo record.',
      follow_up: 'Redo the range derivation.',
    },
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      title: 'Lecture 3 — relative velocity',
      lecture_number: 3,
      source: 'coaching',
      platform: null,
      instructor: null,
      lecture_date: addDaysISO(today, -2),
      duration_minutes: 60,
      is_completed: false,
      notes: 'Demo record: watched half.',
      follow_up: 'Finish the second half.',
    },
    {
      user_subject_id: physics.id,
      user_chapter_id: waves.id,
      title: 'Lecture 1 — wave basics',
      lecture_number: 1,
      source: 'offline',
      platform: null,
      instructor: null,
      lecture_date: addDaysISO(today, -5),
      duration_minutes: 40,
      is_completed: true,
      notes: 'Demo record.',
      follow_up: null,
    },
    {
      user_subject_id: chemistry.id,
      user_chapter_id: atomic.id,
      title: 'Lecture 1 — atomic models',
      lecture_number: 1,
      source: 'live',
      platform: 'College class',
      instructor: null,
      lecture_date: addDaysISO(today, -10),
      duration_minutes: 50,
      is_completed: true,
      notes: 'Demo record.',
      follow_up: null,
    },
  ].map((l) => ({ id: newId(), ...l, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  const sessions = [
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      activity_type: 'practice',
      session_date: addDaysISO(today, -6),
      duration_minutes: 45,
      focus_rating: 4,
      result: 'Solved 12 numericals',
      notes: 'Demo record.',
    },
    {
      user_subject_id: physics.id,
      user_chapter_id: waves.id,
      activity_type: 'reading',
      session_date: addDaysISO(today, -4),
      duration_minutes: 30,
      focus_rating: 3,
      result: null,
      notes: 'Demo record.',
      source: 'manual',
      client_entry_id: null,
      user_topic_id: null,
      user_task_id: null,
    },
    {
      user_subject_id: chemistry.id,
      user_chapter_id: atomic.id,
      activity_type: 'notes',
      session_date: addDaysISO(today, -3),
      duration_minutes: 25,
      focus_rating: 3,
      result: null,
      notes: 'Demo record.',
      source: 'manual',
      client_entry_id: null,
      user_topic_id: null,
      user_task_id: null,
    },
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      activity_type: 'mcq',
      session_date: addDaysISO(today, -1),
      duration_minutes: 35,
      focus_rating: 4,
      result: '18/25',
      notes: 'Demo record.',
      source: 'manual',
      client_entry_id: null,
      user_topic_id: null,
      user_task_id: null,
    },
  ].map((s) => ({
    ...s,
    id: newId(),
    started_at: null,
    ended_at: null,
    is_demo: true,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const revisions = [
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      revised_at: addDaysISO(today, -12),
      method: 'recall',
      confidence_rating: 2,
      questions_attempted: 10,
      questions_correct: 5,
      next_review_date: addDaysISO(today, -9),
      notes: 'Demo record: weak recall.',
    },
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      revised_at: addDaysISO(today, -4),
      method: 'practice',
      confidence_rating: 4,
      questions_attempted: 12,
      questions_correct: 10,
      next_review_date: addDaysISO(today, 3),
      notes: 'Demo record.',
    },
    {
      user_subject_id: chemistry.id,
      user_chapter_id: atomic.id,
      revised_at: addDaysISO(today, -6),
      method: 'notes_reread',
      confidence_rating: 3,
      questions_attempted: null,
      questions_correct: null,
      next_review_date: addDaysISO(today, -1),
      notes: 'Demo record: review was due yesterday.',
    },
  ].map((r) => ({ id: newId(), ...r, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  const difficulties = [
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      topic_name: 'Projectile range derivation',
      reason: 'Lose the angle term when differentiating.',
      severity: 'high',
      status: 'open',
      source_ref: 'Demo board question 2023',
      attempted_solution: 'Rewrote derivation once.',
      corrected_concept: null,
      follow_up_date: addDaysISO(today, 2),
      resolved_at: null,
    },
    {
      user_subject_id: chemistry.id,
      user_chapter_id: atomic.id,
      topic_name: 'Orbital shapes',
      reason: 'Mixing up p and d orbitals.',
      severity: 'medium',
      status: 'working',
      source_ref: null,
      attempted_solution: 'Drawing each shape once.',
      corrected_concept: null,
      follow_up_date: null,
      resolved_at: null,
    },
    {
      user_subject_id: physics.id,
      user_chapter_id: waves.id,
      topic_name: 'Standing waves',
      reason: 'Confused nodes and antinodes.',
      severity: 'low',
      status: 'resolved',
      source_ref: null,
      attempted_solution: 'Used a rope demo.',
      corrected_concept: 'Nodes are displacement zeros; antinodes are maxima.',
      follow_up_date: null,
      resolved_at: null,
    },
  ].map((d) => ({ id: newId(), ...d, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  const mistakes = [
    {
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      exam_result_id: null,
      category: 'calculation',
      question_ref: 'Demo MCQ 12',
      what_went_wrong: 'Forgot to square the time in s = ut + ½at².',
      correction: 'Write the formula before substituting.',
      occurred_at: addDaysISO(today, -6),
      is_resolved: false,
    },
    {
      user_subject_id: chemistry.id,
      user_chapter_id: atomic.id,
      exam_result_id: null,
      category: 'concept_gap',
      question_ref: null,
      what_went_wrong: 'Thought energy increases as n decreases.',
      correction: 'Energy is more negative (lower) for smaller n.',
      occurred_at: addDaysISO(today, -8),
      is_resolved: true,
    },
  ].map((m) => ({ id: newId(), ...m, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  const tasks = [
    {
      title: 'Practise projectile numericals',
      description: 'Ten numericals from the practice sheet.',
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      estimated_minutes: 45,
      priority: 'high',
      status: 'todo',
      due_date: addDaysISO(today, 1),
      planned_date: today,
      origin: 'rule',
      source_report_id: null,
      gap_reason: 'Practice checklist not ticked; high-severity difficulty open.',
      carried_over_count: 0,
      completed_at: null,
    },
    {
      title: 'Revise atomic structure notes',
      description: null,
      user_subject_id: chemistry.id,
      user_chapter_id: atomic.id,
      estimated_minutes: 30,
      priority: 'medium',
      status: 'todo',
      due_date: addDaysISO(today, -1),
      planned_date: addDaysISO(today, -1),
      origin: 'manual',
      source_report_id: null,
      gap_reason: null,
      carried_over_count: 1,
      completed_at: null,
    },
    {
      title: 'Watch second half of relative velocity lecture',
      description: null,
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      estimated_minutes: 40,
      priority: 'medium',
      status: 'done',
      due_date: addDaysISO(today, -2),
      planned_date: addDaysISO(today, -2),
      origin: 'manual',
      source_report_id: null,
      gap_reason: null,
      carried_over_count: 0,
      completed_at: stamp(2),
    },
  ].map((t) => ({ id: newId(), ...t, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  const exams = [
    {
      exam_name: 'Demo Physics unit test',
      exam_type: 'school',
      exam_date: addDaysISO(today, -5),
      user_subject_id: physics.id,
      coverage_note: 'Mechanics (demo record)',
      marks_obtained: 30,
      total_marks: 50,
      duration_minutes: 60,
      source: 'Class test',
      analysis: 'Demo analysis: numericals were stronger than derivations.',
      strengths: 'Numericals',
      weak_areas: 'Derivations',
    },
  ].map((e) => ({ id: newId(), ...e, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  const resources = [
    {
      title: 'Demo Physics practice sheet',
      resource_type: 'pdf',
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      url: 'https://example.com/demo-physics-sheet.pdf',
      storage_path: null,
      description: 'Placeholder link — replace with your own material.',
      tags: ['demo', 'practice'],
    },
  ].map((r) => ({ id: newId(), ...r, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  const notes = [
    {
      title: 'Demo note — formula checklist',
      body: 'This is demo content. Replace it with your own notes.\n\n- Write the formula first\n- Then substitute values\n- Then check units',
      user_subject_id: physics.id,
      user_chapter_id: mechanics.id,
      kind: 'note',
      tags: ['demo', 'formula'],
      is_pinned: false,
    },
  ].map((n) => ({ id: newId(), ...n, is_demo: true, created_at: nowIso, updated_at: nowIso }));

  return { subjects, chapters, checklistItems, checklistProgress, lectures, sessions, revisions, difficulties, mistakes, tasks, exams, resources, notes };
}

export const DEMO_WORKSPACE_TABLES = [
  'user_subjects',
  'user_chapters',
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
] as const;

export const DEMO_FLAGGED_TABLES = [
  'user_subjects',
  'user_chapters',
  'lecture_records',
  'study_sessions',
  'revision_sessions',
  'topic_difficulties',
  'mistake_logs',
  'study_tasks',
  'exam_results',
  'study_resources',
  'notes',
] as const;
