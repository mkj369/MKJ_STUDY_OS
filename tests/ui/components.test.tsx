import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  Badge,
  DemoBadge,
  Notice,
  ProgressBar,
  SectionCard,
  StatCard,
} from '@/components/ui/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { CheckboxField, FormError, SelectField, TextField } from '@/components/ui/Form';
import { NotFoundPage } from '@/features/shared/NotFoundPage';
import { errorMessage, emptyToNull, isPermissionError, toIsoOrNull } from '@/utils/errors';
import { RepositoryError } from '@/services/repository';
import { AuthError } from '@/services/auth/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('empty and error states', () => {
  it('explains an empty list without shaming the user', () => {
    render(<EmptyState title="No lectures yet" message="Record a lecture to start the count." />);
    expect(screen.getByRole('heading', { name: 'No lectures yet' })).toBeInTheDocument();
    expect(screen.getByText('Record a lecture to start the count.')).toBeInTheDocument();
  });

  it('renders an action when provided', () => {
    render(<EmptyState title="Nothing here" message="Add one." action={<button type="button">Add</button>} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('shows a retryable error exactly when a retry exists', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Database is unreachable." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Database is unreachable.');
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('announces loading politely', () => {
    render(<LoadingState label="Loading curriculum…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading curriculum…');
  });
});

describe('page primitives', () => {
  it('renders a section card with title and hint', () => {
    render(
      <SectionCard title="Weekly summary" hint="Built from your records">
        <p>Body</p>
      </SectionCard>,
    );
    expect(screen.getByRole('heading', { name: 'Weekly summary' })).toBeInTheDocument();
    expect(screen.getByText('Built from your records')).toBeInTheDocument();
  });

  it('always labels demo data', () => {
    render(<DemoBadge />);
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('renders a badge with its tone class', () => {
    render(<Badge tone="warn">Needs revision</Badge>);
    expect(screen.getByText('Needs revision')).toHaveClass('badge--warn');
  });

  it('shows a progress bar with an accessible value', () => {
    render(<ProgressBar percent={40} done={2} total={5} label="Checklist" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuetext', '40 percent');
    expect(bar).toHaveAccessibleName('Checklist');
    expect(screen.getByText('40% (2/5)')).toBeInTheDocument();
  });

  it('never renders 0% when the denominator is unknown', () => {
    render(<ProgressBar percent={null} label="Lectures" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveAttribute('aria-valuetext', 'No denominator recorded');
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });

  it('renders a stat card with an explicit unit', () => {
    render(<StatCard label="Study time" value="75 min" hint="2 sessions" />);
    expect(screen.getByText('Study time')).toBeInTheDocument();
    expect(screen.getByText('75 min')).toBeInTheDocument();
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
  });

  it('renders notices with their tone', () => {
    render(<Notice tone="warn">Reminders need the Android app.</Notice>);
    expect(screen.getByText('Reminders need the Android app.')).toBeInTheDocument();
  });
});

describe('form primitives', () => {
  it('links a label, help text and error to the input', () => {
    render(
      <TextField
        label="Lecture title"
        name="title"
        help="Use the chapter name."
        error="Lecture title is required."
        defaultValue=""
      />,
    );
    const input = screen.getByLabelText('Lecture title');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain('title-help');
    expect(input.getAttribute('aria-describedby')).toContain('title-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Lecture title is required.');
  });

  it('renders select options including a placeholder', () => {
    render(
      <SelectField
        label="Subject"
        name="subject"
        placeholder="Choose a subject"
        options={[
          { value: 'a', label: 'Physics' },
          { value: 'b', label: 'Chemistry', disabled: true },
        ]}
      />,
    );
    const select = screen.getByLabelText('Subject');
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Physics' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Chemistry' })).toBeDisabled();
  });

  it('toggles a checkbox through its label', async () => {
    render(<CheckboxField label="Practice sheet done" name="practice" />);
    const checkbox = screen.getByLabelText('Practice sheet done');
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('announces failed saves and stays silent when there is no error', () => {
    const { rerender } = render(<FormError message="Could not save the session." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved.');
    rerender(<FormError message={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('not found page', () => {
  it('is honest and offers a way back', () => {
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing was changed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });
});

describe('error helpers', () => {
  it('uses repository and auth messages verbatim', () => {
    expect(errorMessage(new RepositoryError('Archive it instead.', 'subject_has_records'))).toBe('Archive it instead.');
    expect(errorMessage(new AuthError('Wrong email or password.', 'invalid_credentials'))).toBe('Wrong email or password.');
  });

  it('translates network failures into plain language', () => {
    expect(errorMessage(new Error('Failed to fetch'))).toContain('Network request failed');
  });

  it('never exposes an empty or undefined message', () => {
    expect(errorMessage(undefined)).toContain('Something went wrong');
    expect(errorMessage({ weird: true })).toContain('Something went wrong');
  });

  it('detects permission errors', () => {
    expect(isPermissionError(new RepositoryError('Not allowed.', 'forbidden'))).toBe(true);
    expect(isPermissionError(new Error('forbidden'))).toBe(false);
  });

  it('converts blank optional inputs to null', () => {
    expect(emptyToNull('   ')).toBeNull();
    expect(emptyToNull(' Chemistry ')).toBe('Chemistry');
    expect(emptyToNull(undefined)).toBeNull();
    expect(toIsoOrNull('')).toBeNull();
    expect(toIsoOrNull('not a date')).toBeNull();
    expect(toIsoOrNull('2026-10-27T10:00:00Z')).toBe('2026-10-27T10:00:00.000Z');
  });
});
