import { Fragment, useState } from 'react'
import { Listbox, Dialog, Transition } from '@headlessui/react'
import { Check, ChevronDown, Plus, Globe } from 'lucide-react'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { Environment } from '@/types/models'

export default function EnvironmentSwitcher({ onNewClick }: { onNewClick?: () => void }) {
    const { currentEnvironment, environments, switchEnvironment } = useEnvironment()
    const [isOpen, setIsOpen] = useState(false)

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
                                    onClick={() => {
                                        if (onNewClick) onNewClick()
                                    }}
                                >
                                    <Plus className="w-4 h-4" />
                                    New Environment
                                </button>
                            </div>
                        </Listbox.Options>
                    </Transition>
                </div>
            </Listbox>
        </div >
    )
}
