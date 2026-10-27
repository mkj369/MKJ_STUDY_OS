import { useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { notificationsOutline, phonePortraitOutline } from 'ionicons/icons';
import { useWorkspaceQuery, useMutate } from '@/hooks/useWorkspace';
import { Badge, EmptyState, Notice, PageHeader, SectionCard } from '@/components/ui/Page';
import { FormError } from '@/components/ui/Form';
import { WorkspaceGate, useNotify } from '@/features/shared/WorkspaceGate';
import { planReminders } from '@/domain/reminders';
import { formatDateTime } from '@/domain/dates';
import { TIMEZONE_OPTIONS } from '@/services/reminderDefaults';
import { localNotificationsSupported, scheduleLocalReminders } from '@/services/notifications';
import { errorMessage } from '@/utils/errors';
import type { ReminderPreferences } from '@/types/domain';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function RemindersContent() {
  const { data } = useWorkspaceQuery();
  const mutate = useMutate();
  const notify = useNotify();
  const [draft, setDraft] = useState<ReminderPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schedulingEvents, setSchedulingEvents] = useState(false);

  const prefs = draft ?? data?.bundle.reminderPreferences ?? null;

  const plan = useMemo(() => {
    if (!data || !prefs) return null;
    const weekOpenTasks = data.bundle.tasks.filter((t) => t.status === 'todo' || t.status === 'in_progress');
    return planReminders({
      prefs,
      tasks: data.bundle.tasks,
      revisionQueue: data.view.revisionQueue,
      existingKeys: data.bundle.reminderEvents.filter((e) => e.status !== 'failed').map((e) => e.reminder_key),
      existingEvents: data.bundle.reminderEvents.map((e) => ({ scheduled_for: e.scheduled_for, status: e.status })),
      weekHasIncompleteGoals: weekOpenTasks.length > 0,
    });
  }, [data, prefs]);

  if (!data || !prefs) return null;
  const { bundle } = data;

  const update = <K extends keyof ReminderPreferences>(key: K, value: ReminderPreferences[K]) => {
    setDraft({ ...prefs, [key]: value });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await mutate((repo) =>
        repo.saveReminderPreferences({
          reminders_enabled: prefs.reminders_enabled,
          task_due_enabled: prefs.task_due_enabled,
          task_overdue_enabled: prefs.task_overdue_enabled,
          revision_due_enabled: prefs.revision_due_enabled,
          weekly_planning_enabled: prefs.weekly_planning_enabled,
          incomplete_goal_enabled: prefs.incomplete_goal_enabled,
          weekly_planning_day: prefs.weekly_planning_day,
          weekly_planning_time: prefs.weekly_planning_time,
          quiet_hours_start: prefs.quiet_hours_start,
          quiet_hours_end: prefs.quiet_hours_end,
          max_per_day: prefs.max_per_day,
          channel: prefs.channel,
          timezone: prefs.timezone,
        }),
      );
      setDraft(null);
      await notify('Reminder preferences saved.');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const savePlanned = async () => {
    if (!plan || plan.candidates.length === 0) {
      await notify('No reminder to schedule right now.', 'warning');
      return;
    }
    try {
      await mutate((repo) =>
        repo.saveReminderEvents(
          plan.candidates.map((candidate) => ({
            reminder_key: candidate.reminder_key,
            reminder_type: candidate.reminder_type,
            scheduled_for: candidate.scheduled_for,
            status: 'scheduled' as const,
            channel: candidate.channel,
            title: candidate.title,
            body: candidate.body,
            related_entity_type: candidate.related_entity_type,
            related_entity_id: candidate.related_entity_id,
            error_message: null,
          })),
        ),
      );
      await notify(`${plan.candidates.length} reminder(s) scheduled (status: scheduled, not “sent”).`);
    } catch (scheduleError) {
      await notify(errorMessage(scheduleError), 'danger');
    }
  };

  const scheduleOnDevice = async () => {
    setSchedulingEvents(true);
    try {
      const events = bundle.reminderEvents.filter((event) => event.status === 'scheduled');
      if (events.length === 0) {
        await notify('Nothing scheduled to send. Save the planned reminders first.', 'warning');
        return;
      }
      const outcome = await scheduleLocalReminders(
        events.map((event) => ({
          id: event.id,
          title: event.title,
          body: event.body,
          scheduled_for: event.scheduled_for,
        })),
      );
      if (!outcome.supported) {
        await notify(outcome.message, 'warning');
        return;
      }
      await mutate(async (repo) => {
        for (const result of outcome.results) {
          await repo.updateReminderEventStatus(result.eventId, result.ok ? 'sent' : 'failed', result.error ?? null);
        }
      });
      await notify(outcome.message, outcome.results.every((r) => r.ok) ? 'success' : 'warning');
    } catch (deviceError) {
      await notify(errorMessage(deviceError), 'danger');
    } finally {
      setSchedulingEvents(false);
    }
  };

  const clearScheduled = async () => {
    try {
      await mutate(async (repo) => {
        for (const event of bundle.reminderEvents) {
          if (event.status === 'scheduled' || event.status === 'failed') {
            await repo.remove('reminder_events', event.id);
          }
        }
      });
      await notify('Scheduled reminders cleared. Delivered history was kept.', 'warning');
    } catch (clearError) {
      await notify(errorMessage(clearError), 'danger');
    }
  };

  const events = [...bundle.reminderEvents].sort((a, b) => (a.scheduled_for < b.scheduled_for ? 1 : -1));
  const supported = localNotificationsSupported();

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Supportive reminders you control: no shame messaging, no duplicate spam, quiet hours respected."
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        }
      />

      <div className="grid grid--two">
        <SectionCard title="Reminder types" hint="Turn off anything that feels like pressure">
          <div className="stack">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={prefs.reminders_enabled}
                onChange={(event) => update('reminders_enabled', event.target.checked)}
              />
              <span>
                <strong>Reminders switched on</strong>
                <span className="tiny muted"> · turning this off silences every reminder type</span>
              </span>
            </label>
            <div className="divider" />
            {(
              [
                ['task_due_enabled', 'Task due today', 'A gentle nudge on the day a task is due.'],
                ['task_overdue_enabled', 'Overdue tasks', 'Offers rescheduling, never blame.'],
                ['revision_due_enabled', 'Revision due', 'Uses the review dates from your revisions.'],
                ['weekly_planning_enabled', 'Weekly planning', 'One reminder to plan a realistic week.'],
                ['incomplete_goal_enabled', 'Unfinished weekly goals', 'Sent only on the last day of the week, if enabled.'],
              ] as const
            ).map(([key, label, help]) => (
              <label className="checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(event) => update(key, event.target.checked)}
                  disabled={!prefs.reminders_enabled}
                />
                <span>
                  {label}
                  <span className="tiny muted"> · {help}</span>
                </span>
              </label>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Timing & limits" hint="All times use your selected time zone">
          <div className="form">
            <label className="field">
              <span className="field__label">Time zone</span>
              <select className="select" value={prefs.timezone} onChange={(event) => update('timezone', event.target.value)}>
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <label className="field">
                <span className="field__label">Quiet hours start</span>
                <input
                  className="input"
                  type="time"
                  value={prefs.quiet_hours_start}
                  onChange={(event) => update('quiet_hours_start', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Quiet hours end</span>
                <input
                  className="input"
                  type="time"
                  value={prefs.quiet_hours_end}
                  onChange={(event) => update('quiet_hours_end', event.target.value)}
                />
              </label>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <label className="field">
                <span className="field__label">Weekly planning day</span>
                <select
                  className="select"
                  value={prefs.weekly_planning_day}
                  onChange={(event) => update('weekly_planning_day', Number(event.target.value))}
                >
                  {DAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Planning time</span>
                <input
                  className="input"
                  type="time"
                  value={prefs.weekly_planning_time}
                  onChange={(event) => update('weekly_planning_time', event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">Maximum reminders per day</span>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                value={prefs.max_per_day}
                onChange={(event) => update('max_per_day', Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
              />
            </label>
            <label className="field">
              <span className="field__label">Delivery channel</span>
              <select
                className="select"
                value={prefs.channel}
                onChange={(event) => update('channel', event.target.value as ReminderPreferences['channel'])}
              >
                <option value="in_app">In-app only (works everywhere)</option>
                <option value="local_notification">Device notification (Android build)</option>
              </select>
              <span className="field__help">
                {supported
                  ? 'Native scheduling is available on this device.'
                  : 'This browser cannot schedule device notifications. Saved reminders stay in-app; use the Android build for device notifications.'}
              </span>
            </label>
            <FormError message={error} />
            <div className="row">
              <button type="button" className="btn btn--secondary" onClick={() => void save()} disabled={saving}>
                Save preferences
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft(null)} disabled={!draft}>
                Discard changes
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <div style={{ height: 16 }} />

      <SectionCard
        title="What would be scheduled now"
        hint="A preview from current records — nothing is sent, and these are not “delivered”."
        action={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void savePlanned()} disabled={!plan || plan.candidates.length === 0}>
            Save planned reminders
          </button>
        }
      >
        {!plan ? null : (
          <div className="stack">
            {plan.candidates.length === 0 ? (
              <EmptyState
                icon={<IonIcon icon={notificationsOutline} aria-hidden="true" />}
                title="Nothing to schedule"
                message="No reminder condition is met right now, or reminders are off / quiet hours and daily limits suppress them."
              />
            ) : (
              <div className="list">
                {plan.candidates.map((candidate) => (
                  <div className="list-row" key={candidate.reminder_key}>
                    <div className="list-row__main">
                      <div className="list-row__title">{candidate.title}</div>
                      <div className="list-row__meta">
                        <span>{formatDateTime(candidate.scheduled_for, 'en', prefs.timezone)}</span>
                        <span>{candidate.reminder_type}</span>
                        <span>{candidate.channel === 'in_app' ? 'in-app' : 'device notification'}</span>
                      </div>
                      <p className="tiny muted">{candidate.body}</p>
                    </div>
                    <Badge tone="info">planned</Badge>
                  </div>
                ))}
              </div>
            )}
            {plan.suppressed.length > 0 ? (
              <Notice tone="neutral" title="Suppressed:">
                <ul className="report-list">
                  {plan.suppressed.map((entry) => (
                    <li key={entry.reason}>
                      {entry.reason} × {entry.count}
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            {plan.notes.map((note) => (
              <p className="tiny muted" key={note}>
                {note}
              </p>
            ))}
          </div>
        )}
      </SectionCard>

      <div style={{ height: 16 }} />

      <SectionCard
        title="Scheduled & delivered reminder records"
        hint="Statuses come from the platform, never assumed"
        action={
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void scheduleOnDevice()} disabled={schedulingEvents}>
              <IonIcon icon={phonePortraitOutline} aria-hidden="true" /> {schedulingEvents ? 'Scheduling…' : 'Send on this device'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void clearScheduled()}>
              Clear scheduled
            </button>
          </div>
        }
      >
        {events.length === 0 ? (
          <p className="small muted">No reminder records yet. Save the preview above to create them.</p>
        ) : (
          <div className="list">
            {events.map((event) => (
              <div className="list-row" key={event.id}>
                <div className="list-row__main">
                  <div className="list-row__title">{event.title}</div>
                  <div className="list-row__meta">
                    <span>{formatDateTime(event.scheduled_for, 'en', prefs.timezone)}</span>
                    <span>{event.reminder_type}</span>
                    <span>{event.channel === 'in_app' ? 'in-app' : 'device'}</span>
                    {event.error_message ? <span>{event.error_message}</span> : null}
                  </div>
                </div>
                <Badge
                  tone={
                    event.status === 'sent' ? 'good' : event.status === 'failed' ? 'danger' : event.status === 'skipped' ? 'neutral' : 'info'
                  }
                >
                  {event.status === 'sent' ? 'sent (confirmed)' : event.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 10 }} />
        <Notice tone="neutral" title="No fake delivery claims.">
          “scheduled” means the app stored a reminder to show you. “sent (confirmed)” appears only after the
          platform reports a successful native schedule. In-app reminders are listed here rather than pretending
          they were pushed.
        </Notice>
      </SectionCard>
    </>
  );
}

export function RemindersPage() {
  return <WorkspaceGate>{() => <RemindersContent />}</WorkspaceGate>;
}
