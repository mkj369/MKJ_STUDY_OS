/**
 * Offline-first cloud repository.
 *
 * Reads and writes always hit the LOCAL database first (instant, works on a
 * bus with no signal). Every mutation is diff-captured into a persisted
 * outbox and pushed by the SyncEngine; pulls bring other devices' changes.
 * The only online-only call is browsing other students' shared community
 * rows, which fails honestly when offline.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AddChaptersResult,
  DemoWorkspaceResult,
  NewRow,
  Repository,
  UserDataBundle,
} from '@/services/repository';
import { LocalRepository } from '@/services/local/localRepository';
import type { KeyValueStorage } from '@/services/local/storage';
import type {
  ChapterChecklistItem,
  ChapterChecklistProgress,
  CommunityProfile,
  ID,
  LectureChecklistItem,
  Profile,
  ReminderEvent,
  ReminderPreferences,
  RepositoryTable,
  TableMap,
  Timestamp,
  UserPreferences,
  WeeklySummary,
} from '@/types/domain';
import { SyncEngine } from './syncEngine';
import { SupabaseRemoteAdapter, SyncOfflineError } from './supabaseRemoteAdapter';

export class SyncedRepository implements Repository {
  readonly mode = 'cloud' as const;
  readonly engine: SyncEngine;
  private readonly local: LocalRepository;
  private readonly client: SupabaseClient;
  private readonly userId: string;

  constructor(client: SupabaseClient, userId: string, storage: KeyValueStorage) {
    this.client = client;
    this.userId = userId;
    this.local = new LocalRepository(userId, storage);
    this.engine = new SyncEngine(this.local, new SupabaseRemoteAdapter(client, userId), storage, userId);
  }

  /** Called by the composition root once the repository is handed to the UI. */
  start(): void {
    this.engine.start();
  }

  dispose(): void {
    this.engine.dispose();
  }

  private mutate<T>(action: () => Promise<T>): Promise<T> {
    return this.engine.capture(action);
  }

  currentUserId(): Promise<ID> {
    return this.local.currentUserId();
  }

  hasDemoData(): Promise<boolean> {
    return this.local.hasDemoData();
  }

  list<T extends RepositoryTable>(table: T): Promise<TableMap[T][]> {
    return this.local.list(table);
  }

  create<T extends RepositoryTable>(table: T, values: NewRow<T>): Promise<TableMap[T]> {
    return this.mutate(() => this.local.create(table, values));
  }

  createMany<T extends RepositoryTable>(table: T, values: NewRow<T>[]): Promise<TableMap[T][]> {
    return this.mutate(() => this.local.createMany(table, values));
  }

  update<T extends RepositoryTable>(table: T, id: ID, patch: Partial<TableMap[T]>): Promise<TableMap[T]> {
    return this.mutate(() => this.local.update(table, id, patch));
  }

  remove<T extends RepositoryTable>(table: T, id: ID): Promise<void> {
    return this.mutate(() => this.local.remove(table, id));
  }

  getProfile(): Promise<Profile> {
    return this.mutate(() => this.local.getProfile());
  }

  updateProfile(patch: Partial<Profile>): Promise<Profile> {
    return this.mutate(() => this.local.updateProfile(patch));
  }

  listCurriculum() {
    return this.local.listCurriculum();
  }

  adoptCurriculumSubject(versionId: ID, subjectId: ID) {
    return this.mutate(() => this.local.adoptCurriculumSubject(versionId, subjectId));
  }

  addChaptersFromCurriculum(versionId: ID, subjectId: ID, chapterIds: ID[]): Promise<AddChaptersResult> {
    return this.mutate(() => this.local.addChaptersFromCurriculum(versionId, subjectId, chapterIds));
  }

  rollbackImport(importBatchId: ID): Promise<number> {
    return this.mutate(() => this.local.rollbackImport(importBatchId));
  }

  ensureChecklistDefaults(userChapterId: ID): Promise<ChapterChecklistItem[]> {
    return this.mutate(() => this.local.ensureChecklistDefaults(userChapterId));
  }

  setChecklistProgress(chapterId: ID, checklistItemId: ID, isDone: boolean, note?: string | null): Promise<ChapterChecklistProgress> {
    return this.mutate(() => this.local.setChecklistProgress(chapterId, checklistItemId, isDone, note));
  }

  ensureLectureChecklistDefaults(lectureRecordId: ID): Promise<LectureChecklistItem[]> {
    return this.mutate(() => this.local.ensureLectureChecklistDefaults(lectureRecordId));
  }

  getUserPreferences(): Promise<UserPreferences> {
    return this.mutate(() => this.local.getUserPreferences());
  }

  saveUserPreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    return this.mutate(() => this.local.saveUserPreferences(patch));
  }

  getCommunityProfile(): Promise<CommunityProfile | null> {
    return this.local.getCommunityProfile();
  }

  saveCommunityProfile(values: Omit<CommunityProfile, 'user_id' | 'created_at' | 'updated_at'>): Promise<CommunityProfile> {
    return this.mutate(() => this.local.saveCommunityProfile(values));
  }

  async listSharedCommunityProfiles(): Promise<CommunityProfile[]> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new SyncOfflineError('Community browsing needs a connection. Your own data is safe offline.');
    }
    const { data, error } = await this.client
      .from('community_profiles')
      .select('*')
      .eq('sharing_enabled', true)
      .neq('user_id', this.userId)
      .order('overall_percent', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Loading community progress: ${error.message}`);
    return (data ?? []) as CommunityProfile[];
  }

  deleteCommunityProfile(): Promise<void> {
    return this.mutate(() => this.local.deleteCommunityProfile());
  }

  saveSummary(summary: Omit<WeeklySummary, 'id' | 'user_id' | 'created_at'>): Promise<WeeklySummary> {
    return this.mutate(() => this.local.saveSummary(summary));
  }

  getReminderPreferences(): Promise<ReminderPreferences> {
    return this.mutate(() => this.local.getReminderPreferences());
  }

  saveReminderPreferences(patch: Partial<ReminderPreferences>): Promise<ReminderPreferences> {
    return this.mutate(() => this.local.saveReminderPreferences(patch));
  }

  saveReminderEvents(events: Omit<ReminderEvent, 'id' | 'user_id' | 'created_at'>[]): Promise<ReminderEvent[]> {
    // Device-local notification log: do not replicate.
    return this.local.saveReminderEvents(events);
  }

  updateReminderEventStatus(id: ID, status: ReminderEvent['status'], errorMessage?: string | null): Promise<ReminderEvent> {
    return this.local.updateReminderEventStatus(id, status, errorMessage);
  }

  seedDemoWorkspace(): Promise<DemoWorkspaceResult> {
    return this.mutate(() => this.local.seedDemoWorkspace());
  }

  removeDemoData(): Promise<DemoWorkspaceResult> {
    return this.mutate(() => this.local.removeDemoData());
  }

  deleteAllUserData(): Promise<{ deleted: number }> {
    return this.mutate(() => this.local.deleteAllUserData());
  }

  async exportAll(): Promise<{ exported_at: Timestamp; mode: 'cloud' | 'local'; tables: Partial<Record<RepositoryTable, unknown[]>> }> {
    const exported = await this.local.exportAll();
    return { ...exported, mode: 'cloud' };
  }

  listAllUserData(): Promise<UserDataBundle> {
    // getProfile/getUserPreferences auto-create their rows on first read;
    // capture so those creations reach the outbox like any other write.
    return this.mutate(() => this.local.listAllUserData());
  }
}
