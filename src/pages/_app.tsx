import '@/styles/globals.css'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import type { AppProps } from 'next/app'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { PreferencesProvider } from '@/contexts/PreferencesContext'
import { analytics } from '@/lib/firebaseClient'
import { logEvent } from 'firebase/analytics'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import UpdateChecker from '@/components/UpdateChecker'

const queryClient = new QueryClient()

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
        GoogleAuth.initialize()
      })

      // Handle back button
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) {
          CapacitorApp.exitApp()
        } else {
          window.history.back()
        }
      })
    }
  }, [])

  // Track page views
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      if (analytics) {
        logEvent(analytics, 'page_view', {
          page_path: url,
          page_title: document.title,
        })
      }
    }

    // Track initial page load
    handleRouteChange(window.location.pathname)

    // Track route changes
    router.events.on('routeChangeComplete', handleRouteChange)

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [router.events])

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <PreferencesProvider>
          <UpdateChecker />
          <Component {...pageProps} />
        </PreferencesProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

