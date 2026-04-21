import { ReactNode, useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import OnboardingWizard from './OnboardingWizard'
import UserGuideModal from './UserGuideModal'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useAuth } from '@/contexts/AuthContext'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { collection, getDocs, limit, orderBy, query, limitToLast } from 'firebase/firestore'

interface LayoutProps {
  children: ReactNode
}

function OfflineDataPrewarmer() {
  const { user } = useAuth()
  const { loading: prefsLoading, simpleMode, isOnline, hasOnboarded } = usePreferences()
  const { currentEnvironment, getCollection, environments } = useEnvironment()

  useEffect(() => {
    if (!user || !isOnline || !currentEnvironment?.id || hasOnboarded === false) return

    // Background pre-fetch of core user tables into Firestore IndexedDB cache
    // so they are fully available when dropping offline.
    const prewarmCache = async () => {
      try {
        // Fetch up to last 500 expenses logic securely to fill offline cache
        // For performance we don't await blocking UI
        getDocs(query(getCollection('expenses'), orderBy('occurred_on', 'desc'), limit(500))).catch(() => {})
        getDocs(getCollection('accounts')).catch(() => {})
        getDocs(getCollection('categories')).catch(() => {})
        getDocs(getCollection('budgets')).catch(() => {})
        
        // Also prewarm alternate environments just in case they switch offline
        if (environments && environments.length > 0) {
          environments.forEach(env => {
             if (env.id !== currentEnvironment.id) {
                const envAccounts = collection(getCollection('environments').parent!, env.id, 'accounts')
                const envCategories = collection(getCollection('environments').parent!, env.id, 'categories')
                getDocs(envAccounts).catch(()=>{})
                getDocs(envCategories).catch(()=>{})
             }
          })
        }
      } catch (err) {
        console.warn('Offline cache prewarm silent fail', err)
      }
    }

    // Delay the prewarm slightly so it doesn't block the main app load
    const timer = setTimeout(() => {
      prewarmCache()
    }, 3000)

    return () => clearTimeout(timer)
  }, [user, isOnline, currentEnvironment?.id, getCollection, hasOnboarded, environments])

  return null
}

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth()
  const { hasOnboarded, loading: prefsLoading, simpleMode, isOnline } = usePreferences()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showUserGuide, setShowUserGuide] = useState(false)
  const [showOfflineNotice, setShowOfflineNotice] = useState(false)

  // Onboarding Logic
  useEffect(() => {
    // Only show onboarding if we explicitly know they haven't onboarded AND they are online.
    // If they are offline, we shouldn't trap them in a setup wizard that can't save anyway.
    if (!prefsLoading && user && hasOnboarded === false && isOnline) {
      setShowOnboarding(true)
    } else {
      setShowOnboarding(false)
    }
  }, [hasOnboarded, prefsLoading, user, isOnline])

  // User Guide Logic - Show if onboarded AND not seen yet
  useEffect(() => {
    if (!prefsLoading && user && hasOnboarded === true) {
       const seenGuide = localStorage.getItem('expenso_seen_guide_v1')
       if (!seenGuide) {
           // Small delay to let UI settle if just finished onboarding
           const timer = setTimeout(() => {
               setShowUserGuide(true)
           }, 1000)
           return () => clearTimeout(timer)
       }
    }
  }, [hasOnboarded, prefsLoading, user])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!user) return

    if (!isOnline) {
      const shown = sessionStorage.getItem('expenso_offline_notice_shown')
      if (!shown && simpleMode) {
        setShowOfflineNotice(true)
        sessionStorage.setItem('expenso_offline_notice_shown', 'true')
      }
      return
    }

    sessionStorage.removeItem('expenso_offline_notice_shown')
    setShowOfflineNotice(false)
  }, [isOnline, simpleMode, user])

  const handleCloseGuide = () => {
      setShowUserGuide(false)
      localStorage.setItem('expenso_seen_guide_v1', 'true')
  }

  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  const [showOnlineBriefly, setShowOnlineBriefly] = useState(false)
  const [prevOnline, setPrevOnline] = useState(isOnline)
  const [isOfflineExpanded, setIsOfflineExpanded] = useState(true)

  useEffect(() => {
    if (!isOnline && isOfflineExpanded) {
      const t = setTimeout(() => setIsOfflineExpanded(false), 3000)
      return () => clearTimeout(t)
    }
  }, [isOnline, isOfflineExpanded])

  useEffect(() => {
    if (!prevOnline && isOnline) {
      setShowOnlineBriefly(true)
      const t = setTimeout(() => setShowOnlineBriefly(false), 3000)
      return () => clearTimeout(t)
    }
    setPrevOnline(isOnline)
  }, [isOnline, prevOnline])

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null) // Reset touch end
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    // Swipe Right (from left side) -> Open Sidebar
    // Only allow opening if swipe started near the left edge (e.g., first 50px)
    if (isRightSwipe && touchStart < 50) {
      setSidebarOpen(true)
    }

    // Swipe Left -> Close Sidebar (if open)
    // This is handled by the Sidebar backdrop usually, but we can add it here too
    if (isLeftSwipe && sidebarOpen) {
      setSidebarOpen(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <OfflineDataPrewarmer />
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      {/* Global Connection Status Chip */}
      {(!isOnline || showOnlineBriefly) && (
        <div className="fixed top-4 right-4 mt-[env(safe-area-inset-top,0px)] z-[100] pointer-events-auto transition-all duration-500 cursor-pointer">
          <div 
            onClick={() => !isOnline && setIsOfflineExpanded(true)}
            className={`h-9 shadow-lg flex items-center justify-center backdrop-blur-md border rounded-full transition-all duration-500 ease-in-out ${
            !isOnline 
              ? 'bg-amber-100/95 border-amber-300 text-amber-900 dark:bg-amber-900/95 dark:border-amber-700 dark:text-amber-200' 
              : 'bg-emerald-100/95 border-emerald-300 text-emerald-900 dark:bg-emerald-900/95 dark:border-emerald-700 dark:text-emerald-200'
            } ${(!isOnline && !isOfflineExpanded) ? 'w-9 px-0' : 'px-4'}`}
          >
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              {!isOnline ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              )}
            </span>
            <span 
              className={`text-xs font-semibold tracking-wide uppercase whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out ${
                (!isOnline && !isOfflineExpanded) ? 'max-w-0 opacity-0 ml-0' : 'max-w-[150px] opacity-100 ml-2'
              }`}
            >
              {!isOnline ? 'Offline Mode' : 'Data Synced'}
            </span>
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div 
          className="native-desktop-safe-main px-4 sm:px-6 lg:px-8 py-6 lg:pb-8"
          style={{ 
            paddingBottom: 'max(calc(8rem + env(safe-area-inset-bottom, 0px)), 8rem)',
            minHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8rem)'
          }}
        >
          {children}
        </div>
      </main>
      {showOfflineNotice && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowOfflineNotice(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Offline mode enabled</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Internet is not available, so the app switched to simple offline mode. You can manage and add expenses now, and everything will sync automatically when internet comes back.
            </p>
            <button
              onClick={() => setShowOfflineNotice(false)}
              className="w-full px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}
      <OnboardingWizard open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <UserGuideModal isOpen={showUserGuide} onClose={handleCloseGuide} />
    </div>
  )
}
