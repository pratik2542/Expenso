import Head from 'next/head'
import React, { useMemo, useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { PlusIcon, EditIcon, TrashIcon, AlertTriangleIcon } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
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

export default function BudgetPage() {
  const { user } = useAuth()
  const { formatCurrency, currency: prefCurrency, convertExistingData } = usePreferences()
  const queryClient = useQueryClient()
  const { data: budgets = [], isLoading: loadingBudgets } = useQuery<Budget[]>({
    queryKey: ['budgets', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
  .select('id, user_id, month, year, currency, amount, per_category, roll_over, catagory_name, period, created_at, updated_at')
        .eq('user_id', user!.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return data as Budget[]
    }
  })
  // Monthly spend map keyed by 'YYYY-MM'
  const { data: monthlySpend = {} } = useQuery<Record<string, number>>({
    queryKey: ['monthly-spend', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('occurred_on, amount')
        .eq('user_id', user!.id)
      if (error) throw error
      const agg: Record<string, number> = {}
      for (const row of data as { occurred_on: string; amount: number }[]) {
        const d = new Date(row.occurred_on)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        agg[key] = (agg[key] || 0) + Number(row.amount)
      }
      return agg
    }
  })

  // Monthly spend per category keyed by 'YYYY-MM|Category'
  const { data: monthlyCategorySpend = {} } = useQuery<Record<string, number>>({
    queryKey: ['monthly-category-spend', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('occurred_on, amount, category')
        .eq('user_id', user!.id)
      if (error) throw error
      const agg: Record<string, number> = {}
      for (const row of data as { occurred_on: string; amount: number; category: string }[]) {
        const d = new Date(row.occurred_on)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}|${row.category}`
        agg[key] = (agg[key] || 0) + Number(row.amount)
      }
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
    queryKey: ['categories', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user!.id)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
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
      const q = supabase
        .from('budgets')
        .select('id, catagory_name, period')
        .eq('user_id', user.id)
        .eq('year', Number(newBudget.year))
        .eq('period', newBudget.period)

      if (newBudget.period === 'monthly') {
        q.eq('month', Number(newBudget.month))
      } else {
        q.is('month', null)
      }

      const { data: existing, error: existingErr } = await (newBudget.catagory_name
        ? q.eq('catagory_name', newBudget.catagory_name)
        : q.is('catagory_name', null))

      if (existingErr) throw existingErr
      if (existing && existing.length > 0) {
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
      user_id: user.id,
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
  const { error } = await supabase.from('budgets').insert(payload)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['budgets', user.id] })
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
      setSubmitting(false)
    } else {
      // Show a user-friendly error
      const msg =
        error.message?.includes('row-level security') || error.message?.includes('permission')
          ? 'Permission denied. Check RLS policies for budgets (INSERT must allow auth.uid() = user_id).'
          : error.message || 'Failed to add budget'
      setSubmitError(msg)
      setSubmitting(false)
    }
  }

  const deleteBudget = async (id: string) => {
    if (!user) return
    const { error } = await supabase.from('budgets').delete().eq('id', id).eq('user_id', user.id)
    if (!error) queryClient.invalidateQueries({ queryKey: ['budgets', user.id] })
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
      const q = supabase
        .from('budgets')
        .select('id')
        .eq('user_id', user.id)
        .eq('year', Number(editBudget.year))
        .eq('period', editBudget.period)
        .neq('id', editing.id)

      if (editBudget.period === 'monthly') {
        q.eq('month', Number(editBudget.month))
      } else {
        q.is('month', null)
      }

      const { data: existing, error: existingErr } = await (editBudget.catagory_name
        ? q.eq('catagory_name', editBudget.catagory_name)
        : q.is('catagory_name', null))

      if (existingErr) throw existingErr
      if (existing && existing.length > 0) {
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

    const { error } = await supabase
      .from('budgets')
      .update(payload)
      .eq('id', editing.id)
      .eq('user_id', user.id)

    setUpdating(false)
    if (error) {
      const msg =
        error.message?.includes('row-level security') || error.message?.includes('permission')
          ? 'Permission denied. Check RLS policies for budgets (UPDATE must allow auth.uid() = user_id).'
          : error.message || 'Failed to update budget'
      setEditError(msg)
      return
    }
    // success
    queryClient.invalidateQueries({ queryKey: ['budgets', user.id] })
    setShowEditForm(false)
    setEditing(null)
    setEditBudget(null)
  }

  return (
    <>
      <Head>
  <title>Budget - Expenso</title>
        <meta name="description" content="Set and track your spending budgets" />
      </Head>

      <RequireAuth>
        <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Budget</h1>
                <p className="text-gray-600 mt-2">Set spending limits and track your progress</p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="btn-primary inline-flex items-center"
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Budget
              </button>
            </div>
          </div>

          {/* Budget Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-primary-100">
                  <span className="text-primary-600 font-semibold">$</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Budget</p>
                  <p className="text-2xl font-bold text-gray-900">
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
              </div>
            </div>

            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-warning-100">
                  <span className="text-warning-600 font-semibold">$</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Spent</p>
                  <p className="text-2xl font-bold text-gray-900">
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
              </div>
            </div>

            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-success-100">
                  <span className="text-success-600 font-semibold">$</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Remaining</p>
                  <p className="text-2xl font-bold text-gray-900">
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
              </div>
            </div>
          </div>

          {/* Budgets List */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Budgets</h2>
            {uniqueBudgetCurrencies.length > 1 && (
              <div className="mb-6 p-3 rounded border border-gray-200 bg-gray-50 text-sm flex flex-wrap gap-4">
                <div className="font-medium text-gray-700 w-full">Per-currency totals (converted to {prefCurrency}):</div>
                {uniqueBudgetCurrencies.sort().map(code => {
                  const subtotal = budgets.filter(b => b.currency === code).reduce((s,b)=> s + Number(b.amount),0)
                  return (
                    <div key={code} className="px-2 py-1 bg-white border border-gray-200 rounded shadow-sm text-gray-800">
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
                <div className="text-xs text-gray-500 w-full">Amounts converted using live exchange rates.</div>
              </div>
            )}
            
            <div className="space-y-6">
              {loadingBudgets && <div className="text-sm text-gray-500">Loading budgets...</div>}
              {!loadingBudgets && budgets.length === 0 && <div className="text-sm text-gray-500">No budgets yet. Create one.</div>}
               {budgets.map((budget) => {
                const spent = getSpentForBudget(budget)
                const percentage = getProgressPercentage(spent, Number(budget.amount))
                const isOverBudget = spent > Number(budget.amount)
                const isNearLimit = percentage >= 75
                
                return (
                  <div key={budget.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
            <div>
                        <h3 className="font-semibold text-gray-900">
                          {budget.period === 'yearly'
                            ? `Year ${budget.year}`
                            : new Date(budget.year, (budget.month || 1) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                        </h3>
                        <div className="mt-1 flex items-center flex-wrap gap-2 text-sm text-gray-600">
                          <span>Currency: {budget.currency}</span>
                          <span>• Period: {budget.period || 'monthly'}</span>
                          <span>• Per category: {budget.per_category ? 'Yes' : 'No'}</span>
                          <span>• Rollover: {budget.roll_over ? 'Yes' : 'No'}</span>
                          {budget.catagory_name && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              {budget.catagory_name}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {(isOverBudget || isNearLimit) && (
                          <AlertTriangleIcon className={`w-5 h-5 ${isOverBudget ? 'text-red-500' : 'text-yellow-500'}`} />
                        )}
                        <span className="text-lg font-semibold text-gray-900">
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
                        <div className="flex space-x-1">
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
                )
              })}
            </div>
          </div>

          {/* Add Budget Form Modal */}
          {showAddForm && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Budget</h3>
                
                 <form onSubmit={handleAddBudget} className="space-y-4">
                  {submitError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      {submitError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 gap-4">
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
                  
                  <div className="grid grid-cols-2 gap-4">
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
                  
                  <div className="flex space-x-3 pt-4">
                    <button type="submit" className="btn-primary flex-1">
                      {submitting ? 'Adding…' : 'Add Budget'}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="btn-secondary flex-1"
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
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Budget</h3>

                <form onSubmit={handleUpdateBudget} className="space-y-4">
                  {editError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      {editError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-2 gap-4">
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

                  <div className="flex space-x-3 pt-4">
                    <button type="submit" className="btn-primary flex-1">
                      {updating ? 'Updating…' : 'Update Budget'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowEditForm(false); setEditing(null); setEditBudget(null) }}
                      className="btn-secondary flex-1"
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

// Force dynamic rendering to avoid static caching
export async function getServerSideProps() {
  return { props: {} }
}
