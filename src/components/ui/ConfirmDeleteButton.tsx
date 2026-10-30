import { useState } from 'react';
import { IonAlert } from '@ionic/react';

export function ConfirmDeleteButton({
  onConfirm,
  label = 'Delete',
  header = 'Delete this record?',
  message = 'This removes the record from your account. It cannot be undone.',
  /*
   * Destructive by default, but quiet: a solid red button sitting next to
   * "Add chapter" on every card reads as the primary action on the screen.
   */
  buttonClassName = 'btn btn--danger-ghost btn--sm',
}: {
  onConfirm: () => Promise<void> | void;
  label?: string;
  header?: string;
  message?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen(true)}
        disabled={working}
        aria-label={label}
      >
        {working ? 'Deleting…' : label}
      </button>
      <IonAlert
        isOpen={open}
        onDidDismiss={() => setOpen(false)}
        header={header}
        message={message}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Delete',
            role: 'destructive',
            handler: () => {
              setWorking(true);
              void Promise.resolve(onConfirm()).finally(() => {
                setWorking(false);
                setOpen(false);
              });
            },
          },
        ]}
      />
    </>
  );
}
