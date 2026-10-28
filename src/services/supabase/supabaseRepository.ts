import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CURRICULUM_TABLES,
  USER_OWNED_TABLES,
  type ID,
  type Profile,
  type ReminderEvent,
  type ReminderPreferences,
  type RepositoryTable,
  type TableMap,
  type WeeklySummary,
} from '@/types/domain';
import type {
  AddChaptersResult,
  DemoWorkspaceResult,
  NewRow,
  Repository,
  UserDataBundle,
} from '@/services/repository';
import { RepositoryError } from '@/services/repository';
import { DEFAULT_CHECKLIST } from '@/services/seed/checklistDefaults';
import { buildDemoWorkspace, DEMO_WORKSPACE_TABLES, newId } from '@/services/seed/demoWorkspace';
import { defaultReminderPreferences } from '@/services/reminderDefaults';

function friendlyError(error: { message?: string; code?: string; details?: string } | null, context: string): RepositoryError {
  const message = error?.message ?? 'Unknown database error';
  if (/row-level security|permission denied|violates row-level/i.test(message)) {
    return new RepositoryError(
      `${context}: your account does not have access to that record.`,
      'forbidden',
    );
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return new RepositoryError(`${context}: that record already exists.`, 'duplicate');
  }
  if (/foreign key/i.test(message)) {
    return new RepositoryError(`${context}: a linked record is missing or already deleted.`, 'foreign_key');
  }
  return new RepositoryError(`${context}: ${message}`, error?.code ?? 'database_error');
}

const USER_KEYED: RepositoryTable[] = ['reminder_preferences'];

const ALL_USER_TABLES: RepositoryTable[] = [...USER_OWNED_TABLES, 'reminder_preferences'];

/**
 * Cloud repository. All reads/writes go through the anon client with the
 * signed-in session, so every statement is filtered by Row Level Security in
 * Postgres. The client never holds a service-role key.
 */
export class SupabaseRepository implements Repository {
  readonly mode = 'cloud' as const;
  private readonly client: SupabaseClient;
  private readonly userId: string;

  constructor(client: SupabaseClient, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async currentUserId(): Promise<ID> {
    return this.userId;
  }

  async list<T extends RepositoryTable>(table: T): Promise<TableMap[T][]> {
    const query = this.client.from(table).select('*');
    const { data, error } = await query;
    if (error) throw friendlyError(error, `Loading ${table}`);
    return (data ?? []) as unknown as TableMap[T][];
  }

  async create<T extends RepositoryTable>(table: T, values: NewRow<T>): Promise<TableMap[T]> {
    const created = await this.createMany(table, [values]);
    const first = created[0];
    if (!first) throw new RepositoryError('The record was not created.', 'create_failed');
    return first;
  }

  async createMany<T extends RepositoryTable>(table: T, values: NewRow<T>[]): Promise<TableMap[T][]> {
    if (values.length === 0) return [];
    const { data, error } = await this.client
      .from(table)
      .insert(values as unknown as Record<string, unknown>[])
      .select();
    if (error) throw friendlyError(error, `Saving ${table}`);
    return (data ?? []) as unknown as TableMap[T][];
  }

  async update<T extends RepositoryTable>(table: T, id: ID, patch: Partial<TableMap[T]>): Promise<TableMap[T]> {
    const keyColumn = USER_KEYED.includes(table) ? 'user_id' : 'id';
    const { data, error } = await this.client
      .from(table)
      .update(patch as Record<string, unknown>)
      .eq(keyColumn, USER_KEYED.includes(table) ? this.userId : id)
      .select()
      .maybeSingle();
    if (error) throw friendlyError(error, `Updating ${table}`);
    if (!data) throw new RepositoryError('That record no longer exists or is not yours.', 'not_found');
    return data as unknown as TableMap[T];
  }

  async remove<T extends RepositoryTable>(table: T, id: ID): Promise<void> {
    const keyColumn = USER_KEYED.includes(table) ? 'user_id' : 'id';
    const { error } = await this.client
      .from(table)
      .delete()
      .eq(keyColumn, USER_KEYED.includes(table) ? this.userId : id);
    if (error) throw friendlyError(error, `Deleting from ${table}`);
  }

  async getProfile(): Promise<Profile> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .maybeSingle();
    if (error) throw friendlyError(error, 'Loading profile');
    if (data) return data as Profile;
    // The database trigger normally creates this row; recover if it did not.
    const { data: created, error: createError } = await this.client
      .from('profiles')
      .upsert({ id: this.userId, display_name: 'Student', timezone: 'Asia/Dhaka', locale: 'en' })
      .select()
      .single();
    if (createError) throw friendlyError(createError, 'Creating profile');
    return created as Profile;
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const { data, error } = await this.client
      .from('profiles')
      .update(patch as Record<string, unknown>)
      .eq('id', this.userId)
      .select()
      .maybeSingle();
    if (error) throw friendlyError(error, 'Saving profile');
    if (!data) return this.getProfile();
    return data as Profile;
  }

  async listCurriculum() {
    const [versions, subjects, chapters, topics, sources, requirements] = await Promise.all([
      this.list('curriculum_versions'),
      this.list('curriculum_subjects'),
      this.list('curriculum_chapters'),
      this.list('curriculum_topics'),
      this.list('curriculum_sources'),
      this.list('curriculum_pending_requirements'),
    ]);
    return { versions, subjects, chapters, topics, sources, requirements };
  }

  async adoptCurriculumSubject(versionId: ID, subjectId: ID): Promise<TableMap['user_subjects']> {
    const { data: subject, error } = await this.client
      .from('curriculum_subjects')
      .select('*')
      .eq('id', subjectId)
      .eq('curriculum_version_id', versionId)
      .maybeSingle();
    if (error) throw friendlyError(error, 'Loading subject');
    if (!subject) throw new RepositoryError('That curriculum subject was not found.', 'not_found');
    const existing = (await this.list('user_subjects')).find((s) => s.curriculum_subject_id === subjectId);
    if (existing) return existing;
    const palette = ['#1d4ed8', '#b45309', '#0f766e', '#7c3aed', '#be123c', '#0369a1'];
    const count = (await this.list('user_subjects')).length;
    return this.create('user_subjects', {
      curriculum_subject_id: subjectId,
      curriculum_version_id: versionId,
      custom_name: null,
      custom_paper_label: null,
      status: 'active',
      color: palette[count % palette.length] ?? '#0f5132',
      sort_order: count + 1,
      is_demo: false,
    } as NewRow<'user_subjects'>);
  }

  async addChaptersFromCurriculum(versionId: ID, subjectId: ID, chapterIds: ID[]): Promise<AddChaptersResult> {
    const userSubject = (await this.list('user_subjects')).find((s) => s.curriculum_subject_id === subjectId);
    if (!userSubject) throw new RepositoryError('Add the subject first.', 'subject_missing');
    const existing = await this.list('user_chapters');
    const { data: curriculumChapters, error } = await this.client
      .from('curriculum_chapters')
      .select('*')
      .eq('curriculum_subject_id', subjectId)
      .in('id', chapterIds);
    if (error) throw friendlyError(error, 'Loading chapters');
    const toCreate = (curriculumChapters ?? []).filter(
      (chapter) =>
        !existing.some(
          (uc) => uc.curriculum_chapter_id === chapter.id && uc.user_subject_id === userSubject.id,
        ),
    );
    const importBatchId = newId();
    if (toCreate.length === 0) return { created: 0, skipped: chapterIds.length, importBatchId };
    const rows = toCreate.map((chapter) => ({
      user_subject_id: userSubject.id,
      curriculum_chapter_id: chapter.id,
      curriculum_version_id: versionId,
      custom_title: null,
      status: 'not_recorded',
      lecture_target_count: null,
      import_batch_id: importBatchId,
      is_demo: false,
    }));
    const created = await this.createMany('user_chapters', rows as NewRow<'user_chapters'>[]);
    const checklistRows = created.flatMap((chapter) =>
      DEFAULT_CHECKLIST.map((template, index) => ({
        user_chapter_id: chapter.id,
        kind: template.kind,
        label: template.label,
        sort_order: index + 1,
        is_archived: false,
      })),
    );
    if (checklistRows.length > 0) {
      await this.createMany('chapter_checklist_items', checklistRows as NewRow<'chapter_checklist_items'>[]);
    }
    return { created: created.length, skipped: chapterIds.length - created.length, importBatchId };
  }

  async rollbackImport(importBatchId: ID): Promise<number> {
    const { data, error } = await this.client
      .from('user_chapters')
      .delete({ count: 'exact' })
      .eq('import_batch_id', importBatchId)
      .select('id');
    if (error) throw friendlyError(error, 'Undoing that import');
    return (data ?? []).length;
  }

  async ensureChecklistDefaults(userChapterId: ID): Promise<TableMap['chapter_checklist_items'][]> {
    const existing = await this.client
      .from('chapter_checklist_items')
      .select('*')
      .eq('user_chapter_id', userChapterId);
    if (existing.error) throw friendlyError(existing.error, 'Loading checklist');
    if ((existing.data ?? []).length > 0) return existing.data as TableMap['chapter_checklist_items'][];
    const rows = DEFAULT_CHECKLIST.map((template, index) => ({
      user_chapter_id: userChapterId,
      kind: template.kind,
      label: template.label,
      sort_order: index + 1,
      is_archived: false,
    }));
    return this.createMany('chapter_checklist_items', rows as NewRow<'chapter_checklist_items'>[]);
  }

  async setChecklistProgress(
    _chapterId: ID,
    checklistItemId: ID,
    isDone: boolean,
    note?: string | null,
  ): Promise<TableMap['chapter_checklist_progress']> {
    const existing = await this.client
      .from('chapter_checklist_progress')
      .select('*')
      .eq('checklist_item_id', checklistItemId)
      .maybeSingle();
    if (existing.error) throw friendlyError(existing.error, 'Loading checklist progress');
    const completedAt = isDone ? new Date().toISOString() : null;
    if (existing.data) {
      return this.update('chapter_checklist_progress', (existing.data as { id: string }).id, {
        is_done: isDone,
        completed_at: completedAt,
        ...(note !== undefined ? { note } : {}),
      });
    }
    return this.create('chapter_checklist_progress', {
      checklist_item_id: checklistItemId,
      is_done: isDone,
      completed_at: completedAt,
      note: note ?? null,
    } as NewRow<'chapter_checklist_progress'>);
  }

  async saveSummary(summary: Omit<WeeklySummary, 'id' | 'user_id' | 'created_at'>): Promise<WeeklySummary> {
    return this.create('weekly_summaries', summary as NewRow<'weekly_summaries'>);
  }

  async getReminderPreferences(): Promise<ReminderPreferences> {
    const { data, error } = await this.client
      .from('reminder_preferences')
      .select('*')
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) throw friendlyError(error, 'Loading reminder settings');
    if (data) return data as ReminderPreferences;
    const profile = await this.getProfile();
    const defaults = defaultReminderPreferences(this.userId, profile.timezone);
    return this.create('reminder_preferences', defaults as NewRow<'reminder_preferences'>);
  }

  async saveReminderPreferences(patch: Partial<ReminderPreferences>): Promise<ReminderPreferences> {
    const current = await this.getReminderPreferences();
    return this.update('reminder_preferences', current.user_id, patch);
  }

  async saveReminderEvents(
    events: Omit<ReminderEvent, 'id' | 'user_id' | 'created_at'>[],
  ): Promise<ReminderEvent[]> {
    if (events.length === 0) return [];
    return this.createMany('reminder_events', events as NewRow<'reminder_events'>[]);
  }

  async updateReminderEventStatus(
    id: ID,
    status: ReminderEvent['status'],
    errorMessage?: string | null,
  ): Promise<ReminderEvent> {
    return this.update('reminder_events', id, { status, error_message: errorMessage ?? null });
  }

  async hasDemoData(): Promise<boolean> {
    const { count, error } = await this.client
      .from('user_subjects')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', true);
    if (error) throw friendlyError(error, 'Checking demo data');
    return (count ?? 0) > 0;
  }

  async seedDemoWorkspace(): Promise<DemoWorkspaceResult> {
    if (await this.hasDemoData()) {
      throw new RepositoryError('Demo data is already loaded.', 'demo_exists');
    }
    const rows = buildDemoWorkspace();
    const mapping: [RepositoryTable, Record<string, unknown>[]][] = [
      ['user_subjects', rows.subjects],
      ['user_chapters', rows.chapters],
      ['chapter_checklist_items', rows.checklistItems],
      ['chapter_checklist_progress', rows.checklistProgress],
      ['lecture_records', rows.lectures],
      ['study_sessions', rows.sessions],
      ['revision_sessions', rows.revisions],
      ['topic_difficulties', rows.difficulties],
      ['mistake_logs', rows.mistakes],
      ['study_tasks', rows.tasks],
      ['exam_results', rows.exams],
      ['study_resources', rows.resources],
      ['notes', rows.notes],
    ];
    for (const [table, tableRows] of mapping) {
      if (tableRows.length > 0) {
        await this.createMany(table, tableRows as NewRow<RepositoryTable>[]);
      }
    }
    return { createdSubjects: rows.subjects.length, createdChapters: rows.chapters.length, removed: 0 };
  }

  async removeDemoData(): Promise<DemoWorkspaceResult> {
    const demoChapters = await this.client.from('user_chapters').select('id').eq('is_demo', true);
    if (demoChapters.error) throw friendlyError(demoChapters.error, 'Finding demo chapters');
    const demoChapterIds = (demoChapters.data ?? []).map((r) => (r as { id: string }).id);
    let itemIds: string[] = [];
    if (demoChapterIds.length > 0) {
      const items = await this.client
        .from('chapter_checklist_items')
        .select('id')
        .in('user_chapter_id', demoChapterIds);
      if (items.error) throw friendlyError(items.error, 'Finding demo checklist items');
      itemIds = (items.data ?? []).map((r) => (r as { id: string }).id);
    }
    let removed = 0;
    let removedSubjects = 0;
    let removedChapters = 0;
    if (itemIds.length > 0) {
      const { error } = await this.client.from('chapter_checklist_progress').delete().in('checklist_item_id', itemIds);
      if (error) throw friendlyError(error, 'Removing demo progress');
      const itemDel = await this.client.from('chapter_checklist_items').delete().in('id', itemIds);
      if (itemDel.error) throw friendlyError(itemDel.error, 'Removing demo checklist');
      removed += itemIds.length;
    }
    for (const table of DEMO_WORKSPACE_TABLES) {
      if (table === 'chapter_checklist_items' || table === 'chapter_checklist_progress') continue;
      const { error, count } = await this.client
        .from(table)
        .delete({ count: 'exact' })
        .eq('is_demo', true);
      if (error) throw friendlyError(error, `Removing demo rows from ${table}`);
      removed += count ?? 0;
      if (table === 'user_subjects') removedSubjects = count ?? 0;
      if (table === 'user_chapters') removedChapters = count ?? 0;
    }
    return { createdSubjects: 0, createdChapters: 0, removed, removedSubjects, removedChapters };
  }

  async deleteAllUserData(): Promise<{ deleted: number }> {
    // Dependency order matters: `user_subjects` is protected by `on delete restrict`
    // foreign keys from sessions, tasks, notes and others, so children go first.
    // `audit_events` is append-only and is intentionally not deleted here.
    const order: RepositoryTable[] = [
      'practice_attempts',
      'mistake_logs',
      'practice_questions',
      'daily_blocks',
      'focus_sessions',
      'exam_targets',
      'user_topics',
      'chapter_checklist_progress',
      'chapter_checklist_items',
      'revision_sessions',
      'topic_difficulties',
      'lecture_records',
      'study_sessions',
      'study_tasks',
      'exam_results',
      'study_resources',
      'notes',
      'weekly_summaries',
      'reminder_events',
      'user_chapters',
      'user_subjects',
    ];
    let deleted = 0;
    for (const table of order) {
      const { error, count } = await this.client
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', this.userId);
      if (error) throw friendlyError(error, `Deleting ${table}`);
      deleted += count ?? 0;
    }
    return { deleted };
  }

  async exportAll() {
    const tables: Partial<Record<RepositoryTable, unknown[]>> = {};
    for (const table of [...CURRICULUM_TABLES, ...ALL_USER_TABLES]) {
      tables[table] = await this.list(table);
    }
    return {
      exported_at: new Date().toISOString(),
      mode: this.mode,
      profile: await this.getProfile(),
      demo_active: await this.hasDemoData(),
      tables,
    };
  }

  async listAllUserData(): Promise<UserDataBundle> {
    const [
      curriculum,
      subjects,
      chapters,
      topics,
      checklistItems,
      checklistProgress,
      lectures,
      sessions,
      dailyBlocks,
      focusSessions,
      revisions,
      difficulties,
      mistakes,
      tasks,
      exams,
      examTargets,
      practiceQuestions,
      practiceAttempts,
      resources,
      notes,
      summaries,
      reminderPreferences,
      reminderEvents,
      profile,
    ] = await Promise.all([
      this.listCurriculum(),
      this.list('user_subjects'),
      this.list('user_chapters'),
      this.list('user_topics'),
      this.list('chapter_checklist_items'),
      this.list('chapter_checklist_progress'),
      this.list('lecture_records'),
      this.list('study_sessions'),
      this.list('daily_blocks'),
      this.list('focus_sessions'),
      this.list('revision_sessions'),
      this.list('topic_difficulties'),
      this.list('mistake_logs'),
      this.list('study_tasks'),
      this.list('exam_results'),
      this.list('exam_targets'),
      this.list('practice_questions'),
      this.list('practice_attempts'),
      this.list('study_resources'),
      this.list('notes'),
      this.list('weekly_summaries'),
      this.getReminderPreferences(),
      this.list('reminder_events'),
      this.getProfile(),
    ]);
    return {
      subjects,
      chapters,
      topics,
      checklistItems,
      checklistProgress,
      lectures,
      sessions,
      dailyBlocks,
      focusSessions,
      revisions,
      difficulties,
      mistakes,
      tasks,
      exams,
      examTargets,
      practiceQuestions,
      practiceAttempts,
      resources,
      notes,
      summaries,
      curriculum,
      profile,
      reminderPreferences,
      reminderEvents,
    };
  }
}
