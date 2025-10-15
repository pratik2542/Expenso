import '@/styles/globals.css'
import React, { useState } from 'react'
import type { AppProps } from 'next/app'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { PreferencesProvider } from '@/contexts/PreferencesContext'

const queryClient = new QueryClient()

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <PreferencesProvider>
          <Component {...pageProps} />
        </PreferencesProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

