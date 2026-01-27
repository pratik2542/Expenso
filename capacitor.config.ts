import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.prtk.expenso',
  appName: 'Expenso',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'https://expense-ai-manager.vercel.app/',
      'https://expenso-pdfexcel.vercel.app',
      'https://*.googleapis.com',
      'https://generativelanguage.googleapis.com',
      'https://api.perplexity.ai'
    ]
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '630618173026-0sit7elnmpdqksl520e79gp5oti8978q.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
