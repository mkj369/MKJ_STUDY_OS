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
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#0f5132',
    },
  },
};

export default config;
