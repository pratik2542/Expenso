import Head from 'next/head'
import React, { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, orderBy, doc, addDoc } from 'firebase/firestore'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { CoinsIcon, PlusIcon, CalendarIcon, HistoryIcon, TrendingUpIcon, WalletIcon } from 'lucide-react'

export default function IncomePage() {
    const { user } = useAuth()
    const { getCollection, currentEnvironment } = useEnvironment()
    const { formatCurrencyExplicit, formatDate, currency: prefCurrency } = usePreferences()
    const queryClient = useQueryClient()

    const getLocalToday = () => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const [formData, setFormData] = useState({
        date: getLocalToday(),
        amount: '',
        source: '',
        category: 'Salary',
        note: '',
        account_id: ''
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Load income categories
    const { data: categories = [] } = useQuery({
        queryKey: ['categories-income', user?.uid, currentEnvironment.id],
        enabled: !!user?.uid,
        queryFn: async () => {
            const categoriesRef = getCollection('categories')
            const snapshot = await getDocs(categoriesRef)
            return snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter((cat: any) => cat.type === 'income') as any[]
        }
    })

    // Load accounts
    const { data: accounts = [] } = useQuery({
        queryKey: ['accounts', user?.uid, currentEnvironment.id],
        enabled: !!user?.uid,
        queryFn: async () => {
            const accountsRef = getCollection('accounts')
            const snapshot = await getDocs(accountsRef)
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]
        }
    })

    // Load individual income transactions from expenses collection
    const { data: incomeTransactions = [], isLoading: loadingTransactions } = useQuery({
        queryKey: ['income-transactions', user?.uid, currentEnvironment.id],
        enabled: !!user?.uid,
        queryFn: async () => {
            const expensesRef = getCollection('expenses')
            const q = query(expensesRef, orderBy('occurred_on', 'desc'))
            const snapshot = await getDocs(q)
            // Filter for income transactions (only type='income')
            return snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .filter((item: any) => item.type === 'income') as any[]
        }
    })

    const handleSaveIncome = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return
        setError(null)
        setSuccess(null)

        const amt = Number(formData.amount)
        if (!amt || isNaN(amt) || amt <= 0) {
            setError('Please enter a valid income amount')
            return
        }

        if (!formData.source.trim()) {
            setError('Please enter an income source')
            return
        }

        setSaving(true)
        try {
            const { runTransaction } = await import('firebase/firestore')
            const currency = currentEnvironment.currency || prefCurrency || 'USD'

            await runTransaction(db, async (transaction) => {
                // If account is selected, update its balance
                if (formData.account_id) {
                    const accountRef = doc(getCollection('accounts'), formData.account_id)
                    const accountDoc = await transaction.get(accountRef)

                    if (accountDoc.exists()) {
                        const currentBalance = accountDoc.data().balance || 0
                        // Income is positive, adds to balance
                        transaction.update(accountRef, { balance: currentBalance + amt })
                    }
                }

                // Add income transaction
                const expensesRef = getCollection('expenses')
                const newIncomeRef = doc(expensesRef)
                transaction.set(newIncomeRef, {
                    amount: amt, // Store as positive for income
                    currency: currency,
                    merchant: formData.source,
                    payment_method: formData.account_id ? accounts.find(a => a.id === formData.account_id)?.name : null,
                    account_id: formData.account_id || null,
                    note: formData.note || '',
                    occurred_on: formData.date,
                    category: formData.category || 'Income',
                    type: 'income',
                    created_at: new Date().toISOString()
                })
            })

            setSuccess('Income added successfully!')
            setFormData({
                date: getLocalToday(),
                amount: '',
                source: '',
                category: 'Salary',
                note: '',
                account_id: ''
            })
            queryClient.invalidateQueries({ queryKey: ['income-transactions'] })
            queryClient.invalidateQueries({ queryKey: ['expenses'] })
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
        } catch (err: any) {
            setError(err.message || 'Failed to save income')
        } finally {
            setSaving(false)
        }
    }

    return (
        <RequireAuth>
            <Head>
                <title>Manage Income | Expenso</title>
            </Head>
            <Layout>
                <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-8">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 lg:mb-6">
                        <div>
                            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2 sm:gap-3">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/20 dark:shadow-green-900/40">
                                    <CoinsIcon className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                                </div>
                                Income Tracker
                            </h1>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 ml-12 sm:ml-16">Track and manage all your income sources</p>
                        </div>

                        {/* Quick Stats */}
                        <div className="hidden lg:flex items-center gap-3">
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
                                <p className="text-xs text-green-600 dark:text-green-400 font-medium">This Month</p>
                                <p className="text-base font-bold text-green-700 dark:text-green-400">
                                    {formatCurrencyExplicit(
                                        incomeTransactions
                                            .filter((t: any) => {
                                                const d = new Date(t.occurred_on)
                                                const now = new Date()
                                                return d.getMonth() === now.getMonth() &&
                                                    d.getFullYear() === now.getFullYear() &&
                                                    t.currency === (currentEnvironment.currency || prefCurrency)
                                            })
                                            .reduce((sum, t) => sum + Math.abs(t.amount), 0),
                                        currentEnvironment.currency || prefCurrency
                                    )}
                                </p>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2">
                                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Income</p>
                                <p className="text-base font-bold text-blue-700 dark:text-blue-400">
                                    {formatCurrencyExplicit(
                                        incomeTransactions
                                            .filter((t: any) => t.currency === (currentEnvironment.currency || prefCurrency))
                                            .reduce((sum, t) => sum + Math.abs(t.amount), 0),
                                        currentEnvironment.currency || prefCurrency
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                        {/* Left Column - Add Income Form */}
                        <div className="lg:col-span-1">
                            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 sticky top-6">
                                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                        <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                                    </div>
                                    <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Add Income</h2>
                                </div>

                                <form onSubmit={handleSaveIncome} className="space-y-4">
                                    {error && (
                                        <div className="p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-start gap-2">
                                            <span className="text-red-500 dark:text-red-400">⚠️</span>
                                            <span>{error}</span>
                                        </div>
                                    )}
                                    {success && (
                                        <div className="p-3 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 flex items-start gap-2">
                                            <span className="text-green-500 dark:text-green-400">✓</span>
                                            <span>{success}</span>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Amount *</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                                                <span className="text-gray-500 dark:text-gray-400 font-semibold text-sm sm:text-lg">{currentEnvironment.currency || prefCurrency}</span>
                                            </div>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.amount}
                                                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                                className="w-full pl-12 sm:pl-16 pr-3 sm:pr-4 py-2 sm:py-3 text-lg sm:text-xl font-bold border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                placeholder="0.00"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Source *</label>
                                        <input
                                            type="text"
                                            value={formData.source}
                                            onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                                            className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                            placeholder="e.g. ABC Company, Freelance Client"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
                                            <select
                                                value={formData.category}
                                                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                                className="w-full px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                            >
                                                {categories.length > 0 ? (
                                                    categories.map((cat: any) => (
                                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                                    ))
                                                ) : (
                                                    <>
                                                        <option value="Salary">Salary</option>
                                                        <option value="Business">Business</option>
                                                        <option value="Investments">Investments</option>
                                                        <option value="Rental">Rental</option>
                                                        <option value="Freelance">Freelance</option>
                                                        <option value="Gifts">Gifts</option>
                                                        <option value="Other">Other</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date</label>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                                className="w-full px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Account</label>
                                        <select
                                            value={formData.account_id}
                                            onChange={(e) => setFormData(prev => ({ ...prev, account_id: e.target.value }))}
                                            className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        >
                                            <option value="">No Account</option>
                                            {accounts.map((acc: any) => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Note</label>
                                        <textarea
                                            value={formData.note}
                                            onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                                            className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                                            rows={2}
                                            placeholder="Optional details..."
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-2.5 sm:py-3.5 rounded-xl shadow-lg shadow-green-500/20 dark:shadow-green-900/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
                                    >
                                        {saving ? (
                                            <>
                                                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                <span>Adding...</span>
                                            </>
                                        ) : (
                                            <>
                                                <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                                <span>Add Income</span>
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Right Column - Income History */}
                        <div className="lg:col-span-2">
                            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700 dark:to-gray-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <HistoryIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
                                            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Recent Income</h2>
                                        </div>
                                        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-medium">
                                            {incomeTransactions.length} transactions
                                        </span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    {loadingTransactions ? (
                                        <div className="p-20 flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 border-4 border-green-200 dark:border-green-800 border-t-green-600 dark:border-t-green-400 rounded-full animate-spin mb-4"></div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading income data...</p>
                                        </div>
                                    ) : incomeTransactions.length === 0 ? (
                                        <div className="p-20 text-center">
                                            <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <CoinsIcon className="w-10 h-10 text-green-300 dark:text-green-600" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No income yet</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Start tracking your income by adding your first transaction</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {incomeTransactions.map((transaction) => (
                                                <div key={transaction.id} className="px-3 sm:px-6 py-3 sm:py-4 hover:bg-green-50/30 dark:hover:bg-green-900/10 transition-colors group">
                                                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 sm:gap-3 mb-1">
                                                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 dark:bg-green-900/30 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                                                                    <span className="text-base sm:text-lg">💰</span>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">{transaction.merchant || 'Unknown'}</h3>
                                                                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
                                                                        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                                                            {transaction.category || 'Income'}
                                                                        </span>
                                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                            {formatDate(transaction.occurred_on)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {transaction.note && (
                                                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2 ml-10 sm:ml-13 line-clamp-2">{transaction.note}</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <p className="text-base sm:text-xl font-bold text-green-600 dark:text-green-400">
                                                                +{formatCurrencyExplicit(Math.abs(transaction.amount), transaction.currency)}
                                                            </p>
                                                            {transaction.payment_method && (
                                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">via {transaction.payment_method}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </RequireAuth>
    )
}
