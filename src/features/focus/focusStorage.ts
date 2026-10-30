import type { FocusPlan, FocusState } from '@/domain/focus';

/**
 * The running timer survives leaving the Focus screen.
 *
 * A student who starts a 45-minute block and taps "Study" to check a chapter
 * must not come back to a stopped clock. The state is wall-clock based, so
 * restoring it and calling `advance` catches up on time spent elsewhere. It is
 * deliberately session-scoped storage (not the repository): an unfinished timer
 * is device state, not a study record.
 */
const KEY = 'mkj.studyos.focus.v1';

export interface StoredFocus {
  plan: FocusPlan;
  state: FocusState;
  taskId: string;
  subjectId: string;
  chapterId: string;
}

export function loadFocus(): StoredFocus | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFocus>;
    if (!parsed.plan || !parsed.state) return null;
    return {
      plan: parsed.plan,
      state: parsed.state,
      taskId: parsed.taskId ?? '',
      subjectId: parsed.subjectId ?? '',
      chapterId: parsed.chapterId ?? '',
    };
  } catch {
    return null;
  }
}

export function saveFocus(value: StoredFocus): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked; the timer still works for this visit.
  }
}

export function clearFocus(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
