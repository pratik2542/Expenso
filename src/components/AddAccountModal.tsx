import React, { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X, Check } from 'lucide-react'
import { Account, AccountType } from '@/types/models'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { addDoc, updateDoc, doc } from 'firebase/firestore'

// Simple bank suggestions based on currency/country
// In a real app, this would come from an API or a more comprehensive list
const BANK_SUGGESTIONS: Record<string, string[]> = {
    'CAD': ['TD Canada Trust', 'RBC Royal Bank', 'Scotiabank', 'BMO Bank of Montreal', 'CIBC', 'Tangerine', 'Simplii Financial', 'Wealthsimple'],
    'INR': ['HDFC Bank', 'SBI', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Paytm', 'PhonePe', 'Google Pay'],
    'USD': ['Chase', 'Bank of America', 'Wells Fargo', 'Citibank', 'Capital One', 'Goldman Sachs', 'Venmo', 'Cash App'],
    'EUR': ['Revolut', 'N26', 'Deutsche Bank', 'BNP Paribas', 'Santander', 'Wise'],
    'GBP': ['Barclays', 'HSBC', 'Lloyds Bank', 'NatWest', 'Monzo', 'Revolut', 'Starling Bank']
}

interface AddAccountModalProps {
    open: boolean
    onClose: () => void
    onAdded: () => void
    environmentCountry?: string // To help with suggestions
    mode?: 'add' | 'edit'
    account?: Account | null
}

export default function AddAccountModal({ open, onClose, onAdded, environmentCountry, mode = 'add', account = null }: AddAccountModalProps) {
    const { currentEnvironment, getCollection } = useEnvironment()
    const [formData, setFormData] = useState<{
        name: string
        type: AccountType
        balance: string
        currency: string
        color: string
    }>({
        name: '',
        type: 'Bank',
        balance: '0',
        currency: currentEnvironment.currency,
        color: 'bg-blue-500'
    })

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Initialize form when modal opens
    useEffect(() => {
        if (open) {
            if (mode === 'edit' && account) {
                setFormData({
                    name: account.name,
                    type: account.type,
                    balance: String(account.balance),
                    currency: account.currency,
                    color: account.color || 'bg-blue-500'
                })
            } else {
                setFormData({
                    name: '',
                    type: 'Bank',
                    balance: '0',
                    currency: currentEnvironment.currency,
                    color: 'bg-blue-500'
                })
            }
        }
    }, [open, mode, account, currentEnvironment.currency])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const accountsRef = getCollection('accounts')

            if (mode === 'edit' && account?.id) {
                // Update existing account
                const accountDocRef = doc(accountsRef, account.id)
                await updateDoc(accountDocRef, {
                    name: formData.name,
                    type: formData.type,
                    balance: parseFloat(formData.balance),
                    currency: formData.currency,
                    color: formData.color,
                    updated_at: new Date().toISOString()
                })
            } else {
                // Add new account
                await addDoc(accountsRef, {
                    name: formData.name,
                    type: formData.type,
                    balance: parseFloat(formData.balance),
                    currency: formData.currency,
                    color: formData.color,
                    created_at: new Date().toISOString()
                })
            }

            onAdded()
            onClose()
            // Reset form
            setFormData(prev => ({ ...prev, name: '', balance: '0' }))
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const suggestions = BANK_SUGGESTIONS[formData.currency] || []

    return (
        <Transition.Root show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-3xl bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-8">
                                <div className="absolute right-0 top-0 pr-6 pt-6 block">
                                    <button
                                        type="button"
                                        className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                                        onClick={onClose}
                                    >
                                        <X className="h-6 w-6" />
                                    </button>
                                </div>

                                <div className="w-full">
                                    <div className="text-left w-full">
                                        <Dialog.Title as="h3" className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mb-6">
                                            {mode === 'edit' ? 'Edit Account' : 'Add New Account'}
                                        </Dialog.Title>

                                        <form onSubmit={handleSubmit} className="space-y-6">
                                            {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-800 font-medium">{error}</div>}

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Currency</label>
                                                    <select
                                                        value={formData.currency}
                                                        onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                                        disabled={true}
                                                        className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <option value="USD">🇺🇸 USD</option>
                                                        <option value="EUR">🇪🇺 EUR</option>
                                                        <option value="GBP">🇬🇧 GBP</option>
                                                        <option value="CAD">🇨🇦 CAD</option>
                                                        <option value="INR">🇮🇳 INR</option>
                                                        <option value="AED">🇦🇪 AED</option>
                                                        <option value="AUD">🇦🇺 AUD</option>
                                                        <option value="JPY">🇯🇵 JPY</option>
                                                        <option value="SAR">🇸🇦 SAR</option>
                                                        <option value="QAR">🇶🇦 QAR</option>
                                                        <option value="SGD">🇸🇬 SGD</option>
                                                    </select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Account Type</label>
                                                    <select
                                                        value={formData.type}
                                                        onChange={e => setFormData({ ...formData, type: e.target.value as AccountType })}
                                                        className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                                                    >
                                                        <option value="Bank">Bank Account</option>
                                                        <option value="Credit Card">Credit Card</option>
                                                        <option value="Cash">Cash</option>
                                                        <option value="Mobile Money">Mobile Money</option>
                                                        <option value="Savings">Savings</option>
                                                        <option value="Investment">Investment</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Account Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={formData.name}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium placeholder:text-gray-300 dark:placeholder:text-gray-700"
                                                    placeholder="e.g. My Main Checkings"
                                                />
                                                {/* Suggestions */}
                                                {suggestions.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {suggestions.map(s => (
                                                            <button
                                                                key={s}
                                                                type="button"
                                                                onClick={() => setFormData({ ...formData, name: s })}
                                                                className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                                                            >
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-1">
                                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">{mode === 'edit' ? 'Balance' : 'Initial Balance'}</label>
                                                <div className="relative rounded-2xl shadow-sm overflow-hidden border-2 border-gray-100 dark:border-gray-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-all">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        required
                                                        value={formData.balance}
                                                        onChange={e => setFormData({ ...formData, balance: e.target.value })}
                                                        className="block w-full bg-gray-50 dark:bg-gray-900/50 dark:text-white pl-4 pr-12 py-4 text-3xl font-bold border-none focus:ring-0 placeholder:text-gray-300 dark:placeholder:text-gray-700"
                                                        placeholder="0.00"
                                                    />
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                                                        <span className="text-gray-400 font-semibold">{formData.currency}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-8 flex flex-col-reverse sm:grid sm:grid-cols-2 gap-3 pb-2">
                                                <button
                                                    type="button"
                                                    className="w-full justify-center rounded-xl bg-gray-100 dark:bg-gray-700 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                                                    onClick={onClose}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="w-full justify-center rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/20 hover:from-primary-700 hover:to-primary-800 transition-all active:scale-[0.98] disabled:opacity-50"
                                                >
                                                    {loading ? (mode === 'edit' ? 'Updating...' : 'Adding...') : (mode === 'edit' ? 'Update Account' : 'Add Account')}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
}
