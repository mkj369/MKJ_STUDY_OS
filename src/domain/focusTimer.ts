/**
 * Focus timer engine v2 — open-ended and countdown modes (pure).
 *
 * Design rules:
 *  - Elapsed time is ALWAYS derived from wall-clock timestamps. The state
 *    stores `startedAt`, `accumulatedMs` (banked while running) and
 *    `runningSince`. A throttled tab, a locked phone, an app restart or a
 *    process kill cannot lose or invent time: on restore we recompute from
 *    `Date.now()`.
 *  - The state is a plain JSON object, persistable to any KeyValueStorage.
 *  - Pausing banks elapsed milliseconds; resuming sets a new runningSince.
 *  - Countdown completion is derived (`remainingMs <= 0`), never scheduled,
 *    so returning after the deadline shows the honest finished state.
 */
import type { ID, Timestamp } from '@/types/domain';

export type FocusMode = 'open' | 'countdown';
export type FocusPhase = 'idle' | 'running' | 'paused' | 'finished';

export interface FocusTimerState {
  version: 2;
  mode: FocusMode;
  phase: FocusPhase;
  /** Countdown target; null for open-ended. */
  targetMs: number | null;
  /** When the session first started (null while idle). */
  startedAt: Timestamp | null;
  /** Milliseconds of focus banked from previous running spans. */
  accumulatedMs: number;
  /** Start of the current running span, null unless phase === 'running'. */
  runningSince: Timestamp | null;
  /** When the session finished (derived deadline or manual finish). */
  finishedAt: Timestamp | null;
  /** True when a countdown reached its target (vs manual stop). */
  reachedTarget: boolean;
  subjectId: ID | null;
  chapterId: ID | null;
  /** Idempotency key so restoring + finishing never double-logs a session. */
  sessionId: ID;
}

export const FOCUS_PRESETS_MINUTES = [15, 25, 45, 60, 90] as const;
export const MAX_CUSTOM_MINUTES = 480;

export function newTimerState(mode: FocusMode, targetMinutes: number | null, sessionId: ID): FocusTimerState {
  return {
    version: 2,
    mode,
    phase: 'idle',
    targetMs: mode === 'countdown' && targetMinutes ? Math.round(targetMinutes * 60_000) : null,
    startedAt: null,
    accumulatedMs: 0,
    runningSince: null,
    finishedAt: null,
    reachedTarget: false,
    subjectId: null,
    chapterId: null,
    sessionId,
  };
}

function ms(iso: Timestamp): number {
  return new Date(iso).getTime();
}

/** Elapsed focus milliseconds at `now`, clamped at the countdown target. */
export function elapsedMs(state: FocusTimerState, now: Timestamp): number {
  let total = state.accumulatedMs;
  if (state.phase === 'running' && state.runningSince) {
    total += Math.max(0, ms(now) - ms(state.runningSince));
  }
  if (state.mode === 'countdown' && state.targetMs !== null) {
    // Even while "running", a countdown never reports more than its target:
    // the alarm may have fired while the phone was locked.
    total = Math.min(total, state.targetMs);
  }
  return Math.max(0, total);
}

export function remainingMs(state: FocusTimerState, now: Timestamp): number | null {
  if (state.mode !== 'countdown' || state.targetMs === null) return null;
  return Math.max(0, state.targetMs - elapsedMs(state, now));
}

/** True when a running countdown has reached zero (even if UI was away). */
export function isCountdownDue(state: FocusTimerState, now: Timestamp): boolean {
  return (
    state.mode === 'countdown' &&
    state.targetMs !== null &&
    state.phase === 'running' &&
    state.runningSince !== null &&
    state.accumulatedMs + Math.max(0, ms(now) - ms(state.runningSince)) >= state.targetMs
  );
}

export function startTimer(state: FocusTimerState, now: Timestamp): FocusTimerState {
  if (state.phase !== 'idle') return state;
  return { ...state, phase: 'running', startedAt: now, runningSince: now };
}

export function pauseTimer(state: FocusTimerState, now: Timestamp): FocusTimerState {
  if (state.phase !== 'running' || !state.runningSince) return state;
  const banked = state.accumulatedMs + Math.max(0, ms(now) - ms(state.runningSince));
  return {
    ...state,
    phase: 'paused',
    accumulatedMs: state.mode === 'countdown' && state.targetMs !== null ? Math.min(banked, state.targetMs) : banked,
    runningSince: null,
  };
}

export function resumeTimer(state: FocusTimerState, now: Timestamp): FocusTimerState {
  if (state.phase !== 'paused') return state;
  if (state.mode === 'countdown' && state.targetMs !== null && state.accumulatedMs >= state.targetMs) {
    return { ...state, phase: 'finished', finishedAt: now, reachedTarget: true };
  }
  return { ...state, phase: 'running', runningSince: now };
}

/**
 * Finish a session. For a due countdown the honest end time is the deadline
 * (start + target + pauses), not "now" — time spent with the phone locked
 * after the alarm is not study time.
 */
export function finishTimer(state: FocusTimerState, now: Timestamp): FocusTimerState {
  if (state.phase === 'idle' || state.phase === 'finished') return state;
  const due = isCountdownDue(state, now);
  let finishedAt = now;
  let accumulated = state.accumulatedMs;
  if (state.phase === 'running' && state.runningSince) {
    accumulated += Math.max(0, ms(now) - ms(state.runningSince));
  }
  if (due && state.targetMs !== null) {
    accumulated = state.targetMs;
    // Deadline instant = runningSince + (target - banked-at-span-start).
    const spanMs = state.targetMs - state.accumulatedMs;
    finishedAt = new Date(ms(state.runningSince as Timestamp) + spanMs).toISOString();
  }
  return {
    ...state,
    phase: 'finished',
    accumulatedMs: accumulated,
    runningSince: null,
    finishedAt,
    reachedTarget: due || state.reachedTarget,
  };
}

/** Mark a running countdown as reached-target without user interaction. */
export function completeCountdown(state: FocusTimerState, now: Timestamp): FocusTimerState {
  if (!isCountdownDue(state, now)) return state;
  return finishTimer(state, now);
}

export interface FocusSessionSummary {
  startedAt: Timestamp;
  endedAt: Timestamp;
  focusMinutes: number;
  mode: FocusMode;
  reachedTarget: boolean;
  /** 'completed' for reached target or manual finish; 'interrupted' for <1min stops. */
  status: 'completed' | 'interrupted';
}

export function summarizeFinished(state: FocusTimerState): FocusSessionSummary | null {
  if (state.phase !== 'finished' || !state.startedAt || !state.finishedAt) return null;
  const focusMinutes = Math.floor(state.accumulatedMs / 60_000);
  return {
    startedAt: state.startedAt,
    endedAt: state.finishedAt,
    focusMinutes,
    mode: state.mode,
    reachedTarget: state.reachedTarget,
    status: focusMinutes >= 1 ? 'completed' : 'interrupted',
  };
}

/** Validate a persisted state before trusting it (storage may hold v1 junk). */
export function parseTimerState(raw: unknown): FocusTimerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<FocusTimerState>;
  if (candidate.version !== 2) return null;
  if (candidate.mode !== 'open' && candidate.mode !== 'countdown') return null;
  if (!['idle', 'running', 'paused', 'finished'].includes(candidate.phase as string)) return null;
  if (typeof candidate.accumulatedMs !== 'number' || !Number.isFinite(candidate.accumulatedMs) || candidate.accumulatedMs < 0) return null;
  if (typeof candidate.sessionId !== 'string' || candidate.sessionId.length === 0) return null;
  if (candidate.phase === 'running' && typeof candidate.runningSince !== 'string') return null;
  if (candidate.mode === 'countdown' && (typeof candidate.targetMs !== 'number' || candidate.targetMs <= 0)) return null;
  return candidate as FocusTimerState;
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
