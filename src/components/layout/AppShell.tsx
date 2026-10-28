import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import {
  closeOutline,
  createOutline,
  menuOutline,
  moonOutline,
  personCircleOutline,
  cloudDoneOutline,
  phonePortraitOutline,
  ellipsisHorizontalOutline,
} from 'ionicons/icons';
import { NAV_GROUPS, NAV_ITEMS, BOTTOM_NAV, findNavItem } from '@/app/nav';
import { useAuth } from '@/app/AppProviders';
import { useI18n } from '@/i18n';
import { useMutate, useWorkspaceView } from '@/hooks/useWorkspace';
import { Badge, DemoBadge } from '@/components/ui/Page';
import { RecordDialog } from '@/components/ui/RecordDialog';
import { useNotify } from '@/features/shared/WorkspaceGate';
import { noteSchema, type NoteValues } from '@/domain/schemas';
import { NOTE_KINDS } from '@/types/domain';
import { errorMessage } from '@/utils/errors';

const NOTE_KIND_LABELS: Record<string, string> = {
  note: 'Note',
  formula: 'Formula',
  definition: 'Definition',
  bookmark: 'Bookmark / useful link',
};

/**
 * Quick capture: write a note from any screen without losing the page you were on.
 * It is a plain `notes` row, so it appears in Notes and in the formula vault with no
 * second copy of the data.
 */
function QuickCapture() {
  const [open, setOpen] = useState(false);
  const mutate = useMutate();
  const notify = useNotify();

  const save = async (values: NoteValues) => {
    try {
      await mutate((repo) =>
        repo.create('notes', {
          title: values.title,
          body: values.body,
          user_subject_id: null,
          user_chapter_id: null,
          kind: values.kind,
          tags: [],
          is_pinned: values.is_pinned,
          is_demo: false,
        }),
      );
      setOpen(false);
      await notify('Captured. It is in Notes, ready to tag later.');
    } catch (error) {
      await notify(errorMessage(error), 'danger');
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => setOpen(true)}
        aria-label="Quick capture a note"
      >
        <IonIcon icon={createOutline} aria-hidden="true" />
        <span className="quick-capture__label">Capture</span>
      </button>
      {open ? (
        <RecordDialog<NoteValues>
          title="Quick capture"
          description="A thought, a formula, a doubt. You can attach it to a subject later from Notes."
          schema={noteSchema}
          defaultValues={{ title: '', body: '', kind: 'note', tags: '', is_pinned: false, user_subject_id: '', user_chapter_id: '' }}
          submitLabel="Save note"
          fields={[
            { name: 'title', label: 'Title', type: 'text' },
            { name: 'body', label: 'Note', type: 'textarea', rows: 4 },
            {
              name: 'kind',
              label: 'Kind',
              type: 'select',
              options: NOTE_KINDS.map((value) => ({ value, label: NOTE_KIND_LABELS[value] ?? value })),
            },
            { name: 'is_pinned', label: 'Pin to the top', type: 'checkbox' },
          ]}
          onSubmit={save}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <div className="brand">
        <div className="brand__mark" aria-hidden="true">
          MKJ
        </div>
        <div>
          <div className="brand__name">MKJ StudyOS</div>
          <div className="brand__tag">{t('app.tagline')}</div>
        </div>
      </div>
      <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.key}>
            <span className="nav-group__label">{group.label}</span>
            {NAV_ITEMS.filter((item) => item.group === group.key).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
                onClick={onNavigate}
              >
                <IonIcon icon={item.icon} aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}

function ShellStatusBadges() {
  const auth = useAuth();
  const view = useWorkspaceView();
  return (
    <div className="row" style={{ gap: 6 }}>
      {auth.mode === 'cloud' ? (
        <Badge tone="good">
          <IonIcon icon={cloudDoneOutline} aria-hidden="true" /> Cloud
        </Badge>
      ) : (
        <Badge tone="info">
          <IonIcon icon={phonePortraitOutline} aria-hidden="true" /> Local demo
        </Badge>
      )}
      {view?.demoActive ? <DemoBadge /> : null}
    </div>
  );
}

function UserFooter() {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="nav-footer">
      <div className="row" style={{ gap: 8 }}>
        <IonIcon icon={personCircleOutline} aria-hidden="true" style={{ fontSize: 22 }} />
        <div style={{ minWidth: 0 }}>
          <div className="strong" style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {auth.user?.displayName}
          </div>
          <div className="tiny">{auth.mode === 'local' ? 'This device only' : auth.user?.email}</div>
        </div>
      </div>
      <Link to="/settings" className="nav-link" style={{ padding: '6px 4px', fontSize: '0.82rem' }}>
        Profile &amp; settings
      </Link>
      <button
        type="button"
        className="link-button"
        style={{ textAlign: 'left', color: 'var(--mkj-muted)', fontSize: '0.8rem' }}
        onClick={() => {
          setSigningOut(true);
          void auth.signOut().finally(() => setSigningOut(false));
        }}
        disabled={signingOut}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      <div className="tiny" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <IonIcon icon={moonOutline} aria-hidden="true" /> Follows your system theme
      </div>
    </div>
  );
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} role="presentation" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div className="row row--between">
          <span className="eyebrow">Menu</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close menu">
            <IonIcon icon={closeOutline} />
          </button>
        </div>
        <NavContent onNavigate={onClose} />
        <UserFooter />
      </div>
    </>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navItem = findNavItem(location.pathname);
  const auth = useAuth();
  const view = useWorkspaceView();
  const title =
    location.pathname.startsWith('/chapters/') ? 'Chapter' : navItem ? t(navItem.labelKey) : 'MKJ StudyOS';

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Sidebar">
        <NavContent />
        <UserFooter />
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="btn btn--ghost mobile-only"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
          >
            <IonIcon icon={menuOutline} style={{ fontSize: 22 }} />
          </button>
          <div className="app-topbar__title">
            {/* Not a heading: the page itself renders the one <h1>. Two h1s per
                screen make the outline ambiguous for screen readers. */}
            <p className="app-topbar__heading">{title}</p>
            <div className="app-topbar__sub">
              MKJ StudyOS{view?.demoActive ? ' · demo data' : auth.mode === 'local' ? ' · this device only' : ''}
            </div>
          </div>
          <div className="desktop-only">
            <ShellStatusBadges />
          </div>
          <QuickCapture />
        </header>

        <main className="app-content" id="main-content">
          {children ?? <Outlet />}
        </main>

        <nav className="bottom-nav" aria-label="Quick navigation">
          {BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
            >
              <IonIcon icon={item.icon} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button type="button" className="bottom-nav__item" onClick={() => setDrawerOpen(true)}>
            <IonIcon icon={ellipsisHorizontalOutline} aria-hidden="true" />
            <span>More</span>
          </button>
        </nav>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
