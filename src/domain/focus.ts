/**
 * Focus timer state machine (pure).
 *
 * The timer is driven by wall-clock timestamps, never by counting intervals, so
 * a throttled tab or a locked phone does not silently lose focus time. The
 * module only computes state; persisting rows and writing the study session
 * happen in the UI/service layer.
 *
 * There are no streaks, penalties or "you failed" states. Ending early is a
 * normal outcome and is labelled as such.
 */
import type { Timestamp } from '@/types/domain';

export interface FocusPlan {
  focusMinutes: number;
  breakMinutes: number;
  plannedIntervals: number;
}

export interface FocusState {
  status: 'idle' | 'running' | 'paused' | 'on_break' | 'finished';
  plan: FocusPlan;
  startedAt: Timestamp | null;
  /** Start of the current phase (focus or break). */
  phaseStartedAt: Timestamp | null;
  /** Focus seconds banked from earlier phases. */
  bankedFocusSeconds: number;
  /** Break seconds banked from earlier breaks. */
  bankedBreakSeconds: number;
  completedIntervals: number;
  /** Set when the student pauses mid-focus. */
  pausedAt: Timestamp | null;
}

export const FOCUS_LIMITS = {
  minFocusMinutes: 5,
  maxFocusMinutes: 120,
  maxBreakMinutes: 30,
  maxIntervals: 8,
} as const;

export function validatePlan(plan: FocusPlan): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(plan.focusMinutes) || plan.focusMinutes < FOCUS_LIMITS.minFocusMinutes) {
    issues.push(`A focus block is at least ${FOCUS_LIMITS.minFocusMinutes} minutes.`);
  }
  if (plan.focusMinutes > FOCUS_LIMITS.maxFocusMinutes) {
    issues.push(`Keep a focus block under ${FOCUS_LIMITS.maxFocusMinutes} minutes; long blocks are harder to complete.`);
  }
  if (!Number.isFinite(plan.breakMinutes) || plan.breakMinutes < 0 || plan.breakMinutes > FOCUS_LIMITS.maxBreakMinutes) {
    issues.push(`Break length must be 0–${FOCUS_LIMITS.maxBreakMinutes} minutes.`);
  }
  if (
    !Number.isInteger(plan.plannedIntervals) ||
    plan.plannedIntervals < 1 ||
    plan.plannedIntervals > FOCUS_LIMITS.maxIntervals
  ) {
    issues.push(`Choose 1–${FOCUS_LIMITS.maxIntervals} focus blocks.`);
  }
  return issues;
}

export function idleState(plan: FocusPlan): FocusState {
  return {
    status: 'idle',
    plan,
    startedAt: null,
    phaseStartedAt: null,
    bankedFocusSeconds: 0,
    bankedBreakSeconds: 0,
    completedIntervals: 0,
    pausedAt: null,
  };
}

export function start(state: FocusState, now: Timestamp): FocusState {
  if (state.status !== 'idle') return state;
  return { ...state, status: 'running', startedAt: now, phaseStartedAt: now };
}

/** Pause banks the elapsed focus/break seconds so resuming does not lose them. */
export function pause(state: FocusState, now: Timestamp): FocusState {
  if (state.status !== 'running' && state.status !== 'on_break') return state;
  const elapsed = secondsBetween(state.phaseStartedAt, now);
  return {
    ...state,
    status: 'paused',
    pausedAt: now,
    phaseStartedAt: null,
    bankedFocusSeconds:
      state.status === 'running' ? state.bankedFocusSeconds + elapsed : state.bankedFocusSeconds,
    bankedBreakSeconds:
      state.status === 'on_break' ? state.bankedBreakSeconds + elapsed : state.bankedBreakSeconds,
  };
}

export function resume(state: FocusState, now: Timestamp): FocusState {
  if (state.status !== 'paused') return state;
  // A paused break resumes as a break; otherwise the student returns to focus.
  const wasBreak = state.bankedBreakSeconds > 0 && state.bankedFocusSeconds === 0;
  return {
    ...state,
    status: wasBreak ? 'on_break' : 'running',
    phaseStartedAt: now,
    pausedAt: null,
  };
}

export interface FocusSnapshot {
  phase: 'focus' | 'break' | 'done';
  phaseSeconds: number;
  phaseTargetSeconds: number;
  phaseRemainingSeconds: number;
  focusSeconds: number;
  breakSeconds: number;
  completedIntervals: number;
  plannedIntervals: number;
  progressPercent: number;
  canFinish: boolean;
}

/** Current progress without mutating state. */
export function snapshot(state: FocusState, now: Timestamp): FocusSnapshot {
  const focusTarget = state.plan.focusMinutes * 60;
  const breakTarget = state.plan.breakMinutes * 60;
  const liveSeconds = secondsBetween(state.phaseStartedAt, now);
  const phase: FocusSnapshot['phase'] =
    state.status === 'finished' ? 'done' : state.status === 'on_break' ? 'break' : 'focus';
  const phaseSeconds = phase === 'break' ? state.bankedBreakSeconds + liveSeconds : state.bankedFocusSeconds + liveSeconds;
  const phaseTargetSeconds = phase === 'break' ? breakTarget : focusTarget;
  const focusSeconds = phase === 'focus' ? phaseSeconds : state.bankedFocusSeconds;
  const breakSeconds = phase === 'break' ? phaseSeconds : state.bankedBreakSeconds;
  const target = focusTarget * state.plan.plannedIntervals;
  return {
    phase,
    phaseSeconds,
    phaseTargetSeconds,
    phaseRemainingSeconds: Math.max(0, phaseTargetSeconds - phaseSeconds),
    focusSeconds,
    breakSeconds,
    completedIntervals: state.completedIntervals,
    plannedIntervals: state.plan.plannedIntervals,
    progressPercent: target > 0 ? Math.min(100, Math.round((focusSeconds / target) * 100)) : 0,
    canFinish: focusSeconds >= 60,
  };
}

/**
 * Advance the machine: a finished focus block starts a break, a finished break
 * starts the next focus block, and the last break finishes the session.
 *
 * Returns the same object when nothing is due, so callers can use identity to
 * avoid pointless re-renders.
 */
export function advance(state: FocusState, now: Timestamp): FocusState {
  if (state.status !== 'running' && state.status !== 'on_break') return state;
  const snap = snapshot(state, now);
  if (snap.phaseRemainingSeconds > 0) return state;

  if (snap.phase === 'focus') {
    const completedIntervals = Math.min(state.plan.plannedIntervals, state.completedIntervals + 1);
    const bankedFocusSeconds = state.bankedFocusSeconds + state.plan.focusMinutes * 60;
    if (completedIntervals >= state.plan.plannedIntervals) {
      return {
        ...state,
        status: 'finished',
        completedIntervals,
        bankedFocusSeconds,
        phaseStartedAt: null,
      };
    }
    if (state.plan.breakMinutes === 0) {
      return {
        ...state,
        status: 'running',
        completedIntervals,
        bankedFocusSeconds,
        phaseStartedAt: now,
      };
    }
    return {
      ...state,
      status: 'on_break',
      completedIntervals,
      bankedFocusSeconds,
      bankedBreakSeconds: 0,
      phaseStartedAt: now,
    };
  }

  // Break finished → next focus block.
  return {
    ...state,
    status: 'running',
    bankedBreakSeconds: 0,
    phaseStartedAt: now,
  };
}

export interface FocusSummary {
  focusSeconds: number;
  breakSeconds: number;
  focusMinutes: number;
  completedIntervals: number;
  plannedIntervals: number;
  endedEarly: boolean;
  startedAt: Timestamp | null;
  endedAt: Timestamp;
  message: string;
}

/** Finish (or end early) and produce the values the timeline will store. */
export function finish(state: FocusState, now: Timestamp): FocusSummary {
  const snap = snapshot(state, now);
  const focusSeconds = snap.focusSeconds;
  const focusMinutes = focusSeconds > 0 ? Math.max(1, Math.round(focusSeconds / 60)) : 0;
  const endedEarly = snap.completedIntervals < state.plan.plannedIntervals;
  return {
    focusSeconds,
    breakSeconds: snap.breakSeconds,
    focusMinutes,
    completedIntervals: snap.completedIntervals,
    plannedIntervals: state.plan.plannedIntervals,
    endedEarly,
    startedAt: state.startedAt,
    endedAt: now,
    message: endedEarly
      ? `${focusMinutes} focused minutes recorded. Stopping early still counts — nothing is lost.`
      : `${focusMinutes} focused minutes across ${snap.completedIntervals} block${snap.completedIntervals === 1 ? '' : 's'} recorded.`,
  };
}

function secondsBetween(from: Timestamp | null, to: Timestamp): number {
  if (!from) return 0;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}
