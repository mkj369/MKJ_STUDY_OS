import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { alertCircleOutline, cloudOfflineOutline, fileTrayOutline, refreshOutline } from 'ionicons/icons';

export function Splash() {
  return (
    <div className="auth-shell">
      <div className="loading-block" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p>Starting MKJ StudyOS…</p>
      </div>
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Could not load this screen',
  message,
  onRetry,
  extra,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="card stack" role="alert">
      <div className="row">
        <IonIcon icon={alertCircleOutline} style={{ fontSize: 22, color: 'var(--mkj-danger)' }} aria-hidden="true" />
        <h2>{title}</h2>
      </div>
      <p className="small muted">{message}</p>
      {extra}
      {onRetry ? (
        <div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            <IonIcon icon={refreshOutline} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function OfflineAwareError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <ErrorState
      title={offline ? 'You appear to be offline' : 'Could not load this screen'}
      message={
        offline
          ? `${message} Reconnect and retry. Nothing you saved earlier has been lost from the server.`
          : message
      }
      onRetry={onRetry}
      extra={<IonIcon icon={cloudOfflineOutline} aria-hidden="true" style={{ display: 'none' }} />}
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {/* Always show the icon slot. A bare paragraph floating in a large card
          reads like a rendering failure rather than a deliberate empty state. */}
      <div className="empty__icon" aria-hidden="true">
        {icon ?? <IonIcon icon={fileTrayOutline} />}
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}
