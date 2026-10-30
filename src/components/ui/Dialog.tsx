import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';

/**
 * A small, theme-native modal.
 *
 * Deliberately not Ionic's `IonModal`: that renders into shadow DOM and needs a
 * separate stylesheet to look like anything, which is how the old build ended up
 * with two visual languages. The native <dialog> element gives focus trapping,
 * Escape-to-close and backdrop behaviour for free, and every colour here comes
 * from a token so it follows the student's theme.
 */

export interface DialogProps {
  open: boolean;
  title: string;
  /** One short line. Omit rather than repeat the title. */
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Width ceiling; the dialog is always narrower than the viewport on mobile. */
  width?: string;
}

export function Dialog({ open, title, description, onClose, children, footer, width = '30rem' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) {
      // jsdom has no showModal; opening via the attribute keeps unit tests and
      // the browser behaving the same way.
      if (typeof element.showModal === 'function') {
        element.showModal();
      } else {
        element.setAttribute('open', '');
      }
    } else if (!open && element.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself, not the panel).
        if (event.target === ref.current) onClose();
      }}
      style={{ ['--dialog-width' as string]: width }}
    >
      <div className="dialog__panel" onClick={(event) => event.stopPropagation()}>
        <header className="dialog__head">
          <div>
            <h2 id={titleId} className="dialog__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="dialog__desc">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn--icon" onClick={onClose} aria-label="Close">
            <IonIcon icon={closeOutline} aria-hidden="true" />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__foot">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
