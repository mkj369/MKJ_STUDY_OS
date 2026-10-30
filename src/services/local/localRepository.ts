import {
  CURRICULUM_TABLES,
  USER_OWNED_TABLES,
  type ID,
  type Profile,
  type ReminderEvent,
  type ReminderPreferences,
  type RepositoryTable,
  type TableMap,
  type UserChapter,
  type UserSubject,
  type WeeklySummary,
} from '@/types/domain';
import type {
  AddChaptersResult,
  ChapterPatch,
  DemoWorkspaceResult,
  NewRow,
  PersonalChapterInput,
  PersonalSubjectInput,
  Repository,
  UserDataBundle,
} from '@/services/repository';
import { RepositoryError } from '@/services/repository';
import { DEFAULT_CHECKLIST } from '@/services/seed/checklistDefaults';
import {
  nextChapterNumber,
  placeholderTitle,
  planChapterGeneration,
  findDuplicateSubject,
  type ExistingChapter,
} from '@/domain/chapterGeneration';
import { buildDemoWorkspace, DEMO_WORKSPACE_TABLES, newId } from '@/services/seed/demoWorkspace';
import { defaultReminderPreferences } from '@/services/reminderDefaults';
import { LocalDatabase, type Row } from './localDatabase';
import type { KeyValueStorage } from './storage';

/**
 * New subjects start on the default accent. Kept as a constant rather than the
 * old hardcoded green so the palette and the seed cannot drift apart.
 */
const DEFAULT_SUBJECT_COLOR = '#38BDF8';

/** Adapt stored chapter rows to the shape the numbering helpers expect. */
function toExistingChapters(
  rows: { id: string; chapter_number?: number | null; custom_title: string | null; sort_order?: number }[],
): ExistingChapter[] {
  return rows.map((row) => ({
    id: row.id,
    chapter_number: row.chapter_number ?? null,
    title: row.custom_title ?? '',
    sort_order: row.sort_order ?? 0,
  }));
}

const USER_KEYED: RepositoryTable[] = ['reminder_preferences'];
const CURRICULUM: RepositoryTable[] = [...CURRICULUM_TABLES];

function isCurriculumTable(table: RepositoryTable): boolean {
  return CURRICULUM.includes(table);
}

function isUserKeyed(table: RepositoryTable): boolean {
  return USER_KEYED.includes(table);
}

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Browser-storage implementation of the Repository.
 *
 * It mirrors the cloud data model and enforces the same ownership rules that
 * RLS enforces in Postgres (a row is only visible when its user_id matches the
 * signed-in local account). It is *not* a security boundary — anyone with the
 * device can read browser storage — and the UI says so.
 */
export class LocalRepository implements Repository {
  readonly mode = 'local' as const;
  private readonly db: LocalDatabase;
  private readonly userId: string;

  constructor(userId: string, storage: KeyValueStorage) {
    this.userId = userId;
    this.db = new LocalDatabase(storage);
  }

  async currentUserId(): Promise<ID> {
    return this.userId;
  }

  private owned(row: Row, table: RepositoryTable): boolean {
    if (isCurriculumTable(table)) return true;
    if (isUserKeyed(table)) return row['user_id'] === this.userId;
    if (table === 'profiles') return row['id'] === this.userId;
    return row['user_id'] === this.userId;
  }

  private assertWritable(table: RepositoryTable): void {
    if (isCurriculumTable(table)) {
      throw new RepositoryError(
        'Curriculum content is read-only in the app. Create your own subject or chapter instead.',
        'curriculum_read_only',
      );
    }
  }

  private stampRow(table: RepositoryTable, values: Record<string, unknown>, id?: string): Row {
    const row: Row = clone(values);
    if (isUserKeyed(table)) {
      row['user_id'] = this.userId;
      if (!row['id']) row['id'] = this.userId;
    } else if (table === 'profiles') {
      row['id'] = this.userId;
    } else {
      row['id'] = id ?? (row['id'] as string | undefined) ?? newId();
      row['user_id'] = this.userId;
    }
    if ('created_at' in row === false) row['created_at'] = now();
    if ('updated_at' in row === false) row['updated_at'] = now();
    return row;
  }

  /**
   * Mirrors the composite foreign keys that Postgres enforces but a JSON table does
   * not: a row may only point at a record this same user owns. Today that is
   * mistake_logs.practice_question_id (migration 0005) and practice_attempts'
   * question reference, which the pages validate before saving.
   */
  private assertOwnedLinks(table: RepositoryTable, values: Record<string, unknown>): void {
    if (table !== 'mistake_logs') return;
    const questionId = values['practice_question_id'];
    if (!questionId) return;
    const question = this.db
      .rows('practice_questions')
      .find((row) => row['id'] === questionId && row['user_id'] === this.userId);
    if (!question) {
      throw new RepositoryError(
        'That practice question no longer exists in your workspace. Link a question you own or leave it empty.',
        'not_found',
      );
    }
  }

  private logAudit(db: LocalDatabase, entityType: string, entityId: string, action: string, metadata: Row): void {
    db.mutate((state) => {
      const events = state.tables['audit_events'] ?? [];
      events.push({
        id: newId(),
        user_id: this.userId,
        entity_type: entityType,
        entity_id: entityId,
        action,
        metadata,
        created_at: now(),
      });
      return null;
    });
  }

  async list<T extends RepositoryTable>(table: T): Promise<TableMap[T][]> {
    const rows = this.db.rows(table).filter((row) => this.owned(row, table));
    return clone(rows) as unknown as TableMap[T][];
  }

  async create<T extends RepositoryTable>(table: T, values: NewRow<T>): Promise<TableMap[T]> {
    const created = await this.createMany(table, [values]);
    const first = created[0];
    if (!first) throw new RepositoryError('Could not create the record.', 'create_failed');
    return first;
  }

  async createMany<T extends RepositoryTable>(table: T, values: NewRow<T>[]): Promise<TableMap[T][]> {
    this.assertWritable(table);
    for (const value of values) this.assertOwnedLinks(table, value as Record<string, unknown>);
    const rows = values.map((v) => this.stampRow(table, v as Record<string, unknown>));
    this.db.mutate((state) => {
      state.tables[table] = [...(state.tables[table] ?? []), ...rows];
      return null;
    });
    return clone(rows) as unknown as TableMap[T][];
  }

  async update<T extends RepositoryTable>(table: T, id: ID, patch: Partial<TableMap[T]>): Promise<TableMap[T]> {
    this.assertWritable(table);
    this.assertOwnedLinks(table, patch as Record<string, unknown>);
    let updated: Row | undefined;
    this.db.mutate((state) => {
      const rows = state.tables[table] ?? [];
      const index = rows.findIndex((row) => (isUserKeyed(table) ? row['user_id'] === this.userId : row['id'] === id));
      if (index === -1) throw new RepositoryError('That record no longer exists.', 'not_found');
      const current = rows[index] as Row;
      if (!this.owned(current, table)) throw new RepositoryError('Not allowed.', 'forbidden');
      const next: Row = { ...current, ...(patch as Record<string, unknown>) };
      next['id'] = current['id'];
      if (!isCurriculumTable(table)) next['user_id'] = current['user_id'];
      if ('updated_at' in current) next['updated_at'] = now();
      rows[index] = next;
      updated = next;
      return null;
    });
    const result = updated as Row;
    this.logAudit(this.db, table, id, 'update', { changed: Object.keys(patch) });
    return clone(result) as unknown as TableMap[T];
  }

  async remove<T extends RepositoryTable>(table: T, id: ID): Promise<void> {
    this.assertWritable(table);
    let existed = false;
    this.db.mutate((state) => {
      const rows = state.tables[table] ?? [];
      const index = rows.findIndex((row) => (isUserKeyed(table) ? row['user_id'] === this.userId : row['id'] === id));
      if (index === -1) return null;
      const row = rows[index] as Row;
      if (!this.owned(row, table)) throw new RepositoryError('Not allowed.', 'forbidden');
      rows.splice(index, 1);
      existed = true;
      // Mirror the foreign keys in Postgres:
      //  - deleting a chapter removes its checklist items (+ their progress)
      //    and unlinks historical records instead of deleting them
      //  - deleting a subject cascades to its chapters
      if (table === 'user_chapters') {
        this.cascadeChapter(state, id);
      }
      if (table === 'practice_questions') {
        state.tables['practice_attempts'] = (state.tables['practice_attempts'] ?? []).filter(
          (attempt) => attempt['practice_question_id'] !== id,
        );
        // migration 0005: `on delete set null (practice_question_id)` — the mistake
        // history survives the question, only the link is cleared.
        state.tables['mistake_logs'] = (state.tables['mistake_logs'] ?? []).map((mistake) =>
          mistake['practice_question_id'] === id ? { ...mistake, practice_question_id: null } : mistake,
        );
      }
      if (table === 'user_subjects') {
        const dependentTables = [
          'lecture_records',
          'study_sessions',
          'revision_sessions',
          'topic_difficulties',
          'mistake_logs',
          'study_tasks',
          'exam_results',
          'exam_targets',
          'daily_blocks',
          'focus_sessions',
          'practice_questions',
          'practice_attempts',
          'study_resources',
          'notes',
        ];
        const dependents = dependentTables.reduce(
          (sum, dependent) =>
            sum + (state.tables[dependent] ?? []).filter((row) => row['user_subject_id'] === id).length,
          0,
        );
        if (dependents > 0) {
          throw new RepositoryError(
            `This subject still has ${dependents} linked record(s). Archive it instead, or delete those records first — history is never removed silently.`,
            'subject_has_records',
          );
        }
        const chapterIds = (state.tables['user_chapters'] ?? [])
          .filter((chapter) => chapter['user_subject_id'] === id)
          .map((chapter) => chapter['id'] as string);
        for (const chapterId of chapterIds) this.cascadeChapter(state, chapterId);
        state.tables['user_chapters'] = (state.tables['user_chapters'] ?? []).filter(
          (chapter) => chapter['user_subject_id'] !== id,
        );
      }
      return null;
    });
    if (existed) this.logAudit(this.db, table, id, 'delete', {});
  }

  private cascadeChapter(state: { tables: Record<string, Row[]> }, chapterId: string): void {
    const items = state.tables['chapter_checklist_items'] ?? [];
    const itemIds = items.filter((item) => item['user_chapter_id'] === chapterId).map((item) => item['id']);
    state.tables['chapter_checklist_items'] = items.filter((item) => item['user_chapter_id'] !== chapterId);
    state.tables['chapter_checklist_progress'] = (state.tables['chapter_checklist_progress'] ?? []).filter(
      (progress) => !itemIds.includes(progress['checklist_item_id'] as string),
    );
    state.tables['user_topics'] = (state.tables['user_topics'] ?? []).filter(
      (topic) => topic['user_chapter_id'] !== chapterId,
    );
    for (const table of ['lecture_records', 'study_sessions', 'revision_sessions', 'topic_difficulties', 'mistake_logs', 'study_tasks', 'daily_blocks', 'focus_sessions', 'practice_questions']) {
      state.tables[table] = (state.tables[table] ?? []).map((row) =>
        row['user_chapter_id'] === chapterId ? { ...row, user_chapter_id: null } : row,
      );
    }
  }

  async rollbackImport(importBatchId: ID): Promise<number> {
    const chapters = (await this.list('user_chapters')).filter((c) => c.import_batch_id === importBatchId);
    for (const chapter of chapters) {
      await this.remove('user_chapters', chapter.id);
    }
    return chapters.length;
  }

  /* --------------------- personal curriculum (round 9) -------------------- */

  async createPersonalSubject(input: PersonalSubjectInput): Promise<UserSubject> {
    const name = input.name.trim();
    if (!name) throw new RepositoryError('Give the subject a name.', 'invalid');

    const existing = await this.list('user_subjects');
    const duplicate = findDuplicateSubject(
      existing
        .filter((subject) => subject.status === 'active')
        .map((subject) => ({
          id: subject.id,
          name: subject.custom_name ?? '',
          paperLabel: subject.custom_paper_label,
          classLevel: subject.class_level ?? null,
        })),
      { name, paperLabel: input.paperLabel ?? null, classLevel: input.classLevel },
    );
    if (duplicate) {
      throw new RepositoryError(`"${duplicate.name}" is already in this class.`, 'duplicate');
    }

    const sameClass = existing.filter((subject) => subject.class_level === input.classLevel);
    const created = await this.create('user_subjects', {
      curriculum_subject_id: null,
      curriculum_version_id: null,
      custom_name: name,
      custom_paper_label: input.paperLabel?.trim() || null,
      class_level: input.classLevel,
      name_bn: input.nameBn?.trim() || null,
      status: 'active',
      // Colour follows the student's theme unless they pick one, so a new
      // subject never fights the palette they chose.
      color: input.color ?? DEFAULT_SUBJECT_COLOR,
      sort_order: sameClass.reduce((max, subject) => Math.max(max, subject.sort_order), 0) + 1,
      is_demo: false,
    } as NewRow<'user_subjects'>);
    return created;
  }

  async createPersonalChapter(input: PersonalChapterInput): Promise<UserChapter> {
    const subject = (await this.list('user_subjects')).find((row) => row.id === input.subjectId);
    if (!subject) throw new RepositoryError('That subject no longer exists.', 'not_found');

    const existing = (await this.list('user_chapters')).filter(
      (chapter) => chapter.user_subject_id === input.subjectId,
    );
    const shaped = toExistingChapters(existing);
    const number = input.chapterNumber ?? nextChapterNumber(shaped);

    const created = await this.create('user_chapters', {
      user_subject_id: input.subjectId,
      curriculum_chapter_id: null,
      curriculum_version_id: null,
      custom_title: input.title?.trim() || placeholderTitle(number),
      chapter_title_bn: input.titleBn?.trim() || null,
      chapter_number: number,
      sort_order: shaped.reduce((max, chapter) => Math.max(max, chapter.sort_order), 0) + 1,
      status: 'not_recorded',
      lecture_target_count: null,
      import_batch_id: null,
      is_demo: false,
    } as NewRow<'user_chapters'>);
    await this.ensureChecklistDefaults(created.id);
    return created;
  }

  async generateChapters(subjectId: ID, count: number): Promise<UserChapter[]> {
    const subject = (await this.list('user_subjects')).find((row) => row.id === subjectId);
    if (!subject) throw new RepositoryError('That subject no longer exists.', 'not_found');

    const existing = (await this.list('user_chapters')).filter(
      (chapter) => chapter.user_subject_id === subjectId,
    );
    const planned = planChapterGeneration(toExistingChapters(existing), count);
    const batchId = newId();
    const created: UserChapter[] = [];
    for (const spec of planned) {
      const row = await this.create('user_chapters', {
        user_subject_id: subjectId,
        curriculum_chapter_id: null,
        curriculum_version_id: null,
        custom_title: spec.title,
        chapter_title_bn: null,
        chapter_number: spec.chapter_number,
        sort_order: spec.sort_order,
        status: 'not_recorded',
        lecture_target_count: null,
        import_batch_id: batchId,
        is_demo: false,
      } as NewRow<'user_chapters'>);
      await this.ensureChecklistDefaults(row.id);
      created.push(row);
    }
    return created;
  }

  async updateChapter(chapterId: ID, patch: ChapterPatch): Promise<UserChapter> {
    const chapters = await this.list('user_chapters');
    const existing = chapters.find((chapter) => chapter.id === chapterId);
    if (!existing) throw new RepositoryError('That chapter no longer exists.', 'not_found');

    /*
     * In-place update. The row id, and therefore every record that points at it
     * (checklist progress, lectures, sessions, revisions, tasks, notes), stays
     * exactly as it was. Deleting and recreating would silently orphan all of it.
     */
    const changes: Partial<NewRow<'user_chapters'>> = {};
    if (patch.title !== undefined) changes.custom_title = patch.title?.trim() || null;
    if (patch.titleBn !== undefined) changes.chapter_title_bn = patch.titleBn?.trim() || null;
    if (patch.chapterNumber !== undefined) changes.chapter_number = patch.chapterNumber;
    if (patch.status !== undefined) changes.status = patch.status as UserChapter['status'];
    if (Object.keys(changes).length === 0) return existing;
    return this.update('user_chapters', chapterId, changes);
  }

  async reorderChapters(subjectId: ID, orderedIds: ID[]): Promise<void> {
    const chapters = (await this.list('user_chapters')).filter(
      (chapter) => chapter.user_subject_id === subjectId,
    );
    const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    let order = 1;
    for (const id of orderedIds) {
      if (!byId.has(id)) continue;
      await this.update('user_chapters', id, { sort_order: order });
      order += 1;
    }
  }

  async setSubjectArchived(subjectId: ID, archived: boolean): Promise<UserSubject> {
    return this.update('user_subjects', subjectId, { status: archived ? 'archived' : 'active' });
  }

  async setSubjectClass(subjectId: ID, classLevel: number | null): Promise<UserSubject> {
    return this.update('user_subjects', subjectId, { class_level: classLevel } as Partial<NewRow<'user_subjects'>>);
  }

  async setActiveClass(classLevel: number | null): Promise<Profile> {
    return this.updateProfile({ active_class: classLevel });
  }

  /* ------------------------------- profile ------------------------------- */

  async getProfile(): Promise<Profile> {
    const rows = this.db.rows('profiles');
    const existing = rows.find((row) => row['id'] === this.userId);
    if (existing) return clone(existing) as unknown as Profile;
    const created = await this.create('profiles', {
      display_name: 'Student',
      locale: 'en',
      timezone: 'Asia/Dhaka',
      academic_level: 'HSC',
      study_windows: null,
      onboarded_at: null,
    } as NewRow<'profiles'>);
    return created;
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const profile = await this.getProfile();
    return this.update('profiles', profile.id, patch);
  }

  /* ----------------------------- curriculum ------------------------------ */

  async listCurriculum() {
    const versions = await this.list('curriculum_versions');
    const subjects = await this.list('curriculum_subjects');
    const chapters = await this.list('curriculum_chapters');
    const topics = await this.list('curriculum_topics');
    const sources = await this.list('curriculum_sources');
    const requirements = await this.list('curriculum_pending_requirements');
    return { versions, subjects, chapters, topics, sources, requirements };
  }

  async adoptCurriculumSubject(
    versionId: ID,
    subjectId: ID,
    classLevel: number | null = null,
  ): Promise<TableMap['user_subjects']> {
    const subjects = await this.list('curriculum_subjects');
    const subject = subjects.find((s) => s.id === subjectId && s.curriculum_version_id === versionId);
    if (!subject) throw new RepositoryError('That curriculum subject was not found.', 'not_found');
    const existing = (await this.list('user_subjects')).find((s) => s.curriculum_subject_id === subjectId);
    if (existing) {
      // Re-adopting the same paper under a different class moves the copy
      // rather than making a second one; chapters and records follow the row.
      if (classLevel !== null && existing.class_level !== classLevel) {
        return this.update('user_subjects', existing.id, { class_level: classLevel } as Partial<
          NewRow<'user_subjects'>
        >);
      }
      return existing;
    }
    const palette = ['#0EA5E9', '#8B5CF6', '#F59E0B', '#10B981', '#F43F5E', '#2563EB'];
    const all = await this.list('user_subjects');
    const sameClass = all.filter((row) => (row.class_level ?? null) === classLevel);
    return this.create('user_subjects', {
      curriculum_subject_id: subjectId,
      curriculum_version_id: versionId,
      custom_name: null,
      custom_paper_label: null,
      class_level: classLevel,
      status: 'active',
      color: palette[all.length % palette.length] ?? '#38BDF8',
      sort_order: sameClass.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1,
      is_demo: false,
    } as NewRow<'user_subjects'>);
  }

  async addChaptersFromCurriculum(versionId: ID, subjectId: ID, chapterIds: ID[]): Promise<AddChaptersResult> {
    const subject = (await this.list('user_subjects')).find((s) => s.curriculum_subject_id === subjectId);
    if (!subject) throw new RepositoryError('Add the subject first.', 'subject_missing');
    const existing = await this.list('user_chapters');
    const curriculumChapters = (await this.list('curriculum_chapters')).filter(
      (chapter) => chapter.curriculum_subject_id === subjectId && chapterIds.includes(chapter.id),
    );
    const toCreate = curriculumChapters.filter(
      (chapter) => !existing.some((uc) => uc.curriculum_chapter_id === chapter.id && uc.user_subject_id === subject.id),
    );
    const importBatchId = newId();
    for (const chapter of toCreate) {
      const created = await this.create('user_chapters', {
        user_subject_id: subject.id,
        curriculum_chapter_id: chapter.id,
        curriculum_version_id: versionId,
        custom_title: null,
        status: 'not_recorded',
        lecture_target_count: null,
        import_batch_id: importBatchId,
        is_demo: false,
      } as NewRow<'user_chapters'>);
      await this.ensureChecklistDefaults(created.id);
    }
    return { created: toCreate.length, skipped: chapterIds.length - toCreate.length, importBatchId };
  }

  /* --------------------------- chapter support --------------------------- */

  async ensureChecklistDefaults(userChapterId: ID): Promise<TableMap['chapter_checklist_items'][]> {
    const existing = (await this.list('chapter_checklist_items')).filter(
      (item) => item.user_chapter_id === userChapterId,
    );
    if (existing.length > 0) return existing;
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
    const items = await this.list('chapter_checklist_items');
    if (!items.some((item) => item.id === checklistItemId)) {
      throw new RepositoryError('Checklist item not found.', 'not_found');
    }
    const existing = (await this.list('chapter_checklist_progress')).find(
      (p) => p.checklist_item_id === checklistItemId,
    );
    const completedAt = isDone ? now() : null;
    if (existing) {
      return this.update('chapter_checklist_progress', existing.id, {
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

  /* ------------------------------ summaries ------------------------------ */

  async saveSummary(
    summary: Omit<WeeklySummary, 'id' | 'user_id' | 'created_at'>,
  ): Promise<WeeklySummary> {
    return this.create('weekly_summaries', summary as NewRow<'weekly_summaries'>);
  }

  /* ------------------------------ reminders ------------------------------ */

  async getReminderPreferences(): Promise<ReminderPreferences> {
    const rows = await this.list('reminder_preferences');
    const existing = rows[0];
    if (existing) return existing;
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

  /* -------------------------------- demo -------------------------------- */

  async hasDemoData(): Promise<boolean> {
    for (const table of ['user_subjects', 'user_chapters', 'lecture_records', 'study_tasks', 'daily_blocks', 'practice_questions'] as RepositoryTable[]) {
      const rows = await this.list(table);
      if (rows.some((row) => (row as { is_demo?: boolean }).is_demo === true)) return true;
    }
    return false;
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
    let removed = 0;
    let removedSubjects = 0;
    let removedChapters = 0;
    this.db.mutate((state) => {
      // Checklist progress and items belong to demo chapters: collect first.
      const demoChapterIds = new Set(
        (state.tables['user_chapters'] ?? []).filter((r) => r['is_demo'] === true).map((r) => r['id']),
      );
      const demoItemIds = new Set(
        (state.tables['chapter_checklist_items'] ?? [])
          .filter((r) => demoChapterIds.has(r['user_chapter_id']))
          .map((r) => r['id']),
      );
      for (const table of DEMO_WORKSPACE_TABLES) {
        const rows = state.tables[table] ?? [];
        const kept: Row[] = [];
        for (const row of rows) {
          const isDemoRow = row['is_demo'] === true;
          const isDemoChild =
            (table === 'chapter_checklist_items' && demoChapterIds.has(row['user_chapter_id'])) ||
            (table === 'chapter_checklist_progress' && demoItemIds.has(row['checklist_item_id']));
          if (row['user_id'] !== undefined && row['user_id'] !== this.userId) {
            kept.push(row);
            continue;
          }
          if (isDemoRow || isDemoChild) {
            removed += 1;
            if (table === 'user_subjects') removedSubjects += 1;
            if (table === 'user_chapters') removedChapters += 1;
            continue;
          }
          kept.push(row);
        }
        state.tables[table] = kept;
      }
      return null;
    });
    return { createdSubjects: 0, createdChapters: 0, removed, removedSubjects, removedChapters };
  }

  /* -------------------------------- export ------------------------------- */

  async deleteAllUserData(): Promise<{ deleted: number }> {
    let deleted = 0;
    this.db.mutate((state) => {
      for (const table of USER_OWNED_TABLES) {
        // `profiles` is the account itself; `audit_events` is an append-only trail
        // that never contains note bodies or answers.
        if (table === 'profiles' || table === 'audit_events') continue;
        const rows = state.tables[table] ?? [];
        deleted += rows.filter((row) => row['user_id'] === this.userId).length;
        state.tables[table] = rows.filter((row) => row['user_id'] !== this.userId);
      }
      // Local audit rows only reference ids, but drop them with the data they describe.
      state.tables['audit_events'] = [];
      return null;
    });
    return { deleted };
  }

  async exportAll() {
    const tables: Partial<Record<RepositoryTable, unknown[]>> = {};
    for (const table of [...CURRICULUM_TABLES, ...USER_OWNED_TABLES, 'reminder_preferences'] as RepositoryTable[]) {
      tables[table] = await this.list(table);
    }
    const profile = await this.getProfile();
    return {
      exported_at: now(),
      mode: this.mode,
      profile,
      demo_active: await this.hasDemoData(),
      tables,
    };
  }

  async listAllUserData(): Promise<UserDataBundle> {
    const [curriculum, subjects, chapters, topics, checklistItems, checklistProgress, lectures, sessions, dailyBlocks, focusSessions, revisions, difficulties, mistakes, tasks, exams, examTargets, practiceQuestions, practiceAttempts, resources, notes, summaries, reminderPreferences, reminderEvents, profile] =
      await Promise.all([
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

