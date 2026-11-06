/**
 * Android hardware Back handling.
 *
 * How the pieces fit together (Capacitor 7 + Ionic 8):
 *  - The native App plugin only forwards Back to the webview when at least one
 *    JS `backButton` listener exists. We register one (a no-op) so the plugin
 *    fires the document-level `backbutton` event instead of silently doing
 *    webView.goBack() or letting the Activity finish.
 *  - ion-app listens for `backbutton` and re-dispatches it as `ionBackButton`
 *    with a priority registry. Overlays (IonModal / IonAlert / IonToast used
 *    by our dialogs) register at priority 100, so they always close FIRST.
 *  - This hook registers the navigation handler at priority 0: it only runs
 *    when no overlay consumed the event. Drawer > history > root > exit-confirm.
 *
 * In a plain browser none of these events fire; the browser's own Back button
 * works through the HashRouter history naturally.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

interface BackButtonEventDetail {
  register: (priority: number, handler: (processNextHandler: () => void) => void) => void;
}

/** Call once at the app root: enables the native → document event bridge. */
export function useBackButtonBridge(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapacitorApp.addListener('backButton', () => {
      // Intentionally empty. Presence of this listener makes the native plugin
      // dispatch `backbutton` on document, which ion-app turns into the
      // priority-ordered `ionBackButton` event handled below.
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
}

export interface BackNavigationOptions {
  /** Open overlays owned by the shell (drawer). Return true if one was closed. */
  closeTopLayer?: () => boolean;
  /** Called on the first Back press at the root screen (show a hint). */
  onExitHint?: () => void;
}

const EXIT_CONFIRM_WINDOW_MS = 2000;

/** Call inside the router: navigation-level Back behaviour. */
export function useAndroidBackNavigation(options: BackNavigationOptions = {}): void {
  const navigate = useNavigate();
  const location = useLocation();
  const lastRootPress = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<BackButtonEventDetail>).detail;
      if (!detail?.register) return;
      detail.register(0, () => {
        // 1. Shell layers (drawer) close before any navigation.
        if (optionsRef.current.closeTopLayer?.()) return;

        // 2. Walk the in-app history stack (chapter → subject → syllabus → home).
        const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (historyIndex > 0) {
          navigate(-1);
          return;
        }

        // 3. Deep-link entry (no history): go to the dashboard first.
        if (locationRef.current.pathname !== '/') {
          navigate('/', { replace: true });
          return;
        }

        // 4. Root screen: press Back twice within 2s to exit. Never exit on a
        //    single accidental press.
        const now = Date.now();
        if (now - lastRootPress.current < EXIT_CONFIRM_WINDOW_MS) {
          void CapacitorApp.exitApp();
        } else {
          lastRootPress.current = now;
          optionsRef.current.onExitHint?.();
        }
      });
    };

    document.addEventListener('ionBackButton', handler);
    return () => document.removeEventListener('ionBackButton', handler);
  }, [navigate]);
}
