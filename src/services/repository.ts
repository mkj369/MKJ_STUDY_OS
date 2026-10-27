/**
 * Repository contract. Two implementations exist:
 *  - SupabaseRepository (cloud mode, RLS-protected, the production path)
 *  - LocalRepository  (demo mode, browser storage, no account required)
 *
 * UI code depends only on this interface, so switching modes never changes
 * feature logic.
 */
import type {
  ChapterChecklistItem,
  ChapterChecklistProgress,
  CurriculumChapter,
  CurriculumSubject,
  CurriculumVersion,
  ID,
  Profile,
  ReminderEvent,
  ReminderPreferences,
  RepositoryTable,
  TableMap,
  Timestamp,
  UserChapter,
  UserSubject,
  WeeklySummary,
} from '@/types/domain';

export type { RepositoryTable, TableMap };

/** Fields the client may supply; server defaults cover the rest. */
export type NewRow<T extends RepositoryTable> = Omit<
  TableMap[T],
  'id' | 'user_id' | 'created_at' | 'updated_at'
> & { id?: ID };

export interface RepositoryMode {
  kind: 'cloud' | 'local';
  /** True when the current workspace contains demo records. */
  demoActive: boolean;
}

export class RepositoryError extends Error {
  readonly code: string;
  constructor(message: string, code = 'repository_error') {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export interface AddChaptersResult {
  created: number;
  skipped: number;
  importBatchId: string;
}

export interface DemoWorkspaceResult {
  createdSubjects: number;
  createdChapters: number;
  removed: number;
  removedSubjects?: number;
  removedChapters?: number;
}

export interface Repository {
  readonly mode: 'cloud' | 'local';
  /** Resolves the authenticated user id; throws if unauthenticated. */
  currentUserId(): Promise<ID>;
  /** Whether the current workspace still holds demo rows. */
  hasDemoData(): Promise<boolean>;

  /* ------------------------------- generic ------------------------------- */
  list<T extends RepositoryTable>(table: T): Promise<TableMap[T][]>;
  create<T extends RepositoryTable>(table: T, values: NewRow<T>): Promise<TableMap[T]>;
  createMany<T extends RepositoryTable>(table: T, values: NewRow<T>[]): Promise<TableMap[T][]>;
  update<T extends RepositoryTable>(table: T, id: ID, patch: Partial<TableMap[T]>): Promise<TableMap[T]>;
  remove<T extends RepositoryTable>(table: T, id: ID): Promise<void>;

  /* ------------------------------- profile ------------------------------- */
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;

  /* ----------------------------- curriculum ------------------------------ */
  listCurriculum(): Promise<{
    versions: CurriculumVersion[];
    subjects: CurriculumSubject[];
    chapters: CurriculumChapter[];
  }>;
  adoptCurriculumSubject(versionId: ID, subjectId: ID): Promise<UserSubject>;
  addChaptersFromCurriculum(
    versionId: ID,
    subjectId: ID,
    chapterIds: ID[],
  ): Promise<AddChaptersResult>;
  /** Undo one import batch. Records attached to removed chapters are kept, unlinked. */
  rollbackImport(importBatchId: ID): Promise<number>;

  /* --------------------------- chapter support --------------------------- */
  ensureChecklistDefaults(userChapterId: ID): Promise<ChapterChecklistItem[]>;
  setChecklistProgress(
    chapterId: ID,
    checklistItemId: ID,
    isDone: boolean,
    note?: string | null,
  ): Promise<ChapterChecklistProgress>;

  /* ------------------------------ summaries ------------------------------ */
  saveSummary(summary: Omit<WeeklySummary, 'id' | 'user_id' | 'created_at'>): Promise<WeeklySummary>;

  /* ------------------------------ reminders ------------------------------ */
  getReminderPreferences(): Promise<ReminderPreferences>;
  saveReminderPreferences(patch: Partial<ReminderPreferences>): Promise<ReminderPreferences>;
  saveReminderEvents(events: Omit<ReminderEvent, 'id' | 'user_id' | 'created_at'>[]): Promise<ReminderEvent[]>;
  updateReminderEventStatus(id: ID, status: ReminderEvent['status'], errorMessage?: string | null): Promise<ReminderEvent>;

  /* -------------------------------- demo -------------------------------- */
  seedDemoWorkspace(): Promise<DemoWorkspaceResult>;
  removeDemoData(): Promise<DemoWorkspaceResult>;

  /* ------------------------------- export ------------------------------- */
  exportAll(): Promise<{ exported_at: Timestamp; mode: 'cloud' | 'local'; tables: Partial<Record<RepositoryTable, unknown[]>> }>;

  /** Convenience for pages that need several tables at once. */
  listAllUserData(): Promise<UserDataBundle>;
}

export interface UserDataBundle {
  subjects: UserSubject[];
  chapters: UserChapter[];
  checklistItems: ChapterChecklistItem[];
  checklistProgress: ChapterChecklistProgress[];
  lectures: TableMap['lecture_records'][];
  sessions: TableMap['study_sessions'][];
  revisions: TableMap['revision_sessions'][];
  difficulties: TableMap['topic_difficulties'][];
  mistakes: TableMap['mistake_logs'][];
  tasks: TableMap['study_tasks'][];
  exams: TableMap['exam_results'][];
  resources: TableMap['study_resources'][];
  notes: TableMap['notes'][];
  summaries: WeeklySummary[];
  curriculum: {
    versions: CurriculumVersion[];
    subjects: CurriculumSubject[];
    chapters: CurriculumChapter[];
  };
  profile: Profile;
  reminderPreferences: ReminderPreferences;
  reminderEvents: ReminderEvent[];
}
