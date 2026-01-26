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
    SparklesIcon,
    CoinsIcon,
    MoonIcon,
    SunIcon,
    Globe,
    UploadIcon
} from 'lucide-react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/contexts/PreferencesContext'
import { CalcBrand } from '@/components/Logo'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import EnvironmentSwitcher from './EnvironmentSwitcher'

// Categorized navigation for desktop
const navigationGroups = [
    {
        name: 'Overview',
        items: [
            { name: 'Dashboard', href: '/', icon: HomeIcon },
            { name: 'Analytics', href: '/analytics', icon: BarChart3Icon },
        ]
    },
    {
        name: 'Transactions',
        items: [
            { name: 'Income', href: '/income', icon: CoinsIcon },
            { name: 'Expenses', href: '/expenses', icon: CreditCardIcon },
        ]
    },
    {
        name: 'Management',
        items: [
            { name: 'Accounts', href: '/accounts', icon: WalletIcon },
            { name: 'Budget', href: '/budget', icon: SparklesIcon },
            { name: 'Categories', href: '/categories', icon: TagIcon },
        ]
    },
    {
        name: 'Settings',
        items: [
            { name: 'Settings', href: '/settings', icon: SettingsIcon },
        ]
    }
]

// Full navigation for desktop (flat version for compatibility)
const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Income', href: '/income', icon: CoinsIcon },
    { name: 'Expenses', href: '/expenses', icon: CreditCardIcon },
    { name: 'Accounts', href: '/accounts', icon: WalletIcon },
    { name: 'Budget', href: '/budget', icon: SparklesIcon },
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
    const { darkMode, toggleDarkMode, currency: prefCurrency } = usePreferences()
    const { currentEnvironment, createEnvironment } = useEnvironment()

    // Create Environment Modal State
    const [showCreateEnv, setShowCreateEnv] = useState(false)
    const [newEnvName, setNewEnvName] = useState('')
    const [newEnvCurrency, setNewEnvCurrency] = useState('USD')
    const [newEnvCountry, setNewEnvCountry] = useState('')
    const [isCreatingEnv, setIsCreatingEnv] = useState(false)
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            Keyboard.addListener('keyboardDidShow', () => setIsKeyboardOpen(true))
            Keyboard.addListener('keyboardDidHide', () => setIsKeyboardOpen(false))
            // Clean up listener? Capacitor plugins listeners are often persistent or global, but good practice to remove if possible.
            // However, the removal API returns a promise, so we can ignore it for this simple usage or handle it properly.
            return () => {
                Keyboard.removeAllListeners()
            }
        }
    }, [])

    const handleCreateEnv = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsCreatingEnv(true)
        try {
            await createEnvironment(newEnvName, newEnvCurrency, newEnvCountry)
            setShowCreateEnv(false)
            setNewEnvName('')
            setNewEnvCountry('')
        } catch (err) {
            console.error(err)
            alert('Failed to create environment')
        } finally {
            setIsCreatingEnv(false)
        }
    }

    // Use props if provided, otherwise internal state
    const sidebarOpen = isOpen !== undefined ? isOpen : internalOpen
    const setSidebarOpen = setIsOpen || setInternalOpen

    useEffect(() => {
        setMounted(true)
        // Fetch version info
        fetch('/version.json')
            .then(res => res.json())
            .then(data => setAppVersion(data.version))
            .catch(() => { })
    }, [])

    // Sync default currency
    useEffect(() => {
        if (showCreateEnv && !newEnvCountry) {
            setNewEnvCurrency(currentEnvironment.currency || prefCurrency || 'USD')
        }
    }, [showCreateEnv, currentEnvironment.currency, prefCurrency])

    if (!mounted) {
        return (
            <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">

                <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-200">
                    <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
                        <div className="flex flex-shrink-0 items-center px-4 mb-6">
                            <div className="text-xl font-bold text-gray-900"><CalcBrand size={28} /></div>
                        </div>
                        {/* Environment Switcher Skeleton */}
                        <div className="px-3 mb-4 h-10 bg-gray-100 rounded animate-pulse"></div>
                        <nav className="mt-2 flex-1 space-y-1 px-2">
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
            {(!isKeyboardOpen || !Capacitor.isNativePlatform()) && (
            <div 
                className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white dark:bg-gray-800" 
                style={{ 
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
                    position: 'fixed',
                    willChange: 'transform',
                    transform: 'translateZ(0)',
                    WebkitTransform: 'translateZ(0)'
                }}
            >
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
                <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 relative transition-colors">
                    {/* Notch cutout effect */}
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-20 h-5 bg-white dark:bg-gray-800 rounded-t-full transition-colors"></div>

                    <nav className="flex items-center justify-around h-16 px-2 relative">
                        {bottomNavItems.slice(0, 2).map((item) => {
                            const isActive = router.pathname === item.href
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors ${isActive
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
                                    className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors ${isActive
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
                            className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors ${showMoreMenu || ['/settings', '/categories'].includes(router.pathname)
                                ? 'text-primary-600'
                                : 'text-gray-500 active:text-gray-700'
                                }`}
                        >
                            <MoreHorizontalIcon
                                className={`h-5 w-5 ${['/settings', '/categories'].includes(router.pathname) ? 'text-primary-600' : 'text-gray-400'
                                    }`}
                                strokeWidth={['/settings', '/categories'].includes(router.pathname) ? 2.5 : 2}
                            />
                            <span className={`text-[10px] mt-0.5 font-medium ${['/settings', '/categories'].includes(router.pathname) ? 'text-primary-600' : 'text-gray-500'
                                }`}>
                                More
                            </span>
                        </button>
                    </nav>
                </div>
            </div>
            )}

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
                            <Dialog.Panel className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl shadow-xl safe-area-bottom transition-colors">
                                {/* Drag handle */}
                                <div className="flex justify-center pt-3 pb-2">
                                    <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                                </div>

                                <div className="px-4 pb-6">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 px-2">Quick Actions</h3>

                                    {/* Transactions Section */}
                                    <div className="mb-3">
                                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-2">Transactions</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/income')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/10 dark:to-green-900/20 hover:from-green-100 hover:to-green-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                                                    <CoinsIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Income</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/expenses')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/10 dark:to-rose-900/20 hover:from-rose-100 hover:to-rose-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center">
                                                    <CreditCardIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Expenses</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/expenses?action=import')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/10 dark:to-blue-900/20 hover:from-blue-100 hover:to-blue-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                                                    <UploadIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Upload</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Management Section */}
                                    <div className="mb-3">
                                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-2">Management</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/accounts')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/10 dark:to-indigo-900/20 hover:from-indigo-100 hover:to-indigo-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center">
                                                    <WalletIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Accounts</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/budget')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/10 dark:to-purple-900/20 hover:from-purple-100 hover:to-purple-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center">
                                                    <SparklesIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Budget</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/categories')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/10 dark:to-pink-900/20 hover:from-pink-100 hover:to-pink-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center">
                                                    <TagIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Categories</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tools Section */}
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-2">Tools</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/expenses?action=export')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/10 dark:to-teal-900/20 hover:from-teal-100 hover:to-teal-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center">
                                                    <DownloadIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Export</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setShowQuickActions(false)
                                                    router.push('/settings')
                                                }}
                                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 hover:from-gray-100 hover:to-gray-200 active:scale-95 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center">
                                                    <SettingsIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Settings</span>
                                            </button>
                                        </div>
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
                            <Dialog.Panel className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl shadow-xl safe-area-bottom transition-colors">
                                {/* Drag handle */}
                                <div className="flex justify-center pt-3 pb-2">
                                    <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                                </div>

                                <div className="px-4 pb-4">
                                    {/* User info */}
                                    <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl transition-colors">
                                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                                            <span className="text-primary-600 font-semibold text-sm">
                                                {user?.email?.charAt(0).toUpperCase() || 'U'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.email || 'User'}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Manage your account</p>
                                        </div>
                                    </div>

                                    {/* Environment Switcher */}
                                    <div className="mb-4">
                                        <EnvironmentSwitcher onNewClick={() => {
                                            setShowMoreMenu(false)
                                            setShowCreateEnv(true)
                                        }} />
                                    </div>

                                    {/* Menu items */}
                                    <div className="space-y-1">
                                        <Link
                                            href="/income"
                                            onClick={() => setShowMoreMenu(false)}
                                            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${router.pathname === '/income'
                                                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600'
                                                }`}
                                        >
                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${router.pathname === '/income' ? 'bg-primary-100' : 'bg-gray-100'
                                                }`}>
                                                <CoinsIcon className={`h-5 w-5 ${router.pathname === '/income' ? 'text-primary-600' : 'text-gray-600'
                                                    }`} />
                                            </div>
                                            <span className="font-medium">Income</span>
                                        </Link>

                                        <button
                                            onClick={() => {
                                                setShowMoreMenu(false)
                                                router.push('/expenses?action=import')
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
                                        >
                                            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                                <UploadIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <span className="font-medium">Upload File</span>
                                        </button>

                                        <Link
                                            href="/categories"
                                            onClick={() => setShowMoreMenu(false)}
                                            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${router.pathname === '/categories'
                                                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600'
                                                }`}
                                        >
                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${router.pathname === '/categories' ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-gray-100 dark:bg-gray-700'
                                                }`}>
                                                <TagIcon className={`h-5 w-5 ${router.pathname === '/categories' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}
                          }`} />
                                            </div>
                                            <span className="font-medium">Categories</span>
                                        </Link>

                                        <Link
                                            href="/settings"
                                            onClick={() => setShowMoreMenu(false)}
                                            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${router.pathname === '/settings'
                                                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600'
                                                }`}
                                        >
                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${router.pathname === '/settings' ? 'bg-primary-100 dark:bg-primary-900/50' : 'bg-gray-100 dark:bg-gray-700'
                                                }`}>
                                                <SettingsIcon className={`h-5 w-5 ${router.pathname === '/settings' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}
                          }`} />
                                            </div>
                                            <span className="font-medium">Settings</span>
                                        </Link>

                                        {!Capacitor.isNativePlatform() && (
                                            <button
                                                onClick={() => { setShowDownloadModal(true); setShowMoreMenu(false) }}
                                                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
                                            >
                                                <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                                    <SmartphoneIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                </div>
                                                <span className="font-medium">Get Android App</span>
                                            </button>
                                        )}

                                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />



                                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />

                                        <button
                                            onClick={async () => {
                                                await signOut();
                                                router.replace('/auth');
                                                setShowMoreMenu(false)
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30 transition-colors"
                                        >
                                            <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                                <LogOutIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
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
            <div className="sticky top-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] shrink-0 items-center justify-center border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md px-4 lg:hidden transition-colors">
                <div className="flex items-center">
                    <CalcBrand size={26} />
                </div>
            </div>
            <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
                <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-colors">
                    <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar pt-4 pb-2">
                        <div className="flex flex-shrink-0 items-center px-4 mb-4">
                            <div className="text-xl font-bold text-gray-900 dark:text-white"><CalcBrand size={26} /></div>
                        </div>

                        <EnvironmentSwitcher onNewClick={() => setShowCreateEnv(true)} />

                        <nav className="mt-2 flex-1 px-2 space-y-4">
                            {navigationGroups.map((group) => (
                                <div key={group.name}>
                                    <h3 className="px-3 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
                                        {group.name}
                                    </h3>
                                    <div className="space-y-1">
                                        {group.items.map((item) => {
                                            const isActive = router.pathname === item.href
                                            return (
                                                <div key={item.name}>
                                                    <Link
                                                        href={item.href}
                                                        className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isActive
                                                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                                                            }`}
                                                    >
                                                        <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'}`} />
                                                        {item.name}
                                                        {isActive && (
                                                            <div className="ml-auto w-1 h-5 bg-primary-600 rounded-full" />
                                                        )}
                                                    </Link>
                                                    {/* Add Upload File submenu for Expenses */}
                                                    {item.name === 'Expenses' && isActive && (
                                                        <button
                                                            onClick={() => router.push('/expenses?action=import')}
                                                            className="group flex items-center px-3 py-2 pl-11 text-sm font-medium rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                                                        >
                                                            <UploadIcon className="mr-3 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400" />
                                                            Upload File
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {group.name === 'Settings' && !Capacitor.isNativePlatform() && (
                                            <button
                                                onClick={() => setShowDownloadModal(true)}
                                                className="w-full group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                                            >
                                                <SmartphoneIcon className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400" />
                                                Get Android App
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </nav>
                        <div className="mt-auto px-4 py-2 border-t border-gray-100 dark:border-gray-700">


                            <button
                                onClick={async () => { await signOut(); router.replace('/auth') }}
                                className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md py-2"
                            >
                                <LogOutIcon className="h-4 w-4" /> Sign out
                            </button>
                            {user && <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>}
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
            {/* Create Environment Modal - Global */}
            <Transition appear show={showCreateEnv} as={Fragment}>
                <Dialog as="div" className="relative z-[100]" onClose={() => setShowCreateEnv(false)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
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
                                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-3xl bg-white dark:bg-gray-800 p-6 lg:p-8 text-left align-middle shadow-2xl border-none transition-all">
                                    <Dialog.Title
                                        as="h3"
                                        className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-6"
                                    >
                                        <Globe className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                                        Create New Environment
                                    </Dialog.Title>
                                    <form onSubmit={handleCreateEnv} className="space-y-6">
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Environment Name</label>
                                            <input
                                                type="text"
                                                required
                                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium placeholder:text-gray-300 dark:placeholder:text-gray-700"
                                                placeholder="e.g. Canada Trip, Business"
                                                value={newEnvName}
                                                onChange={e => setNewEnvName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Country</label>
                                            <select
                                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                                                value={newEnvCountry}
                                                onChange={e => {
                                                    const val = e.target.value
                                                    setNewEnvCountry(val)
                                                    // Auto set currency based on country
                                                    if (val === 'Canada') setNewEnvCurrency('CAD')
                                                    else if (val === 'India') setNewEnvCurrency('INR')
                                                    else if (val === 'USA') setNewEnvCurrency('USD')
                                                    else if (val === 'UK') setNewEnvCurrency('GBP')
                                                    else if (val === 'Europe') setNewEnvCurrency('EUR')
                                                }}
                                            >
                                                <option value="">Select Country...</option>
                                                <option value="Canada">🇨🇦 Canada</option>
                                                <option value="India">🇮🇳 India</option>
                                                <option value="USA">🇺🇸 USA</option>
                                                <option value="UK">🇬🇧 UK</option>
                                                <option value="Europe">🇪🇺 Europe</option>
                                                <option value="Other">🌐 Other</option>
                                            </select>
                                        </div>

                                        {newEnvCountry && (
                                            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-xl p-3.5 space-y-2">
                                                <div className="flex justify-between items-center text-[10px] lg:text-xs">
                                                    <span className="text-primary-600 dark:text-primary-400 font-bold uppercase tracking-wider">Currency:</span>
                                                    <span className="text-primary-900 dark:text-white font-black px-2 py-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-primary-100 dark:border-primary-800">{newEnvCurrency}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] lg:text-xs">
                                                    <span className="text-primary-600 dark:text-primary-400 font-bold uppercase tracking-wider">Time Zone:</span>
                                                    <span className="text-primary-900 dark:text-white font-black px-2 py-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-primary-100 dark:border-primary-800">
                                                        {newEnvCountry === 'Canada' ? 'America/Toronto' :
                                                            newEnvCountry === 'India' ? 'Asia/Kolkata' :
                                                                newEnvCountry === 'USA' ? 'America/New_York' :
                                                                    newEnvCountry === 'UK' ? 'Europe/London' :
                                                                        newEnvCountry === 'Europe' ? 'Europe/Paris' : 'UTC'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Override Currency (Optional)</label>
                                            <select
                                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                                                value={newEnvCurrency}
                                                onChange={e => setNewEnvCurrency(e.target.value)}
                                            >
                                                <option value="USD">USD - US Dollar</option>
                                                <option value="CAD">CAD - Canadian Dollar</option>
                                                <option value="INR">INR - Indian Rupee</option>
                                                <option value="EUR">EUR - Euro</option>
                                                <option value="GBP">GBP - British Pound</option>
                                                <option value="AUD">AUD - Australian Dollar</option>
                                                <option value="JPY">JPY - Japanese Yen</option>
                                            </select>
                                        </div>

                                        <div className="mt-8 flex flex-col-reverse lg:grid lg:grid-cols-2 gap-3 pb-2">
                                            <button
                                                type="button"
                                                className="w-full justify-center rounded-xl bg-gray-100 dark:bg-gray-700 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                                                onClick={() => setShowCreateEnv(false)}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isCreatingEnv}
                                                className="w-full justify-center rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/20 hover:from-primary-700 hover:to-primary-800 transition-all active:scale-[0.98] disabled:opacity-50"
                                            >
                                                {isCreatingEnv ? 'Creating...' : 'Create Workspace'}
                                            </button>
                                        </div>
                                    </form>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    )
}
