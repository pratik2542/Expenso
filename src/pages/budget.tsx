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

// Component to display converted currency amount
function ConvertedAmount({ amount, fromCurrency, prefCurrency, formatCurrency, convertExistingData }: { 
  amount: number, 
  fromCurrency: string, 
  prefCurrency: string, 
  formatCurrency: (amt: number) => string,
  convertExistingData: boolean
}) {
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null)
  
  useEffect(() => {
    // If user chose not to convert existing data, show in original currency
    if (!convertExistingData && fromCurrency !== prefCurrency) {
      try {
        const formatted = new Intl.NumberFormat(undefined, { style: 'currency', currency: fromCurrency }).format(amount)
        setConvertedAmount(amount)
        return
      } catch {
        setConvertedAmount(amount)
        return
      }
    }
    
    if (fromCurrency === prefCurrency) {
      setConvertedAmount(amount)
      return
    }
    
    const convert = async () => {
      try {
        const resp = await fetch(`/api/fx/convert?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(prefCurrency)}`)
        if (!resp.ok) {
          setConvertedAmount(amount)
          return
        }
        const json = await resp.json()
        if (!json.success || !json.rate) {
          setConvertedAmount(amount)
          return
        }
        setConvertedAmount(amount * json.rate)
      } catch {
        setConvertedAmount(amount)
      }
    }
    
    convert()
  }, [amount, fromCurrency, prefCurrency, convertExistingData])
  
  if (convertedAmount === null) return <span>Loading...</span>
  
  // If user chose not to convert and currencies differ, show in original currency
  if (!convertExistingData && fromCurrency !== prefCurrency) {
    try {
      return <span>{new Intl.NumberFormat(undefined, { style: 'currency', currency: fromCurrency }).format(amount)}</span>
    } catch {
      return <span>{amount} {fromCurrency}</span>
    }
  }
  
  return <span>{formatCurrency(convertedAmount)}</span>
}

function getCurrencySymbol(currency: string) {
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
  const { formatCurrency, currency: prefCurrency, convertExistingData, loading: prefsLoading } = usePreferences()
  const queryClient = useQueryClient()
  
  console.log('BudgetPage - User:', user?.uid, 'Email:', user?.email, 'Loading:', !user)
  console.log('BudgetPage - Firebase config check:', {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 10) + '...',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  })
  
  // Check if user is signed in
  useEffect(() => {
    console.log('BudgetPage - Auth check:', {
      isSignedIn: !!user,
      userId: user?.uid,
      email: user?.email,
      provider: user?.providerData?.[0]?.providerId
    })
  }, [user])
  
  // Test export API - REMOVED: This was causing repeated API calls
  const { data: budgets = [], isLoading: loadingBudgets } = useQuery<Budget[]>({
    queryKey: ['budgets', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      console.log('Fetching budgets for user:', user.uid)
      const budgetsRef = collection(db, 'budgets', user.uid, 'items')
      console.log('Budgets collection path:', budgetsRef.path)
      try {
        // Try with composite index first
        const q = query(budgetsRef, orderBy('year', 'desc'), orderBy('month', 'desc'))
        const snapshot = await getDocs(q)
        console.log('Budgets snapshot:', snapshot.docs.length, 'documents')
        const budgets = snapshot.docs.map(doc => ({
          id: doc.id,
          user_id: user.uid,
          ...doc.data()
        })) as Budget[]
        console.log('Budgets data:', budgets)
        return budgets
      } catch (error) {
        console.error('Budgets query failed with composite index, trying single orderBy:', error)
        // Fallback to single orderBy if composite index doesn't exist
        try {
          const q = query(budgetsRef, orderBy('year', 'desc'))
          const snapshot = await getDocs(q)
          console.log('Budgets snapshot (fallback):', snapshot.docs.length, 'documents')
          const budgets = snapshot.docs.map(doc => ({
            id: doc.id,
            user_id: user.uid,
            ...doc.data()
          })) as Budget[]
          console.log('Budgets data (fallback):', budgets)
          return budgets
        } catch (fallbackError) {
          console.error('Budgets query failed completely:', fallbackError)
          return []
        }
      }
    }
  })
  // Monthly spend map keyed by 'YYYY-MM'
  const { data: monthlySpend = {} } = useQuery<Record<string, number>>({
    queryKey: ['monthly-spend', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return {}
      const expensesRef = collection(db, 'expenses', user.uid, 'items')
      const snapshot = await getDocs(expensesRef)
      const agg: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const d = new Date(data.occurred_on)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        agg[key] = (agg[key] || 0) + Number(data.amount)
      })
      return agg
    }
  })

  // Monthly spend per category keyed by 'YYYY-MM|Category'
  const { data: monthlyCategorySpend = {} } = useQuery<Record<string, number>>({
    queryKey: ['monthly-category-spend', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return {}
      const expensesRef = collection(db, 'expenses', user.uid, 'items')
      const snapshot = await getDocs(expensesRef)
      const agg: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const d = new Date(data.occurred_on)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}|${data.category}`
        agg[key] = (agg[key] || 0) + Number(data.amount)
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
  currency: 'INR',
    amount: '',
    per_category: false,
    roll_over: false,
  catagory_name: '',
  period: 'monthly'
  })
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

  // Keep the form currency aligned with user preference when opening the form or pref changes
  React.useEffect(() => {
    if (prefCurrency && newBudget.currency !== prefCurrency) {
      setNewBudget(prev => ({ ...prev, currency: prefCurrency }))
    }
  }, [prefCurrency])

  // Fetch available categories for selection
  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['categories', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = collection(db, 'categories', user.uid, 'items')
      const q = query(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }))
    }
  })

  // Default categories (same as AddExpenseModal)
  const defaultCategories = [
    'Food & Dining',
    'Transportation',
    'Shopping',
    'Entertainment',
    'Bills & Utilities',
    'Healthcare',
    'Travel',
    'Groceries',
    'Gas',
    'Other',
  ]

  // Merge DB categories with defaults for the Budget category picker
  const mergedCategoryNames = useMemo(() => {
    const names = new Set<string>(defaultCategories)
    for (const c of categories) names.add(c.name)
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [categories])

  const getSpentForBudget = (b: Budget) => {
    if (b.period === 'yearly') {
      // Sum all months in the year
      let total = 0
      if (b.catagory_name) {
        for (let m = 1; m <= 12; m++) {
          const key = `${b.year}-${String(m).padStart(2, '0')}|${b.catagory_name}`
          total += monthlyCategorySpend[key] || 0
        }
      } else {
        for (let m = 1; m <= 12; m++) {
          const key = `${b.year}-${String(m).padStart(2, '0')}`
          total += monthlySpend[key] || 0
        }
      }
      return total
    } else {
      const ym = `${b.year}-${String(b.month).padStart(2, '0')}`
      if (b.catagory_name) {
        return monthlyCategorySpend[`${ym}|${b.catagory_name}`] || 0
      }
      return monthlySpend[ym] || 0
    }
  }

  // For mixed currencies we won't aggregate meaningfully; detect if mixed.
  const uniqueBudgetCurrencies = Array.from(new Set(budgets.map(b => b.currency)))
  const singleCurrency = uniqueBudgetCurrencies.length === 1 ? uniqueBudgetCurrencies[0] : null
  const totalBudget = singleCurrency ? budgets.reduce((sum, b) => sum + Number(b.amount), 0) : 0
  const totalSpent = singleCurrency ? budgets.reduce((sum, b) => sum + getSpentForBudget(b), 0) : 0

  const getProgressPercentage = (spent: number, amount: number) => {
    return Math.min((spent / amount) * 100, 100)
  }

  const getProgressColor = (spent: number, amount: number) => {
    const percentage = (spent / amount) * 100
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSubmitError(null)
    // Basic client-side validation
  if (!newBudget.catagory_name) {
      setSubmitError('Please select a category')
      return
    }
    if (!newBudget.amount || isNaN(Number(newBudget.amount)) || Number(newBudget.amount) <= 0) {
      setSubmitError('Please enter a valid amount greater than 0')
      return
    }
    if (newBudget.period === 'monthly') {
      if (newBudget.month < 1 || newBudget.month > 12) {
        setSubmitError('Please select a valid month')
        return
      }
    }
    if (newBudget.year < 2000 || newBudget.year > 2100) {
      setSubmitError('Please enter a valid year')
      return
    }

    setSubmitting(true)

    // Pre-check for an existing budget for this user/month/year/category
    try {
      const budgetsRef = collection(db, 'budgets', user.uid, 'items')
      let q = query(
        budgetsRef,
        where('year', '==', Number(newBudget.year)),
        where('period', '==', newBudget.period)
      )

      if (newBudget.period === 'monthly') {
        q = query(q, where('month', '==', Number(newBudget.month)))
      }

      if (newBudget.catagory_name) {
        q = query(q, where('catagory_name', '==', newBudget.catagory_name))
      }

      const existing = await getDocs(q)
      if (!existing.empty) {
        const rangeLabel = newBudget.period === 'yearly'
          ? `${newBudget.year}`
          : `${new Date(0, newBudget.month - 1, 1).toLocaleString('en-US', { month: 'long' })} ${newBudget.year}`
        setSubmitError(newBudget.catagory_name
          ? `A budget for ${newBudget.catagory_name} already exists for ${rangeLabel}.`
          : `A global budget already exists for ${rangeLabel}.`)
        setSubmitting(false)
        return
      }
    } catch (err: any) {
      // Non-fatal; proceed but show a hint
      console.warn('Precheck failed', err?.message || err)
    }
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
    try {
      const budgetsRef = collection(db, 'budgets', user.uid, 'items')
      await addDoc(budgetsRef, payload)
      queryClient.invalidateQueries({ queryKey: ['budgets', user.uid] })
  setNewBudget({
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        currency: prefCurrency || 'USD',
        amount: '',
        per_category: false,
        roll_over: false,
        catagory_name: '',
        period: 'monthly'
      })
      setShowAddForm(false)
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to add budget')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteBudget = async (id: string) => {
    if (!user) return
    try {
      const budgetDocRef = doc(db, 'budgets', user.uid, 'items', id)
      await deleteDoc(budgetDocRef)
      queryClient.invalidateQueries({ queryKey: ['budgets', user.uid] })
    } catch (error) {
      console.error('Failed to delete budget:', error)
    }
  }

  const openEdit = (b: Budget) => {
    setEditing(b)
    setEditError(null)
    setEditBudget({
      month: (b.month ?? 1),
      year: b.year,
      currency: b.currency || prefCurrency || 'INR',
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

    // Validate
  if (!editBudget.catagory_name) {
      setEditError('Please select a category')
      return
    }
    if (!editBudget.amount || isNaN(Number(editBudget.amount)) || Number(editBudget.amount) <= 0) {
      setEditError('Please enter a valid amount greater than 0')
      return
    }
    if (editBudget.period === 'monthly') {
      if (editBudget.month < 1 || editBudget.month > 12) {
        setEditError('Please select a valid month')
        return
      }
    }
    if (editBudget.year < 2000 || editBudget.year > 2100) {
      setEditError('Please enter a valid year')
      return
    }

    setUpdating(true)
    // Duplicate check excluding the current budget id
    try {
      const budgetsRef = collection(db, 'budgets', user.uid, 'items')
      let q = query(
        budgetsRef,
        where('year', '==', Number(editBudget.year)),
        where('period', '==', editBudget.period)
      )

      if (editBudget.period === 'monthly') {
        q = query(q, where('month', '==', Number(editBudget.month)))
      }

      if (editBudget.catagory_name) {
        q = query(q, where('catagory_name', '==', editBudget.catagory_name))
      }

      const existing = await getDocs(q)
      // Check if any existing budget is NOT the current one we're editing
      const hasConflict = existing.docs.some(doc => doc.id !== editing.id)
      if (hasConflict) {
        const rangeLabel = editBudget.period === 'yearly'
          ? `${editBudget.year}`
          : `${new Date(0, editBudget.month - 1, 1).toLocaleString('en-US', { month: 'long' })} ${editBudget.year}`
        setEditError(`A budget for ${editBudget.catagory_name || 'this selection'} already exists for ${rangeLabel}.`)
        setUpdating(false)
        return
      }
    } catch (err: any) {
      console.warn('Edit precheck failed', err?.message || err)
    }

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

    try {
      const budgetDocRef = doc(db, 'budgets', user.uid, 'items', editing.id)
      await updateDoc(budgetDocRef, payload)
      // success
      queryClient.invalidateQueries({ queryKey: ['budgets', user.uid] })
      setShowEditForm(false)
      setEditing(null)
      setEditBudget(null)
    } catch (error: any) {
      const msg = error.message || 'Failed to update budget'
      setEditError(msg)
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
          {/* Header - Mobile Optimized */}
          <div className="mb-4 lg:mb-8">
            {/* Mobile Header */}
            <div className="lg:hidden">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Budget</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Track spending limits</p>
                </div>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-11 h-11 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center shadow-lg"
                >
                  <PlusIcon className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
            
            {/* Desktop Header */}
            <div className="hidden lg:flex lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Budget</h1>
                <p className="text-gray-600 mt-1 sm:mt-2 text-sm sm:text-base">Set spending limits and track your progress</p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="btn-primary inline-flex items-center justify-center w-full sm:w-auto"
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Budget
              </button>
            </div>
          </div>

          {/* Budget Overview - Redesigned for Mobile */}
          <div className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0 mb-4 lg:mb-8">
            <div className="bg-gradient-to-br from-primary-50 to-indigo-100 rounded-2xl p-4 lg:p-5 shadow-sm">
              <div className="flex items-center justify-between lg:flex-col lg:items-start">
                <div>
                  <p className="text-xs lg:text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Budget</p>
                  <p className="text-base lg:text-2xl font-bold text-gray-900">
                    {singleCurrency ? (
                      <ConvertedAmount 
                        amount={totalBudget} 
                        fromCurrency={singleCurrency} 
                        prefCurrency={prefCurrency} 
                        formatCurrency={formatCurrency}
                        convertExistingData={convertExistingData}
                      />
                    ) : '—'}
                  </p>
                </div>
                <div className="lg:hidden w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-600 font-semibold text-sm">
                    {prefsLoading ? '...' : getCurrencySymbol(prefCurrency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-4 lg:p-5 shadow-sm">
              <div className="flex items-center justify-between lg:flex-col lg:items-start">
                <div>
                  <p className="text-xs lg:text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Spent</p>
                  <p className="text-base lg:text-2xl font-bold text-gray-900">
                    {singleCurrency ? (
                      <ConvertedAmount 
                        amount={totalSpent} 
                        fromCurrency={singleCurrency} 
                        prefCurrency={prefCurrency} 
                        formatCurrency={formatCurrency}
                        convertExistingData={convertExistingData}
                      />
                    ) : '—'}
                  </p>
                </div>
                <div className="lg:hidden w-10 h-10 rounded-full bg-warning-100 flex items-center justify-center">
                  <span className="text-warning-600 font-semibold text-sm">
                    {prefsLoading ? '...' : getCurrencySymbol(prefCurrency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl p-4 lg:p-5 shadow-sm">
              <div className="flex items-center justify-between lg:flex-col lg:items-start">
                <div>
                  <p className="text-xs lg:text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Left</p>
                  <p className="text-base lg:text-2xl font-bold text-gray-900">
                    {singleCurrency ? (
                      <ConvertedAmount 
                        amount={totalBudget - totalSpent} 
                        fromCurrency={singleCurrency} 
                        prefCurrency={prefCurrency} 
                        formatCurrency={formatCurrency}
                        convertExistingData={convertExistingData}
                      />
                    ) : '—'}
                  </p>
                </div>
                <div className="lg:hidden w-10 h-10 rounded-full bg-success-100 flex items-center justify-center">
                  <span className="text-success-600 font-semibold text-sm">
                    {prefsLoading ? '...' : getCurrencySymbol(prefCurrency)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Budgets List - Mobile Optimized */}
          <div className="bg-white rounded-2xl shadow-sm p-4 lg:card lg:!p-6">
            <h2 className="text-base lg:text-xl font-semibold text-gray-900 mb-4 lg:mb-6">Your Budgets</h2>
            {uniqueBudgetCurrencies.length > 1 && (
              <div className="mb-4 lg:mb-6 p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm flex flex-wrap gap-2 lg:gap-4">
                <div className="font-medium text-gray-700 w-full text-xs lg:text-sm">Per-currency totals:</div>
                {uniqueBudgetCurrencies.sort().map(code => {
                  const subtotal = budgets.filter(b => b.currency === code).reduce((s,b)=> s + Number(b.amount),0)
                  return (
                    <div key={code} className="px-2 py-1 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-800 text-xs lg:text-sm">
                      {code}: <ConvertedAmount 
                        amount={subtotal} 
                        fromCurrency={code} 
                        prefCurrency={prefCurrency} 
                        formatCurrency={formatCurrency}
                        convertExistingData={convertExistingData}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            
            <div className="space-y-3 lg:space-y-6">
              {loadingBudgets && (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading budgets...</p>
                </div>
              )}
              {!loadingBudgets && budgets.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-base font-medium text-gray-900">No budgets yet</p>
                  <p className="text-sm text-gray-500 mt-1">Create your first budget to start tracking</p>
                  <button 
                    onClick={() => setShowAddForm(true)}
                    className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium"
                  >
                    Add Budget
                  </button>
                </div>
              )}
               {budgets.map((budget) => {
                const spent = getSpentForBudget(budget)
                const percentage = getProgressPercentage(spent, Number(budget.amount))
                const isOverBudget = spent > Number(budget.amount)
                const isNearLimit = percentage >= 75
                
                return (
                  <div key={budget.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    {/* Mobile Layout */}
                    <div className="lg:hidden">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {budget.catagory_name && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700">
                                {budget.catagory_name}
                              </span>
                            )}
                            {(isOverBudget || isNearLimit) && (
                              <AlertTriangleIcon className={`w-4 h-4 ${isOverBudget ? 'text-red-500' : 'text-yellow-500'}`} />
                            )}
                          </div>
                          <h3 className="text-sm font-medium text-gray-900">
                            {budget.period === 'yearly'
                              ? `Year ${budget.year}`
                              : new Date(budget.year, (budget.month || 1) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 text-gray-400 hover:text-gray-600" onClick={() => openEdit(budget)}>
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteBudget(budget.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2">
                        <div
                          className={`h-2.5 rounded-full transition-all ${getProgressColor(spent, Number(budget.amount))}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      
                      {/* Stats */}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          <span className="font-semibold text-gray-900">
                            <ConvertedAmount 
                              amount={spent} 
                              fromCurrency={budget.currency} 
                              prefCurrency={prefCurrency} 
                              formatCurrency={formatCurrency}
                              convertExistingData={convertExistingData}
                            />
                          </span> of <ConvertedAmount 
                            amount={Number(budget.amount)} 
                            fromCurrency={budget.currency} 
                            prefCurrency={prefCurrency} 
                            formatCurrency={formatCurrency}
                            convertExistingData={convertExistingData}
                          />
                        </span>
                        <span className={`font-medium ${isOverBudget ? 'text-red-600' : 'text-gray-600'}`}>
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                      
                      {isOverBudget && (
                        <div className="mt-2 text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded-lg">
                          Over by <ConvertedAmount 
                            amount={spent - Number(budget.amount)} 
                            fromCurrency={budget.currency} 
                            prefCurrency={prefCurrency} 
                            formatCurrency={formatCurrency}
                            convertExistingData={convertExistingData}
                          />
                        </div>
                      )}
                    </div>
                    
                    {/* Desktop Layout */}
                    <div className="hidden lg:block">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">
                            {budget.period === 'yearly'
                              ? `Year ${budget.year}`
                              : new Date(budget.year, (budget.month || 1) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                          </h3>
                          <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-1 sm:gap-2 text-sm text-gray-600">
                            <span>Currency: {budget.currency}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>Period: {budget.period || 'monthly'}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>Per category: {budget.per_category ? 'Yes' : 'No'}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>Rollover: {budget.roll_over ? 'Yes' : 'No'}</span>
                            {budget.catagory_name && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                {budget.catagory_name}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between sm:justify-end gap-2 sm:space-x-2">
                          {(isOverBudget || isNearLimit) && (
                            <AlertTriangleIcon className={`w-5 h-5 flex-shrink-0 ${isOverBudget ? 'text-red-500' : 'text-yellow-500'}`} />
                          )}
                          <span className="text-base sm:text-lg font-semibold text-gray-900 flex-1 sm:flex-initial">
                            <ConvertedAmount 
                              amount={spent} 
                              fromCurrency={budget.currency} 
                              prefCurrency={prefCurrency} 
                              formatCurrency={formatCurrency}
                              convertExistingData={convertExistingData}
                            /> / <ConvertedAmount 
                              amount={Number(budget.amount)} 
                              fromCurrency={budget.currency} 
                              prefCurrency={prefCurrency} 
                              formatCurrency={formatCurrency}
                              convertExistingData={convertExistingData}
                            />
                          </span>
                          <div className="flex space-x-1 flex-shrink-0">
                            <button className="p-1 text-gray-400 hover:text-gray-600" onClick={() => openEdit(budget)}>
                              <EditIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteBudget(budget.id)}
                              className="p-1 text-gray-400 hover:text-red-600"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${getProgressColor(spent, Number(budget.amount))}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      
                      <div className="flex justify-between text-sm text-gray-600 mt-2">
                        <span>{percentage.toFixed(1)}% used</span>
                        <span>
                          <ConvertedAmount 
                            amount={Number(budget.amount) - spent} 
                            fromCurrency={budget.currency} 
                            prefCurrency={prefCurrency} 
                            formatCurrency={formatCurrency}
                            convertExistingData={convertExistingData}
                          /> remaining
                        </span>
                      </div>
                      
                      {isOverBudget && (
                        <div className="mt-2 text-sm text-red-600 font-medium">
                          Over budget by <ConvertedAmount 
                            amount={spent - Number(budget.amount)} 
                            fromCurrency={budget.currency} 
                            prefCurrency={prefCurrency} 
                            formatCurrency={formatCurrency}
                            convertExistingData={convertExistingData}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Add Budget Form Modal */}
          {showAddForm && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Budget</h3>
                
                 <form onSubmit={handleAddBudget} className="space-y-4">
                  {submitError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      {submitError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Period</label>
                      <select
                        value={newBudget.period}
                        onChange={(e) => setNewBudget({ ...newBudget, period: e.target.value as 'monthly' | 'yearly' })}
                        className="input"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Category</label>
                      <select
                        required
                        value={newBudget.catagory_name}
                        onChange={(e) => setNewBudget({ ...newBudget, catagory_name: e.target.value })}
                        className="input"
                      >
                        <option value="">Select a category</option>
                        {mergedCategoryNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Applies to this category for chosen period</p>
                    </div>
                  </div>

                  {/* (Removed duplicate placeholder category grid) */}

                  {newBudget.period === 'monthly' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Month</label>
                        <select
                          required={newBudget.period === 'monthly'}
                          value={newBudget.month}
                          onChange={(e) => setNewBudget({ ...newBudget, month: Number(e.target.value) })}
                          className="input"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>
                              {new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' })}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Year</label>
                        <input
                          type="number"
                          required
                          min="2000"
                          max="2100"
                          value={newBudget.year}
                          onChange={(e) => setNewBudget({ ...newBudget, year: Number(e.target.value) })}
                          className="input"
                        />
                      </div>
                    </div>
                  )}
                  {newBudget.period === 'yearly' && (
                    <div>
                      <label className="label">Year</label>
                      <input
                        type="number"
                        required
                        min="2000"
                        max="2100"
                        value={newBudget.year}
                        onChange={(e) => setNewBudget({ ...newBudget, year: Number(e.target.value) })}
                        className="input"
                      />
                    </div>
                  )}

                  <div>
                    <label className="label">Budget Amount</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={newBudget.amount}
                      onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Currency</label>
                      <select
                        value={newBudget.currency}
                        onChange={(e) => setNewBudget({ ...newBudget, currency: e.target.value })}
                        className="input"
                      >
                        <option value="INR">INR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="CAD">CAD</option>
                        <option value="AUD">AUD</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 mt-6">
                      <input
                        id="per_category"
                        type="checkbox"
                        checked={newBudget.per_category}
                        onChange={(e) => setNewBudget({ ...newBudget, per_category: e.target.checked })}
                      />
                      <label htmlFor="per_category" className="text-sm text-gray-700">Per category</label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="roll_over"
                      type="checkbox"
                      checked={newBudget.roll_over}
                      onChange={(e) => setNewBudget({ ...newBudget, roll_over: e.target.checked })}
                    />
                    <label htmlFor="roll_over" className="text-sm text-gray-700">Rollover remaining amount to next month</label>
                  </div>
                  
                  <div className="flex flex-col gap-2 sm:flex-row sm:space-x-3 pt-4">
                    <button type="submit" className="btn-primary w-full sm:flex-1">
                      {submitting ? 'Adding…' : 'Add Budget'}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="btn-secondary w-full sm:flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Budget Form Modal */}
          {showEditForm && editBudget && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Budget</h3>

                <form onSubmit={handleUpdateBudget} className="space-y-4">
                  {editError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      {editError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Period</label>
                      <select
                        value={editBudget.period}
                        onChange={(e) => setEditBudget({ ...editBudget, period: e.target.value as 'monthly' | 'yearly' })}
                        className="input"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Category</label>
                      <select
                        required
                        value={editBudget.catagory_name}
                        onChange={(e) => setEditBudget({ ...editBudget, catagory_name: e.target.value })}
                        className="input"
                      >
                        <option value="">Select a category</option>
                        {mergedCategoryNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {editBudget.period === 'monthly' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Month</label>
                        <select
                          required
                          value={editBudget.month}
                          onChange={(e) => setEditBudget({ ...editBudget, month: Number(e.target.value) })}
                          className="input"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>
                              {new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' })}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Year</label>
                        <input
                          type="number"
                          required
                          min="2000"
                          max="2100"
                          value={editBudget.year}
                          onChange={(e) => setEditBudget({ ...editBudget, year: Number(e.target.value) })}
                          className="input"
                        />
                      </div>
                    </div>
                  )}
                  {editBudget.period === 'yearly' && (
                    <div>
                      <label className="label">Year</label>
                      <input
                        type="number"
                        required
                        min="2000"
                        max="2100"
                        value={editBudget.year}
                        onChange={(e) => setEditBudget({ ...editBudget, year: Number(e.target.value) })}
                        className="input"
                      />
                    </div>
                  )}

                  <div>
                    <label className="label">Budget Amount</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={editBudget.amount}
                      onChange={(e) => setEditBudget({ ...editBudget, amount: e.target.value })}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Currency</label>
                      <select
                        value={editBudget.currency}
                        onChange={(e) => setEditBudget({ ...editBudget, currency: e.target.value })}
                        className="input"
                      >
                        <option value="INR">INR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="CAD">CAD</option>
                        <option value="AUD">AUD</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 mt-6">
                      <input
                        id="per_category_edit"
                        type="checkbox"
                        checked={editBudget.per_category}
                        onChange={(e) => setEditBudget({ ...editBudget, per_category: e.target.checked })}
                      />
                      <label htmlFor="per_category_edit" className="text-sm text-gray-700">Per category</label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="roll_over_edit"
                      type="checkbox"
                      checked={editBudget.roll_over}
                      onChange={(e) => setEditBudget({ ...editBudget, roll_over: e.target.checked })}
                    />
                    <label htmlFor="roll_over_edit" className="text-sm text-gray-700">Rollover remaining amount to next month</label>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:space-x-3 pt-4">
                    <button type="submit" className="btn-primary w-full sm:flex-1">
                      {updating ? 'Updating…' : 'Update Budget'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowEditForm(false); setEditing(null); setEditBudget(null) }}
                      className="btn-secondary w-full sm:flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
        </Layout>
      </RequireAuth>
    </>
  )
}


