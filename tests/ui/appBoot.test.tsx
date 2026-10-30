// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000/" }
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app/App';

/**
 * Boot smoke test: mounts the real app (providers, auth layer, router, local
 * repository, demo seeding) in jsdom. It proves the first-run path works
 * end-to-end without a cloud project: start a local workspace, land on the
 * dashboard, and navigate to another screen.
 *
 * It does not replace a real-browser E2E run (see README: known limitations).
 */

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
  Object.defineProperty(window, 'scrollTo', { writable: true, value: () => {} });
});

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '#/';
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});


/**
 * Complete the first-launch setup the same way a student does: choose a class,
 * pick a group where one applies, then start the workspace. The class is written
 * to the profile during sign-up, so onboarding is not shown a second time.
 */
async function startWorkspace(classLevel = 11, group = /science/i) {
  await screen.findByRole('button', { name: /start on this device/i }, { timeout: 15000 });
  await userEvent.click(screen.getByRole('button', { name: `Class ${classLevel}`, exact: true }));
  if (classLevel >= 9) {
    await userEvent.click(screen.getByRole('radio', { name: group }));
  }
  await userEvent.click(screen.getByRole('button', { name: /start on this device/i }));
}

describe('first run (device workspace)', () => {
  it('starts a local workspace, seeds labelled demo data and shows the dashboard', async () => {
    render(<App />);

    // The auth screen says plainly that this build runs without a cloud account.
    expect(
      (await screen.findAllByText(/Cloud accounts are not configured in this build/i, {}, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);

    // Class and group are asked once, on the welcome screen.
    await startWorkspace();

    // The dashboard greets the student and seeded rows are clearly labelled.
    expect(await screen.findByText(/welcome,|good to see you/i, {}, { timeout: 15000 })).toBeInTheDocument();
    expect((await screen.findAllByText('Demo', {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    // The shell exposes every Phase 1 screen.
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
  }, 25000);

  it('navigates between screens without losing the workspace', async () => {
    render(<App />);
    await startWorkspace();
    await screen.findByText(/welcome,|good to see you/i, {}, { timeout: 15000 });

    // Ionic briefly hides the shell while a page settles in jsdom, so wait for
    // the navigation to become visible instead of assuming it is there already.
    await waitFor(() => expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0));
    /*
     * The shell has two navigation landmarks: the sidebar ("Main navigation")
     * and the mobile bottom bar ("Quick navigation"). Lectures is a Study
     * shortcut in the sidebar, so address that landmark by name instead of
     * assuming document order.
     */
    const nav = screen.getByRole('navigation', { name: /study shortcuts/i });
    await userEvent.click(within(nav).getByRole('link', { name: /^lectures$/i }));
    await waitFor(() => expect(window.location.hash).toContain('/lectures'));
    expect((await screen.findAllByText(/lecture log/i)).length).toBeGreaterThan(0);

    // Curriculum screen renders its honest demo disclaimer.
    await waitFor(() => expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0));
    const nav2 = screen.getByRole('navigation', { name: /study shortcuts/i });
    await userEvent.click(within(nav2).getByRole('link', { name: /^curriculum$/i }));
    await waitFor(() => expect(window.location.hash).toContain('/curriculum'));
    expect((await screen.findAllByText(/demo/i, {}, { timeout: 5000 })).length).toBeGreaterThan(0);
  }, 30000);

  it('renders every Phase 1 screen without a crash', async () => {
    render(<App />);
    await startWorkspace();
    await screen.findByText(/welcome,|good to see you/i, {}, { timeout: 15000 });

    const paths = [
      '/curriculum',
      '/subjects',
      '/lectures',
      '/sessions',
      '/revisions',
      '/tasks',
      '/difficulties',
      '/mistakes',
      '/exams',
      '/notes',
      '/reports',
      '/reminders',
      '/settings',
    ];

    for (const path of paths) {
      act(() => {
        window.location.hash = `#${path}`;
      });
      await waitFor(() => expect(window.location.hash).toBe(`#${path}`));
      await waitFor(
        () => {
          expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
        },
        { timeout: 8000 },
      );
      // Pages must not render the load-failure state for an empty demo workspace.
      expect(screen.queryByText(/Could not load this screen/i)).not.toBeInTheDocument();
    }
  }, 40000);
});
