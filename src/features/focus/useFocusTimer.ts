/**
 * Persistent focus timer hook (v2 engine).
 *
 * - State lives in device storage under mkj.studyos.v1.focus.<userId>, so a
 *   reload, app restart or process kill restores the exact session.
 * - The 1s interval only re-renders the clock; elapsed time itself is always
 *   recomputed from timestamps, so background throttling cannot lose time.
 * - visibilitychange + Capacitor appStateChange re-check the countdown on
 *   return: if the deadline passed while locked, the finished state is shown
 *   immediately (and the notification already fired natively).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { KeyValueStorage } from '@/services/local/storage';
import { STORAGE_PREFIX } from '@/services/local/storage';
import {
  completeCountdown,
  elapsedMs,
  isCountdownDue,
  newTimerState,
  parseTimerState,
  remainingMs,
  type FocusTimerState,
} from '@/domain/focusTimer';

const NOTIFICATION_ID = 2_250_001;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}.focus.${userId}`;
}

function readState(storage: KeyValueStorage, userId: string): FocusTimerState {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (raw) {
      const parsed = parseTimerState(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    // corrupt state — start clean rather than crash
  }
  return newTimerState('open', null, crypto.randomUUID());
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      return (await Notification.requestPermission()) === 'granted';
    }
  } catch {
    // permission APIs unavailable — timer still works, just silent
  }
  return false;
}

async function scheduleCountdownNotification(state: FocusTimerState, nowMs: number): Promise<void> {
  const remaining = remainingMs(state, new Date(nowMs).toISOString());
  if (remaining === null || remaining <= 0) return;
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIFICATION_ID,
            title: 'Focus session complete',
            body: 'Your countdown reached zero. Nice work — log the session in MKJ StudyOS.',
            schedule: { at: new Date(nowMs + remaining), allowWhileIdle: true },
          },
        ],
      });
    }
    // Web: no reliable background scheduling without a service worker; the
    // in-app alarm covers the foreground case. We do not pretend otherwise.
  } catch {
    // scheduling failed (permission revoked) — silent fallback
  }
}

async function cancelCountdownNotification(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    }
  } catch {
    // ignore
  }
}

function fireWebAlarm(): void {
  try {
    if (!Capacitor.isNativePlatform() && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Focus session complete', {
        body: 'Your countdown reached zero. Nice work — log the session in MKJ StudyOS.',
      });
    }
  } catch {
    // ignore
  }
}

export interface FocusTimerApi {
  state: FocusTimerState;
  /** Current wall clock, updated ~1s while running. */
  now: string;
  elapsed: number;
  remaining: number | null;
  update: (next: FocusTimerState) => void;
  /** Call after start/resume of a countdown to arm the native notification. */
  armNotification: (next: FocusTimerState) => Promise<void>;
  disarmNotification: () => Promise<void>;
  reset: (mode?: FocusTimerState['mode'], targetMinutes?: number | null) => void;
}

export function useFocusTimer(storage: KeyValueStorage, userId: string, onCountdownComplete?: () => void): FocusTimerApi {
  const [state, setState] = useState<FocusTimerState>(() => readState(storage, userId));
  const [now, setNow] = useState(() => new Date().toISOString());
  const stateRef = useRef(state);
  stateRef.current = state;
  const completeRef = useRef(onCountdownComplete);
  completeRef.current = onCountdownComplete;

  const persist = useCallback(
    (next: FocusTimerState) => {
      stateRef.current = next;
      setState(next);
      try {
        storage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        // storage full/unavailable — session continues in memory
      }
    },
    [storage, userId],
  );

  // Re-read on user switch (sign-out/in without full reload).
  useEffect(() => {
    persist(readState(storage, userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const checkCountdown = useCallback(() => {
    const iso = new Date().toISOString();
    setNow(iso);
    const current = stateRef.current;
    if (isCountdownDue(current, iso)) {
      const finished = completeCountdown(current, iso);
      persist(finished);
      fireWebAlarm();
      void cancelCountdownNotification();
      completeRef.current?.();
    }
  }, [persist]);

  // Clock tick — display only; correctness comes from timestamps.
  useEffect(() => {
    if (state.phase !== 'running') return;
    const handle = window.setInterval(checkCountdown, 1000);
    return () => window.clearInterval(handle);
  }, [state.phase, checkCountdown]);

  // Lifecycle: recompute when the app/tab becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkCountdown();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkCountdown);
    let removeNative: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) checkCountdown();
        else persist(stateRef.current); // make sure the latest span is on disk
      });
      removeNative = () => {
        void handle.then((h) => h.remove());
      };
    }
    // Initial check: a countdown may have finished while the app was closed.
    checkCountdown();
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkCountdown);
      removeNative?.();
    };
  }, [checkCountdown, persist]);

  const reset = useCallback(
    (mode: FocusTimerState['mode'] = 'open', targetMinutes: number | null = null) => {
      void cancelCountdownNotification();
      const fresh = newTimerState(mode, targetMinutes, crypto.randomUUID());
      fresh.subjectId = stateRef.current.subjectId;
      fresh.chapterId = stateRef.current.chapterId;
      persist(fresh);
    },
    [persist],
  );

  return {
    state,
    now,
    elapsed: elapsedMs(state, now),
    remaining: remainingMs(state, now),
    update: persist,
    armNotification: (next) => scheduleCountdownNotification(next, Date.now()),
    disarmNotification: cancelCountdownNotification,
    reset,
  };
}
