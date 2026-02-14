import { ReactNode, useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import OnboardingWizard from './OnboardingWizard'
import UserGuideModal from './UserGuideModal'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useAuth } from '@/contexts/AuthContext'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth()
  const { hasOnboarded, loading: prefsLoading } = usePreferences()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showUserGuide, setShowUserGuide] = useState(false)

  // Onboarding Logic
  useEffect(() => {
    if (!prefsLoading && user && hasOnboarded === false) {
      setShowOnboarding(true)
    } else {
      setShowOnboarding(false)
    }
  }, [hasOnboarded, prefsLoading, user])

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

  const handleCloseGuide = () => {
      setShowUserGuide(false)
      localStorage.setItem('expenso_seen_guide_v1', 'true')
  }

  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

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
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <main className="lg:pl-64">
        <div 
          className="px-4 sm:px-6 lg:px-8 py-6 lg:pb-8"
          style={{ 
            paddingBottom: 'max(calc(8rem + env(safe-area-inset-bottom, 0px)), 8rem)',
            minHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8rem)'
          }}
        >
          {children}
        </div>
      </main>
      <OnboardingWizard open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <UserGuideModal isOpen={showUserGuide} onClose={handleCloseGuide} />
    </div>
  )
}
