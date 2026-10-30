import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the Android build.
 *
 * `appId` is the shipped application id, not a template placeholder. It is
 * asserted against `android/app/build.gradle` (applicationId + namespace) and
 * `res/values/strings.xml` by tests/android/config.test.ts, and it is the id
 * Play Console will hold forever — changing it means a new listing, so it must
 * never be edited casually.
 */
const config: CapacitorConfig = {
  appId: 'com.mkjstudyos.app',
  appName: 'MKJ StudyOS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      // drawable/ic_stat_studyos.xml — a white alpha-mask icon for the status bar.
      // The plugin falls back to the launcher icon if this resource is missing.
      smallIcon: 'ic_stat_studyos',
      iconColor: '#0f5132',
    },
  },
};

export default config;
