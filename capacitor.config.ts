import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the Android build.
 *
 * appId is a placeholder package id — change it to your own reverse-DNS id
 * before publishing to Google Play, then regenerate the Android project.
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
