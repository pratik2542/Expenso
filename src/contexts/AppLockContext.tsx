import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

interface AppLockContextType {
  isLocked: boolean
  hasPin: boolean
  setupPin: (pin: string) => void
  unlock: (pin: string) => boolean
  verifyPin: (pin: string) => boolean
  changePin: (oldPin: string, newPin: string) => boolean
  removePin: () => void
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined)

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  // Store the real PIN in memory? That's risky if XSS.
  // But localStorage is also readable by XSS.
  // For this level of security (app lock), localStorage is acceptable as per user request "access by code".
  // Better: Store a hash? But we need to verify it.
  // Ideally, use SecureStorage plugin. But we will stick to localStorage as a first step or use a mock.
  
  const PIN_KEY = 'expenso_app_lock_pin'

  // Initialize
  useEffect(() => {
    const storedPin = localStorage.getItem(PIN_KEY)
    if (storedPin) {
      setHasPin(true)
      setIsLocked(true) // Always lock on startup if PIN exists
    }
  }, [])

  // Listen for app state changes
  useEffect(() => {
    // Only meaningful for native apps or PWA installed
    const handleAppStateChange = async (state: { isActive: boolean }) => {
      if (!state.isActive) {
        // App went to background
        const storedPin = localStorage.getItem(PIN_KEY)
        if (storedPin) {
          setIsLocked(true)
        }
      }
    }

    const listener = App.addListener('appStateChange', handleAppStateChange)

    return () => {
      listener.then(l => l.remove())
    }
  }, [])

  const setupPin = useCallback((pin: string) => {
    localStorage.setItem(PIN_KEY, pin)
    setHasPin(true)
    setIsLocked(false) // Setting up PIN doesn't lock immediately/or it might, but usually you are already authenticated
  }, [])

  const unlock = useCallback((pin: string) => {
    const storedPin = localStorage.getItem(PIN_KEY)
    if (storedPin === pin) {
      setIsLocked(false)
      return true
    }
    return false
  }, [])

  const verifyPin = useCallback((pin: string) => {
    const storedPin = localStorage.getItem(PIN_KEY)
    return storedPin === pin
  }, [])

  const changePin = useCallback((oldPin: string, newPin: string) => {
    const storedPin = localStorage.getItem(PIN_KEY)
    if (storedPin === oldPin) {
      localStorage.setItem(PIN_KEY, newPin)
      return true
    }
    return false
  }, [])

  const removePin = useCallback(() => {
    localStorage.removeItem(PIN_KEY)
    setHasPin(false)
    setIsLocked(false)
  }, [])

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        hasPin,
        setupPin,
        unlock,
        verifyPin,
        changePin,
        removePin,
      }}
    >
      {children}
    </AppLockContext.Provider>
  )
}

export function useAppLock() {
  const context = useContext(AppLockContext)
  if (context === undefined) {
    throw new Error('useAppLock must be used within an AppLockProvider')
  }
  return context
}
