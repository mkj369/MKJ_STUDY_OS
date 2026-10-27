import { HashRouter } from 'react-router-dom';
import { IonApp } from '@ionic/react';
import { AppProviders, useAuth } from '@/app/AppProviders';
import { AppRoutes } from '@/app/AppRoutes';
import { Splash } from '@/components/ui/States';
import { AuthPage } from '@/features/auth/AuthPage';

function AuthGate() {
  const auth = useAuth();
  if (auth.loading) return <Splash />;
  if (!auth.user) return <AuthPage />;
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
