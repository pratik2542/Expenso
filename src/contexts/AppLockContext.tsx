import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'

interface AppLockContextType {
  isLocked: boolean
  hasPin: boolean
  isBiometricAvailable: boolean
  isBiometricEnabled: boolean
  setupPin: (pin: string) => void
  unlock: (pin: string) => boolean
  unlockWithBiometrics: () => Promise<boolean>
  verifyPin: (pin: string) => boolean
  changePin: (oldPin: string, newPin: string) => boolean
  removePin: () => void
  toggleBiometrics: (enabled: boolean) => void
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined)

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false)
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false)
  
  const PIN_KEY = 'expenso_app_lock_pin'
  const BIO_KEY = 'expenso_app_lock_bio'
  const SKIP_LOCK_UNTIL_KEY = 'expenso_app_lock_skip_until'

  // Initialize
  useEffect(() => {
    const storedPin = localStorage.getItem(PIN_KEY)
    if (storedPin) {
      setHasPin(true)

      // If we just intentionally opened an external flow (e.g. update download),
      // avoid immediately re-locking on a WebView reload/app restart.
      let shouldLock = true
      try {
        const skipUntilRaw = localStorage.getItem(SKIP_LOCK_UNTIL_KEY)
        const skipUntil = skipUntilRaw ? Number(skipUntilRaw) : 0
        if (skipUntil && Number.isFinite(skipUntil) && Date.now() < skipUntil) {
          shouldLock = false
        }
      } catch {
        // ignore
      }

      setIsLocked(shouldLock)
    }
    
    const storedBio = localStorage.getItem(BIO_KEY)
    if (storedBio === 'true') {
      setIsBiometricEnabled(true)
    }

    if (Capacitor.isNativePlatform()) {
      NativeBiometric.isAvailable().then(result => {
        setIsBiometricAvailable(result.isAvailable)
      }).catch(() => setIsBiometricAvailable(false))
    }
  }, [])

  // Listen for app state changes
  useEffect(() => {
    // Only meaningful for native apps or PWA installed
    const handleAppStateChange = async (state: { isActive: boolean }) => {
      if (!state.isActive) {
        // App went to background
        try {
          const skipUntilRaw = localStorage.getItem(SKIP_LOCK_UNTIL_KEY)
          const skipUntil = skipUntilRaw ? Number(skipUntilRaw) : 0
          if (skipUntil && Number.isFinite(skipUntil) && Date.now() < skipUntil) {
            return
          }
        } catch {
          // ignore
        }

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
  }, [PIN_KEY])

  const setupPin = useCallback((pin: string) => {
    localStorage.setItem(PIN_KEY, pin)
    setHasPin(true)
    setIsLocked(false)
  }, [PIN_KEY])

  const unlock = useCallback((pin: string) => {
    const storedPin = localStorage.getItem(PIN_KEY)
    if (storedPin === pin) {
      setIsLocked(false)
      return true
    }
    return false
  }, [PIN_KEY])

  const unlockWithBiometrics = useCallback(async () => {
    if (!isBiometricAvailable) return false
    
    try {
      const result = await NativeBiometric.verifyIdentity({
        reason: "Unlock Expenso",
        title: "Log in",
        subtitle: "Use Biometrics to unlock",
        description: "Verify your identity",
      })
      .then(() => ({ success: true }))
      .catch(() => ({ success: false }));
      
      if (result.success) {
        setIsLocked(false)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [isBiometricAvailable])

  const verifyPin = useCallback((pin: string) => {
    const storedPin = localStorage.getItem(PIN_KEY)
    return storedPin === pin
  }, [PIN_KEY])

  const changePin = useCallback((oldPin: string, newPin: string) => {
    const storedPin = localStorage.getItem(PIN_KEY)
    if (storedPin === oldPin) {
      localStorage.setItem(PIN_KEY, newPin)
      return true
    }
    return false
  }, [PIN_KEY])

  const removePin = useCallback(() => {
    localStorage.removeItem(PIN_KEY)
    // Also disable biometrics if PIN is removed
    localStorage.removeItem(BIO_KEY)
    setIsBiometricEnabled(false)
    setHasPin(false)
    setIsLocked(false)
  }, [PIN_KEY, BIO_KEY])
  
  const toggleBiometrics = useCallback((enabled: boolean) => {
    if (enabled) {
      localStorage.setItem(BIO_KEY, 'true')
    } else {
      localStorage.removeItem(BIO_KEY)
    }
    setIsBiometricEnabled(enabled)
  }, [BIO_KEY])

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        hasPin,
        isBiometricAvailable,
        isBiometricEnabled,
        setupPin,
        unlock,
        unlockWithBiometrics,
        verifyPin,
        changePin,
        removePin,
        toggleBiometrics,
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
