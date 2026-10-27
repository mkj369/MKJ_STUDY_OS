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

describe('first run (local demo mode)', () => {
  it('starts a local workspace, seeds labelled demo data and shows the dashboard', async () => {
    render(<App />);

    // The auth screen explains that this build is running without Supabase.
    expect((await screen.findAllByText(/Local demo mode/i, {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    const start = await screen.findByRole('button', { name: /start local workspace/i });
    await userEvent.click(start);

    // The dashboard greets the student and seeded rows are clearly labelled.
    expect(await screen.findByText(/welcome,|good to see you/i, {}, { timeout: 15000 })).toBeInTheDocument();
    expect((await screen.findAllByText('Demo', {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    // The shell exposes every Phase 1 screen.
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
  }, 25000);

  it('navigates between screens without losing the workspace', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /start local workspace/i }));
    await screen.findByText(/welcome,|good to see you/i, {}, { timeout: 15000 });

    const nav = screen.getAllByRole('navigation')[0]!;
    await userEvent.click(within(nav).getByRole('link', { name: /lecture log/i }));
    await waitFor(() => expect(window.location.hash).toContain('/lectures'));
    expect((await screen.findAllByText('Lecture Log')).length).toBeGreaterThan(0);

    // Curriculum screen renders its honest demo disclaimer.
    const nav2 = screen.getAllByRole('navigation')[0]!;
    await userEvent.click(within(nav2).getByRole('link', { name: /my curriculum/i }));
    await waitFor(() => expect(window.location.hash).toContain('/curriculum'));
    expect((await screen.findAllByText(/demo/i, {}, { timeout: 5000 })).length).toBeGreaterThan(0);
  }, 30000);

  it('renders every Phase 1 screen without a crash', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /start local workspace/i }));
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
