import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebaseClient'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'

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
  toggleDarkMode: () => void
}

const PreferencesContext = createContext<Prefs | undefined>(undefined)

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
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })

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
        setHasOnboarded(false)
        setLoading(false)
        return
      }

      const docSnap = querySnapshot.docs[0]
      const data = docSnap.data()

      setHasOnboarded(data?.onboarded === true)
      const currencyValue = data?.preferred_currency || data?.current_currency || data?.currency || initialCurrency

      if (currencyValue) setCurrency(currencyValue)
      const globalTimeZone = data?.time_zone
      if (globalTimeZone) setTimeZone(globalTimeZone)

      const envName = data?.default_env_name || 'Personal'
      setDefaultEnvName(envName)
    } catch (e) {
      console.error('PreferencesContext: fetch exception', e)
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

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev: boolean) => {
      const newValue = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('darkMode', JSON.stringify(newValue))
        if (newValue) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }
      return newValue
    })
  }, [])

  // Apply dark mode on mount and when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (darkMode) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }, [darkMode])

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
    toggleDarkMode,
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
