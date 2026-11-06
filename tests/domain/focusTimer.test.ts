import { describe, expect, it } from 'vitest';
import {
  completeCountdown,
  elapsedMs,
  finishTimer,
  formatClock,
  isCountdownDue,
  newTimerState,
  parseTimerState,
  pauseTimer,
  remainingMs,
  resumeTimer,
  startTimer,
  summarizeFinished,
} from '@/domain/focusTimer';

const T0 = '2026-11-06T10:00:00.000Z';
const plus = (seconds: number) => new Date(new Date(T0).getTime() + seconds * 1000).toISOString();

describe('open-ended timer', () => {
  it('derives elapsed time from timestamps, not tick counts', () => {
    let state = newTimerState('open', null, 'session-1');
    state = startTimer(state, T0);
    // No intermediate ticks at all — jump straight 25 minutes ahead.
    expect(elapsedMs(state, plus(25 * 60))).toBe(25 * 60_000);
  });

  it('pause banks time; resume continues from the bank', () => {
    let state = startTimer(newTimerState('open', null, 's'), T0);
    state = pauseTimer(state, plus(600)); // 10 min banked
    expect(elapsedMs(state, plus(9999))).toBe(600_000); // paused: clock keeps moving, elapsed does not
    state = resumeTimer(state, plus(1200)); // resume at +20min
    expect(elapsedMs(state, plus(1500))).toBe(600_000 + 300_000);
  });

  it('survives serialisation round-trips (app restart / phone lock)', () => {
    const state = startTimer(newTimerState('open', null, 's'), T0);
    const restored = parseTimerState(JSON.parse(JSON.stringify(state)));
    expect(restored).not.toBeNull();
    expect(elapsedMs(restored!, plus(3600))).toBe(3_600_000);
  });

  it('finish produces an honest summary and cannot double-finish', () => {
    let state = startTimer(newTimerState('open', null, 's'), T0);
    state = finishTimer(state, plus(1800));
    const summary = summarizeFinished(state);
    expect(summary).not.toBeNull();
    expect(summary?.focusMinutes).toBe(30);
    expect(summary?.status).toBe('completed');
    expect(summary?.startedAt).toBe(T0);
    expect(summary?.endedAt).toBe(plus(1800));
    // Finishing again is a no-op.
    expect(finishTimer(state, plus(9999))).toEqual(state);
  });

  it('sub-minute sessions are labelled interrupted, not completed', () => {
    let state = startTimer(newTimerState('open', null, 's'), T0);
    state = finishTimer(state, plus(30));
    expect(summarizeFinished(state)?.status).toBe('interrupted');
  });

  it('ignores invalid transitions', () => {
    const idle = newTimerState('open', null, 's');
    expect(pauseTimer(idle, T0)).toEqual(idle);
    expect(resumeTimer(idle, T0)).toEqual(idle);
    expect(finishTimer(idle, T0)).toEqual(idle);
    const running = startTimer(idle, T0);
    expect(startTimer(running, plus(10))).toEqual(running);
  });
});

describe('countdown timer', () => {
  it('counts down and clamps at zero even if the phone was locked past the deadline', () => {
    let state = newTimerState('countdown', 25, 's');
    state = startTimer(state, T0);
    expect(remainingMs(state, plus(60))).toBe(24 * 60_000);
    // Return 2 hours later: remaining is 0, elapsed is exactly the target.
    expect(remainingMs(state, plus(7200))).toBe(0);
    expect(elapsedMs(state, plus(7200))).toBe(25 * 60_000);
    expect(isCountdownDue(state, plus(7200))).toBe(true);
  });

  it('completion records the deadline instant, not the late return time', () => {
    let state = startTimer(newTimerState('countdown', 25, 's'), T0);
    state = completeCountdown(state, plus(7200)); // user returns 2h later
    expect(state.phase).toBe('finished');
    expect(state.reachedTarget).toBe(true);
    expect(state.finishedAt).toBe(plus(25 * 60));
    expect(summarizeFinished(state)?.focusMinutes).toBe(25);
  });

  it('pauses extend the deadline correctly', () => {
    let state = startTimer(newTimerState('countdown', 25, 's'), T0);
    state = pauseTimer(state, plus(600)); // 10 min done
    state = resumeTimer(state, plus(1200)); // 10 min pause
    expect(isCountdownDue(state, plus(2000))).toBe(false); // only ~16.7 focus min
    state = completeCountdown(state, plus(2100)); // 10 + 15 = 25 focus min
    expect(state.phase).toBe('finished');
    expect(state.finishedAt).toBe(plus(2100));
  });

  it('stopping early is allowed and labelled honestly', () => {
    let state = startTimer(newTimerState('countdown', 60, 's'), T0);
    state = finishTimer(state, plus(600)); // 10 of 60 min
    expect(state.reachedTarget).toBe(false);
    expect(summarizeFinished(state)?.focusMinutes).toBe(10);
    expect(summarizeFinished(state)?.status).toBe('completed');
  });

  it('resuming an already-elapsed paused countdown finishes instead of running', () => {
    let state = startTimer(newTimerState('countdown', 5, 's'), T0);
    state = pauseTimer(state, plus(300)); // exactly at target
    state = resumeTimer(state, plus(400));
    expect(state.phase).toBe('finished');
    expect(state.reachedTarget).toBe(true);
  });

  it('completeCountdown is a no-op before the deadline', () => {
    const state = startTimer(newTimerState('countdown', 25, 's'), T0);
    expect(completeCountdown(state, plus(60))).toEqual(state);
  });
});

describe('persisted state validation', () => {
  it('rejects v1/foreign junk instead of crashing', () => {
    expect(parseTimerState(null)).toBeNull();
    expect(parseTimerState({ version: 1 })).toBeNull();
    expect(parseTimerState({ ...newTimerState('open', null, 's'), accumulatedMs: -5 })).toBeNull();
    expect(parseTimerState({ ...newTimerState('open', null, 's'), accumulatedMs: NaN })).toBeNull();
    expect(parseTimerState({ ...newTimerState('countdown', 25, 's'), targetMs: null })).toBeNull();
    expect(parseTimerState({ ...startTimer(newTimerState('open', null, 's'), T0), runningSince: null })).toBeNull();
    expect(parseTimerState({ ...newTimerState('open', null, 's'), sessionId: '' })).toBeNull();
  });

  it('accepts a valid running state', () => {
    const state = startTimer(newTimerState('countdown', 45, 'abc'), T0);
    expect(parseTimerState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

describe('clock formatting', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(-10)).toBe('00:00');
  });
});
