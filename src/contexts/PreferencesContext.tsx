import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebaseClient'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'

type Prefs = {
  currency: string
  timeZone: string
  loading: boolean
  convertExistingData: boolean
  formatCurrency: (amount: number) => string
  formatCurrencyExplicit: (amount: number, code: string) => string
  formatDate: (date?: string | Date | null, opts?: Intl.DateTimeFormatOptions) => string
  convertAmount: (amount: number, from: string, to?: string) => Promise<{ amount: number; rate: number; from: string; to: string }>
  formatConverted: (amount: number, from: string, target?: string) => Promise<string>
  refetch: () => Promise<void>
  updatePrefs: (p: Partial<{ currency: string; convertExistingData: boolean; timeZone: string }>) => void
}

const PreferencesContext = createContext<Prefs | undefined>(undefined)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  // Initials: do NOT read/write browser storage
  const initialCurrency = process.env.NEXT_PUBLIC_BASE_CURRENCY || 'USD'
  const initialTimeZone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
  })()
  const [currency, setCurrency] = useState(initialCurrency)
  const [timeZone, setTimeZone] = useState(initialTimeZone)
  const [convertExistingData, setConvertExistingData] = useState<boolean>(true)
  const [loading, setLoading] = useState(true) // Start as true until first fetch completes

  const fetchPrefs = useCallback(async () => {
    if (!user?.uid) {
      console.log('PreferencesContext: No user UID')
      setLoading(false)
      return
    }
    setLoading(true)
    console.log('PreferencesContext: Fetching for user:', user.uid)
    try {
      // Query user_settings collection where user_id equals the Firebase UID
      const userSettingsRef = collection(db, 'user_settings')
      const q = query(userSettingsRef, where('user_id', '==', user.uid))
      console.log('PreferencesContext: Querying collection with user_id:', user.uid)
      const querySnapshot = await getDocs(q)
      
      if (querySnapshot.empty) {
        console.log('PreferencesContext: No user settings found for user:', user.uid)
        return
      }

      const docSnap = querySnapshot.docs[0] // Get the first matching document
      const data = docSnap.data()
      console.log('PreferencesContext: Found data:', data)
      const currencyValue = data?.preferred_currency || data?.current_currency || data?.currency || initialCurrency
      const convertExisting = data?.convert_existing_data
      
      if (currencyValue) setCurrency(currencyValue)
      if (typeof convertExisting === 'boolean') setConvertExistingData(convertExisting)
      // timeZone currently not persisted in this context; settings page stores its own value
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
        // Force en-US for CAD to get CA$
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
        // Parse date string as date in the user's selected timezone
        // If it's in YYYY-MM-DD format, parse it correctly to avoid UTC shift
        if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
          // Append time to ensure it's parsed in the user's timezone, not UTC
          // This prevents the "one day off" bug
          const dateStr = date.split('T')[0] + 'T12:00:00'
          d = new Date(dateStr)
        } else {
          d = new Date(date)
        }
      } else {
        d = date
      }
      if (!(d instanceof Date) || isNaN(d.getTime())) return '—'
      try {
        // Use the user's selected timezone from settings
        return d.toLocaleDateString(undefined, { timeZone, month: 'short', day: 'numeric', year: 'numeric', ...opts })
      } catch {
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...opts })
      }
    }
  }, [timeZone])

  const value: Prefs = {
    currency,
    timeZone,
    loading,
    convertExistingData,
    formatCurrency,
    formatCurrencyExplicit,
    formatDate,
    convertAmount: async (amount, from, to = currency) => {
      if (!amount || from === to) return { amount, rate: 1, from, to }
      try {
        const resp = await fetch(`/api/fx/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        if (!resp.ok) throw new Error('Rate fetch failed')
        const json = await resp.json()
        if (!json.success || !json.rate) throw new Error('Invalid rate response')
        return { amount: amount * json.rate, rate: json.rate, from, to }
      } catch {
        return { amount, rate: 1, from, to }
      }
    },
    formatConverted: async (amount: number, from: string, target: string = currency) => {
      const { amount: converted } = await (async () => {
        if (from === target) return { amount, rate: 1 }
        try {
          const r = await fetch(`/api/fx/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(target)}`)
          if (!r.ok) return { amount, rate: 1 }
          const j = await r.json()
          if (!j.rate) return { amount, rate: 1 }
          return { amount: amount * j.rate, rate: j.rate }
        } catch { return { amount, rate: 1 } }
      })()
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: target }).format(converted)
      } catch { return `${target} ${converted.toFixed(2)}` }
    },
    refetch: fetchPrefs,
    updatePrefs: (p) => {
      if (p.currency) setCurrency(p.currency)
      if (typeof p.convertExistingData === 'boolean') setConvertExistingData(p.convertExistingData)
      if (p.timeZone) setTimeZone(p.timeZone)
      // No browser storage; state-only here. Persist via settings page to DB.
    },
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
