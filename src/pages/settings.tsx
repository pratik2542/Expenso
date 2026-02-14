import Head from 'next/head'
import PaymentMethodsManager from '@/components/PaymentMethodsManager'
import { useState, useEffect, useCallback } from 'react'
import Layout from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { UserIcon, Globe } from 'lucide-react'
import { db } from '@/lib/firebaseClient'
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useAppLock } from '@/contexts/AppLockContext'
import PinManagerModal from '@/components/PinManagerModal'

export default function Settings() {
  const { user, signOut } = useAuth()
  const { darkMode, toggleDarkMode, refetch: refetchPrefs } = usePreferences()
  const { currentEnvironment, environments, deleteEnvironment, getCollection, reloadCurrentEnvironment } = useEnvironment()
  const { hasPin, isBiometricAvailable, isBiometricEnabled, toggleBiometrics } = useAppLock()
  const [pinModal, setPinModal] = useState<{ open: boolean; mode: 'setup' | 'change' | 'remove' }>({ 
    open: false, 
    mode: 'setup' 
  })
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendingWeekly, setSendingWeekly] = useState(false)
  const [sendingAnalytics, setSendingAnalytics] = useState(false)

  // Global app settings
  const [globalSettings, setGlobalSettings] = useState({
    full_name: '',
    email: '',
    default_environment_id: 'default',
    payment_methods: [] as string[],
  })

  // Per-environment settings
  const [envSettings, setEnvSettings] = useState({
    name: '',
    currency: 'USD',
    time_zone: 'UTC',
    country: '',
  })

  // Notification preferences
  const [notifications, setNotifications] = useState({
    email_notifications: true,
    push_notifications: false,
    weekly_reports: false,
    analytics: false,
    marketing: false,
  })

  const [dirty, setDirty] = useState(false)
  const [envDirty, setEnvDirty] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      // Load global user settings
      const userSettingsRef = collection(db, 'user_settings')
      const q = query(userSettingsRef, where('user_id', '==', user.uid))
      const querySnapshot = await getDocs(q)
      const settingsRow = !querySnapshot.empty ? querySnapshot.docs[0].data() : null

      // Fallback: If no name in database, try to get from OAuth metadata
      let fullName = settingsRow?.full_name || ''
      if (!fullName) {
        fullName = user.displayName || ''
        if (fullName) {
          const newDocRef = doc(db, 'user_settings', user.uid)
          await setDoc(newDocRef, {
            user_id: user.uid,
            full_name: fullName,
            updated_at: new Date().toISOString()
          }, { merge: true })
        }
      }

      setGlobalSettings({
        full_name: fullName,
        email: settingsRow?.email || user.email || '',
        default_environment_id: settingsRow?.default_environment_id || 'default',
        payment_methods: Array.isArray(settingsRow?.payment_methods) ? settingsRow.payment_methods : [
          'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'UPI', 'NEFT', 'Check', 'Other'
        ],
      })

      setNotifications({
        email_notifications: settingsRow?.email_notifications ?? true,
        push_notifications: settingsRow?.push_notifications ?? false,
        weekly_reports: settingsRow?.weekly_reports ?? false,
        analytics: settingsRow?.analytics ?? false,
        marketing: settingsRow?.marketing ?? false,
      })

      // Load current environment settings
      if (currentEnvironment.id !== 'default') {
        const envDocRef = doc(db, 'users', user.uid, 'environments', currentEnvironment.id)
        const envDoc = await getDoc(envDocRef)
        if (envDoc.exists()) {
          const envData = envDoc.data()
          setEnvSettings({
            name: envData.name || currentEnvironment.name,
            currency: envData.currency || 'USD',
            time_zone: envData.time_zone || 'UTC',
            country: envData.country || '',
          })
        } else {
          setEnvSettings({
            name: currentEnvironment.name,
            currency: currentEnvironment.currency || 'USD',
            time_zone: 'UTC',
            country: '',
          })
        }
      } else {
        setEnvSettings({
          name: settingsRow?.default_env_name || 'Personal',
          currency: settingsRow?.current_currency || currentEnvironment.currency || 'USD',
          time_zone: settingsRow?.time_zone || 'UTC',
          country: settingsRow?.country || '',
        })
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load settings'
      console.error('Settings load error:', e)
      setError(msg)
    } finally {
      setLoading(false)
      setDirty(false)
      setEnvDirty(false)
    }
  }, [user, currentEnvironment])

  useEffect(() => { load() }, [load])

  const markDirty = () => { if (!dirty) setDirty(true) }
  const markEnvDirty = () => { if (!envDirty) setEnvDirty(true) }

  const saveGlobalSettings = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        full_name: globalSettings.full_name,
        email: user.email || '',
        default_environment_id: globalSettings.default_environment_id,
        payment_methods: globalSettings.payment_methods,
        ...notifications,
        updated_at: new Date().toISOString(),
      }

      const userSettingsRef = collection(db, 'user_settings')
      const q = query(userSettingsRef, where('user_id', '==', user.uid))
      const querySnapshot = await getDocs(q)

      if (!querySnapshot.empty) {
        const existingDocRef = querySnapshot.docs[0].ref
        await setDoc(existingDocRef, payload, { merge: true })
      } else {
        const newDocRef = doc(db, 'user_settings', user.uid)
        await setDoc(newDocRef, { ...payload, user_id: user.uid }, { merge: true })
      }

      setDirty(false)
      refetchPrefs()
      setError('Settings saved successfully!')
      setTimeout(() => setError(null), 2000)

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save'
      console.error('Settings save error:', e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const saveEnvironmentSettings = async () => {
    if (!user) return
    setSaving(true)
    setError(null)

    try {
      if (currentEnvironment.id === 'default') {
        const userSettingsRef = collection(db, 'user_settings')
        const q = query(userSettingsRef, where('user_id', '==', user.uid))
        const querySnapshot = await getDocs(q)

        const payload = {
          default_env_name: envSettings.name,
          current_currency: envSettings.currency,
          preferred_currency: envSettings.currency, // Also set preferred_currency for consistency
          time_zone: envSettings.time_zone,
          country: envSettings.country,
          updated_at: new Date().toISOString()
        }

        if (!querySnapshot.empty) {
          await setDoc(querySnapshot.docs[0].ref, payload, { merge: true })
        } else {
          await setDoc(doc(db, 'user_settings', user.uid), { ...payload, user_id: user.uid }, { merge: true })
        }
      } else {
        const envDocRef = doc(db, 'users', user.uid, 'environments', currentEnvironment.id)
        await updateDoc(envDocRef, {
          name: envSettings.name,
          currency: envSettings.currency,
          time_zone: envSettings.time_zone,
          country: envSettings.country,
          updated_at: new Date().toISOString()
        })
      }

      // DATA SYNC: Update accounts and expenses to match new environment currency
      if (envSettings.currency !== currentEnvironment.currency) {
        try {
          const accountsRef = getCollection('accounts')
          const accountsSnap = await getDocs(accountsRef)
          const accPromises = accountsSnap.docs.map(d => updateDoc(d.ref, { currency: envSettings.currency }))

          const expensesRef = getCollection('expenses')
          const expensesSnap = await getDocs(expensesRef)
          const expPromises = expensesSnap.docs.map(d => updateDoc(d.ref, { currency: envSettings.currency }))

          await Promise.all([...accPromises, ...expPromises])
        } catch (syncErr) {
          console.error('Data sync warning:', syncErr)
        }
      }

      setEnvDirty(false)

      // Reload contexts and invalidate queries
      await Promise.all([
        refetchPrefs(),
        reloadCurrentEnvironment()
      ])

      // Invalidate all queries to force refetch with new currency
      await queryClient.invalidateQueries()

      setError('Settings saved successfully!')
      setTimeout(() => setError(null), 2000)
    } catch (e: any) {
      setError(e.message || 'Failed to save environment settings')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEnvironment = async () => {
    if (!user || currentEnvironment.id === 'default') return

    const confirmed = confirm(`Are you sure you want to delete "${currentEnvironment.name}"? This will remove the workspace and all its configurations. Data associated with this workspace will be archived.`)
    if (!confirmed) return

    const secondConfirmation = prompt(`Type "${currentEnvironment.name.toUpperCase()}" to confirm deletion:`)
    if (secondConfirmation !== currentEnvironment.name.toUpperCase()) {
      alert('Verification failed. Workspace not deleted.')
      return
    }

    setDeleting(true)
    setError(null)
    try {
      await deleteEnvironment(currentEnvironment.id)
      setError('Workspace deleted successfully.')
    } catch (e: any) {
      setError('Failed to delete: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <RequireAuth>
      <Head>
        <title>Settings - Expenso</title>
        <meta name="description" content="Manage your account settings and preferences" />
      </Head>

      <Layout>
        <div className="max-w-4xl mx-auto px-3 lg:px-8 py-4 lg:py-8 pb-24 lg:pb-8">
          {/* Mobile Header */}
          <div className="lg:hidden mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Settings</h1>
                <p className="text-xs text-gray-500 mt-0.5">Manage your preferences</p>
              </div>
            </div>
            {(dirty || envDirty) && !saving && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-orange-600 bg-orange-50 px-2 py-1 rounded-lg w-fit">
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                Unsaved changes
              </div>
            )}
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:flex mb-8 items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Manage your account and environment preferences</p>
            </div>
          </div>

          {/* Error/Success Message */}
          {error && (
            <div className={`mb-4 lg:mb-6 text-xs lg:text-sm border rounded-xl p-3 lg:p-4 ${error.includes('successfully') || error.includes('saved')
              ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
              <p className="font-medium">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="mb-4 lg:mb-6 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-4 w-4 text-blue-500 dark:text-blue-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading settings...
            </div>
          )}

          <div className="space-y-3 lg:space-y-6">
            {/* Environment-Specific Settings */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-2xl shadow-sm p-4 lg:p-6 border-2 border-purple-100 dark:border-purple-800">
              <div className="flex items-center justify-between mb-4 lg:mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                    <Globe className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white">{currentEnvironment.name} Settings</h2>
                    <p className="text-[10px] lg:text-xs text-gray-600 dark:text-gray-400">Environment-specific preferences</p>
                  </div>
                </div>
                <button
                  disabled={!envDirty || saving}
                  onClick={saveEnvironmentSettings}
                  className={`px-3 lg:px-4 py-2 text-xs lg:text-sm font-medium rounded-xl transition-all ${envDirty && !saving
                    ? 'bg-purple-600 text-white shadow-lg hover:bg-purple-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Environment Name</label>
                  <input
                    type="text"
                    value={envSettings.name}
                    onChange={(e) => {
                      setEnvSettings(prev => ({ ...prev, name: e.target.value }))
                      markEnvDirty()
                    }}
                    className="w-full px-3 py-2.5 lg:py-2 text-sm border border-purple-200 dark:border-purple-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-gray-800 dark:text-white transition-colors"
                    placeholder="e.g. Personal, Work, Travel"
                  />
                </div>

                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Country</label>
                  <select
                    value={envSettings.country}
                    onChange={(e) => {
                      const val = e.target.value
                      setEnvSettings(prev => {
                        const updates: any = { ...prev, country: val }
                        // Auto map currency and timezone
                        if (val === 'Canada') {
                          updates.currency = 'CAD'
                          updates.time_zone = 'America/Toronto'
                        } else if (val === 'India') {
                          updates.currency = 'INR'
                          updates.time_zone = 'Asia/Kolkata'
                        } else if (val === 'USA') {
                          updates.currency = 'USD'
                          updates.time_zone = 'America/New_York'
                        } else if (val === 'UK') {
                          updates.currency = 'GBP'
                          updates.time_zone = 'Europe/London'
                        } else if (val === 'Europe') {
                          updates.currency = 'EUR'
                          updates.time_zone = 'Europe/Paris'
                        } else if (val === 'Australia') {
                          updates.currency = 'AUD'
                          updates.time_zone = 'Australia/Sydney'
                        } else if (val === 'Dubai') {
                          updates.currency = 'AED'
                          updates.time_zone = 'Asia/Dubai'
                        }
                        return updates
                      })
                      markEnvDirty()
                    }}
                    className="w-full px-3 py-2.5 lg:py-2 text-sm border border-purple-200 dark:border-purple-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-gray-800 dark:text-white transition-colors"
                  >
                    <option value="">Select Country...</option>
                    <option value="Canada">🇨🇦 Canada</option>
                    <option value="India">🇮🇳 India</option>
                    <option value="USA">🇺🇸 USA</option>
                    <option value="UK">🇬🇧 UK</option>
                    <option value="Europe">🇪🇺 Europe</option>
                    <option value="Dubai">🇦🇪 Dubai</option>
                    <option value="Australia">🇦🇺 Australia</option>
                    <option value="Other">🌐 Other</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Currency</label>
                    <select
                      value={envSettings.currency}
                      onChange={(e) => {
                        setEnvSettings(prev => ({ ...prev, currency: e.target.value }))
                        markEnvDirty()
                      }}
                      className="w-full px-3 py-2.5 lg:py-2 text-sm border border-purple-200 dark:border-purple-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-gray-800 dark:text-white transition-colors"
                    >
                      <option value="USD">🇺🇸 USD - US Dollar</option>
                      <option value="EUR">🇪🇺 EUR - Euro</option>
                      <option value="GBP">🇬🇧 GBP - British Pound</option>
                      <option value="CAD">🇨🇦 CAD - Canadian Dollar</option>
                      <option value="AUD">🇦🇺 AUD - Australian Dollar</option>
                      <option value="INR">🇮🇳 INR - Indian Rupee</option>
                      <option value="AED">🇦🇪 AED - UAE Dirham</option>
                      <option value="JPY">🇯🇵 JPY - Japanese Yen</option>
                      <option value="SAR">🇸🇦 SAR - Saudi Riyal</option>
                      <option value="QAR">🇶🇦 QAR - Qatari Rial</option>
                      <option value="SGD">🇸🇬 SGD - Singapore Dollar</option>
                      <option value="CHF">🇨🇭 CHF - Swiss Franc</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Time Zone</label>
                    <select
                      value={envSettings.time_zone}
                      onChange={(e) => {
                        setEnvSettings(prev => ({ ...prev, time_zone: e.target.value }))
                        markEnvDirty()
                      }}
                      className="w-full px-3 py-2.5 lg:py-2 text-sm border border-purple-200 dark:border-purple-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-gray-800 dark:text-white transition-colors"
                    >
                      <option value="UTC">🌐 UTC</option>
                      <option value="America/New_York">🇺🇸 America/New_York</option>
                      <option value="America/Chicago">🇺🇸 America/Chicago</option>
                      <option value="America/Los_Angeles">🇺🇸 America/Los_Angeles</option>
                      <option value="America/Toronto">🇨🇦 Toronto</option>
                      <option value="Europe/London">🇬🇧 Europe/London</option>
                      <option value="Asia/Kolkata">🇮🇳 Asia/Kolkata</option>
                    </select>
                  </div>
                </div>

                {/* Delete Workspace Section */}
                {currentEnvironment.id !== 'default' && (
                  <div className="pt-4 mt-2 border-t border-purple-100 dark:border-purple-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <label className="block text-xs lg:text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</label>
                        <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400">Remove this workspace and its secondary data</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDeleteEnvironment}
                        disabled={deleting}
                        className="px-3 lg:px-4 py-2 text-xs lg:text-sm bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-all font-medium disabled:opacity-50 whitespace-nowrap border border-red-100 dark:border-red-800"
                      >
                        {deleting ? 'Deleting...' : '🗑️ Delete Workspace'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Global App Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 lg:p-6 dark:border dark:border-gray-700">
              <div className="flex items-center justify-between mb-4 lg:mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center">
                    <UserIcon className="w-4 h-4 lg:w-5 lg:h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white">Profile Settings</h2>
                </div>
                <button
                  disabled={!dirty || saving}
                  onClick={saveGlobalSettings}
                  className={`px-3 lg:px-4 py-2 text-xs lg:text-sm font-medium rounded-xl transition-all ${dirty && !saving
                    ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="space-y-3 lg:space-y-4">
                {/* Profile */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs lg:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={globalSettings.full_name}
                      onChange={(e) => {
                        setGlobalSettings((p) => ({ ...p, full_name: e.target.value }))
                        markDirty()
                      }}
                      className="w-full px-3 py-2.5 lg:py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-800 dark:text-white transition-colors"
                      placeholder="Enter your name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs lg:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={globalSettings.email}
                      disabled
                      className="w-full px-3 py-2.5 lg:py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Default Environment */}
                                {/* Payment Methods Manager */}
                                <div>
                                  <PaymentMethodsManager
                                    paymentMethods={globalSettings.payment_methods}
                                    setPaymentMethods={methods => {
                                      setGlobalSettings(prev => ({ ...prev, payment_methods: methods }));
                                      markDirty();
                                    }}
                                  />
                                </div>
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">Default Environment</label>
                  <select
                    value={globalSettings.default_environment_id}
                    onChange={(e) => {
                      setGlobalSettings(prev => ({ ...prev, default_environment_id: e.target.value }))
                      markDirty()
                    }}
                    className="w-full px-3 py-2.5 lg:py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-800 dark:text-white transition-colors"
                  >
                    {environments.map(env => (
                      <option key={env.id} value={env.id}>{env.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 mt-1">Opens automatically when you launch the app</p>
                </div>

                {/* Regenerate Nickname */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <label className="block text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-300">Dashboard Nickname</label>
                      <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 mt-0.5">Regenerate your AI 4-letter code</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return
                        const confirmed = confirm('Regenerate your nickname? This will create a new 4-letter code.')
                        if (!confirmed) return

                        try {
                          setLoading(true)
                          const userSettingsRef = collection(db, 'user_settings')
                          const q = query(userSettingsRef, where('user_id', '==', user.uid))
                          const querySnapshot = await getDocs(q)

                          if (!querySnapshot.empty) {
                            const docRef = querySnapshot.docs[0].ref
                            await setDoc(docRef, {
                              nickname: null,
                              updated_at: new Date().toISOString()
                            }, { merge: true })
                          }

                          setError('Nickname cleared! Reload the dashboard to generate a new one.')
                        } catch (e: any) {
                          setError('Failed to clear nickname: ' + e.message)
                        } finally {
                          setLoading(false)
                        }
                      }}
                      className="px-3 lg:px-4 py-2 text-xs lg:text-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium disabled:opacity-50 whitespace-nowrap"
                      disabled={loading}
                    >
                      🔄 Regenerate
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 lg:p-6 dark:border dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4 lg:mb-6">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 flex items-center justify-center">
                  <span className="text-lg">🌓</span>
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white">Appearance</h2>
              </div>

              <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs lg:text-sm text-gray-800 dark:text-gray-200 font-medium">Dark Mode</span>
                    <span className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400">Switch between light and dark themes</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={toggleDarkMode}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Security */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 lg:p-6 dark:border dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4 lg:mb-6">
                 <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 flex items-center justify-center">
                  <span className="text-lg">🔒</span>
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white">Security</h2>
              </div>
              
              <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                 <div>
                   <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">App Lock</h3>
                   <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                     Restrict access to the app with a PIN code
                   </p>
                 </div>
                 
                 <div className="flex gap-2">
                   {hasPin ? (
                     <>
                        <button
                          onClick={() => setPinModal({ open: true, mode: 'change' })}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Change PIN
                        </button>
                        <button
                          onClick={() => setPinModal({ open: true, mode: 'remove' })}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        >
                          Remove
                        </button>
                     </>
                   ) : (
                      <button
                        onClick={() => setPinModal({ open: true, mode: 'setup' })}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
                      >
                        Set PIN
                      </button>
                   )}
                 </div>
              </div>

              {hasPin && isBiometricAvailable && (
                <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl mt-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">👆</span>
                    <div className="flex flex-col">
                        <span className="text-xs lg:text-sm text-gray-800 dark:text-gray-200 font-medium">Biometric Unlock</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">Unlock with Face ID or fingerprint</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isBiometricEnabled}
                      onChange={(e) => toggleBiometrics(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 lg:p-6 dark:border dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center">
                  <svg className="w-4 h-4 lg:w-5 lg:h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
              </div>

              <div className="space-y-2 lg:space-y-3">
                {/* Email Notifications */}
                <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📧</span>
                    <span className="text-xs lg:text-sm text-gray-800 dark:text-gray-200 font-medium">Email notifications</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifications.email_notifications}
                      onChange={(e) => {
                        setNotifications((p) => ({ ...p, email_notifications: e.target.checked }))
                        markDirty()
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Push Notifications */}
                <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🔔</span>
                    <div className="flex flex-col">
                        <span className="text-xs lg:text-sm text-gray-800 dark:text-gray-200 font-medium">Daily Reminders</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">Mobile app only (8:00 PM)</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifications.push_notifications}
                      onChange={async (e) => {
                          const isEnabled = e.target.checked
                          setNotifications((p) => ({ ...p, push_notifications: isEnabled }))
                          markDirty()
                          
                          if (Capacitor.isNativePlatform()) {
                              if (isEnabled) {
                                  // Request permission
                                  const perm = await LocalNotifications.requestPermissions()
                                  if (perm.display === 'granted') {
                                      // Schedule daily reminder at 8 PM
                                      await LocalNotifications.schedule({
                                          notifications: [{
                                              id: 1,
                                              title: "Reminder: Add Expenses",
                                              body: "Don't forget to track your spending today!",
                                              schedule: {
                                                 on: { hour: 20, minute: 0 },
                                                 repeats: true,
                                                 every: 'day'
                                              }
                                          }]
                                      })
                                      alert("Daily reminder set for 8:00 PM")
                                  } else {
                                      alert("Notifications permission denied")
                                      setNotifications((p) => ({ ...p, push_notifications: false }))
                                  }
                              } else {
                                  // Cancel reminder
                                  await LocalNotifications.cancel({ notifications: [{ id: 1 }] })
                              }
                          }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Weekly Reports with Send Now */}
                <div className="py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg">📊</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs lg:text-sm text-gray-800 dark:text-gray-200 font-medium block">Weekly reports</span>
                        <span className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 hidden lg:block">Sent every Monday</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={sendingWeekly}
                        onClick={async () => {
                          if (!user) return;
                          setSendingWeekly(true);
                          try {
                            const token = await user.getIdToken();
                            const response = await fetch('/api/notifications/send-on-demand', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify({ type: 'weekly_reports' })
                            });
                            const data = await response.json();
                            if (data.success) {
                              alert('Weekly report sent! Check your email.');
                            } else {
                              alert(data.message || 'Could not send report.');
                            }
                          } catch (e) {
                            alert('Failed to send report');
                          } finally {
                            setSendingWeekly(false);
                          }
                        }}
                        className="px-2 py-1 text-[10px] lg:text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium whitespace-nowrap disabled:opacity-50"
                      >
                        {sendingWeekly ? 'Sending...' : 'Send now'}
                      </button>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.weekly_reports}
                          onChange={(e) => {
                            setNotifications((p) => ({ ...p, weekly_reports: e.target.checked }))
                            markDirty()
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Monthly Analytics with Send Now */}
                <div className="py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg">📈</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs lg:text-sm text-gray-800 dark:text-gray-200 font-medium block">Monthly analytics</span>
                        <span className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 hidden lg:block">Sent 1st of each month</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={sendingAnalytics}
                        onClick={async () => {
                          if (!user) return;
                          setSendingAnalytics(true);
                          try {
                            const token = await user.getIdToken();
                            const response = await fetch('/api/notifications/send-on-demand', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify({ type: 'analytics' })
                            });
                            const data = await response.json();
                            if (data.success) {
                              alert('Analytics report sent! Check your email.');
                            } else {
                              alert(data.message || 'Could not send report.');
                            }
                          } catch (e) {
                            alert('Failed to send report');
                          } finally {
                            setSendingAnalytics(false);
                          }
                        }}
                        className="px-2 py-1 text-[10px] lg:text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium whitespace-nowrap disabled:opacity-50"
                      >
                        {sendingAnalytics ? 'Sending...' : 'Send now'}
                      </button>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.analytics}
                          onChange={(e) => {
                            setNotifications((p) => ({ ...p, analytics: e.target.checked }))
                            markDirty()
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Marketing */}
                <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🎉</span>
                    <span className="text-xs lg:text-sm text-gray-800 dark:text-gray-200 font-medium">Product updates</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifications.marketing}
                      onChange={(e) => {
                        setNotifications((p) => ({ ...p, marketing: e.target.checked }))
                        markDirty()
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 lg:p-6 border-2 border-red-100 dark:border-red-900">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 flex items-center justify-center">
                  <svg className="w-4 h-4 lg:w-5 lg:h-5 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
              </div>

              <div className="bg-red-50/50 dark:bg-red-900/20 rounded-xl p-3 lg:p-4">
                <div className="flex items-start lg:items-center justify-between gap-3 flex-col lg:flex-row">
                  <div>
                    <h3 className="text-xs lg:text-sm font-semibold text-gray-900 dark:text-white">Delete Account</h3>
                    <p className="text-[10px] lg:text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      Permanently delete all your data. Cannot be undone.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!user) return
                      if (!confirm('Are you sure you want to delete your account? This will permanently delete all your data and cannot be undone.')) return
                      if (!confirm('This is your last chance. Are you absolutely sure?')) return

                      const confirmation = prompt('Type DELETE to confirm:')
                      if (confirmation !== 'DELETE') {
                        alert('Account deletion cancelled.')
                        return
                      }

                      try {
                        const token = await user.getIdToken()
                        const response = await fetch('/api/delete-account', {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${token}`
                          }
                        })
                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({}))
                          throw new Error(errorData.error || 'Failed to delete account')
                        }
                        await signOut()
                        window.location.href = '/auth'
                      } catch (e) {
                        alert('Error: ' + (e instanceof Error ? e.message : 'Failed'))
                      }
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-xs lg:text-sm font-medium transition-all whitespace-nowrap"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <PinManagerModal 
          isOpen={pinModal.open} 
          mode={pinModal.mode} 
          onClose={() => setPinModal(p => ({ ...p, open: false }))} 
        />
      </Layout>
    </RequireAuth>
  )
}
