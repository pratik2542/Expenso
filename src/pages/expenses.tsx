import Head from 'next/head'
import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { PlusIcon, SearchIcon, FilterIcon, MoreVerticalIcon } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState as useReactState } from 'react';
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import AddExpenseModal from '@/components/AddExpenseModal'
import { usePreferences } from '@/contexts/PreferencesContext'

interface Expense {
  id: string
  amount: number
  currency: string
  merchant?: string
  payment_method?: string
  note?: string
  occurred_on: string
  created_at: string
  category: string
}
interface Category { id: string; name: string }

// Deterministic color palette for category chips (explicit classes to satisfy Tailwind purge)
const CATEGORY_CHIP_COLORS: Array<{ bg: string; text: string }> = [
  { bg: 'bg-rose-100', text: 'text-rose-800' },
  { bg: 'bg-pink-100', text: 'text-pink-800' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800' },
  { bg: 'bg-purple-100', text: 'text-purple-800' },
  { bg: 'bg-violet-100', text: 'text-violet-800' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  { bg: 'bg-blue-100', text: 'text-blue-800' },
  { bg: 'bg-sky-100', text: 'text-sky-800' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  { bg: 'bg-teal-100', text: 'text-teal-800' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  { bg: 'bg-green-100', text: 'text-green-800' },
  { bg: 'bg-lime-100', text: 'text-lime-800' },
  { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-orange-100', text: 'text-orange-800' },
  { bg: 'bg-red-100', text: 'text-red-800' },
]

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0
  }
  return h
}

const CATEGORY_MAP: Record<string, string> = {
  retail: 'Shopping',
  groceries: 'Groceries',
  food: 'Food & Dining',
  dining: 'Food & Dining',
  restaurant: 'Food & Dining',
  entertainment: 'Entertainment',
  travel: 'Travel',
  transport: 'Transportation',
  transportation: 'Transportation',
  gas: 'Gas',
  fuel: 'Gas',
  healthcare: 'Healthcare',
  medical: 'Healthcare',
  bills: 'Bills & Utilities',
  utilities: 'Bills & Utilities',
  shopping: 'Shopping',
  other: 'Other',
}

function normalizeCategory(raw?: string, definedCategories?: string[]): string {
  if (!raw) return 'Other'
  const lower = raw.trim().toLowerCase()
  // Direct match to defined categories
  if (definedCategories && definedCategories.some(c => c.toLowerCase() === lower)) {
    return definedCategories.find(c => c.toLowerCase() === lower) || 'Other'
  }
  // Map via alias
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower]
  // Fuzzy match: contains
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return val
  }
  return 'Other'
}

function categoryBadgeClass(name?: string) {
  const key = (name && name.trim().length > 0) ? name : 'Other'
  const idx = hashString(key) % CATEGORY_CHIP_COLORS.length
  const { bg, text } = CATEGORY_CHIP_COLORS[idx]
  return `inline-flex px-2 py-1 text-xs font-semibold rounded-full ${bg} ${text}`
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

export default function Expenses() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const { user } = useAuth()
  const { formatCurrency, formatCurrencyExplicit, currency: prefCurrency, formatDate, convertExistingData } = usePreferences()
  const [actionOpenId, setActionOpenId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [actionPlacement, setActionPlacement] = useState<'up' | 'down'>('down')
  const [actionExpense, setActionExpense] = useState<Expense | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  
  // Helper function to convert amount to preference currency
  const convertToPrefCurrency = async (amount: number, fromCurrency: string): Promise<number> => {
    if (!amount || fromCurrency === prefCurrency) return amount
    try {
      const resp = await fetch(`/api/fx/convert?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(prefCurrency)}`)
      if (!resp.ok) return amount
      const json = await resp.json()
      if (!json.success || !json.rate) return amount
      return amount * json.rate
    } catch {
      return amount
    }
  }
  
  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user!.id)
        .order('occurred_on', { ascending: false })
      if (error) throw error
      return data as Expense[]
    },
  })

  const [searchTerm, setSearchTerm] = useState('')
  // State for AI duplicate detection
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
  const [duplicatesLoading, setDuplicatesLoading] = useState(false)
  const [detectedDuplicates, setDetectedDuplicates] = useState<string[]>([])
  const [duplicatesError, setDuplicatesError] = useState<string|null>(null)
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState('occurred_on')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')

  // Load categories for filter dropdown
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user!.id)
        .order('name')
      if (error) throw error
      return data as Category[]
    }
  })

  // Get defined category names for mapping
  const definedCategoryNames = categories.map(c => c.name)

  // Get unique months from expenses for the month filter
  const availableMonths = Array.from(new Set(expenses.map(e => {
    const date = new Date(e.occurred_on)
    // Use UTC methods to avoid timezone issues with date strings
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }))).sort().reverse()

  const filteredExpenses = expenses.filter(expense => {
    const term = searchTerm.trim().toLowerCase()
    const mappedCategory = normalizeCategory(expense.category, definedCategoryNames)
    
    // Search by note, merchant, category, payment method, AND amount
    const amountStr = expense.amount.toString()
    const matchesSearch = term.length === 0
      ? true
      : [expense.note, expense.merchant, mappedCategory, expense.payment_method, amountStr]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(term))
    
    const matchesCategory = !categoryFilter || mappedCategory === categoryFilter
    
    // Month filter
    const matchesMonth = !monthFilter || (() => {
      const expenseDate = new Date(expense.occurred_on)
      // Use UTC methods to avoid timezone issues with date strings
      const expenseMonth = `${expenseDate.getUTCFullYear()}-${String(expenseDate.getUTCMonth() + 1).padStart(2, '0')}`
      return expenseMonth === monthFilter
    })()
    
    return matchesSearch && matchesCategory && matchesMonth
  })

  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    if (sortBy === 'occurred_on') {
      return sortOrder === 'asc' 
        ? new Date(a.occurred_on).getTime() - new Date(b.occurred_on).getTime()
        : new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime()
    } else if (sortBy === 'amount') {
      return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount
    } else {
      return (a.note || '').localeCompare(b.note || '')
    }
  })

  // Total should be displayed in current preference currency; if multiple currencies exist, we can either:
  // (a) show per-currency subtotals, or (b) show a simple sum without conversion (not meaningful cross-currency).
  // For now we keep original logic but if multiple currencies are present we append a note.
  const totalAmount = sortedExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const distinctCurrencies = new Set(sortedExpenses.map(e => e.currency))
  const singleCurrencyCode = distinctCurrencies.size === 1 ? Array.from(distinctCurrencies)[0] : null

  // Converted total state for single-currency case
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null)
  const [conversionSucceeded, setConversionSucceeded] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    // Reset while recalculating
    setConvertedTotal(null)
    setConversionSucceeded(null)

    const run = async () => {
      if (!singleCurrencyCode) {
        // Multiple currencies; we won't aggregate a unified converted total (kept as future work)
        if (mounted) {
          setConvertedTotal(totalAmount)
          setConversionSucceeded(false)
        }
        return
      }

      // Same currency as preference → no conversion needed
      if (singleCurrencyCode === prefCurrency) {
        if (mounted) {
          setConvertedTotal(totalAmount)
          setConversionSucceeded(true)
        }
        return
      }

      // User opted out of converting existing data → display in original currency
      if (!convertExistingData) {
        if (mounted) {
          setConvertedTotal(totalAmount)
          setConversionSucceeded(false)
        }
        return
      }

      // Convert the aggregated total from the single source currency to the preference currency
      try {
        const resp = await fetch(`/api/fx/convert?from=${encodeURIComponent(singleCurrencyCode)}&to=${encodeURIComponent(prefCurrency)}`)
        if (!resp.ok) throw new Error('rate fetch failed')
        const json = await resp.json()
        const rate = json?.rate
        if (!json?.success || !rate) throw new Error('invalid rate')
        const converted = totalAmount * rate
        if (mounted) {
          setConvertedTotal(converted)
          setConversionSucceeded(true)
        }
      } catch {
        // If conversion fails, fall back to showing original currency explicitly
        if (mounted) {
          setConvertedTotal(totalAmount)
          setConversionSucceeded(false)
        }
      }
    }

    run()
    return () => { mounted = false }
  }, [totalAmount, singleCurrencyCode, prefCurrency, convertExistingData])
  const perCurrencyTotals = Array.from(distinctCurrencies).map(code => ({
    code,
    total: sortedExpenses.filter(e => e.currency === code).reduce((s, e) => s + e.amount, 0)
  })).sort((a,b)=> a.code.localeCompare(b.code))

  const onAdded = () => {
  queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] })
  }

  const deleteExpense = async (id: string) => {
    if (!user) return
    setActionError(null)
    const confirmDelete = window.confirm('Delete this expense? This cannot be undone.')
    if (!confirmDelete) return
    setDeletingId(id)
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    setDeletingId(null)
    if (error) {
      setActionError(error.message)
    } else {
      queryClient.invalidateQueries({ queryKey: ['expenses', user.id] })
      setActionOpenId(null)
    }
  }

  // using PreferencesContext.formatDate instead

  return (
    <>
      <Head>
        <title>Expenses - Expenso</title>
        <meta name="description" content="View and manage your expenses" />
      </Head>
      <RequireAuth>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Expenses</h1>
                <p className="text-gray-600 mt-1 sm:mt-2 text-sm sm:text-base">Track and manage all your expenses</p>
              </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                  {selectedIds.size > 0 && (
                    <button
                      className="btn-secondary text-red-700 border-red-200 hover:bg-red-50 w-full sm:w-auto"
                      onClick={async () => {
                        if (!user) return
                        if (!window.confirm(`Delete ${selectedIds.size} selected item(s)? This cannot be undone.`)) return
                        setDeletingId('bulk')
                        const ids = Array.from(selectedIds)
                        const { error } = await supabase
                          .from('expenses')
                          .delete()
                          .in('id', ids)
                          .eq('user_id', user.id)
                        setDeletingId(null)
                        if (error) {
                          setActionError(error.message)
                        } else {
                          setSelectedIds(new Set())
                          queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] })
                        }
                      }}
                    >
                      Delete Selected ({selectedIds.size})
                    </button>
                  )}
                  <button
                    className="btn-secondary border-blue-200 text-blue-700 hover:bg-blue-50 w-full sm:w-auto"
                    onClick={async () => {
                      setShowDuplicatesModal(true)
                      setDuplicatesLoading(true)
                      setDuplicatesError(null)
                      setDetectedDuplicates([])
                      setSelectedDuplicateIds(new Set())
                      try {
                        const resp = await fetch('/api/ai/detect-duplicates', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ expenses })
                        })
                        if (!resp.ok) throw new Error('Failed to detect duplicates')
                        const json = await resp.json()
                        if (!json.duplicateIds) throw new Error('No duplicates found')
                        setDetectedDuplicates(json.duplicateIds)
                        setSelectedDuplicateIds(new Set(json.duplicateIds))
                      } catch (e: any) {
                        setDuplicatesError(e.message || 'Error detecting duplicates')
                      } finally {
                        setDuplicatesLoading(false)
                      }
                    }}
                  >
                    AI Remove Duplicates
                  </button>
                  <button onClick={() => setShowAdd(true)} className="btn-primary inline-flex items-center justify-center w-full sm:w-auto">
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Add Expense
                  </button>
                </div>
            </div>
          </div>

          {/* Filters and Search - Responsive for mobile */}
          <div className="card mb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4 w-full">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1 sm:sr-only">Search</label>
                  <div className="relative">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by note, merchant, category, method, or amount..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input !pl-14 pr-3"
                    />
                  </div>
                </div>
                <div className="sm:min-w-[180px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1 sm:sr-only">Category</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="input"
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:min-w-[180px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1 sm:sr-only">Month</label>
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="input"
                  >
                    <option value="">All months</option>
                    {availableMonths.map((month) => {
                      const [year, monthNum] = month.split('-')
                      const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
                      return <option key={month} value={month}>{monthName}</option>
                    })}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs font-medium text-gray-600 mb-1 sm:sr-only">Sort</label>
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="input"
                    >
                      <option value="occurred_on">Date</option>
                      <option value="amount">Amount</option>
                      <option value="note">Note</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Results Summary */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-gray-600">
                {isLoading ? 'Loading...' : `${sortedExpenses.length} expense(s) found`}
              </span>
              <span className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                {singleCurrencyCode ? (
                  // Single-currency list
                  convertExistingData ? (
                    singleCurrencyCode === prefCurrency ? (
                      // No conversion needed
                      <>Total: {formatCurrency(totalAmount)}</>
                    ) : (
                      // Converting to preference currency
                      convertedTotal === null ? (
                        <>Total: …</>
                      ) : conversionSucceeded ? (
                        <>Total: {formatCurrency(convertedTotal)}</>
                      ) : (
                        // Conversion failed → show original currency explicitly
                        <>Total: {formatCurrencyExplicit(totalAmount, singleCurrencyCode)}</>
                      )
                    )
                  ) : (
                    // Not converting existing data → show original currency explicitly if different
                    singleCurrencyCode === prefCurrency ? (
                      <>Total: {formatCurrency(totalAmount)}</>
                    ) : (
                      <>Total: {formatCurrencyExplicit(totalAmount, singleCurrencyCode)}</>
                    )
                  )
                ) : (
                  // Multi-currency list: keep existing behavior
                  <>Total: {totalAmount.toFixed(2)} (mixed)</>
                )}
              </span>
            </div>
          </div>

          {/* Expenses List - Responsive for mobile */}
          <div className="card">
            {distinctCurrencies.size > 1 && (
              <div className="mb-4 p-3 rounded border border-gray-200 bg-gray-50 text-sm flex flex-wrap gap-4">
                <div className="font-medium text-gray-700 w-full">Per-currency totals:</div>
                {perCurrencyTotals.map(c => (
                  <div key={c.code} className="px-2 py-1 bg-white border border-gray-200 rounded shadow-sm text-gray-800">
                    {c.code}: {c.total.toFixed(2)}
                  </div>
                ))}
                <div className="text-xs text-gray-500 w-full">Add FX conversion to show unified total.</div>
              </div>
            )}
            {actionError && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{actionError}</div>
            )}
            <div className="overflow-visible">
              {/* Mobile: card/list view, Desktop: table */}
              <div className="block md:hidden">
                {!isLoading && sortedExpenses.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-gray-500">
                      <FilterIcon className="mx-auto h-12 w-12 mb-4" />
                      <p className="text-lg font-medium">No expenses found</p>
                      <p className="text-sm">Try adjusting your search or filter criteria</p>
                    </div>
                  </div>
                )}
                {!isLoading && sortedExpenses.map((expense) => {
                  const mappedCategory = normalizeCategory(expense.category, definedCategoryNames)
                  return (
                    <div key={expense.id} className="mb-4 p-4 rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-gray-900 text-base">
                          {(() => {
                            const clean = String(expense.note || '').replace(/\bTransaction date\b[^;\n]*;\s*\bPosting date\b[^\n]*/gi, '').trim()
                            if (clean) return clean
                            if (expense.category) return expense.category
                            if (expense.merchant) return expense.merchant
                            return 'No description'
                          })()}
                        </div>
                        <span className={categoryBadgeClass(mappedCategory)}>{mappedCategory}</span>
                      </div>
                      {expense.merchant && (
                        <div className="text-sm text-gray-500">{expense.merchant}</div>
                      )}
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{formatDate(expense.occurred_on)}</span>
                        <span className="font-medium text-gray-900">
                          <ConvertedAmount 
                            amount={expense.amount} 
                            fromCurrency={expense.currency} 
                            prefCurrency={prefCurrency} 
                            formatCurrency={formatCurrency}
                            convertExistingData={convertExistingData}
                          />
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(expense.id)}
                          onChange={(e) => {
                            setSelectedIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(expense.id)
                              else next.delete(expense.id)
                              return next
                            })
                          }}
                          className="w-5 h-5"
                        />
                        <button
                          className="text-gray-400 hover:text-gray-600 p-2 rounded"
                          onClick={(e) => {
                            const nextOpen = actionOpenId === expense.id ? null : expense.id
                            setActionOpenId(nextOpen)
                            if (nextOpen) {
                              setActionExpense(expense)
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              const MENU_WIDTH = 160
                              const MENU_HEIGHT = 96
                              const spaceBelow = window.innerHeight - rect.bottom
                              const placeUp = spaceBelow < MENU_HEIGHT + 16
                              setActionPlacement(placeUp ? 'up' : 'down')
                              const top = placeUp ? (rect.top - 8 - MENU_HEIGHT) : (rect.bottom + 8)
                              const left = Math.min(
                                window.innerWidth - 8 - MENU_WIDTH,
                                Math.max(8, rect.right - MENU_WIDTH)
                              )
                              setMenuPos({ top, left })
                            } else {
                              setActionExpense(null)
                              setMenuPos(null)
                            }
                          }}
                          aria-haspopup="menu"
                          aria-expanded={actionOpenId === expense.id}
                        >
                          <MoreVerticalIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Desktop/table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={selectedIds.size > 0 && selectedIds.size === sortedExpenses.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds(new Set(sortedExpenses.map(x => x.id)))
                            else setSelectedIds(new Set())
                          }}
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {!isLoading && sortedExpenses.map((expense) => {
                      const mappedCategory = normalizeCategory(expense.category, definedCategoryNames)
                      return (
                      <tr key={expense.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(expense.id)}
                            onChange={(e) => {
                              setSelectedIds(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(expense.id)
                                else next.delete(expense.id)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {(() => {
                                const clean = String(expense.note || '').replace(/\bTransaction date\b[^;\n]*;\s*\bPosting date\b[^\n]*/gi, '').trim()
                                if (clean) return clean
                                if (expense.category) return expense.category
                                if (expense.merchant) return expense.merchant
                                return 'No description'
                              })()}
                            </div>
                            {expense.merchant && (
                              <div className="text-sm text-gray-500">
                                {expense.merchant}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={categoryBadgeClass(mappedCategory)}>
                            {mappedCategory}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(expense.occurred_on)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          <ConvertedAmount 
                            amount={expense.amount} 
                            fromCurrency={expense.currency} 
                            prefCurrency={prefCurrency} 
                            formatCurrency={formatCurrency}
                            convertExistingData={convertExistingData}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                          <button
                            className="text-gray-400 hover:text-gray-600 p-1 rounded"
                            onClick={(e) => {
                              const nextOpen = actionOpenId === expense.id ? null : expense.id
                              setActionOpenId(nextOpen)
                              if (nextOpen) {
                                setActionExpense(expense)
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                const MENU_WIDTH = 160
                                const MENU_HEIGHT = 96 // approx for 2 items
                                const spaceBelow = window.innerHeight - rect.bottom
                                const placeUp = spaceBelow < MENU_HEIGHT + 16
                                setActionPlacement(placeUp ? 'up' : 'down')
                                const top = placeUp ? (rect.top - 8 - MENU_HEIGHT) : (rect.bottom + 8)
                                // Keep within viewport horizontally
                                const left = Math.min(
                                  window.innerWidth - 8 - MENU_WIDTH,
                                  Math.max(8, rect.right - MENU_WIDTH)
                                )
                                setMenuPos({ top, left })
                              } else {
                                setActionExpense(null)
                                setMenuPos(null)
                              }
                            }}
                            aria-haspopup="menu"
                            aria-expanded={actionOpenId === expense.id}
                          >
                            <MoreVerticalIcon className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </Layout>
      <AddExpenseModal
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditingExpense(null) }}
        onAdded={onAdded}
        mode={editingExpense ? 'edit' : 'add'}
        expense={editingExpense}
      />

      {/* AI Duplicates Modal */}
      {showDuplicatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 relative">
            <h2 className="text-xl font-bold mb-2">AI Detected Duplicate Expenses</h2>
            <p className="mb-4 text-gray-600 text-sm">Review the detected duplicates below. Uncheck any you do not want to delete. Click Confirm to remove selected duplicates.</p>
            {duplicatesLoading ? (
              <div className="py-8 text-center text-blue-600">Detecting duplicates…</div>
            ) : duplicatesError ? (
              <div className="py-4 text-red-600">{duplicatesError}</div>
            ) : detectedDuplicates.length === 0 ? (
              <div className="py-8 text-center text-gray-500">No duplicates detected.</div>
            ) : (
              <div className="max-h-64 overflow-y-auto border rounded mb-4">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-1"><input type="checkbox"
                        checked={selectedDuplicateIds.size === detectedDuplicates.length}
                        onChange={e => {
                          if (e.target.checked) setSelectedDuplicateIds(new Set(detectedDuplicates))
                          else setSelectedDuplicateIds(new Set())
                        }}
                      /></th>
                      <th className="px-2 py-1 text-left">Description</th>
                      <th className="px-2 py-1 text-left">Amount</th>
                      <th className="px-2 py-1 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detectedDuplicates.map(id => {
                      const exp = expenses.find(e => e.id === id)
                      if (!exp) return null
                      return (
                        <tr key={id} className="border-t">
                          <td className="px-2 py-1">
                            <input type="checkbox"
                              checked={selectedDuplicateIds.has(id)}
                              onChange={e => {
                                setSelectedDuplicateIds(prev => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(id)
                                  else next.delete(id)
                                  return next
                                })
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">{exp.note || exp.merchant || exp.category || 'No description'}</td>
                          <td className="px-2 py-1">{exp.amount} {exp.currency}</td>
                          <td className="px-2 py-1">{formatDate(exp.occurred_on)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="btn-secondary"
                onClick={() => setShowDuplicatesModal(false)}
                disabled={duplicatesLoading}
              >Cancel</button>
              <button
                className="btn-primary"
                disabled={duplicatesLoading || selectedDuplicateIds.size === 0}
                onClick={async () => {
                  if (!user) return
                  if (!window.confirm(`Delete ${selectedDuplicateIds.size} duplicate expense(s)? This cannot be undone.`)) return
                  setDuplicatesLoading(true)
                  setDuplicatesError(null)
                  try {
                    const ids = Array.from(selectedDuplicateIds)
                    const { error } = await supabase
                      .from('expenses')
                      .delete()
                      .in('id', ids)
                      .eq('user_id', user.id)
                    if (error) throw new Error(error.message)
                    setShowDuplicatesModal(false)
                    setDetectedDuplicates([])
                    setSelectedDuplicateIds(new Set())
                    queryClient.invalidateQueries({ queryKey: ['expenses', user.id] })
                  } catch (e: any) {
                    setDuplicatesError(e.message || 'Error deleting duplicates')
                  } finally {
                    setDuplicatesLoading(false)
                  }
                }}
              >Confirm & Delete</button>
            </div>
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-700"
              onClick={() => setShowDuplicatesModal(false)}
              aria-label="Close"
              disabled={duplicatesLoading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      {/* Global actions menu overlay and popup to avoid clipping/scroll issues */}
      {actionOpenId && actionExpense && menuPos && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setActionOpenId(null); setActionExpense(null); setMenuPos(null) }}
          />
          <div
            className="fixed z-50 w-40 bg-white border border-gray-200 rounded-md shadow-lg flex flex-col py-1"
            style={{ top: menuPos.top, left: menuPos.left }}
            role="menu"
          >
            <button
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                setEditingExpense(actionExpense)
                setShowAdd(true)
                setActionOpenId(null)
                setActionExpense(null)
                setMenuPos(null)
              }}
            >
              Edit
            </button>
            <button
              className="block w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600"
              onClick={() => actionExpense && deleteExpense(actionExpense.id)}
              disabled={deletingId === actionExpense.id}
            >
              {deletingId === actionExpense.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </>
      )}
    </RequireAuth>
    </>
  )
}

// Force dynamic rendering to avoid static optimization differences across ports
export async function getServerSideProps() {
  return { props: {} }
}
