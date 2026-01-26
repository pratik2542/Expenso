import Head from 'next/head'
import React, { useMemo, useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { PlusIcon, EditIcon, TrashIcon, AlertTriangleIcon } from 'lucide-react'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RequireAuth } from '@/components/RequireAuth'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useEnvironment } from '@/contexts/EnvironmentContext'

interface Budget {
  id: string
  user_id: string
  month: number | null
  year: number
  currency: string
  amount: number
  per_category: boolean
  roll_over: boolean
  catagory_name?: string
  period?: 'monthly' | 'yearly'
  created_at?: string
  updated_at?: string
}

// Component to display amount in its original currency
function ConvertedAmount({ amount, currency, formatCurrencyExplicit }: {
  amount: number,
  currency: string,
  formatCurrencyExplicit: (amt: number, code: string) => string
}) {
  return <span>{formatCurrencyExplicit(amount, currency)}</span>
}

function getCurrencySymbol(currency: string) {
  if (currency === 'CAD') return 'CA$'
  try {
    return (0).toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\d/g, '').trim()
  } catch (e) {
    return currency
  }
}

// Format large numbers with K, M abbreviations for mobile
function formatCompactCurrency(amount: number, currency: string) {
  const absAmount = Math.abs(amount)
  const symbol = getCurrencySymbol(currency)
  const isNegative = amount < 0
  const sign = isNegative ? '-' : ''

  if (absAmount >= 1000000) {
    return `${sign}${symbol}${(absAmount / 1000000).toFixed(1)}M`
  } else if (absAmount >= 1000) {
    return `${sign}${symbol}${(absAmount / 1000).toFixed(1)}K`
  } else {
    return `${sign}${symbol}${absAmount.toFixed(2)}`
  }
}

export default function BudgetPage() {
  const { user } = useAuth()
  const { formatCurrency, formatCurrencyExplicit, currency: prefCurrency, loading: prefsLoading } = usePreferences()
  const { getCollection, currentEnvironment } = useEnvironment()
  const queryClient = useQueryClient()

  // budgets listing
  const { data: budgets = [], isLoading: loadingBudgets } = useQuery<Budget[]>({
    queryKey: ['budgets', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const budgetsRef = getCollection('budgets')
      try {
        const q = query(budgetsRef, orderBy('year', 'desc'), orderBy('month', 'desc'))
        const snapshot = await getDocs(q)
        return snapshot.docs.map(doc => ({
          id: doc.id,
          user_id: user.uid,
          ...doc.data()
        })) as Budget[]
      } catch (error) {
        try {
          const q = query(budgetsRef, orderBy('year', 'desc'))
          const snapshot = await getDocs(q)
          return snapshot.docs.map(doc => ({
            id: doc.id,
            user_id: user.uid,
            ...doc.data()
          })) as Budget[]
        } catch (fallbackError) {
          return []
        }
      }
    }
  })

  // Monthly spend agg
  const { data: monthlySpend = {} } = useQuery<Record<string, number>>({
    queryKey: ['monthly-spend', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return {}
      const expensesRef = getCollection('expenses')
      const snapshot = await getDocs(expensesRef)
      const agg: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data() as any
        const amount = Number(data.amount || 0)
        // Only include expenses (negative amounts or type='expense')
        const isExpense = data.type === 'expense' || (!data.type && amount < 0) || amount < 0
        if (!isExpense) return

        const d = new Date(data.occurred_on)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}|${data.currency}`
        agg[key] = (agg[key] || 0) + Math.abs(amount)
      })
      return agg
    }
  })

  // Monthly spend per category
  const { data: monthlyCategorySpend = {} } = useQuery<Record<string, number>>({
    queryKey: ['monthly-category-spend', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return {}
      const expensesRef = getCollection('expenses')
      const snapshot = await getDocs(expensesRef)
      const agg: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data() as any
        const amount = Number(data.amount || 0)
        // Only include expenses (negative amounts or type='expense')
        const isExpense = data.type === 'expense' || (!data.type && amount < 0) || amount < 0
        if (!isExpense) return

        const d = new Date(data.occurred_on)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}|${data.category}|${data.currency}`
        agg[key] = (agg[key] || 0) + Math.abs(amount)
      })
      return agg
    }
  })

  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const now = new Date()
  const [newBudget, setNewBudget] = useState<{
    month: number
    year: number
    currency: string
    amount: string
    per_category: boolean
    roll_over: boolean
    catagory_name: string
    period: 'monthly' | 'yearly'
  }>({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    currency: currentEnvironment.currency || prefCurrency || 'USD',
    amount: '',
    per_category: false,
    roll_over: false,
    catagory_name: '',
    period: 'monthly'
  })

  // Sync currency with currentEnvironment
  useEffect(() => {
    if (currentEnvironment.currency) {
      setNewBudget(prev => ({ ...prev, currency: currentEnvironment.currency }))
    }
  }, [currentEnvironment.currency])

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const [editBudget, setEditBudget] = useState<{
    month: number
    year: number
    currency: string
    amount: string
    per_category: boolean
    roll_over: boolean
    catagory_name: string
    period: 'monthly' | 'yearly'
  } | null>(null)

  // Removed redundant prefCurrency sync to avoid conflict with environment sync
  /*
  useEffect(() => {
    if (prefCurrency && newBudget.currency !== prefCurrency) {
      setNewBudget(prev => ({ ...prev, currency: prefCurrency }))
    }
  }, [prefCurrency])
  */

  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['categories', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = getCollection('categories')
      const q = query(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }))
    }
  })

  const mergedCategoryNames = useMemo(() => {
    const defaults = ['Food & Dining', 'Transportation', 'Shopping', 'Entertainment', 'Bills & Utilities', 'Healthcare', 'Travel', 'Groceries', 'Gas', 'Other']
    const names = new Set<string>(defaults)
    for (const c of categories) names.add(c.name)
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [categories])

  const getSpentForBudget = (b: Budget) => {
    if (b.period === 'yearly') {
      let total = 0
      if (b.catagory_name) {
        for (let m = 1; m <= 12; m++) {
          const key = `${b.year}-${String(m).padStart(2, '0')}|${b.catagory_name}|${b.currency}`
          total += monthlyCategorySpend[key] || 0
        }
      } else {
        for (let m = 1; m <= 12; m++) {
          const key = `${b.year}-${String(m).padStart(2, '0')}|${b.currency}`
          total += monthlySpend[key] || 0
        }
      }
      return total
    } else {
      const ym = `${b.year}-${String(b.month).padStart(2, '0')}`
      if (b.catagory_name) return monthlyCategorySpend[`${ym}|${b.catagory_name}|${b.currency}`] || 0
      return monthlySpend[`${ym}|${b.currency}`] || 0
    }
  }

  const uniqueBudgetCurrencies = Array.from(new Set(budgets.map(b => b.currency)))
  const singleCurrency = uniqueBudgetCurrencies.length === 1 ? uniqueBudgetCurrencies[0] : null
  const totalBudget = singleCurrency ? budgets.reduce((sum, b) => sum + Number(b.amount), 0) : 0
  const totalSpent = singleCurrency ? budgets.reduce((sum, b) => sum + getSpentForBudget(b), 0) : 0

  const getProgressPercentage = (spent: number, amount: number) => Math.min((spent / amount) * 100, 100)
  const getProgressColor = (spent: number, amount: number) => {
    const p = (spent / amount) * 100
    if (p >= 90) return 'bg-red-500'
    if (p >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSubmitError(null)
    if (!newBudget.catagory_name) { setSubmitError('Please select a category'); return }
    if (!newBudget.amount || isNaN(Number(newBudget.amount)) || Number(newBudget.amount) <= 0) { setSubmitError('Please enter a valid amount'); return }

    setSubmitting(true)
    try {
      const budgetsRef = getCollection('budgets')
      const payload = {
        month: newBudget.period === 'monthly' ? Number(newBudget.month) : null,
        year: Number(newBudget.year),
        currency: newBudget.currency,
        amount: parseFloat(newBudget.amount),
        per_category: newBudget.per_category,
        roll_over: newBudget.roll_over,
        catagory_name: newBudget.catagory_name || null,
        period: newBudget.period,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await addDoc(budgetsRef, payload)
      queryClient.invalidateQueries({ queryKey: ['budgets', user.uid, currentEnvironment.id] })
      setShowAddForm(false)
      setNewBudget({ ...newBudget, amount: '' })
    } catch (error: any) {
      setSubmitError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const deleteBudget = async (id: string) => {
    if (!user) return
    if (!window.confirm('Delete this budget?')) return
    try {
      await deleteDoc(doc(getCollection('budgets'), id))
      queryClient.invalidateQueries({ queryKey: ['budgets', user.uid, currentEnvironment.id] })
    } catch (error) {
      console.error(error)
    }
  }

  const openEdit = (b: Budget) => {
    setEditing(b)
    setEditError(null)
    setEditBudget({
      month: (b.month ?? 1),
      year: b.year,
      currency: b.currency || prefCurrency || 'USD',
      amount: String(b.amount ?? ''),
      per_category: !!b.per_category,
      roll_over: !!b.roll_over,
      catagory_name: b.catagory_name || '',
      period: (b.period as any) === 'yearly' ? 'yearly' : 'monthly'
    })
    setShowEditForm(true)
  }

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !editing || !editBudget) return
    setEditError(null)
    setUpdating(true)
    try {
      const payload = {
        month: editBudget.period === 'monthly' ? Number(editBudget.month) : null,
        year: Number(editBudget.year),
        currency: editBudget.currency,
        amount: parseFloat(editBudget.amount),
        per_category: editBudget.per_category,
        roll_over: editBudget.roll_over,
        catagory_name: editBudget.catagory_name || null,
        period: editBudget.period,
        updated_at: new Date().toISOString(),
      }
      await updateDoc(doc(getCollection('budgets'), editing.id), payload)
      queryClient.invalidateQueries({ queryKey: ['budgets', user.uid, currentEnvironment.id] })
      setShowEditForm(false)
    } catch (error: any) {
      setEditError(error.message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      <Head>
        <title>Budget - Expenso</title>
        <meta name="description" content="Set and track your spending budgets" />
      </Head>

      <RequireAuth>
        <Layout>
          <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-8">
            <div className="mb-4 lg:mb-8">
              <div className="lg:hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Budget</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Track spending limits</p>
                  </div>
                  <button onClick={() => setShowAddForm(true)} className="w-11 h-11 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center shadow-lg">
                    <PlusIcon className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              <div className="hidden lg:flex lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Budget</h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 text-sm sm:text-base">Set spending limits and track your progress</p>
                </div>
                <button onClick={() => setShowAddForm(true)} className="btn-primary inline-flex items-center justify-center w-full sm:w-auto">
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add Budget
                </button>
              </div>
            </div>

            <div className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0 mb-4 lg:mb-8">
              <div className="bg-gradient-to-br from-primary-50 to-indigo-100 dark:from-primary-900/20 dark:to-indigo-900/20 rounded-2xl p-4 lg:p-5 shadow-sm dark:shadow-gray-900/20">
                <p className="text-xs lg:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Budget</p>
                <p className="text-base lg:text-2xl font-bold text-gray-900 dark:text-white">
                  {singleCurrency ? <ConvertedAmount amount={totalBudget} currency={singleCurrency} formatCurrencyExplicit={formatCurrencyExplicit} /> : '—'}
                </p>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-4 lg:p-5 shadow-sm dark:shadow-gray-900/20">
                <p className="text-xs lg:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Spent</p>
                <p className="text-base lg:text-2xl font-bold text-gray-900 dark:text-white">
                  {singleCurrency ? <ConvertedAmount amount={totalSpent} currency={singleCurrency} formatCurrencyExplicit={formatCurrencyExplicit} /> : '—'}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-4 lg:p-5 shadow-sm dark:shadow-gray-900/20">
                <p className="text-xs lg:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Left</p>
                <p className="text-base lg:text-2xl font-bold text-gray-900 dark:text-white">
                  {singleCurrency ? <ConvertedAmount amount={totalBudget - totalSpent} currency={singleCurrency} formatCurrencyExplicit={formatCurrencyExplicit} /> : '—'}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 p-4 lg:card lg:!p-6">
              <h2 className="text-base lg:text-xl font-semibold text-gray-900 dark:text-white mb-4 lg:mb-6">Your Budgets</h2>
              <div className="space-y-3 lg:space-y-6">
                {!loadingBudgets && budgets.length === 0 && (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">No budgets yet. Create one to start tracking.</div>
                )}
                {budgets.map((budget) => {
                  const spent = getSpentForBudget(budget)
                  const percentage = getProgressPercentage(spent, Number(budget.amount))
                  const isOverBudget = spent > Number(budget.amount)

                  return (
                    <div key={budget.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {budget.catagory_name && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                                {budget.catagory_name}
                              </span>
                            )}
                            {isOverBudget && <AlertTriangleIcon className="w-4 h-4 text-red-500 dark:text-red-400" />}
                          </div>
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                            {budget.period === 'yearly' ? `Year ${budget.year}` : new Date(budget.year, (budget.month || 1) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" onClick={() => openEdit(budget)}><EditIcon className="w-4 h-4" /></button>
                          <button className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400" onClick={() => deleteBudget(budget.id)}><TrashIcon className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 mb-2">
                        <div className={`h-2.5 rounded-full transition-all ${getProgressColor(spent, Number(budget.amount))}`} style={{ width: `${percentage}%` }}></div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            <ConvertedAmount amount={spent} currency={budget.currency} formatCurrencyExplicit={formatCurrencyExplicit} />
                          </span> of <ConvertedAmount amount={Number(budget.amount)} currency={budget.currency} formatCurrencyExplicit={formatCurrencyExplicit} />
                        </span>
                        <span className={`font-medium ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>{percentage.toFixed(0)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Layout>

        {/* Add/Edit Modals would go here; simplified for now to fix the core issue */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 lg:p-8 w-full max-w-md shadow-2xl border-none transform transition-all">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">Add Budget</h2>
                <button onClick={() => setShowAddForm(false)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <PlusIcon className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleAddBudget} className="space-y-6">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Amount</label>
                  <div className="relative rounded-2xl shadow-sm overflow-hidden border-2 border-gray-100 dark:border-gray-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-all">
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newBudget.amount}
                      onChange={e => setNewBudget({ ...newBudget, amount: e.target.value })}
                      className="block w-full bg-gray-50 dark:bg-gray-900/50 dark:text-white pl-4 pr-12 py-4 text-3xl font-bold border-none focus:ring-0 placeholder:text-gray-300 dark:placeholder:text-gray-700"
                      placeholder="0.00"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <span className="text-gray-400 font-semibold">{newBudget.currency}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Category</label>
                  <select
                    value={newBudget.catagory_name}
                    onChange={e => setNewBudget({ ...newBudget, catagory_name: e.target.value })}
                    className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-3 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                  >
                    <option value="">Select Category</option>
                    {mergedCategoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {submitError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-800">
                    <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
                    <p className="font-medium">{submitError}</p>
                  </div>
                )}

                <div className="flex flex-col-reverse lg:grid lg:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="w-full justify-center rounded-xl bg-gray-100 dark:bg-gray-700 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full justify-center rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/20 hover:from-primary-700 hover:to-primary-800 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {submitting ? 'Adding...' : 'Add Budget'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showEditForm && editBudget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 lg:p-8 w-full max-w-md shadow-2xl border-none transform transition-all">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">Edit Budget</h2>
                <button onClick={() => setShowEditForm(false)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <PlusIcon className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleUpdateBudget} className="space-y-6">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Amount</label>
                  <div className="relative rounded-2xl shadow-sm overflow-hidden border-2 border-gray-100 dark:border-gray-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-all">
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editBudget.amount}
                      onChange={e => setEditBudget({ ...editBudget, amount: e.target.value })}
                      className="block w-full bg-gray-50 dark:bg-gray-900/50 dark:text-white pl-4 pr-12 py-4 text-3xl font-bold border-none focus:ring-0 placeholder:text-gray-300 dark:placeholder:text-gray-700"
                      placeholder="0.00"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <span className="text-gray-400 font-semibold">{editBudget.currency}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Category</label>
                  <select
                    disabled
                    value={editBudget.catagory_name}
                    className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-4 py-3 text-sm font-medium cursor-not-allowed"
                  >
                    <option value="">{editBudget.catagory_name || 'All Categories'}</option>
                  </select>
                  <p className="text-[10px] text-gray-400 ml-1">Category cannot be changed after creation.</p>
                </div>

                {editError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-800">
                    <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
                    <p className="font-medium">{editError}</p>
                  </div>
                )}

                <div className="flex flex-col-reverse lg:grid lg:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditForm(false)}
                    className="w-full justify-center rounded-xl bg-gray-100 dark:bg-gray-700 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updating}
                    className="w-full justify-center rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/20 hover:from-primary-700 hover:to-primary-800 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {updating ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </RequireAuth>
    </>
  )
}
