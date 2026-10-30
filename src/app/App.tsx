import { HashRouter, Route, Routes } from 'react-router-dom';
import { IonApp } from '@ionic/react';
import { AppProviders, useAuth } from '@/app/AppProviders';
import { AppRoutes } from '@/app/AppRoutes';
import { Splash } from '@/components/ui/States';
import { AuthPage } from '@/features/auth/AuthPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { PrivacyPage, TermsPage } from '@/features/legal/LegalPage';

/**
 * A Supabase recovery link lands on `#access_token=…&type=recovery`, which is
 * not a route. Without this gate the router would render "page not found" for a
 * link that is supposed to work, so the reset screen is chosen before routing.
 */
function isRecoveryLink(): boolean {
  if (typeof window === 'undefined') return false;
  return /(^|[#&?])type=recovery([&=]|$)/.test(window.location.hash);
}

/**
 * Public pages (privacy, terms) render outside the app shell but still need a
 * landmark and a readable column, which is what the store listing and the
 * pre-signup footer link to.
 */
function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-page">
      <main className="app-content public-page__content" id="main-content">
        {children}
      </main>
    </div>
  );
}

function AuthGate() {
  const auth = useAuth();
  if (auth.loading) return <Splash />;
  if (isRecoveryLink()) return <ResetPasswordPage />;
  if (!auth.user) {
    // Privacy and Terms must be readable before anyone creates a workspace.
    return (
      <Routes>
        <Route
          path="privacy"
          element={
            <PublicPage>
              <PrivacyPage />
            </PublicPage>
          }
        />
        <Route
          path="terms"
          element={
            <PublicPage>
              <TermsPage />
            </PublicPage>
          }
        />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }
  return <AppRoutes />;
}

export function App() {
  return (
    <AppProviders>
      <IonApp>
        <HashRouter>
          <AuthGate />
        </HashRouter>
      </IonApp>
    </AppProviders>
  );
}
