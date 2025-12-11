import Head from 'next/head'
import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { PlusIcon, SearchIcon, FilterIcon, MoreVerticalIcon, ArrowUpIcon } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState as useReactState } from 'react';
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import AddExpenseModal from '@/components/AddExpenseModal'
import { usePreferences } from '@/contexts/PreferencesContext'
import { getApiUrl } from '@/lib/config'

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
  attachment?: string
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
  const [viewAttachment, setViewAttachment] = useState<string | null>(null)
  const [attachingToExpense, setAttachingToExpense] = useState<Expense | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  
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
    queryKey: ['expenses', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const expensesRef = collection(db, 'expenses', user.uid, 'items')
      const q = query(expensesRef, orderBy('occurred_on', 'desc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[]
    },
  })

  const [searchTerm, setSearchTerm] = useState('')
  // State for AI duplicate detection
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
  const [duplicatesLoading, setDuplicatesLoading] = useState(false)
  const [detectedDuplicates, setDetectedDuplicates] = useState<string[]>([])
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([])
  const [duplicatesError, setDuplicatesError] = useState<string|null>(null)
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set())
  
  // State for Similar in Same Month detection
  const [showSimilarModal, setShowSimilarModal] = useState(false)
  const [similarGroups, setSimilarGroups] = useState<Array<{month: string, expenses: Expense[]}>>([])
  const [selectedSimilarIds, setSelectedSimilarIds] = useState<Set<string>>(new Set())
  
  const [sortBy, setSortBy] = useState('occurred_on')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  
  // Scroll to top button visibility
  const [showScrollTop, setShowScrollTop] = useState(false)
  
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Load categories for filter dropdown
  const { data: categories = [] } = useQuery<Category[]>({
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
      })) as Category[]
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

  // Calculate average per month when category is selected
  const categoryAvgPerMonth = (() => {
    if (!categoryFilter || sortedExpenses.length === 0) return null
    
    // Group expenses by month
    const monthlyData = new Map<string, { total: number; currency: string }>()
    sortedExpenses.forEach(expense => {
      const date = new Date(expense.occurred_on)
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      const existing = monthlyData.get(monthKey)
      monthlyData.set(monthKey, {
        total: (existing?.total || 0) + expense.amount,
        currency: expense.currency
      })
    })

    // Calculate average
    if (monthlyData.size === 0) return null
    const totalAmount = Array.from(monthlyData.values()).reduce((sum, m) => sum + m.total, 0)
    const avgPerMonth = totalAmount / monthlyData.size
    const currencyOfFirst = Array.from(monthlyData.values())[0].currency
    
    return { avgPerMonth, currency: currencyOfFirst, monthCount: monthlyData.size }
  })()

  // Calculate predicted yearly average when category is selected
  const categoryPredictedYearly = (() => {
    if (!categoryFilter || sortedExpenses.length === 0) return null
    
    const totalAmount = sortedExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    const predictedMonthly = totalAmount / 12
    const currencyOfFirst = sortedExpenses[0].currency
    
    return { predictedMonthly, currency: currencyOfFirst }
  })()

  const onAdded = () => {
  queryClient.invalidateQueries({ queryKey: ['expenses', user?.uid] })
  }

  const deleteExpense = async (id: string) => {
    if (!user) return
    setActionError(null)
    const confirmDelete = window.confirm('Delete this expense? This cannot be undone.')
    if (!confirmDelete) return
    setDeletingId(id)
    try {
      const expenseDocRef = doc(db, 'expenses', user.uid, 'items', id)
      await deleteDoc(expenseDocRef)
      queryClient.invalidateQueries({ queryKey: ['expenses', user.uid] })
      setActionOpenId(null)
    } catch (error: any) {
      setActionError(error.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleAttachBill = async (file: File) => {
    if (!user || !attachingToExpense) return
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Please select an image under 5MB.')
      return
    }

    setUploadingAttachment(true)
    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64String = reader.result as string
        try {
          const expenseDocRef = doc(db, 'expenses', user.uid, 'items', attachingToExpense.id)
          await updateDoc(expenseDocRef, { attachment: base64String })
          queryClient.invalidateQueries({ queryKey: ['expenses', user.uid] })
          setAttachingToExpense(null)
        } catch (error: any) {
          alert('Failed to attach bill: ' + error.message)
        } finally {
          setUploadingAttachment(false)
        }
      }
      reader.onerror = () => {
        alert('Failed to read file')
        setUploadingAttachment(false)
      }
      reader.readAsDataURL(file)
    } catch (error: any) {
      alert('Failed to attach bill: ' + error.message)
      setUploadingAttachment(false)
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
                        try {
                          // Delete each expense
                          await Promise.all(ids.map(id => {
                            const expenseDocRef = doc(db, 'expenses', user.uid, 'items', id)
                            return deleteDoc(expenseDocRef)
                          }))
                          setSelectedIds(new Set())
                          queryClient.invalidateQueries({ queryKey: ['expenses', user.uid] })
                        } catch (error: any) {
                          setActionError(error.message)
                        } finally {
                          setDeletingId(null)
                        }
                      }}
                    >
                      Delete Selected ({selectedIds.size})
                    </button>
                  )}
                  <button
                    className="btn-secondary border-amber-200 text-amber-700 hover:bg-amber-50 w-full sm:w-auto"
                    onClick={() => {
                      // Find similar expenses in the same month (potential duplicates by mistake)
                      const monthMap = new Map<string, Expense[]>()
                      expenses.forEach(exp => {
                        const date = new Date(exp.occurred_on)
                        const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
                        const existing = monthMap.get(monthKey) || []
                        existing.push(exp)
                        monthMap.set(monthKey, existing)
                      })
                      
                      // Find groups of similar expenses within each month
                      const groups: Array<{month: string, expenses: Expense[]}> = []
                      monthMap.forEach((monthExpenses, month) => {
                        // Group by same amount
                        const amountMap = new Map<number, Expense[]>()
                        monthExpenses.forEach(exp => {
                          const existing = amountMap.get(exp.amount) || []
                          existing.push(exp)
                          amountMap.set(exp.amount, existing)
                        })
                        
                        // Only include groups with 2+ expenses with same amount
                        amountMap.forEach((sameAmountExpenses) => {
                          if (sameAmountExpenses.length >= 2) {
                            groups.push({ month, expenses: sameAmountExpenses })
                          }
                        })
                      })
                      
                      // Sort by month descending
                      groups.sort((a, b) => b.month.localeCompare(a.month))
                      
                      setSimilarGroups(groups)
                      setSelectedSimilarIds(new Set())
                      setShowSimilarModal(true)
                    }}
                  >
                    Find Similar (Same Month)
                  </button>
                  <button
                    className="btn-secondary border-blue-200 text-blue-700 hover:bg-blue-50 w-full sm:w-auto"
                    onClick={async () => {
                      setShowDuplicatesModal(true)
                      setDuplicatesLoading(true)
                      setDuplicatesError(null)
                      setDetectedDuplicates([])
                      setDuplicateGroups([])
                      setSelectedDuplicateIds(new Set())
                      try {
                        const resp = await fetch(getApiUrl('/api/ai/detect-duplicates'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ expenses })
                        })
                        if (!resp.ok) throw new Error('Failed to detect duplicates')
                        const json = await resp.json()
                        
                        if (json.groups && Array.isArray(json.groups)) {
                          setDuplicateGroups(json.groups)
                          // Pre-select all detected duplicates
                          const allIds = new Set<string>()
                          json.groups.forEach((g: any) => {
                            if (Array.isArray(g.duplicate_ids)) {
                              g.duplicate_ids.forEach((id: string) => allIds.add(id))
                            }
                          })
                          if (allIds.size === 0) throw new Error('No duplicates found')
                          setSelectedDuplicateIds(allIds)
                        } else if (json.duplicateIds) {
                          // Fallback for old API response if any
                          setDetectedDuplicates(json.duplicateIds)
                          setSelectedDuplicateIds(new Set(json.duplicateIds))
                        } else {
                          throw new Error('No duplicates found')
                        }
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
          <div className="card mb-4 sm:mb-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4 w-full">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1 sm:sr-only">Search</label>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input !pl-10 sm:!pl-14 pr-3"
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
                      className="px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Results Summary */}
            <div className="mt-2 pt-2 sm:mt-4 sm:pt-4 border-t border-gray-200 flex flex-col gap-2 sm:gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
              {categoryAvgPerMonth && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 text-sm">
                  <span className="text-gray-600">Average per month:</span>
                  <span className="font-semibold text-blue-600">
                    {formatCurrencyExplicit(categoryAvgPerMonth.avgPerMonth, categoryAvgPerMonth.currency)} 
                    <span className="text-xs text-gray-500 ml-1">
                      (across {categoryAvgPerMonth.monthCount} month{categoryAvgPerMonth.monthCount > 1 ? 's' : ''})
                    </span>
                  </span>
                </div>
              )}
              {categoryPredictedYearly && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 text-sm">
                  <span className="text-gray-600">Predicted monthly average (yearly):</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrencyExplicit(categoryPredictedYearly.predictedMonthly, categoryPredictedYearly.currency)} 
                    <span className="text-xs text-gray-500 ml-1">
                      (based on 12 months)
                    </span>
                  </span>
                </div>
              )}
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
                        <div className="text-sm text-gray-500 break-words line-clamp-2">{expense.merchant}</div>
                      )}
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <span>{formatDate(expense.occurred_on)}</span>
                          {expense.attachment && (
                            <span title="Has attachment">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                            </span>
                          )}
                        </div>
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
                        <td className="px-6 py-4">
                          <div className="max-w-[200px] sm:max-w-xs">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {(() => {
                                const clean = String(expense.note || '').replace(/\bTransaction date\b[^;\n]*;\s*\bPosting date\b[^\n]*/gi, '').trim()
                                if (clean) return clean
                                if (expense.category) return expense.category
                                if (expense.merchant) return expense.merchant
                                return 'No description'
                              })()}
                            </div>
                            {expense.merchant && (
                              <div className="text-sm text-gray-500 break-words line-clamp-2">
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
                          <div className="flex items-center gap-2">
                            {formatDate(expense.occurred_on)}
                            {expense.attachment && (
                              <span title="Has attachment">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                              </span>
                            )}
                          </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg sm:text-xl font-bold mb-2">AI Detected Duplicate Expenses</h2>
            <p className="mb-4 text-gray-600 text-sm">
              The AI has analyzed your expenses and found potential duplicates. 
              Please review the groups below and select the ones to delete.
            </p>
            
            {duplicatesLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-blue-600">
                <svg className="animate-spin h-8 w-8 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p>Analyzing expenses with AI...</p>
              </div>
            ) : duplicatesError ? (
              <div className="py-4 text-red-600 bg-red-50 p-4 rounded border border-red-200">
                <p className="font-bold">Error</p>
                <p>{duplicatesError}</p>
              </div>
            ) : duplicateGroups.length === 0 && detectedDuplicates.length === 0 ? (
              <div className="py-8 text-center text-gray-500">No duplicates detected. Great job!</div>
            ) : (
              <div className="space-y-6">
                {duplicateGroups.map((group, idx) => (
                  <div key={idx} className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                    <div className="mb-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-blue-800">Group #{idx + 1}</span>
                        <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
                          group.confidence === 'high' ? 'bg-green-100 text-green-800' : 
                          group.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {group.confidence || 'Potential'} Match
                        </span>
                      </div>
                      <p className="text-sm text-blue-700 mt-1">{group.reason}</p>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm bg-white rounded border border-blue-100">
                        <thead>
                          <tr className="bg-blue-100 text-blue-800">
                            <th className="px-2 py-1 w-10">Action</th>
                            <th className="px-2 py-1 text-left whitespace-nowrap">Status</th>
                            <th className="px-2 py-1 text-left whitespace-nowrap">Description</th>
                            <th className="px-2 py-1 text-left whitespace-nowrap">Amount</th>
                            <th className="px-2 py-1 text-left whitespace-nowrap">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Original (if identified) */}
                          {group.original_id && (() => {
                            const original = expenses.find(e => e.id === group.original_id)
                            if (!original) return null
                            return (
                              <tr className="bg-green-50">
                                <td className="px-2 py-1 text-center text-green-600">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                </td>
                                <td className="px-2 py-1 font-medium text-green-700">Keep</td>
                                <td className="px-2 py-1 whitespace-nowrap max-w-[150px] overflow-hidden text-ellipsis">{original.note || original.merchant || original.category}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{original.amount} {original.currency}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{formatDate(original.occurred_on)}</td>
                              </tr>
                            )
                          })()}
                          
                          {/* Duplicates */}
                          {group.duplicate_ids.map((id: string) => {
                            const exp = expenses.find(e => e.id === id)
                            if (!exp) return null
                            return (
                              <tr key={id} className="hover:bg-red-50">
                                <td className="px-2 py-1 text-center">
                                  <input 
                                    type="checkbox"
                                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
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
                                <td className="px-2 py-1 text-red-600 font-medium">Delete</td>
                                <td className="px-2 py-1 whitespace-nowrap max-w-[150px] overflow-hidden text-ellipsis">{exp.note || exp.merchant || exp.category}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{exp.amount} {exp.currency}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{formatDate(exp.occurred_on)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4 pt-4 border-t">
              <button
                className="btn-secondary w-full sm:w-auto"
                onClick={() => setShowDuplicatesModal(false)}
                disabled={duplicatesLoading}
              >Cancel</button>
              <button
                className="btn-primary bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                disabled={duplicatesLoading || selectedDuplicateIds.size === 0}
                onClick={async () => {
                  if (!user) return
                  if (!window.confirm(`Delete ${selectedDuplicateIds.size} duplicate expense(s)? This cannot be undone.`)) return
                  setDuplicatesLoading(true)
                  setDuplicatesError(null)
                  try {
                    const ids = Array.from(selectedDuplicateIds)
                    await Promise.all(ids.map(id => {
                      const expenseDocRef = doc(db, 'expenses', user.uid, 'items', id)
                      return deleteDoc(expenseDocRef)
                    }))
                    setShowDuplicatesModal(false)
                    setDetectedDuplicates([])
                    setDuplicateGroups([])
                    setSelectedDuplicateIds(new Set())
                    queryClient.invalidateQueries({ queryKey: ['expenses', user.uid] })
                  } catch (e: any) {
                    setDuplicatesError(e.message || 'Error deleting duplicates')
                  } finally {
                    setDuplicatesLoading(false)
                  }
                }}
              >Delete Selected ({selectedDuplicateIds.size})</button>
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

      {/* Similar in Same Month Modal */}
      {showSimilarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg sm:text-xl font-bold mb-2">Similar Expenses in Same Month</h2>
            <p className="mb-4 text-gray-600 text-xs sm:text-sm">
              These expenses have the same amount within the same month — they might be duplicates added by mistake. 
              Select the ones you want to delete.
            </p>
            {similarGroups.length === 0 ? (
              <div className="py-8 text-center text-gray-500">No similar expenses found in the same month.</div>
            ) : (
              <div className="space-y-4">
                {similarGroups.map((group, groupIdx) => {
                  const [year, monthNum] = group.month.split('-')
                  const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
                  const groupAmount = group.expenses[0]?.amount
                  const groupCurrency = group.expenses[0]?.currency
                  return (
                    <div key={groupIdx} className="border rounded-lg p-2 sm:p-3 bg-amber-50 border-amber-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                        <span className="font-semibold text-amber-800 text-sm sm:text-base">{monthName}</span>
                        <span className="text-xs sm:text-sm text-amber-700 bg-amber-100 px-2 py-1 rounded self-start sm:self-auto">
                          {group.expenses.length} items × {groupAmount} {groupCurrency}
                        </span>
                      </div>
                      <div className="overflow-x-auto -mx-2 sm:mx-0">
                        <table className="min-w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="bg-amber-100">
                              <th className="px-1 sm:px-2 py-2 w-8 sm:w-10 align-middle">
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    className="w-3 h-3 sm:w-4 sm:h-4"
                                    checked={group.expenses.every(e => selectedSimilarIds.has(e.id))}
                                    onChange={e => {
                                      setSelectedSimilarIds(prev => {
                                        const next = new Set(prev)
                                        group.expenses.forEach(exp => {
                                          if (e.target.checked) next.add(exp.id)
                                          else next.delete(exp.id)
                                        })
                                        return next
                                      })
                                    }}
                                  />
                                </div>
                              </th>
                              <th className="px-1 sm:px-2 py-2 text-left text-xs align-middle">Note</th>
                              <th className="px-1 sm:px-2 py-2 text-left text-xs align-middle hidden sm:table-cell">Merchant</th>
                              <th className="px-1 sm:px-2 py-2 text-left text-xs align-middle">Amount</th>
                              <th className="px-1 sm:px-2 py-2 text-left text-xs align-middle">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.expenses.map(exp => (
                              <tr key={exp.id} className="border-t border-amber-200 bg-white">
                                <td className="px-1 sm:px-2 py-2 align-middle">
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="checkbox"
                                      className="w-3 h-3 sm:w-4 sm:h-4"
                                      checked={selectedSimilarIds.has(exp.id)}
                                      onChange={e => {
                                        setSelectedSimilarIds(prev => {
                                          const next = new Set(prev)
                                          if (e.target.checked) next.add(exp.id)
                                          else next.delete(exp.id)
                                          return next
                                        })
                                      }}
                                    />
                                  </div>
                                </td>
                                <td className="px-1 sm:px-2 py-2 text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none align-middle">{exp.note || exp.category || 'No description'}</td>
                                <td className="px-1 sm:px-2 py-2 text-xs sm:text-sm hidden sm:table-cell align-middle">{exp.merchant || '-'}</td>
                                <td className="px-1 sm:px-2 py-2 text-xs sm:text-sm whitespace-nowrap align-middle">{exp.amount} {exp.currency}</td>
                                <td className="px-1 sm:px-2 py-2 text-xs sm:text-sm whitespace-nowrap align-middle">{formatDate(exp.occurred_on)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <button
                className="btn-secondary"
                onClick={() => setShowSimilarModal(false)}
              >Cancel</button>
              <button
                className="btn-primary bg-red-600 hover:bg-red-700"
                disabled={selectedSimilarIds.size === 0}
                onClick={async () => {
                  if (!user) return
                  if (!window.confirm(`Delete ${selectedSimilarIds.size} expense(s)? This cannot be undone.`)) return
                  try {
                    const ids = Array.from(selectedSimilarIds)
                    await Promise.all(ids.map(id => {
                      const expenseDocRef = doc(db, 'expenses', user.uid, 'items', id)
                      return deleteDoc(expenseDocRef)
                    }))
                    setShowSimilarModal(false)
                    setSimilarGroups([])
                    setSelectedSimilarIds(new Set())
                    queryClient.invalidateQueries({ queryKey: ['expenses', user.uid] })
                  } catch (e: any) {
                    alert(e.message || 'Error deleting expenses')
                  }
                }}
              >Delete Selected ({selectedSimilarIds.size})</button>
            </div>
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-700"
              onClick={() => setShowSimilarModal(false)}
              aria-label="Close"
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
            {actionExpense.attachment ? (
              <>
                <button
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setViewAttachment(actionExpense.attachment || null)
                    setActionOpenId(null)
                    setActionExpense(null)
                    setMenuPos(null)
                  }}
                >
                  View Attachment
                </button>
                <button
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setAttachingToExpense(actionExpense)
                    setActionOpenId(null)
                    setActionExpense(null)
                    setMenuPos(null)
                  }}
                >
                  Replace Attachment
                </button>
              </>
            ) : (
              <button
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  setAttachingToExpense(actionExpense)
                  setActionOpenId(null)
                  setActionExpense(null)
                  setMenuPos(null)
                }}
              >
                Attach Bill
              </button>
            )}
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

      {/* Attachment Viewer Modal */}
      {viewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-2 sm:p-4" onClick={() => setViewAttachment(null)}>
          <div className="relative max-w-full sm:max-w-4xl max-h-[90vh] w-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <img 
              src={viewAttachment} 
              alt="Bill Attachment" 
              className="max-w-full max-h-[85vh] object-contain rounded shadow-lg bg-white" 
            />
            <button
              className="absolute top-2 right-2 bg-white rounded-full p-2 text-gray-800 hover:bg-gray-100 shadow-md"
              onClick={() => setViewAttachment(null)}
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Attach Bill Modal */}
      {attachingToExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {attachingToExpense.attachment ? 'Replace' : 'Attach'} Bill
              </h3>
              <button
                onClick={() => setAttachingToExpense(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-1">Expense Details:</p>
                <p className="text-gray-800">{attachingToExpense.note || attachingToExpense.category || 'No description'}</p>
                <p className="text-gray-500 text-xs mt-1">
                  {attachingToExpense.amount} {attachingToExpense.currency} • {formatDate(attachingToExpense.occurred_on)}
                </p>
              </div>

              {attachingToExpense.attachment && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-600 mb-2">Current Attachment:</p>
                  <img 
                    src={attachingToExpense.attachment} 
                    alt="Current bill" 
                    className="h-24 w-auto object-contain mx-auto border rounded"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleAttachBill(file)
                  }}
                  disabled={uploadingAttachment}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-primary-50 file:text-primary-700
                    hover:file:bg-primary-100
                    disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Maximum file size: 5MB. Supported formats: JPG, PNG, etc.
                </p>
              </div>

              {uploadingAttachment && (
                <div className="flex items-center justify-center py-4 text-blue-600">
                  <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm">Uploading...</span>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setAttachingToExpense(null)}
                  className="btn-secondary flex-1"
                  disabled={uploadingAttachment}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-3 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all duration-300 hover:scale-110"
          aria-label="Scroll to top"
        >
          <ArrowUpIcon className="w-5 h-5" />
        </button>
      )}
    </RequireAuth>
    </>
  )
}


