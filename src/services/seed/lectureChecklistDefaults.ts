/**
 * Default lecture checklist. Like the chapter checklist, every item is an
 * independent row the student can rename, add to, or remove — these are
 * starting points, not a fixed contract.
 */
export interface LectureChecklistTemplate {
  label: string;
}

export const DEFAULT_LECTURE_CHECKLIST: LectureChecklistTemplate[] = [
  { label: 'Watched / attended the lecture' },
  { label: 'Notes taken' },
  { label: 'Notes reviewed' },
  { label: 'Examples practised' },
  { label: 'Doubts cleared' },
];
