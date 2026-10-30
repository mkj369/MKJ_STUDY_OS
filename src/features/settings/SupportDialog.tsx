import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { copyOutline, mailOutline } from 'ionicons/icons';
import { Dialog } from '@/components/ui/Dialog';
import { LogoMark } from '@/components/brand/Logo';

export const SUPPORT_EMAIL = 'minhajkhanjihan.mkj@gmail.com';

/**
 * Support / donation contact.
 *
 * Deliberately contact-only: there is no payment account, gateway, QR code or
 * confirmation in this build, so the panel never implies money has been sent.
 */
export function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Support MKJ StudyOS">
      <div className="support">
        <div className="support__head">
          <LogoMark size={44} />
          <p className="support__thanks">Thank you for supporting MKJ StudyOS 💙</p>
        </div>
        <p className="small">
          Your interest in supporting this project means a lot. Every bit of encouragement motivates us to keep
          improving the learning experience for students.
        </p>
        <p className="small">
          If you would like to discuss a donation or support the project, please contact us by email.
        </p>

        <div className="support__email">
          <span className="mono-num">{SUPPORT_EMAIL}</span>
        </div>

        <div className="support__actions">
          <button type="button" className="btn btn--secondary" onClick={() => void copy()}>
            <IonIcon icon={copyOutline} aria-hidden="true" /> {copied ? 'Copied' : 'Copy email'}
          </button>
          <a className="btn btn--primary" href={`mailto:${SUPPORT_EMAIL}?subject=Support%20MKJ%20StudyOS`}>
            <IonIcon icon={mailOutline} aria-hidden="true" /> Email us
          </a>
        </div>
        <p className="tiny muted">
          This opens your email app. No payment is taken here — nothing in this app processes donations.
        </p>
      </div>
    </Dialog>
  );
}
