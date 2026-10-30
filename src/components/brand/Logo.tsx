import { useId, type CSSProperties } from 'react';

/**
 * The MKJ StudyOS identity.
 *
 * One inline SVG so the mark is crisp at 20px in the sidebar and at 96px on the
 * onboarding screen, inherits the current theme's accent, and needs no network
 * request. Two pages (learning), an upward path (progress) and three rising
 * bars (the MKJ name) — no stock icon, no emoji.
 */

export function LogoMark({
  size = 32,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  /*
   * A gradient id must be unique per instance. Two copies of this mark can be on
   * screen at once — the sidebar and the mobile header both exist in the DOM, and
   * one of them is `display: none` at any width. A duplicated id makes the
   * browser resolve `url(#…)` against the hidden copy, and the tile renders
   * blank. `useId` gives each instance its own gradient.
   */
  const gradientId = `mkj-logo-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={style}
      role="img"
      aria-label="MKJ StudyOS"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gradientId})`} />
      {/* Open book: the two pages a student actually works from. */}
      <path
        d="M13 38.2c6.4-3.5 12.6-3.5 19 0 6.4-3.5 12.6-3.5 19 0v12.1c-6.4-3.5-12.6-3.5-19 0-6.4-3.5-12.6-3.5-19 0V38.2Z"
        fill="#FFFFFF"
      />
      <path d="M32 38.2v12.1" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" opacity=".38" />
      {/* Forward path: progress rising out of the pages. */}
      <path
        d="M20.5 30.5l8-8 5.2 5.2 7.3-7.3"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35.5 20h6.5v6.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark plus wordmark, for headers, onboarding and the auth screen. */
export function LogoLockup({
  size = 36,
  tagline,
  className,
}: {
  size?: number;
  tagline?: string | null;
  className?: string;
}) {
  return (
    <div className={`logo-lockup${className ? ` ${className}` : ''}`}>
      <LogoMark size={size} />
      <div className="logo-lockup__text">
        <span className="logo-lockup__name">MKJ StudyOS</span>
        {tagline ? <span className="logo-lockup__tagline">{tagline}</span> : null}
      </div>
    </div>
  );
}

/** Small badge used where the mark sits next to a heading. */
export function BrandPill({ label = 'MKJ StudyOS' }: { label?: string }) {
  return (
    <span className="brand-pill">
      <LogoMark size={18} />
      {label}
    </span>
  );
}
