import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { chevronForwardOutline } from 'ionicons/icons';
import { PageHeader } from '@/components/ui/Page';
import { MORE_SECTIONS } from '@/app/nav';
import { useAuth } from '@/app/AppProviders';

/**
 * More.
 *
 * Every secondary destination, grouped by what the student is trying to do
 * rather than by database table. Nothing was removed from the app in Round 9 —
 * this page is where the things that used to crowd the sidebar now live.
 */
export function MorePage() {
  const auth = useAuth();

  return (
    <>
      <PageHeader title="More" description="Everything else, grouped by what you are doing." />

      {MORE_SECTIONS.map((section) => (
        <section className="card" key={section.title}>
          <h2 className="card__title" style={{ marginBottom: 8 }}>
            {section.title}
          </h2>
          <div className="list">
            {section.items.map((item) => (
              <Link
                key={`${section.title}-${item.path}`}
                to={item.path}
                className="list-row"
                style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center' }}
              >
                <span
                  className="empty__icon"
                  aria-hidden="true"
                  style={{ width: 34, height: 34, fontSize: 1, marginBottom: 0, flexShrink: 0 }}
                >
                  <IonIcon icon={item.icon} style={{ fontSize: 17 }} />
                </span>
                <span className="list-row__main">
                  <span className="list-row__title" style={{ display: 'block' }}>
                    {item.label}
                  </span>
                  <span className="list-row__meta" style={{ display: 'block' }}>
                    {item.hint}
                  </span>
                </span>
                <IonIcon icon={chevronForwardOutline} aria-hidden="true" style={{ color: 'var(--muted)' }} />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 8 }}>
          Account
        </h2>
        <p className="small muted">
          Signed in as {auth.user?.displayName ?? 'Student'} ·{' '}
          {auth.mode === 'local' ? 'this device only' : auth.user?.email}
        </p>
      </section>
    </>
  );
}
