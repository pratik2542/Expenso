import { Capacitor } from '@capacitor/core';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const getApiUrl = (path: string) => {
  const cleanPath = path.replace(/^\//, '');

  // If running in Capacitor (Native), we must use the remote production URL
  // because the local WebView cannot serve API routes.
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    // Hardcoded production URL for the native app fallback
    const prodUrl = 'https://expense-ai-manager.vercel.app';
    return `${prodUrl}/${cleanPath}`;
  }

  // In development, always use relative paths to hit local Next.js API routes
  if (process.env.NODE_ENV === 'development') {
    return `/${cleanPath}`;
  }
  
  // In production, use the configured API URL
  const baseUrl = API_URL.replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/${cleanPath}` : `/${cleanPath}`;
};
