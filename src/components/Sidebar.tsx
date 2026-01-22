import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { 
  HomeIcon, 
  CreditCardIcon, 
  SettingsIcon,
  WalletIcon,
  LogOutIcon,
  TagIcon,
  BarChart3Icon,
  SmartphoneIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  FilterIcon,
  ChevronUpIcon,
  SparklesIcon
} from 'lucide-react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { CalcBrand } from '@/components/Logo'
import { Capacitor } from '@capacitor/core'

// Full navigation for desktop
const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Expenses', href: '/expenses', icon: CreditCardIcon },
  { name: 'Budget', href: '/budget', icon: WalletIcon },
  { name: 'Categories', href: '/categories', icon: TagIcon },
  { name: 'Analytics', href: '/analytics', icon: BarChart3Icon },
  { name: 'Settings', href: '/settings', icon: SettingsIcon },
]

// Bottom nav items for mobile (4 items for perfect symmetry with center button)
const bottomNavItems = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Expenses', href: '/expenses', icon: CreditCardIcon },
  { name: 'Analytics', href: '/analytics', icon: BarChart3Icon },
]

export default function Sidebar({ isOpen, setIsOpen }: { isOpen?: boolean, setIsOpen?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const { user, signOut } = useAuth()

  // Use props if provided, otherwise internal state
  const sidebarOpen = isOpen !== undefined ? isOpen : internalOpen
  const setSidebarOpen = setIsOpen || setInternalOpen

  useEffect(() => {
    setMounted(true)
    // Fetch version info
    fetch('/version.json')
      .then(res => res.json())
      .then(data => setAppVersion(data.version))
      .catch(() => {})
  }, [])

  if (!mounted) {
    return (
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-200">
          <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
            <div className="flex flex-shrink-0 items-center px-4">
              <div className="text-xl font-bold text-gray-900"><CalcBrand size={28} /></div>
            </div>
            <nav className="mt-8 flex-1 space-y-1 px-2">
              {navigation.map((item) => (
                <div key={item.name} className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600">
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </div>
              ))}
            </nav>
            <div className="px-4 py-4 border-t border-gray-100 text-xs text-gray-500">
              {user ? user.email : 'Not signed in'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile Bottom Navigation Bar with Center Quick Actions Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        {/* Quick Actions Button - Centered and elevated */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => setShowQuickActions(true)}
            className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 flex items-center justify-center ring-4 ring-white"
          >
            <ChevronUpIcon className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
        
        {/* Bottom Nav Bar with notch */}
        <div className="bg-white border-t border-gray-200 safe-area-bottom relative">
          {/* Notch cutout effect */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-20 h-5 bg-white rounded-t-full"></div>
          
          <nav className="flex items-center justify-around h-16 px-2 relative">
            {bottomNavItems.slice(0, 2).map((item) => {
              const isActive = router.pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors ${
                    isActive
                      ? 'text-primary-600'
                      : 'text-gray-500 active:text-gray-700'
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
                    {item.name}
                  </span>
                  {isActive && (
                    <div className="absolute top-0 w-12 h-0.5 bg-primary-600 rounded-full" />
                  )}
                </Link>
              )
            })}
            
            {/* Spacer for center button */}
            <div className="flex-1"></div>
            
            {bottomNavItems.slice(2).map((item) => {
              const isActive = router.pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors ${
                    isActive
                      ? 'text-primary-600'
                      : 'text-gray-500 active:text-gray-700'
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
                    {item.name}
                  </span>
                  {isActive && (
                    <div className="absolute top-0 w-12 h-0.5 bg-primary-600 rounded-full" />
                  )}
                </Link>
              )
            })}
          
          {/* More Menu Button */}
          <button
            onClick={() => setShowMoreMenu(true)}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors ${
              showMoreMenu || ['/settings', '/categories'].includes(router.pathname)
                ? 'text-primary-600'
                : 'text-gray-500 active:text-gray-700'
            }`}
          >
            <MoreHorizontalIcon 
              className={`h-5 w-5 ${
                ['/settings', '/categories'].includes(router.pathname) ? 'text-primary-600' : 'text-gray-400'
              }`} 
              strokeWidth={['/settings', '/categories'].includes(router.pathname) ? 2.5 : 2}
            />
            <span className={`text-[10px] mt-0.5 font-medium ${
              ['/settings', '/categories'].includes(router.pathname) ? 'text-primary-600' : 'text-gray-500'
            }`}>
              More
            </span>
          </button>
        </nav>
      </div>
      </div>

      {/* Quick Actions Menu Bottom Sheet */}
      <Transition appear show={showQuickActions} as={Fragment}>
        <Dialog as="div" className="relative z-[60] lg:hidden" onClose={() => setShowQuickActions(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 flex items-end justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="translate-y-full"
              enterTo="translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="translate-y-0"
              leaveTo="translate-y-full"
            >
              <Dialog.Panel className="w-full max-w-lg bg-white rounded-t-3xl shadow-xl safe-area-bottom">
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 bg-gray-300 rounded-full" />
                </div>
                
                <div className="px-4 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 px-2">Quick Actions</h3>
                  
                  {/* Action Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Add Expense */}
                    <button
                      onClick={() => {
                        setShowQuickActions(false)
                        router.push('/expenses?action=add')
                      }}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 active:scale-95 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                        <PlusIcon className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">Add Expense</span>
                    </button>

                    {/* Add Category */}
                    <button
                      onClick={() => {
                        setShowQuickActions(false)
                        router.push('/categories?action=add')
                      }}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 active:scale-95 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center">
                        <TagIcon className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">Add Category</span>
                    </button>

                    {/* Filter Expenses */}
                    <button
                      onClick={() => {
                        setShowQuickActions(false)
                        router.push('/expenses?action=filter')
                      }}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 active:scale-95 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                        <FilterIcon className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">Filter</span>
                    </button>

                    {/* AI Insights */}
                    <button
                      onClick={() => {
                        setShowQuickActions(false)
                        router.push('/')
                        setTimeout(() => {
                          const aiWidget = document.getElementById('ai-insights')
                          if (aiWidget) {
                            aiWidget.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          }
                        }, 100)
                      }}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 active:scale-95 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center">
                        <SparklesIcon className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">AI Insights</span>
                    </button>

                    {/* Budget */}
                    <button
                      onClick={() => {
                        setShowQuickActions(false)
                        router.push('/budget')
                      }}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-pink-50 to-pink-100 hover:from-pink-100 hover:to-pink-200 active:scale-95 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center">
                        <WalletIcon className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">Budget</span>
                    </button>

                    {/* Analytics */}
                    <button
                      onClick={() => {
                        setShowQuickActions(false)
                        router.push('/analytics')
                      }}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-cyan-50 to-cyan-100 hover:from-cyan-100 hover:to-cyan-200 active:scale-95 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center">
                        <BarChart3Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">Analytics</span>
                    </button>

                    {/* Export CSV */}
                    <button
                      onClick={() => {
                        setShowQuickActions(false)
                        router.push('/expenses?action=export')
                      }}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-100 hover:from-emerald-100 hover:to-green-200 active:scale-95 transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
                        <DownloadIcon className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">Export CSV</span>
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      {/* Mobile More Menu Bottom Sheet */}
      <Transition appear show={showMoreMenu} as={Fragment}>
        <Dialog as="div" className="relative z-[60] lg:hidden" onClose={() => setShowMoreMenu(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 flex items-end justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="translate-y-full"
              enterTo="translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="translate-y-0"
              leaveTo="translate-y-full"
            >
              <Dialog.Panel className="w-full max-w-lg bg-white rounded-t-3xl shadow-xl safe-area-bottom">
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 bg-gray-300 rounded-full" />
                </div>
                
                <div className="px-4 pb-4">
                  {/* User info */}
                  <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-primary-600 font-semibold text-sm">
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user?.email || 'User'}</p>
                      <p className="text-xs text-gray-500">Manage your account</p>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="space-y-1">
                    <Link
                      href="/categories"
                      onClick={() => setShowMoreMenu(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                        router.pathname === '/categories'
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        router.pathname === '/categories' ? 'bg-primary-100' : 'bg-gray-100'
                      }`}>
                        <TagIcon className={`h-5 w-5 ${
                          router.pathname === '/categories' ? 'text-primary-600' : 'text-gray-600'
                        }`} />
                      </div>
                      <span className="font-medium">Categories</span>
                    </Link>

                    <Link
                      href="/settings"
                      onClick={() => setShowMoreMenu(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                        router.pathname === '/settings'
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        router.pathname === '/settings' ? 'bg-primary-100' : 'bg-gray-100'
                      }`}>
                        <SettingsIcon className={`h-5 w-5 ${
                          router.pathname === '/settings' ? 'text-primary-600' : 'text-gray-600'
                        }`} />
                      </div>
                      <span className="font-medium">Settings</span>
                    </Link>

                    {!Capacitor.isNativePlatform() && (
                      <button
                        onClick={() => { setShowDownloadModal(true); setShowMoreMenu(false) }}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                          <SmartphoneIcon className="h-5 w-5 text-green-600" />
                        </div>
                        <span className="font-medium">Get Android App</span>
                      </button>
                    )}

                    <div className="h-px bg-gray-200 my-2" />

                    <button
                      onClick={async () => { 
                        await signOut(); 
                        router.replace('/auth'); 
                        setShowMoreMenu(false) 
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                        <LogOutIcon className="h-5 w-5 text-red-600" />
                      </div>
                      <span className="font-medium">Sign out</span>
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      {/* Mobile Header - Simplified */}
      <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-center border-b border-gray-200 bg-white/80 backdrop-blur-md px-4 lg:hidden">
        <div className="flex items-center">
          <CalcBrand size={26} />
        </div>
      </div>
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-200">
          <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
            <div className="flex flex-shrink-0 items-center px-4">
              <div className="text-xl font-bold text-gray-900"><CalcBrand size={28} /></div>
            </div>
            <nav className="mt-8 flex-1 space-y-1 px-2">
              {navigation.map((item) => {
                const isActive = router.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                    {item.name}
                  </Link>
                )
              })}
              <button
                onClick={() => setShowDownloadModal(true)}
                className={`w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900 ${Capacitor.isNativePlatform() ? 'hidden' : ''}`}
              >
                <SmartphoneIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                Get Android App
              </button>
            </nav>
            <div className="mt-auto px-4 py-4 border-t border-gray-100">
              <button
                onClick={async () => { await signOut(); router.replace('/auth') }}
                className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md py-2"
              >
                <LogOutIcon className="h-4 w-4" /> Sign out
              </button>
              {user && <p className="mt-2 text-xs text-gray-400 truncate">{user.email}</p>}
              {appVersion && (
                <p className="mt-1 text-[10px] text-gray-300 text-center">
                  v{appVersion}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Download App Modal */}
      <Transition appear show={showDownloadModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowDownloadModal(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 flex items-center gap-2"
                  >
                    <SmartphoneIcon className="h-6 w-6 text-primary-600" />
                    Download Android App
                  </Dialog.Title>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-4">
                      Get the full Expenso experience on your Android device. Download the APK file and install it manually.
                    </p>
                    
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Installation Instructions:</h4>
                      <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1">
                        <li>Download the APK file below</li>
                        <li>Open the file on your Android device</li>
                        <li>If prompted, allow installation from "Unknown Sources"</li>
                        <li>Tap "Install" and enjoy!</li>
                      </ol>
                    </div>

                    <a
                      href="/Expenso.apk"
                      download="Expenso.apk"
                      className="w-full flex justify-center items-center gap-2 rounded-md border border-transparent bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                    >
                      <DownloadIcon className="h-5 w-5" />
                      Download APK {appVersion ? `(v${appVersion})` : ''}
                    </a>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => setShowDownloadModal(false)}
                    >
                      Close
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
