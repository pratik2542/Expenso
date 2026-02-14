import '@/styles/globals.css'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import type { AppProps } from 'next/app'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { PreferencesProvider } from '@/contexts/PreferencesContext'
import { EnvironmentProvider } from '@/contexts/EnvironmentContext'
import { analytics } from '@/lib/firebaseClient'
import { logEvent } from 'firebase/analytics'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import UpdateChecker from '@/components/UpdateChecker'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { AppLockProvider } from '@/contexts/AppLockContext'
import AppLockScreen from '@/components/AppLockScreen'

const queryClient = new QueryClient()

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
        GoogleAuth.initialize()
      })

      // Handle back button with double-press to exit
      let lastBackPress = 0
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        const isExitRoute = window.location.pathname === '/' || window.location.pathname === '/auth'

        if (!canGoBack || isExitRoute) {
          const now = Date.now()
          if (now - lastBackPress < 2000) {
            CapacitorApp.exitApp()
          } else {
            lastBackPress = now
            // Show simple toast
            const toast = document.createElement('div')
            toast.innerText = 'Press back again to exit'
            Object.assign(toast.style, {
              position: 'fixed',
              bottom: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(30, 30, 30, 0.9)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '50px',
              zIndex: '9999',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              pointerEvents: 'none',
              transition: 'opacity 0.3s ease'
            })
            document.body.appendChild(toast)
            setTimeout(() => {
              toast.style.opacity = '0'
              setTimeout(() => {
                if (document.body.contains(toast)) {
                  document.body.removeChild(toast)
                }
              }, 300)
            }, 2000)
          }
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
          <EnvironmentProvider>
            <AppLockProvider>
              <UpdateChecker />
              <Component {...pageProps} />
              <AppLockScreen />
              <SpeedInsights />
            </AppLockProvider>
          </EnvironmentProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

