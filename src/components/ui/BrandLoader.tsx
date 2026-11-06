/**
 * Branded loading surfaces.
 *
 * Honesty rule: the shimmer/pulse communicates "working", never a fake
 * percentage. Real progress bars elsewhere always show done/total.
 * All motion is disabled by the global prefers-reduced-motion rule.
 */
import { useEffect, useState } from 'react';

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`brand-loader__mark brand-loader__mark--${size}`} aria-hidden="true">
      MKJ
    </div>
  );
}

/** Full-screen boot loader: shown while the session/database is resolving. */
export function BrandSplash({ label = 'Starting MKJ StudyOS…' }: { label?: string }) {
  // Delay the "still working" hint so fast boots never flash extra text.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const handle = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(handle);
  }, []);

  return (
    <div className="brand-loader" role="status" aria-live="polite">
      <div className="brand-loader__pulse">
        <BrandMark size="lg" />
      </div>
      <div className="brand-loader__name">MKJ StudyOS</div>
      <div className="brand-loader__tag">Plan better. Study smarter.</div>
      <div className="brand-loader__bar" aria-hidden="true">
        <span />
      </div>
      <p className="brand-loader__label">{label}</p>
      {slow ? <p className="brand-loader__slow">Taking longer than usual — checking your session and records.</p> : null}
    </div>
  );
}

/** Skeleton block for content-heavy screens (lists, cards). */
export function Skeleton({ lines = 3, card = false }: { lines?: number; card?: boolean }) {
  const body = (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skeleton__line" style={{ width: `${100 - (index % 3) * 18}%` }} />
      ))}
    </div>
  );
  return card ? <div className="card">{body}</div> : body;
}

/** Page-shaped skeleton: header bar + two cards. Used by route suspense. */
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading screen" className="stack">
      <Skeleton lines={2} />
      <Skeleton lines={4} card />
      <Skeleton lines={4} card />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
