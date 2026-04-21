import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebaseClient'
import { Capacitor } from '@capacitor/core'
import { doc, getDoc, collection, query, where, getDocs, disableNetwork, enableNetwork } from 'firebase/firestore'

type Prefs = {
  currency: string
  timeZone: string
  loading: boolean
  formatCurrency: (amount: number) => string
  formatCurrencyExplicit: (amount: number, code: string) => string
  formatDate: (date?: string | Date | null, opts?: Intl.DateTimeFormatOptions) => string
  refetch: () => Promise<void>
  updatePrefs: (p: Partial<{ currency: string; timeZone: string }>) => void
  defaultEnvName: string
  hasOnboarded: boolean | null
  darkMode: boolean
  themeMode: 'light' | 'dark' | 'black'
  setThemeMode: (mode: 'light' | 'dark' | 'black') => void
  toggleDarkMode: () => void
  isOnline: boolean
  simpleMode: boolean
  paymentMethods: string[]
  setPaymentMethods: (methods: string[]) => void
}


import { Network } from '@capacitor/network'

const PreferencesContext = createContext<Prefs | undefined>(undefined)

type ThemeMode = 'light' | 'dark' | 'black'

function applyThemeClasses(mode: ThemeMode) {
  if (typeof window === 'undefined') return

  const root = document.documentElement
  const isDarkFamily = mode === 'dark' || mode === 'black'

  if (isDarkFamily) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  if (mode === 'black') {
    root.classList.add('theme-black')
  } else {
    root.classList.remove('theme-black')
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  // Initials
  const initialCurrency = process.env.NEXT_PUBLIC_BASE_CURRENCY || 'USD'
  const initialTimeZone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
  })()
  const [currency, setCurrency] = useState(initialCurrency)
  const [timeZone, setTimeZone] = useState(initialTimeZone)
  const [defaultEnvName, setDefaultEnvName] = useState('Personal')
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null
    const cached = localStorage.getItem('hasOnboarded')
    if (cached === 'true') return true
    if (cached === 'false') return false
    return null
  })
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof window === 'undefined' ? true : navigator.onLine))
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const savedThemeMode = localStorage.getItem('themeMode')
      if (savedThemeMode === 'light' || savedThemeMode === 'dark' || savedThemeMode === 'black') {
        return savedThemeMode
      }

      // Migrate legacy darkMode boolean to the new theme system.
      const savedDarkMode = localStorage.getItem('darkMode')
      if (savedDarkMode) {
        return JSON.parse(savedDarkMode) ? 'dark' : 'light'
      }
    }
    return 'light'
  })
  const [paymentMethods, setPaymentMethods] = useState<string[]>([
    'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'UPI', 'NEFT', 'Check', 'Other'
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    // Initial check
    if (!navigator.onLine) {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Capacitor Network listener
    let networkListener: any
    if (Capacitor.isNativePlatform()) {
      const setupNetwork = async () => {
        const initialStatus = await Network.getStatus()
        setIsOnline(initialStatus.connected)
        
        networkListener = await Network.addListener('networkStatusChange', status => {
          setIsOnline(status.connected)
        })
      }
      setupNetwork()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (networkListener) {
        networkListener.remove()
      }
    }
  }, [])
  useEffect(() => {
    // Explicitly toggle Firebase Network based on online status.
    const manageFirebaseNetwork = async () => {
      try {
        if (isOnline) {
          await enableNetwork(db)
        } else {
          await disableNetwork(db)
        }
      } catch (e) {
        console.error('Failed to toggle Firebase network state', e)
      }
    }
    manageFirebaseNetwork()
  }, [isOnline])

  const fetchPrefs = useCallback(async () => {
    if (!user?.uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const userSettingsRef = collection(db, 'user_settings')
      const q = query(userSettingsRef, where('user_id', '==', user.uid))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        const cachedOnboarded = typeof window !== 'undefined' ? localStorage.getItem('hasOnboarded') : null
        if (cachedOnboarded === 'true') {
          // Trust the cache if they were onboarded, don't revert to false
          setHasOnboarded(true)
          
          // Also try to load cached detailed settings if available
          try {
            const cachedPrefs = localStorage.getItem('expenso_cached_prefs')
            if (cachedPrefs) {
              const data = JSON.parse(cachedPrefs)
              if (data.currency) setCurrency(data.currency)
              if (data.time_zone) setTimeZone(data.time_zone)
              if (data.default_env_name) setDefaultEnvName(data.default_env_name)
              if (data.payment_methods) setPaymentMethods(data.payment_methods)
            }
          } catch(e) {}
        } else {
          // If not cached, then maybe they truly aren't onboarded
          const isOffline = typeof window !== 'undefined' && !navigator.onLine
          if (!isOffline) {
            setHasOnboarded(false)
            if (typeof window !== 'undefined') {
              localStorage.setItem('hasOnboarded', 'false')
            }
          }
        }
        setLoading(false)
        return
      }

      const docSnap = querySnapshot.docs[0]
      const data = docSnap.data()

      const onboarded = data?.onboarded === true
      setHasOnboarded(onboarded)
      if (typeof window !== 'undefined') {
        localStorage.setItem('hasOnboarded', onboarded ? 'true' : 'false')
        localStorage.setItem('expenso_cached_prefs', JSON.stringify({
          currency: data?.preferred_currency || data?.current_currency || data?.currency,
          time_zone: data?.time_zone,
          default_env_name: data?.default_env_name,
          payment_methods: data?.payment_methods
        }))
      }
      const currencyValue = data?.preferred_currency || data?.current_currency || data?.currency || initialCurrency

      if (currencyValue) setCurrency(currencyValue)
      const globalTimeZone = data?.time_zone
      if (globalTimeZone) setTimeZone(globalTimeZone)

      const envName = data?.default_env_name || 'Personal'
      setDefaultEnvName(envName)

      // Load payment methods from user_settings if available
      if (Array.isArray(data?.payment_methods) && data.payment_methods.length > 0) {
        setPaymentMethods(data.payment_methods)
      }

      // If we got here successfully, it might mean we are actually online
      // or retrieving perfectly from cache.
    } catch (e: any) {
      console.error('PreferencesContext: fetch exception', e)
      
      // If Firebase specifically throws a network/offline error, trust it over navigator.onLine
      if (e?.code === 'unavailable' || String(e).toLowerCase().includes('offline')) {
        setIsOnline(false)
      }

      // Load fallback from cache if error
      if (typeof window !== 'undefined') {
        const cachedOnboarded = localStorage.getItem('hasOnboarded')
        if (cachedOnboarded === 'true') {
          setHasOnboarded(true)
          try {
            const cachedPrefs = localStorage.getItem('expenso_cached_prefs')
            if (cachedPrefs) {
              const data = JSON.parse(cachedPrefs)
              if (data.currency) setCurrency(data.currency)
              if (data.time_zone) setTimeZone(data.time_zone)
              if (data.default_env_name) setDefaultEnvName(data.default_env_name)
              if (data.payment_methods) setPaymentMethods(data.payment_methods)
            }
          } catch(err) {}
        }
      }
      
    } finally {
      setLoading(false)
    }
  }, [user?.uid, initialCurrency])

  useEffect(() => {
    fetchPrefs()
  }, [fetchPrefs])

  const formatCurrency = useMemo(() => {
    return (amount: number) => {
      try {
        const locale = currency === 'CAD' ? 'en-US' : undefined
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
      } catch {
        return `${currency} ${amount.toFixed(2)}`
      }
    }
  }, [currency])

  const formatCurrencyExplicit = useMemo(() => {
    return (amount: number, code: string) => {
      if (!code) return amount.toFixed(2)
      try {
        const locale = code === 'CAD' ? 'en-US' : undefined
        return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount)
      } catch {
        return `${code} ${amount.toFixed(2)}`
      }
    }
  }, [])

  const formatDate = useMemo(() => {
    return (date?: string | Date | null, opts?: Intl.DateTimeFormatOptions) => {
      if (!date) return '—'

      let d: Date
      if (typeof date === 'string') {
        // If it's a simple YYYY-MM-DD string, we want to display exactly those parts
        // without any timezone shifting.
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const [year, month, day] = date.split('-').map(Number)
          // Create a UTC date at mid-day to be extra safe from boundary errors
          d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

          return d.toLocaleDateString(undefined, {
            ...opts,
            timeZone: 'UTC', // Tells the formatter to use the UTC parts we just set
            month: opts?.month || 'short',
            day: opts?.day || 'numeric',
            year: opts?.year || 'numeric'
          })
        }
        d = new Date(date)
      } else {
        d = date
      }

      if (!(d instanceof Date) || isNaN(d.getTime())) return '—'

      try {
        return d.toLocaleDateString(undefined, {
          timeZone,
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          ...opts
        })
      } catch {
        return d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          ...opts
        })
      }
    }
  }, [timeZone])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('themeMode', mode)
      localStorage.setItem('darkMode', JSON.stringify(mode !== 'light'))
      applyThemeClasses(mode)
    }
  }, [])

  const darkMode = themeMode !== 'light'
  
  // We consider it simple mode if it's the native app and there's no internet, OR if they've manually forced it (useful for testing)
  const simpleMode = useMemo(() => {
    if (typeof window === 'undefined') return false
    return Capacitor.isNativePlatform() && !isOnline
  }, [isOnline])

  const toggleDarkMode = useCallback(() => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light')
  }, [themeMode, setThemeMode])

  // Apply theme classes on mount and whenever the mode changes.
  useEffect(() => {
    applyThemeClasses(themeMode)
  }, [themeMode])

  const value: Prefs = {
    currency,
    timeZone,
    loading,
    formatCurrency,
    formatCurrencyExplicit,
    formatDate,
    refetch: fetchPrefs,
    updatePrefs: (p) => {
      if (p.currency) setCurrency(p.currency)
      if (p.timeZone) setTimeZone(p.timeZone)
    },
    defaultEnvName,
    hasOnboarded,
    darkMode,
    themeMode,
    setThemeMode,
    toggleDarkMode,
    isOnline,
    simpleMode,
    paymentMethods,
    setPaymentMethods,
  }

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  )
}

export function usePreferences(): Prefs {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}
