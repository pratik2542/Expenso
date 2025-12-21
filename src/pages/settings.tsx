import Head from 'next/head'
import { useState, useEffect, useCallback } from 'react'
import Layout from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { UserIcon } from 'lucide-react'
import { db } from '@/lib/firebaseClient'
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/contexts/PreferencesContext'

export default function Settings() {
  const { user, signOut } = useAuth()
  const { refetch: refetchPrefs, currency: currentPrefCurrency, convertExistingData, updatePrefs } = usePreferences()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)
  const [originalCurrency, setOriginalCurrency] = useState<string>('')
  const [settings, setSettings] = useState({
    full_name: '',
    email: '', // derived from auth user; not persisted here
    email_notifications: true,
    push_notifications: false,
    weekly_reports: false,
    analytics: false,
    marketing: false,
  current_currency: 'INR',
  time_zone: 'UTC',
  })
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      // Load from user_settings using Firebase - query by user_id field
      const userSettingsRef = collection(db, 'user_settings')
      const q = query(userSettingsRef, where('user_id', '==', user.uid))
      const querySnapshot = await getDocs(q)
      const settingsRow = !querySnapshot.empty ? querySnapshot.docs[0].data() : null

      // Fallback: If no name in database, try to get from OAuth metadata
      let fullName = settingsRow?.full_name || ''
      if (!fullName) {
        // Try to get name from user metadata (OAuth providers)
        fullName = user.displayName || ''
        
        // If we found a name in metadata, save it to database
        if (fullName) {
          const newDocRef = doc(db, 'user_settings', user.uid)
          await setDoc(newDocRef, {
            user_id: user.uid,
            full_name: fullName,
            updated_at: new Date().toISOString()
          }, { merge: true })
        }
      }
      
      setSettings({
        full_name: fullName,
        email: settingsRow?.email || user.email || '',
        email_notifications: settingsRow?.email_notifications ?? true,
        push_notifications: settingsRow?.push_notifications ?? false,
        weekly_reports: settingsRow?.weekly_reports ?? false,
        analytics: settingsRow?.analytics ?? false,
        marketing: settingsRow?.marketing ?? false,
  current_currency: settingsRow?.current_currency || 'INR',
  time_zone: settingsRow?.time_zone || 'UTC',
      })
      
      // Store the original currency for comparison
      setOriginalCurrency(settingsRow?.current_currency || 'INR')

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load settings'
      console.error('Settings load error:', e)
      setError(msg)
    } finally {
      setLoading(false)
      setDirty(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  // Reset settings when user changes (logout/login)
  useEffect(() => {
    if (!user) {
      setSettings({
        full_name: '',
        email: '',
        email_notifications: true,
        push_notifications: false,
        weekly_reports: false,
        analytics: false,
        marketing: false,
        current_currency: 'INR',
        time_zone: 'UTC',
      })
      setDirty(false)
      setError(null)
    }
  }, [user])

  const markDirty = () => { if (!dirty) setDirty(true) }

  const handleCurrencyChange = (newCurrency: string) => {
    if (newCurrency === originalCurrency) {
      // Same as original stored currency; still apply to Preferences to ensure app reflects it
      setSettings((p) => ({ ...p, current_currency: newCurrency }))
      try {
        // Preserve existing choice for converting existing data
        updatePrefs({ currency: newCurrency })
      } catch (e) { /* noop */ }
      // Also refresh global preferences (no-op if unchanged)
      refetchPrefs()
      markDirty()
      return
    }
    
    // Show confirmation modal for currency change
    setPendingCurrency(newCurrency)
    setShowCurrencyModal(true)
  }
  
  const confirmCurrencyChange = async (convertExisting: boolean) => {
    if (!pendingCurrency) return
    
    setSettings((p) => ({ ...p, current_currency: pendingCurrency }))
    markDirty()
    
  // Store the user's choice about converting existing data
    try {
      const basePayload = {
        full_name: settings.full_name,
        email_notifications: settings.email_notifications,
        push_notifications: settings.push_notifications,
        weekly_reports: settings.weekly_reports,
        analytics: settings.analytics,
        marketing: settings.marketing,
        current_currency: pendingCurrency, // Use the new currency
        time_zone: settings.time_zone,
        updated_at: new Date().toISOString(),
        convert_existing_data: convertExisting
      }

      // Save to Firebase - find existing document by user_id and update it
      try {
        const userSettingsRef = collection(db, 'user_settings')
        const q = query(userSettingsRef, where('user_id', '==', user!.uid))
        const querySnapshot = await getDocs(q)
        
        if (!querySnapshot.empty) {
          // Update existing document
          const existingDocRef = querySnapshot.docs[0].ref
          await setDoc(existingDocRef, basePayload, { merge: true })
        } else {
          // Create new document with Firebase UID as document ID
          const newDocRef = doc(db, 'user_settings', user!.uid)
          await setDoc(newDocRef, { ...basePayload, user_id: user!.uid }, { merge: true })
        }
        console.log('Currency settings saved successfully')
      } catch (error: any) {
        console.warn('Failed to save currency change:', error)
        setError('Failed to save currency change: ' + error.message)
        // even if DB save failed, proceed with local update so UI reflects change
      }
      
      // Update the original currency so we don't show the modal again
      setOriginalCurrency(pendingCurrency)
      setDirty(false)
      
      // Update local settings state immediately to reflect the new currency
      setSettings(prev => ({
        ...prev,
        current_currency: pendingCurrency
      }))
      
      // Persist to localStorage & in-memory preferences immediately to reflect change without waiting on DB
      try {
        updatePrefs({ currency: pendingCurrency, convertExistingData: convertExisting })
      } catch (e) { console.warn('Settings: localStorage write failed', e) }

      // Refresh global preferences so currency/timezone update app-wide
      await refetchPrefs()
      
    } catch (e) {
      console.warn('Failed to save currency change:', e)
      setError('Failed to save currency change')
      return
    }
    
    setShowCurrencyModal(false)
    setPendingCurrency(null)
    
    // Show a message about the choice
    if (convertExisting) {
      setError('Currency changed to ' + pendingCurrency + '! All amounts will be converted to display in ' + pendingCurrency)
    } else {
      setError('Currency changed to ' + pendingCurrency + '! New transactions will use ' + pendingCurrency + '. Existing data remains in original currencies.')
    }
    setTimeout(() => setError(null), 4000)
  }

  const saveAll = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        full_name: settings.full_name,
        email: user.email || '',
        email_notifications: settings.email_notifications,
        push_notifications: settings.push_notifications,
        weekly_reports: settings.weekly_reports,
        analytics: settings.analytics,
        marketing: settings.marketing,
        current_currency: settings.current_currency,
        time_zone: settings.time_zone,
        updated_at: new Date().toISOString(),
      }

      // Save to Firebase - find existing document by user_id and update it
      const userSettingsRef = collection(db, 'user_settings')
      const q = query(userSettingsRef, where('user_id', '==', user.uid))
      const querySnapshot = await getDocs(q)
      
      if (!querySnapshot.empty) {
        // Update existing document
        const existingDocRef = querySnapshot.docs[0].ref
        await setDoc(existingDocRef, payload, { merge: true })
      } else {
        // Create new document with Firebase UID as document ID
        const newDocRef = doc(db, 'user_settings', user.uid)
        await setDoc(newDocRef, { ...payload, user_id: user.uid }, { merge: true })
      }

  setDirty(false)
  // refresh global preferences so currency/timezone update app-wide
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
              <button
                disabled={!dirty || saving}
                onClick={saveAll}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-all active:scale-[0.98] ${
                  dirty && !saving
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {saving ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Saving
                  </span>
                ) : 'Save'}
              </button>
            </div>
            {dirty && !saving && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-orange-600 bg-orange-50 px-2 py-1 rounded-lg w-fit">
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"/>
                Unsaved changes
              </div>
            )}
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:flex mb-8 items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
              <p className="text-gray-600 mt-2">Manage your account settings and preferences</p>
            </div>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs text-orange-600">Unsaved changes</span>}
              <button
                disabled={!dirty || saving}
                onClick={saveAll}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>

          {/* Error/Success Message */}
          {error && (
            <div className={`mb-4 lg:mb-6 text-xs lg:text-sm border rounded-xl p-3 lg:p-4 ${
              error.includes('successfully') 
                ? 'text-green-700 bg-green-50 border-green-200' 
                : 'text-red-700 bg-red-50 border-red-200'
            }`}>
              <p className="font-medium">{error}</p>
              {error.includes('Database tables missing') && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs">To fix this:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Open your <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Firebase Console</a></li>
                    <li>Go to "SQL Editor" tab</li>
                    <li>Copy the contents of <code className="bg-gray-100 px-1 rounded">COMPLETE_MIGRATION.sql</code> file</li>
                    <li>Paste and click "RUN"</li>
                    <li>Refresh this page</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="mb-4 lg:mb-6 flex items-center gap-2 text-xs text-gray-500">
              <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Loading settings...
            </div>
          )}

          <div className="space-y-3 lg:space-y-6">
            {/* Profile Settings */}
            <div className="bg-white rounded-2xl shadow-sm p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-4 lg:mb-6">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                  <UserIcon className="w-4 h-4 lg:w-5 lg:h-5 text-blue-600" />
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-gray-900">Profile</h2>
              </div>
            
              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-600 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={settings.full_name}
                    onChange={(e) => {
                      setSettings((p) => ({ ...p, full_name: e.target.value }))
                      markDirty()
                    }}
                    className="w-full px-3 py-2.5 lg:py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
                    placeholder="Enter your name"
                  />
                </div>

                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-600 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={settings.email}
                    disabled
                    className="w-full px-3 py-2.5 lg:py-2 text-sm border border-gray-200 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Regenerate Nickname */}
              <div className="mt-4 lg:mt-6 pt-4 lg:pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs lg:text-sm font-medium text-gray-700">Dashboard Nickname</label>
                    <p className="text-[10px] lg:text-xs text-gray-500 mt-0.5">Regenerate your AI 4-letter code</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!user) return
                      const confirmed = confirm('Regenerate your nickname? This will create a new 4-letter code.')
                      if (!confirmed) return
                      
                      try {
                        setLoading(true)
                        // Delete cached nickname from Firestore
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
                    className="px-3 lg:px-4 py-2 text-xs lg:text-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all active:scale-[0.98] shadow-md shadow-indigo-200 font-medium disabled:opacity-50 whitespace-nowrap"
                    disabled={loading}
                  >
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            </div>

            {/* Notification & Preferences */}
            <div className="bg-white rounded-2xl shadow-sm p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center">
                  <svg className="w-4 h-4 lg:w-5 lg:h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-gray-900">Notifications</h2>
              </div>

              <div className="space-y-2 lg:space-y-3">
                {/* Email Notifications Toggle */}
                <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📧</span>
                    <span className="text-xs lg:text-sm text-gray-800 font-medium">Email notifications</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.email_notifications}
                      onChange={(e) => {
                        setSettings((p) => ({ ...p, email_notifications: e.target.checked }))
                        markDirty()
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Push Notifications Toggle */}
                <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🔔</span>
                    <span className="text-xs lg:text-sm text-gray-800 font-medium">Push notifications</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.push_notifications}
                      onChange={(e) => {
                        setSettings((p) => ({ ...p, push_notifications: e.target.checked }))
                        markDirty()
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Weekly Reports Toggle with Send Now */}
                <div className="py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg">📊</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs lg:text-sm text-gray-800 font-medium block">Weekly reports</span>
                        <span className="text-[10px] lg:text-xs text-gray-500 hidden lg:block">Sent every Monday</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) return;
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
                              alert(data.message || 'Could not send report. Make sure notifications are enabled.');
                            }
                          } catch (e) {
                            console.error(e);
                            alert('Failed to send report');
                          }
                        }}
                        className="px-2 py-1 text-[10px] lg:text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium whitespace-nowrap"
                      >
                        Send now
                      </button>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.weekly_reports}
                          onChange={(e) => {
                            setSettings((p) => ({ ...p, weekly_reports: e.target.checked }))
                            markDirty()
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Analytics Toggle with Send Now */}
                <div className="py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg">📈</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs lg:text-sm text-gray-800 font-medium block">Monthly analytics</span>
                        <span className="text-[10px] lg:text-xs text-gray-500 hidden lg:block">Sent 1st of each month</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) return;
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
                              alert(data.message || 'Could not send report. Make sure notifications are enabled.');
                            }
                          } catch (e) {
                            console.error(e);
                            alert('Failed to send report');
                          }
                        }}
                        className="px-2 py-1 text-[10px] lg:text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium whitespace-nowrap"
                      >
                        Send now
                      </button>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.analytics}
                          onChange={(e) => {
                            setSettings((p) => ({ ...p, analytics: e.target.checked }))
                            markDirty()
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Marketing Toggle */}
                <div className="flex items-center justify-between py-2.5 lg:py-3 px-3 lg:px-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🎉</span>
                    <span className="text-xs lg:text-sm text-gray-800 font-medium">Product updates</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.marketing}
                      onChange={(e) => {
                        setSettings((p) => ({ ...p, marketing: e.target.checked }))
                        markDirty()
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Localization */}
            <div className="bg-white rounded-2xl shadow-sm p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 lg:w-5 lg:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-gray-900">Localization</h2>
              </div>

              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-600 mb-1.5">Currency</label>
                  <div className="relative">
                    <select
                      value={settings.current_currency}
                      onChange={(e) => handleCurrencyChange(e.target.value)}
                      className="w-full px-3 py-2.5 lg:py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors appearance-none pr-10"
                    >
                      <option value="USD">🇺🇸 USD - US Dollar</option>
                      <option value="EUR">🇪🇺 EUR - Euro</option>
                      <option value="GBP">🇬🇧 GBP - British Pound</option>
                      <option value="CAD">🇨🇦 CAD - Canadian Dollar</option>
                      <option value="AUD">🇦🇺 AUD - Australian Dollar</option>
                      <option value="INR">🇮🇳 INR - Indian Rupee</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  <button 
                    type="button"
                    onClick={async () => {
                      console.log('Manual refetch button clicked')
                      await refetchPrefs()
                    }}
                    className="mt-2 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    ↻ Refresh
                  </button>
                </div>
                <div>
                  <label className="block text-xs lg:text-sm font-medium text-gray-600 mb-1.5">Time Zone</label>
                  <div className="relative">
                    <select
                      value={settings.time_zone}
                      onChange={(e) => { setSettings((p) => ({ ...p, time_zone: e.target.value })); markDirty() }}
                      className="w-full px-3 py-2.5 lg:py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors appearance-none pr-10"
                    >
                      <option value="UTC">🌐 UTC</option>
                      <option value="America/New_York">🇺🇸 America/New_York</option>
                      <option value="America/Chicago">🇺🇸 America/Chicago</option>
                      <option value="America/Denver">🇺🇸 America/Denver</option>
                      <option value="America/Los_Angeles">🇺🇸 America/Los_Angeles</option>
                      <option value="America/Toronto">🇨🇦 Toronto (Eastern)</option>
                      <option value="America/Winnipeg">🇨🇦 Winnipeg (Central)</option>
                      <option value="America/Edmonton">🇨🇦 Edmonton (Mountain)</option>
                      <option value="America/Vancouver">🇨🇦 Vancouver (Pacific)</option>
                      <option value="America/Halifax">🇨🇦 Halifax (Atlantic)</option>
                      <option value="America/St_Johns">🇨🇦 St. Johns (Newfoundland)</option>
                      <option value="Europe/London">🇬🇧 Europe/London</option>
                      <option value="Europe/Paris">🇫🇷 Europe/Paris</option>
                      <option value="Asia/Kolkata">🇮🇳 Asia/Kolkata</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-2xl shadow-sm p-4 lg:p-6 border-2 border-red-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
                  <svg className="w-4 h-4 lg:w-5 lg:h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-sm lg:text-lg font-semibold text-red-600">Danger Zone</h2>
              </div>
              
              <div className="bg-red-50/50 rounded-xl p-3 lg:p-4">
                <div className="flex items-start lg:items-center justify-between gap-3 flex-col lg:flex-row">
                  <div>
                    <h3 className="text-xs lg:text-sm font-semibold text-gray-900">Delete Account</h3>
                    <p className="text-[10px] lg:text-xs text-gray-600 mt-0.5">
                      Permanently delete all your data. Cannot be undone.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure you want to delete your account? This will permanently delete all your data and cannot be undone.')) {
                        return
                      }
                      
                      if (!confirm('This is your last chance. Are you absolutely sure? Type DELETE in the next prompt to confirm.')) {
                        return
                      }
                      
                      const confirmation = prompt('Type DELETE to confirm account deletion:')
                      if (confirmation !== 'DELETE') {
                        alert('Account deletion cancelled.')
                        return
                      }
                      
                      try {
                        const response = await fetch('/api/delete-account', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                        })
                        
                        if (!response.ok) {
                          const error = await response.json()
                          throw new Error(error.error || 'Failed to delete account')
                        }
                        
                        // Sign out and redirect to auth page
                        await signOut()
                        window.location.href = '/auth'
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Failed to delete account'
                        alert('Error: ' + msg)
                      }
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-xs lg:text-sm font-medium transition-all active:scale-[0.98] whitespace-nowrap"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
      
      {/* Currency Change Confirmation Modal - Mobile Optimized */}
      {showCurrencyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end lg:items-center justify-center z-50">
          <div className="bg-white rounded-t-3xl lg:rounded-2xl p-5 lg:p-6 w-full lg:max-w-md lg:mx-4 max-h-[85vh] overflow-y-auto">
            {/* Modal Handle for mobile */}
            <div className="lg:hidden w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Change Currency to {pendingCurrency}?
            </h3>
            <p className="text-xs lg:text-sm text-gray-600 mb-5">
              Changing from <span className="font-semibold text-gray-800">{originalCurrency}</span> to <span className="font-semibold text-gray-800">{pendingCurrency}</span>. 
              What should happen to existing data?
            </p>
            
            <div className="space-y-3 mb-5">
              <button
                onClick={() => confirmCurrencyChange(true)}
                className="w-full text-left border-2 border-blue-200 bg-blue-50/50 rounded-xl p-3 lg:p-4 hover:border-blue-400 transition-colors active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✨</span>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900">Convert Everything</h4>
                    <p className="text-[10px] lg:text-xs text-gray-600 mt-0.5">
                      All amounts converted to {pendingCurrency}. <span className="text-blue-600 font-medium">Best for permanent moves.</span>
                    </p>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => confirmCurrencyChange(false)}
                className="w-full text-left border-2 border-green-200 bg-green-50/50 rounded-xl p-3 lg:p-4 hover:border-green-400 transition-colors active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900">Keep Mixed Currencies</h4>
                    <p className="text-[10px] lg:text-xs text-gray-600 mt-0.5">
                      Only new transactions use {pendingCurrency}. <span className="text-green-600 font-medium">Great for travel tracking.</span>
                    </p>
                  </div>
                </div>
              </button>
            </div>
            
            <button
              onClick={() => {
                setShowCurrencyModal(false)
                setPendingCurrency(null)
                // Reset currency to original
                setSettings((p) => ({ ...p, current_currency: originalCurrency }))
              }}
              className="w-full py-3 text-gray-500 hover:text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </RequireAuth>
  )
}


