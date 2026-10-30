import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { informationCircleOutline, warningOutline } from 'ionicons/icons';
import { chapterStatusLabel } from '@/domain/progress';
import type { ChapterStatus } from '@/types/domain';

/**
 * The one page header. Rendered as the same `hero` panel the dashboard uses so
 * every screen opens with the same weight, radius and background instead of a
 * bare heading on some routes and a decorated card on others.
 *
 * `meta` takes small chips (level, week range, freshness) that belong next to
 * the title rather than in a separate row of badges.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="hero page-head">
      <div className="hero__body">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="hero__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="hero__actions">{actions}</div> : null}
    </header>
  );
}

export function SectionCard({
  title,
  hint,
  action,
  children,
  className = '',
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`.trim()}>
      {title || action ? (
        <div className="card__header">
          <div>
            {title ? <h2 className="card__title">{title}</h2> : null}
            {hint ? <p className="card__hint">{hint}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'good' | 'warn' | 'danger' | 'info' | 'accent';

/**
 * A row of filter controls that belongs to the card below it. Kept out of the
 * card header so the title keeps its line and the controls line up left to
 * right instead of wrapping around the heading.
 */
export function FilterBar({ children, label = 'Filters' }: { children: ReactNode; label?: string }) {
  return (
    <div className="filters" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: ChapterStatus }) {
  const tone: Tone =
    status === 'complete'
      ? 'good'
      : status === 'blocked'
        ? 'danger'
        : status === 'needs_practice' || status === 'needs_revision'
          ? 'warn'
          : status === 'in_progress'
            ? 'info'
            : 'neutral';
  return <Badge tone={tone}>{chapterStatusLabel(status)}</Badge>;
}

export function ProgressBar({
  percent,
  done,
  total,
  label,
  tone,
  compact,
}: {
  percent: number | null;
  done?: number;
  total?: number;
  label?: string;
  tone?: 'default' | 'warn' | 'danger';
  /** Track only, no meta line — for dense rows that already show the counts. */
  compact?: boolean;
}) {
  const hasData = percent !== null;
  const clamped = hasData ? Math.max(0, Math.min(100, percent)) : 0;
  const toneClass = tone === 'warn' ? 'progress--warn' : tone === 'danger' ? 'progress--danger' : '';
  return (
    <div className={`progress-block${compact ? ' progress-block--compact' : ''} ${toneClass}`}>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasData ? Math.round(clamped) : undefined}
        aria-valuetext={hasData ? `${Math.round(clamped)} percent` : 'No denominator recorded'}
        aria-label={label ?? 'Progress'}
      >
        <div className="progress__fill" style={{ width: `${clamped}%` }} />
      </div>
      {compact ? null : (
        <div className="progress__meta">
          <span>{label ?? 'Completion'}</span>
          <span className="mono-num">
            {hasData ? `${Math.round(clamped)}%` : 'Not recorded'}
            {typeof done === 'number' && typeof total === 'number' ? ` (${done}/${total})` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  to,
  badge,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
  badge?: ReactNode;
}) {
  const inner = (
    <>
      <div className="row row--between">
        <span className="stat__label">{label}</span>
        {badge}
      </div>
      <span className="stat__value">{value}</span>
      {hint ? <span className="stat__hint">{hint}</span> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="stat">
        {inner}
      </Link>
    );
  }
  return <div className="stat">{inner}</div>;
}

export function Notice({
  tone = 'info',
  title,
  children,
  icon,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'neutral';
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const defaultIcon =
    tone === 'warn' || tone === 'danger' ? warningOutline : informationCircleOutline;
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon ?? <IonIcon icon={defaultIcon} aria-hidden="true" />}
      <div>
        {title ? <strong>{title} </strong> : null}
        {children}
      </div>
    </div>
  );
}

export function DemoBadge() {
  return <Badge tone="accent">Demo</Badge>;
}

export function DataFreshness({ lastRecordDate, now }: { lastRecordDate: string | null; now: string }) {
  return (
    <p className="tiny muted">
      Data freshness: today is {now}.{' '}
      {lastRecordDate
        ? `Last record added or dated ${lastRecordDate}.`
        : 'No dated records yet.'}{' '}
      Missing records are not proof that you did not study.
    </p>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="field__help">{children}</p>;
}

export { EmptyState } from '@/components/ui/States';
