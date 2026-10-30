import { Dialog } from '@/components/ui/Dialog';

/**
 * Confirmation for anything destructive.
 *
 * Every use names the exact thing being removed and says what else goes with it.
 * "Are you sure?" makes a student guess; "Chapter 4 and the records attached to
 * it" does not.
 */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      width="26rem"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="small" style={{ color: 'var(--ink-soft)' }}>
        {message}
      </p>
    </Dialog>
  );
}
