import type { DateOnly, LectureRecord, LectureSource } from '@/types/domain';

export const LECTURE_SOURCE_LABELS: Record<LectureSource, string> = {
  live: 'Live class',
  recorded: 'Recorded',
  offline: 'Offline / self study',
  coaching: 'Coaching',
  other: 'Other',
};

export interface LectureDraft {
  user_subject_id: string;
  user_chapter_id?: string | null;
  title: string;
  lecture_number: number | null;
  lecture_date: DateOnly;
}

/**
 * Duplicate detection for lecture records.
 * Same subject + same date + (same lecture number or same normalised title)
 * is treated as a likely duplicate so the user can confirm before saving twice.
 */
export function findSimilarLectures(draft: LectureDraft, existing: LectureRecord[]): LectureRecord[] {
  const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  return existing.filter((lecture) => {
    if (lecture.user_subject_id !== draft.user_subject_id) return false;
    if (lecture.lecture_date !== draft.lecture_date) return false;
    if (draft.lecture_number !== null && lecture.lecture_number === draft.lecture_number) return true;
    return normalise(lecture.title) === normalise(draft.title);
  });
}

export function groupLecturesByDate(lectures: LectureRecord[]): Map<string, LectureRecord[]> {
  const map = new Map<string, LectureRecord[]>();
  for (const lecture of [...lectures].sort((a, b) => (a.lecture_date < b.lecture_date ? 1 : -1))) {
    const list = map.get(lecture.lecture_date) ?? [];
    list.push(lecture);
    map.set(lecture.lecture_date, list);
  }
  return map;
}
