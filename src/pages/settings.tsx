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
  console.log('Settings page - current preferences:', { currentPrefCurrency, convertExistingData })
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between gap-4">
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

          {error && (
            <div className={`mb-6 text-sm border rounded p-4 ${
              error.includes('successfully') 
                ? 'text-green-600 bg-green-50 border-green-200' 
                : 'text-red-600 bg-red-50 border-red-200'
            }`}>
              <p className="font-medium">{error}</p>
              {error.includes('Database tables missing') && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm">To fix this:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
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

          {loading && (
            <div className="mb-6 animate-pulse text-sm text-gray-500">Loading settings...</div>
          )}

          <div className="space-y-6">
            {/* Profile Settings */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center mb-6">
                <UserIcon className="w-5 h-5 text-gray-400 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
              </div>
            
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={settings.full_name}
                    onChange={(e) => {
                      setSettings((p) => ({ ...p, full_name: e.target.value }))
                      markDirty()
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={settings.email}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Notification & Preferences */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notifications & Preferences</h2>
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.email_notifications}
                    onChange={(e) => {
                      setSettings((p) => ({ ...p, email_notifications: e.target.checked }))
                      markDirty()
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-800">Email notifications</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.push_notifications}
                    onChange={(e) => {
                      setSettings((p) => ({ ...p, push_notifications: e.target.checked }))
                      markDirty()
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-800">Push notifications</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.weekly_reports}
                    onChange={(e) => {
                      setSettings((p) => ({ ...p, weekly_reports: e.target.checked }))
                      markDirty()
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-800">Weekly reports</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.analytics}
                    onChange={(e) => {
                      setSettings((p) => ({ ...p, analytics: e.target.checked }))
                      markDirty()
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-800">Analytics</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.marketing}
                    onChange={(e) => {
                      setSettings((p) => ({ ...p, marketing: e.target.checked }))
                      markDirty()
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-800">Marketing</span>
                </label>
              </div>
            </div>

            {/* Localization */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Localization</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Currency</label>
                  <select
                    value={settings.current_currency}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                    <option value="INR">INR</option>
                  </select>
                  <button 
                    type="button"
                    onClick={async () => {
                      console.log('Manual refetch button clicked')
                      await refetchPrefs()
                      console.log('Manual refetch completed')
                    }}
                    className="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                  >
                    Refresh Preferences
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Zone</label>
                  <select
                    value={settings.time_zone}
                    onChange={(e) => { setSettings((p) => ({ ...p, time_zone: e.target.value })); markDirty() }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Chicago">America/Chicago</option>
                    <option value="America/Denver">America/Denver</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    {/* Canada */}
                    <option value="America/Toronto">America/Toronto (Canada – Eastern)</option>
                    <option value="America/Winnipeg">America/Winnipeg (Canada – Central)</option>
                    <option value="America/Edmonton">America/Edmonton (Canada – Mountain)</option>
                    <option value="America/Vancouver">America/Vancouver (Canada – Pacific)</option>
                    <option value="America/Halifax">America/Halifax (Canada – Atlantic)</option>
                    <option value="America/St_Johns">America/St_Johns (Canada – Newfoundland)</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Europe/Paris">Europe/Paris</option>
                    {/* India */}
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-lg shadow p-6 border-2 border-red-200">
              <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
              <div className="bg-red-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete Account</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
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
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
      
      {/* Currency Change Confirmation Modal */}
      {showCurrencyModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Change Currency to {pendingCurrency}?
            </h3>
            <p className="text-gray-600 mb-6">
              You're changing your currency from <strong>{originalCurrency}</strong> to <strong>{pendingCurrency}</strong>. 
              What would you like to do with your existing data?
            </p>
            
            <div className="space-y-4 mb-6">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">
                  ✨ Convert Everything
                </h4>
                <p className="text-sm text-gray-600">
                  All existing amounts will be converted and displayed in {pendingCurrency} using current exchange rates. 
                  <span className="text-blue-600"> Recommended for permanent moves.</span>
                </p>
              </div>
              
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">
                  📊 Keep Mixed Currencies
                </h4>
                <p className="text-sm text-gray-600">
                  Existing transactions stay in their original currencies. Only new transactions will use {pendingCurrency}.
                  <span className="text-green-600"> Great for tracking expenses across different countries.</span>
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => confirmCurrencyChange(true)}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
              >
                Convert Everything
              </button>
              <button
                onClick={() => confirmCurrencyChange(false)}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium"
              >
                Keep Mixed
              </button>
            </div>
            
            <button
              onClick={() => {
                setShowCurrencyModal(false)
                setPendingCurrency(null)
                // Reset currency to original
                setSettings((p) => ({ ...p, current_currency: originalCurrency }))
              }}
              className="w-full mt-3 text-gray-500 hover:text-gray-700 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </RequireAuth>
  )
}

// Force dynamic rendering to avoid static caching
export async function getServerSideProps() {
  return { props: {} }
}
