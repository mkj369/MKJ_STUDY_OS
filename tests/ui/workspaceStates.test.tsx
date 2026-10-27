// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000/" }
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, useRepositoryOptional } from '@/app/AppProviders';
import { createAppServices } from '@/app/services';
import { WorkspaceGate } from '@/features/shared/WorkspaceGate';
import type { Repository } from '@/services/repository';

/**
 * Loading, error and retry states are wired to the real provider stack.
 *
 * The repository is the only thing replaced: it is either slow, failing, or
 * returning a deliberately empty workspace. That proves the UI actually reacts
 * to each state instead of only containing the right words.
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
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

async function makeServices(override: (repo: Repository) => Partial<Repository>) {
  const base = createAppServices({});
  await base.auth.signUp('states@example.test', 'password123', 'States Tester');
  return {
    ...base,
    createRepository: (userId: string) => {
      const real = base.createRepository(userId);
      return Object.assign(Object.create(real) as Repository, override(real));
    },
  };
}

/**
 * Mirrors the real auth gate: pages only mount once a session exists, so the
 * test waits for the same boundary instead of mounting the gate with no user.
 */
function TestShell() {
  const repository = useRepositoryOptional();
  if (!repository) return <p>restoring session…</p>;
  return <WorkspaceGate>{(data) => <p>Loaded {data.bundle.subjects.length} subjects</p>}</WorkspaceGate>;
}

function renderGate() {
  return render(
    <MemoryRouter>
      <AppProviders services={servicesRef.current}>
        <TestShell />
      </AppProviders>
    </MemoryRouter>,
  );
}

const servicesRef: { current: ReturnType<typeof createAppServices> } = { current: createAppServices({}) };

describe('workspace gate states', () => {
  it('shows a loading state while the records are in flight', async () => {
    const services = await makeServices(() => ({
      listAllUserData: () => new Promise(() => {}),
    }));
    servicesRef.current = services;
    renderGate();
    expect(await screen.findByText(/loading your records/i, {}, { timeout: 15000 })).toBeInTheDocument();
  });

  it('shows an error state with the real message when loading fails', async () => {
    const services = await makeServices(() => ({
      listAllUserData: () => Promise.reject(new Error('network unreachable in test')),
    }));
    servicesRef.current = services;
    renderGate();
    const alert = await screen.findByRole('alert', {}, { timeout: 15000 });
    expect(alert).toHaveTextContent(/could not load your records/i);
    expect(alert).toHaveTextContent(/network unreachable in test/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  }, 25000);

  it('retries and recovers once the failure clears', async () => {
    let attempts = 0;
    // The provider retries once automatically, so the error surface appears on
    // attempt 2; the manual Retry is attempt 3 and succeeds.
    const services = await makeServices((real) => ({
      listAllUserData: () => {
        attempts += 1;
        return attempts <= 2 ? Promise.reject(new Error('transient failure')) : real.listAllUserData();
      },
    }));
    servicesRef.current = services;
    renderGate();

    await userEvent.click(await screen.findByRole('button', { name: /retry/i }, { timeout: 15000 }));
    await waitFor(() => expect(screen.getByText(/loaded \d+ subjects/i)).toBeInTheDocument(), { timeout: 15000 });
    expect(attempts).toBe(3);
  }, 30000);
});
