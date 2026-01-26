import React, { useState, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Globe, Wallet, CheckCircle2, ChevronRight, UserCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { usePreferences } from '@/contexts/PreferencesContext'
import { db } from '@/lib/firebaseClient'
import { doc, setDoc } from 'firebase/firestore'

export default function OnboardingWizard({ open, onClose }: { open: boolean, onClose: () => void }) {
    const { user } = useAuth()
    const { provisionDefaults } = useEnvironment()
    const { refetch: refetchPrefs, darkMode, toggleDarkMode } = usePreferences()

    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)

    const [envName, setEnvName] = useState('Personal')
    const [country, setCountry] = useState('Canada')
    const [currency, setCurrency] = useState('CAD')
    const [timeZone, setTimeZone] = useState('America/Toronto')

    const countries = [
        { name: 'Canada', code: 'CAD', tz: 'America/Toronto', flag: '🇨🇦' },
        { name: 'India', code: 'INR', tz: 'Asia/Kolkata', flag: '🇮🇳' },
        { name: 'USA', code: 'USD', tz: 'America/New_York', flag: '🇺🇸' },
        { name: 'UK', code: 'GBP', tz: 'Europe/London', flag: '🇬🇧' },
        { name: 'Europe', code: 'EUR', tz: 'Europe/Paris', flag: '🇪🇺' },
        { name: 'Dubai', code: 'AED', tz: 'Asia/Dubai', flag: '🇦🇪' },
        { name: 'Australia', code: 'AUD', tz: 'Australia/Sydney', flag: '🇦🇺' },
    ]

    const handleCountryChange = (name: string) => {
        const c = countries.find(x => x.name === name)
        if (c) {
            setCountry(c.name)
            setCurrency(c.code)
            setTimeZone(c.tz)
        } else {
            setCountry(name)
        }
    }

    const handleFinish = async () => {
        if (!user) return
        setLoading(true)
        try {
            // 1. Create user settings (marks onboarding as done)
            const settingsRef = doc(db, 'user_settings', user.uid)
            await setDoc(settingsRef, {
                user_id: user.uid,
                default_env_name: envName,
                preferred_currency: currency,
                current_currency: currency,
                time_zone: timeZone,
                country: country,
                onboarded: true,
                created_at: new Date().toISOString()
            }, { merge: true })

            // 2. Provision default accounts & categories for the "default" env
            await provisionDefaults('default', currency)

            // 3. Refresh and close
            await refetchPrefs()
            onClose()
        } catch (err) {
            console.error('Onboarding failed:', err)
            alert('Something went wrong during setup')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-[100]" onClose={() => { }}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
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
                            <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-3xl bg-white dark:bg-gray-800 p-8 text-left align-middle shadow-2xl transition-all">

                                {/* Progress Indicator */}
                                <div className="flex gap-2 mb-8">
                                    {[1, 2, 3, 4].map(i => (
                                        <div
                                            key={i}
                                            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= i ? 'bg-primary-600' : 'bg-gray-100'}`}
                                        />
                                    ))}
                                </div>

                                {step === 1 && (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
                                            <UserCircle className="w-8 h-8 text-primary-600" />
                                        </div>
                                        <Dialog.Title as="h3" className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                                            Welcome to Expenso!
                                        </Dialog.Title>
                                        <p className="mt-2 text-gray-500 dark:text-gray-400">
                                            Let's personalize your experience. What should we call your primary workspace?
                                        </p>

                                        <div className="mt-8">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workspace Name</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-4 focus:ring-primary-100 focus:border-primary-500 transition-all text-lg dark:text-white"
                                                placeholder="e.g. Personal, My Home, Business"
                                                value={envName}
                                                onChange={e => setEnvName(e.target.value)}
                                                autoFocus
                                            />
                                            <p className="mt-3 text-xs text-gray-400">You can create more workspaces later for trips or business.</p>
                                        </div>

                                        <div className="mt-10 flex items-center justify-between">
                                            <button
                                                onClick={handleFinish}
                                                className="text-gray-400 font-medium hover:text-gray-600 transition-colors"
                                            >
                                                Skip and use defaults
                                            </button>
                                            <button
                                                onClick={() => setStep(2)}
                                                className="group flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-all shadow-lg hover:shadow-primary-200 hover:-translate-y-0.5"
                                            >
                                                Next Step
                                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 2 && (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                                        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                                            <Globe className="w-8 h-8 text-indigo-600" />
                                        </div>
                                        <Dialog.Title as="h3" className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                                            Regional Settings
                                        </Dialog.Title>
                                        <p className="mt-2 text-gray-500 dark:text-gray-400">
                                            Tell us where you are so we can set up your currency and time zone.
                                        </p>

                                        <div className="mt-8 space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Country</label>
                                                <select
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all dark:text-white"
                                                    value={country}
                                                    onChange={e => handleCountryChange(e.target.value)}
                                                >
                                                    {countries.map(c => (
                                                        <option key={c.name} value={c.name}>{c.flag} {c.name}</option>
                                                    ))}
                                                    <option value="Other">🌐 Other</option>
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 pt-2">
                                                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Currency</span>
                                                    <span className="text-lg font-bold text-gray-700 dark:text-gray-200">{currency}</span>
                                                </div>
                                                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Time Zone</span>
                                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate block">{timeZone}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-10 flex items-center justify-between">
                                            <button onClick={() => setStep(1)} className="text-gray-400 font-medium hover:text-gray-600 transition-colors">Go Back</button>
                                            <button
                                                onClick={() => setStep(3)}
                                                className="group flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-all shadow-lg hover:shadow-primary-200 hover:-translate-y-0.5"
                                            >
                                                Next Step
                                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 3 && (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-6">
                                            <SunIcon className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                        </div>
                                        <Dialog.Title as="h3" className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                                            Appearance
                                        </Dialog.Title>
                                        <p className="mt-2 text-gray-500 dark:text-gray-400">
                                            Choose your preferred theme. You can always change this later.
                                        </p>

                                        <div className="mt-8 grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => darkMode && toggleDarkMode()}
                                                className={`p-4 rounded-2xl border-2 transition-all text-left ${!darkMode ? 'border-primary-500 bg-primary-50' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                                            >
                                                <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 mb-3 flex items-center justify-center shadow-sm">
                                                    <div className="w-6 h-1 bg-gray-200 rounded-full mb-1" />
                                                    <div className="w-4 h-1 bg-gray-100 rounded-full" />
                                                </div>
                                                <span className={`font-bold ${!darkMode ? 'text-primary-900' : 'text-gray-500'}`}>Light Mode</span>
                                            </button>

                                            <button
                                                onClick={() => !darkMode && toggleDarkMode()}
                                                className={`p-4 rounded-2xl border-2 transition-all text-left ${darkMode ? 'border-primary-500 bg-primary-900/20' : 'border-gray-200 bg-white'}`}
                                            >
                                                <div className="w-10 h-10 bg-gray-900 rounded-lg border border-gray-800 mb-3 flex items-center justify-center shadow-sm">
                                                    <div className="w-6 h-1 bg-gray-700 rounded-full mb-1" />
                                                    <div className="w-4 h-1 bg-gray-800 rounded-full" />
                                                </div>
                                                <span className={`font-bold ${darkMode ? 'text-primary-100' : 'text-gray-500'}`}>Dark Mode</span>
                                            </button>
                                        </div>

                                        <div className="mt-10 flex items-center justify-between">
                                            <button onClick={() => setStep(2)} className="text-gray-400 font-medium hover:text-gray-600 transition-colors">Go Back</button>
                                            <button
                                                onClick={() => setStep(4)}
                                                className="group flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition-all shadow-lg hover:shadow-primary-200 hover:-translate-y-0.5"
                                            >
                                                Almost Done
                                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 4 && (
                                    <div className="animate-in fade-in zoom-in-95 duration-500">
                                        <div className="w-20 h-20 bg-green-50 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-8 mx-auto">
                                            <Wallet className="w-10 h-10 text-green-600 dark:text-green-400" />
                                        </div>
                                        <div className="text-center">
                                            <Dialog.Title as="h3" className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">
                                                Ready to launch!
                                            </Dialog.Title>
                                            <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                                                We'll pre-populate <b>{envName}</b> with common categories and accounts like <span className="text-primary-600 font-medium">Cash</span>, <span className="text-primary-600 font-medium">Card</span>, and <span className="text-primary-600 font-medium">Savings</span> to get you started.
                                            </p>
                                        </div>

                                        <div className="mt-10 space-y-3">
                                            <button
                                                disabled={loading}
                                                onClick={handleFinish}
                                                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:from-primary-700 hover:to-indigo-700 transition-all shadow-xl shadow-primary-200 disabled:opacity-50"
                                            >
                                                {loading ? (
                                                    <>
                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Setting everything up...
                                                    </>
                                                ) : (
                                                    <>
                                                        Get Started
                                                        <CheckCircle2 className="w-6 h-6" />
                                                    </>
                                                )}
                                            </button>
                                            <p className="text-center text-xs text-gray-400">You can customize all of this later in Settings.</p>
                                        </div>
                                    </div>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    )
}

function SunIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M22 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
        </svg>
    )
}
