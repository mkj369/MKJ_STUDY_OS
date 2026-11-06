import { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import { IonApp } from '@ionic/react';
import { AppProviders, useAuth, useServices } from '@/app/AppProviders';
import { AppRoutes } from '@/app/AppRoutes';
import { ThemeProvider } from '@/app/ThemeProvider';
import { BrandSplash } from '@/components/ui/BrandLoader';
import { AuthPage } from '@/features/auth/AuthPage';
import { useBackButtonBridge } from '@/hooks/useAndroidBackButton';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';

function AuthGate() {
  const auth = useAuth();
  const services = useServices();
  const [recovering, setRecovering] = useState(false);
  useBackButtonBridge();

  // Supabase appends `#access_token=…&type=recovery` to the app root; the auth
  // client detects it and fires PASSWORD_RECOVERY. Switch to the reset form
  // regardless of the current route.
  useEffect(() => {
    const subscribe = services.auth.onPasswordRecovery?.bind(services.auth);
    if (!subscribe) return;
    return subscribe(() => setRecovering(true));
  }, [services]);

  if (recovering) {
    return <ResetPasswordPage onDone={() => setRecovering(false)} />;
  }
  if (auth.loading) return <BrandSplash />;
  if (!auth.user) return <AuthPage />;
  return <AppRoutes />;
}

export function App() {
  return (
    <ThemeProvider>
      <AppProviders>
        <IonApp>
          <HashRouter>
            <AuthGate />
          </HashRouter>
        </IonApp>
      </AppProviders>
    </ThemeProvider>
  );
}
