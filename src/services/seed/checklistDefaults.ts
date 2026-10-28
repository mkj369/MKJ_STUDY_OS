import type { ChecklistKind } from '@/types/domain';

export interface ChecklistTemplate {
  kind: ChecklistKind;
  label: string;
}

/**
 * Default chapter learning checklist. Every item is independent and can be
 * archived (not deleted) by the student, so progress history is never lost.
 */
export const DEFAULT_CHECKLIST: ChecklistTemplate[] = [
  { kind: 'reading', label: 'Main book reading' },
  { kind: 'lecture', label: 'Lecture / class completed' },
  { kind: 'notes_review', label: 'Lecture notes reviewed' },
  { kind: 'concept_book', label: 'Concept book / formula sheet' },
  { kind: 'practice', label: 'Practice sheet / homework' },
  { kind: 'board_questions', label: 'Board question bank' },
  { kind: 'admission_questions', label: 'Admission question bank' },
  { kind: 'mcq', label: 'MCQ practice' },
  { kind: 'written', label: 'Written (creative) practice' },
  { kind: 'self_test', label: 'Self test / mock' },
  { kind: 'error_correction', label: 'Error correction' },
  { kind: 'final_revision', label: 'Final revision' },
];

export const CHECKLIST_KIND_LABELS: Record<ChecklistKind, string> = {
  reading: 'Main book reading',
  lecture: 'Lecture completed',
  notes_review: 'Notes reviewed',
  concept_book: 'Concept book',
  practice: 'Practice sheet',
  board_questions: 'Board questions',
  admission_questions: 'Admission questions',
  mcq: 'MCQ practice',
  written: 'Written practice',
  self_test: 'Self test',
  error_correction: 'Error correction',
  final_revision: 'Final revision',
  custom: 'Custom item',
};
