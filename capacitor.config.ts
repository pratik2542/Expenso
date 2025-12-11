import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.expenso.app',
  appName: 'Expenso',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // cleartext: true // Allow http for development
  }
};

export default config;
