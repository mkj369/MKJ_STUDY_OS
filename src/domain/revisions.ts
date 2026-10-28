import { diffDaysISO } from '@/domain/dates';
import type { DateOnly, RevisionSession } from '@/types/domain';
import { computeRevisionSummary, type RevisionSummary } from '@/domain/progress';

export interface RevisionQueueEntry {
  userChapterId: string;
  userSubjectId: string;
  chapterTitle: string;
  subjectName: string;
  summary: RevisionSummary;
  /** overdue < 0, today = 0, upcoming > 0 */
  daysUntilDue: number;
  bucket: 'overdue' | 'today' | 'this_week' | 'later';
}

export interface RevisionQueueInput {
  userChapterId: string;
  userSubjectId: string;
  chapterTitle: string;
  subjectName: string;
  revisions: RevisionSession[];
}

/**
 * Build the revision queue from recorded revisions only. Chapters without any
 * revision record are not listed as "due" — they are simply not recorded.
 */
export function buildRevisionQueue(entries: RevisionQueueInput[], today: DateOnly): RevisionQueueEntry[] {
  const queue: RevisionQueueEntry[] = [];
  for (const entry of entries) {
    const summary = computeRevisionSummary(entry.revisions, today);
    if (summary.nextDate === null) continue;
    const daysUntilDue = diffDaysISO(today, summary.nextDate);
    const bucket: RevisionQueueEntry['bucket'] =
      daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'today' : daysUntilDue <= 7 ? 'this_week' : 'later';
    queue.push({
      userChapterId: entry.userChapterId,
      userSubjectId: entry.userSubjectId,
      chapterTitle: entry.chapterTitle,
      subjectName: entry.subjectName,
      summary,
      daysUntilDue,
      bucket,
    });
  }
  return queue.sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.chapterTitle.localeCompare(b.chapterTitle));
}

export const REVISION_METHOD_LABELS: Record<string, string> = {
  recall: 'Active recall',
  notes_reread: 'Notes re-read',
  practice: 'Practice questions',
  flashcards: 'Flashcards',
  mock: 'Mock test',
};

export const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Could not recall',
  2: 'Very shaky',
  3: 'Partly recalled',
  4: 'Mostly solid',
  5: 'Easy recall',
};
