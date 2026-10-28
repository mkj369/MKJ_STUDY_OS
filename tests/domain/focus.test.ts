import { describe, expect, it } from 'vitest';
import {
  advance,
  finish,
  idleState,
  pause,
  resume,
  snapshot,
  start,
  validatePlan,
  type FocusPlan,
} from '@/domain/focus';
import { TODAY } from '../fixtures/factories';

const PLAN: FocusPlan = { focusMinutes: 25, breakMinutes: 5, plannedIntervals: 2 };
const T = {
  start: `${TODAY}T10:00:00.000Z`,
  plus25: `${TODAY}T10:25:00.000Z`,
  plus30: `${TODAY}T10:30:00.000Z`,
  plus55: `${TODAY}T10:55:00.000Z`,
  plus60: `${TODAY}T11:00:00.000Z`,
};

describe('focus plan validation', () => {
  it('accepts a sane plan', () => {
    expect(validatePlan(PLAN)).toEqual([]);
  });

  it('explains each bad value', () => {
    expect(validatePlan({ ...PLAN, focusMinutes: 2 }).join(' ')).toContain('at least 5');
    expect(validatePlan({ ...PLAN, focusMinutes: 200 }).join(' ')).toContain('under 120');
    expect(validatePlan({ ...PLAN, breakMinutes: 45 }).join(' ')).toContain('Break length');
    expect(validatePlan({ ...PLAN, plannedIntervals: 0 }).join(' ')).toContain('1–8');
  });
});

describe('timer state machine', () => {
  it('starts idle and begins on start', () => {
    const idle = idleState(PLAN);
    expect(idle.status).toBe('idle');
    const running = start(idle, T.start);
    expect(running.status).toBe('running');
    expect(running.startedAt).toBe(T.start);
  });

  it('reports elapsed focus from the clock', () => {
    const running = start(idleState(PLAN), T.start);
    const snap = snapshot(running, T.plus25);
    expect(snap.phase).toBe('focus');
    expect(snap.focusSeconds).toBe(1500);
    expect(snap.phaseRemainingSeconds).toBe(0);
    expect(snap.completedIntervals).toBe(0);
    expect(snap.progressPercent).toBe(50);
  });

  it('moves from focus to break when the block elapses', () => {
    const running = start(idleState(PLAN), T.start);
    const onBreak = advance(running, T.plus25);
    expect(onBreak.status).toBe('on_break');
    expect(onBreak.completedIntervals).toBe(1);
    expect(onBreak.bankedFocusSeconds).toBe(1500);
  });

  it('stays put while the phase is still running', () => {
    const running = start(idleState(PLAN), T.start);
    expect(advance(running, `${TODAY}T10:10:00.000Z`)).toBe(running);
  });

  it('starts the next focus block when the break ends', () => {
    const onBreak = advance(start(idleState(PLAN), T.start), T.plus25);
    const nextFocus = advance(onBreak, T.plus30);
    expect(nextFocus.status).toBe('running');
    expect(nextFocus.completedIntervals).toBe(1);
    const snap = snapshot(nextFocus, `${TODAY}T10:55:00.000Z`);
    expect(snap.phase).toBe('focus');
    expect(snap.focusSeconds).toBe(3000);
  });

  it('finishes after the last break', () => {
    const second = advance(advance(start(idleState(PLAN), T.start), T.plus25), T.plus30);
    const afterSecond = advance(second, T.plus55);
    expect(afterSecond.completedIntervals).toBe(2);
    const done = advance(afterSecond, T.plus60);
    expect(done.status).toBe('finished');
  });

  it('skips the break when break length is zero', () => {
    const plan: FocusPlan = { focusMinutes: 25, breakMinutes: 0, plannedIntervals: 2 };
    const onTrack = advance(start(idleState(plan), T.start), T.plus25);
    expect(onTrack.status).toBe('running');
    expect(onTrack.completedIntervals).toBe(1);
  });

  it('banks focus time across pause and resume', () => {
    const running = start(idleState(PLAN), T.start);
    const paused = pause(running, `${TODAY}T10:10:00.000Z`);
    expect(paused.status).toBe('paused');
    expect(paused.bankedFocusSeconds).toBe(600);

    // Paused time is not counted.
    const resumed = resume(paused, `${TODAY}T10:20:00.000Z`);
    expect(resumed.status).toBe('running');
    const snap = snapshot(resumed, `${TODAY}T10:30:00.000Z`);
    expect(snap.focusSeconds).toBe(1200);
  });

  it('ignores pause/resume in the wrong state', () => {
    const idle = idleState(PLAN);
    expect(pause(idle, T.start)).toBe(idle);
    expect(resume(idle, T.start)).toBe(idle);
  });

  it('records an early finish honestly', () => {
    const running = start(idleState(PLAN), T.start);
    const summary = finish(running, `${TODAY}T10:12:00.000Z`);
    expect(summary.focusMinutes).toBe(12);
    expect(summary.endedEarly).toBe(true);
    expect(summary.message).toContain('Stopping early still counts');
    expect(summary.message).not.toMatch(/fail|streak|lazy/i);
  });

  it('reports a complete session without shame language', () => {
    const full = advance(advance(start(idleState({ ...PLAN, plannedIntervals: 1 }), T.start), T.plus25), T.plus30);
    const summary = finish(full, T.plus30);
    expect(summary.completedIntervals).toBe(1);
    expect(summary.endedEarly).toBe(false);
    expect(summary.message).toContain('1 block');
  });

  it('never reports negative focus time', () => {
    const running = start(idleState(PLAN), `${TODAY}T10:00:00.000Z`);
    const summary = finish(running, `${TODAY}T09:00:00.000Z`);
    expect(summary.focusSeconds).toBe(0);
    expect(summary.focusMinutes).toBe(0);
  });

  it('does not allow finishing via canFinish before a minute of focus', () => {
    const running = start(idleState(PLAN), T.start);
    expect(snapshot(running, `${TODAY}T10:00:30.000Z`).canFinish).toBe(false);
    expect(snapshot(running, `${TODAY}T10:01:30.000Z`).canFinish).toBe(true);
  });
});
