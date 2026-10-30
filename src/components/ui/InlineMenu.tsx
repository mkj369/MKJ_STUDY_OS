import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { ellipsisHorizontal } from 'ionicons/icons';

/**
 * A small overflow menu for card actions.
 *
 * A real <button> plus a positioned panel (not <details>) so the trigger is a
 * proper button role for keyboard and screen-reader users, and so Escape and
 * outside clicks both close it. No portal, no extra dependency.
 */
export function InlineMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-inline" ref={wrap}>
      <button
        type="button"
        className="btn btn--icon btn--sm"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu-inline__panel" role="group" aria-label={label} onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
