import { Fragment, useState } from 'react'
import { Listbox, Dialog, Transition } from '@headlessui/react'
import { Check, ChevronDown, Plus, Globe } from 'lucide-react'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { Environment } from '@/types/models'

export default function EnvironmentSwitcher() {
    const { currentEnvironment, environments, switchEnvironment, createEnvironment } = useEnvironment()
    const [isOpen, setIsOpen] = useState(false)

    // Create Modal State
    const [showCreate, setShowCreate] = useState(false)
    const [newName, setNewName] = useState('')
    const [newCurrency, setNewCurrency] = useState('USD')
    const [newCountry, setNewCountry] = useState('')
    const [creating, setCreating] = useState(false)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)
        try {
            await createEnvironment(newName, newCurrency, newCountry)
            setShowCreate(false)
            setNewName('')
            setNewCountry('')
            // Optionally switch to it? The context doesn't auto-switch but we could
        } catch (err) {
            console.error(err)
            alert('Failed to create environment')
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="px-3 mb-4">
            <Listbox value={currentEnvironment} onChange={(env) => switchEnvironment(env.id)}>
                <div className="relative mt-1">
                    <Listbox.Button className="relative w-full cursor-pointer rounded-xl bg-gray-50 dark:bg-gray-700/50 py-2.5 pl-3 pr-10 text-left shadow-sm focus:outline-none transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <div>
                            <span className="block truncate font-bold text-gray-900 dark:text-white text-sm">{currentEnvironment.name}</span>
                            <span className="block truncate text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                                {currentEnvironment.id === 'default' ? 'Primary Workspace' : 'Shared Workspace'}
                            </span>
                        </div>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                        </span>
                    </Listbox.Button>
                    <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <Listbox.Options className="absolute mt-2 max-h-60 w-full overflow-auto rounded-2xl bg-white dark:bg-gray-800 py-2 text-base shadow-2xl ring-1 ring-black/5 dark:ring-white/10 focus:outline-none sm:text-sm z-50 transition-colors">
                            {environments.map((env) => (
                                <Listbox.Option
                                    key={env.id}
                                    className={({ active }) =>
                                        `relative cursor-default select-none py-3 pl-10 pr-4 transition-colors ${active ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-gray-100'
                                        }`
                                    }
                                    value={env}
                                >
                                    {({ selected }) => (
                                        <>
                                            <span
                                                className={`block truncate ${selected ? 'font-medium' : 'font-normal'
                                                    }`}
                                            >
                                                {env.name}
                                            </span>
                                            {selected ? (
                                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600">
                                                    <Check className="h-4 w-4" aria-hidden="true" />
                                                </span>
                                            ) : null}
                                        </>
                                    )}
                                </Listbox.Option>
                            ))}
                            <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
                                <button
                                    className="w-full text-left px-4 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 font-bold transition-all"
                                    onClick={() => setShowCreate(true)}
                                >
                                    <Plus className="w-4 h-4" />
                                    New Environment
                                </button>
                            </div>
                        </Listbox.Options>
                    </Transition>
                </div>
            </Listbox>

            {/* Create Modal */}
            <Transition appear show={showCreate} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setShowCreate(false)}>
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
                                    <form onSubmit={handleCreate} className="space-y-6">
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Environment Name</label>
                                            <input
                                                type="text"
                                                required
                                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium placeholder:text-gray-300 dark:placeholder:text-gray-700"
                                                placeholder="e.g. Canada Trip, Business"
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Country</label>
                                            <select
                                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                                                value={newCountry}
                                                onChange={e => {
                                                    const val = e.target.value
                                                    setNewCountry(val)
                                                    // Auto set currency based on country
                                                    if (val === 'Canada') setNewCurrency('CAD')
                                                    else if (val === 'India') setNewCurrency('INR')
                                                    else if (val === 'USA') setNewCurrency('USD')
                                                    else if (val === 'UK') setNewCurrency('GBP')
                                                    else if (val === 'Europe') setNewCurrency('EUR')
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

                                        {newCountry && (
                                            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-xl p-3.5 space-y-2">
                                                <div className="flex justify-between items-center text-[10px] lg:text-xs">
                                                    <span className="text-primary-600 dark:text-primary-400 font-bold uppercase tracking-wider">Currency:</span>
                                                    <span className="text-primary-900 dark:text-white font-black px-2 py-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-primary-100 dark:border-primary-800">{newCurrency}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] lg:text-xs">
                                                    <span className="text-primary-600 dark:text-primary-400 font-bold uppercase tracking-wider">Time Zone:</span>
                                                    <span className="text-primary-900 dark:text-white font-black px-2 py-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-primary-100 dark:border-primary-800">
                                                        {newCountry === 'Canada' ? 'America/Toronto' :
                                                            newCountry === 'India' ? 'Asia/Kolkata' :
                                                                newCountry === 'USA' ? 'America/New_York' :
                                                                    newCountry === 'UK' ? 'Europe/London' :
                                                                        newCountry === 'Europe' ? 'Europe/Paris' : 'UTC'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Override Currency (Optional)</label>
                                            <select
                                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                                                value={newCurrency}
                                                onChange={e => setNewCurrency(e.target.value)}
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
                                                onClick={() => setShowCreate(false)}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={creating}
                                                className="w-full justify-center rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/20 hover:from-primary-700 hover:to-primary-800 transition-all active:scale-[0.98] disabled:opacity-50"
                                            >
                                                {creating ? 'Creating...' : 'Create Workspace'}
                                            </button>
                                        </div>
                                    </form>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div >
    )
}
