import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { informationCircleOutline, warningOutline } from 'ionicons/icons';
import { chapterStatusLabel } from '@/domain/progress';
import type { ChapterStatus } from '@/types/domain';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
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
}: {
  percent: number | null;
  done?: number;
  total?: number;
  label?: string;
  tone?: 'default' | 'warn' | 'danger';
}) {
  const hasData = percent !== null;
  const clamped = hasData ? Math.max(0, Math.min(100, percent)) : 0;
  const toneClass = tone === 'warn' ? 'progress--warn' : tone === 'danger' ? 'progress--danger' : '';
  return (
    <div className={`progress ${toneClass}`}>
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
      <div className="progress__meta">
        <span>{label ?? 'Completion'}</span>
        <span className="mono-num">
          {hasData ? `${Math.round(clamped)}%` : 'Not recorded'}
          {typeof done === 'number' && typeof total === 'number' ? ` (${done}/${total})` : ''}
        </span>
      </div>
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
