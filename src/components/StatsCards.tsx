import { CreditCardIcon, TrendingUpIcon, ChevronDownIcon, PencilIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore'
import { useState, useEffect } from 'react'
import { usePreferences } from '@/contexts/PreferencesContext'

function startEndOfMonth(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const toISO = (x: Date) => x.toISOString().slice(0, 10)
  return { start: toISO(start), end: toISO(end) }
}

interface StatsCardsProps {
  selectedCurrency?: string
  onSelectedCurrencyChange?: (code: string) => void
  selectedMonth?: number
  selectedYear?: number
  onSelectedMonthChange?: (month: number) => void
  onSelectedYearChange?: (year: number) => void
}

export default function StatsCards({ 
  selectedCurrency, 
  onSelectedCurrencyChange,
  selectedMonth: controlledMonth,
  selectedYear: controlledYear,
  onSelectedMonthChange,
  onSelectedYearChange
}: StatsCardsProps = {}) {
  const { user } = useAuth()
  const { formatCurrencyExplicit, currency: prefCurrency, loading: prefsLoading } = usePreferences()
  const now = new Date()
  const { start, end } = startEndOfMonth(now)
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  // Month/Year selection for editing income (defaults to current)
  // Use controlled values if provided, otherwise use local state
  const [localMonth, setLocalMonth] = useState(month)
  const [localYear, setLocalYear] = useState(year)
  
  const selectedMonth = controlledMonth ?? localMonth
  const selectedYear = controlledYear ?? localYear
  
  const setSelectedMonth = (m: number) => {
    if (onSelectedMonthChange) onSelectedMonthChange(m)
    else setLocalMonth(m)
  }
  
  const setSelectedYear = (y: number) => {
    if (onSelectedYearChange) onSelectedYearChange(y)
    else setLocalYear(y)
  }
  const { start: selectedStart, end: selectedEnd } = startEndOfMonth(new Date(selectedYear, selectedMonth - 1, 1))

  // In mixed mode, we don't convert. Use the selected incomeCurrency as the view currency for all cards.
  // Inline editor state for income and the currency filter for all cards
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeCurrency, setIncomeCurrency] = useState(prefCurrency || 'USD')
  
  // Sync incomeCurrency with prefCurrency when it loads from Firebase
  useEffect(() => {
    if (!prefsLoading && prefCurrency) {
      setIncomeCurrency(prefCurrency)
    }
  }, [prefCurrency, prefsLoading])
  
  const viewCurrency = selectedCurrency || incomeCurrency
  const [savingIncome, setSavingIncome] = useState(false)
  const [incomeError, setIncomeError] = useState<string | null>(null)
  const [isIncomeExpanded, setIsIncomeExpanded] = useState(false)

  const { data: spending = { amount: 0, currency: prefCurrency || 'USD' }, isLoading: loadingSpend } = useQuery({
    queryKey: ['monthly-spend-total', user?.uid, selectedStart, selectedEnd, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return { amount: 0, currency: viewCurrency }
      const expensesRef = collection(db, 'expenses', user.uid, 'items')
      const q = query(
        expensesRef,
        where('occurred_on', '>=', selectedStart),
        where('occurred_on', '<=', selectedEnd),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      const total = snapshot.docs.reduce((acc, doc) => acc + Number(doc.data().amount || 0), 0)
      return { amount: total, currency: viewCurrency }
    }
  })

  const { data: budget = { amount: 0, currency: prefCurrency || 'USD' }, isLoading: loadingBudget } = useQuery({
    queryKey: ['monthly-budget-total', user?.uid, selectedMonth, selectedYear, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return { amount: 0, currency: viewCurrency }
      const budgetsRef = collection(db, 'budgets', user.uid, 'items')
      const q = query(
        budgetsRef,
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      const total = snapshot.docs.reduce((acc, doc) => acc + Number(doc.data().amount || 0), 0)
      return { amount: total, currency: viewCurrency }
    }
  })

  // Monthly Income for current month
  const queryClient = useQueryClient()
  const { data: income = { amount: 0, currency: prefCurrency || 'USD' }, isLoading: loadingIncome } = useQuery({
    queryKey: ['monthly-income', user?.uid, selectedMonth, selectedYear, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return { amount: 0, currency: viewCurrency }
      const incomeRef = collection(db, 'monthly_income', user.uid, 'items')
      const q = query(
        incomeRef,
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      if (snapshot.empty) return { amount: 0, currency: viewCurrency }
      const data = snapshot.docs[0].data()
      const originalAmount = Number(data.amount ?? 0)
      return { amount: originalAmount, currency: viewCurrency }
    }
  })

  useEffect(() => {
    if (!loadingIncome) {
      setIncomeAmount(String(income.amount || ''))
      const c = income.currency || 'USD'
      setIncomeCurrency(c)
      if (onSelectedCurrencyChange && selectedCurrency === undefined) {
        // If uncontrolled from parent, keep parent informed optionally
        onSelectedCurrencyChange(c)
      }
    }
  }, [loadingIncome, income, selectedMonth, selectedYear])

  const saveIncome = async () => {
    if (!user) return
    setIncomeError(null)
    const amt = Number(incomeAmount)
    if (!amt || isNaN(amt) || amt <= 0) {
      setIncomeError('Enter a valid income amount > 0')
      return
    }
    setSavingIncome(true)
    try {
      // Create a deterministic doc ID based on user/year/month/currency
      const docId = `${user.uid}_${selectedYear}_${selectedMonth}_${viewCurrency}`
      const incomeDocRef = doc(db, 'monthly_income', user.uid, 'items', docId)
      const payload = {
        month: selectedMonth,
        year: selectedYear,
        currency: viewCurrency,
        amount: amt,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
      await setDoc(incomeDocRef, payload, { merge: true })
      queryClient.invalidateQueries({ queryKey: ['monthly-income', user.uid, selectedMonth, selectedYear, viewCurrency] })
    } catch (error: any) {
      setIncomeError(error.message || 'Failed to save income')
    } finally {
      setSavingIncome(false)
    }
  }

  // Compact currency formatter for mobile (e.g., 114.5K instead of 114,483.48)
  const formatCompact = (amount: number, currency: string) => {
    const absAmount = Math.abs(amount)
    const sign = amount < 0 ? '-' : ''
    let symbol = ''
    try {
      symbol = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(0).replace(/[\d.,\s]/g, '')
    } catch { symbol = currency + ' ' }
    
    if (absAmount >= 1000000) {
      return `${sign}${symbol}${(absAmount / 1000000).toFixed(1)}M`
    } else if (absAmount >= 10000) {
      return `${sign}${symbol}${(absAmount / 1000).toFixed(1)}K`
    } else if (absAmount >= 1000) {
      return `${sign}${symbol}${(absAmount / 1000).toFixed(2)}K`
    }
    return formatCurrencyExplicit(amount, currency)
  }

  const cards: Array<{ name: string; value: string; compactValue: string; icon: any }> = []

  // Monthly Spending card
  if (!loadingSpend) {
    cards.push({
      name: `Monthly Spending`,
      value: formatCurrencyExplicit(spending.amount, viewCurrency),
      compactValue: formatCompact(spending.amount, viewCurrency),
      icon: CreditCardIcon,
    })
  }

  // Budget Used card (only if a budget exists)
  if (!loadingBudget && budget.amount > 0) {
    const usedPct = budget.amount > 0 ? Math.min(100, (spending.amount / budget.amount) * 100) : 0
    cards.push({
      name: 'Budget Used',
      value: `${usedPct.toFixed(0)}%`,
      compactValue: `${usedPct.toFixed(0)}%`,
      icon: TrendingUpIcon,
    })
  }

  // Total Balance & Savings Rate (requires income)
  if (!loadingIncome) {
    const incomeAmt = Number(income.amount || 0)
    if (incomeAmt > 0) {
      const balance = incomeAmt - spending.amount
      const isDeficit = balance < 0
      
      cards.unshift({
        name: 'Total Balance',
        value: formatCurrencyExplicit(balance, viewCurrency),
        compactValue: formatCompact(balance, viewCurrency),
        icon: TrendingUpIcon,
      })
      
      // Calculate savings rate (can be negative for deficit)
      const savingsRate = incomeAmt > 0 ? ((balance / incomeAmt) * 100) : 0
      
      // Add savings rate card
      cards.push({
        name: isDeficit ? 'Deficit Rate' : 'Savings Rate',
        value: `${Math.abs(savingsRate).toFixed(0)}%${isDeficit ? ' over' : ''}`,
        compactValue: `${Math.abs(savingsRate).toFixed(0)}%${isDeficit ? ' over' : ''}`,
        icon: TrendingUpIcon,
      })
    }
  }

  if (cards.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Filters + Income Editor */}
      <div className="card !p-3 lg:!p-5">
        {/* Mobile Layout */}
        <div className="lg:hidden space-y-3">
          {/* Filters - Always visible */}
          <div className="flex gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'short' })}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-24 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {Array.from({ length: 7 }, (_, i) => year - 3 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={viewCurrency}
              onChange={(e) => {
                const v = e.target.value
                if (onSelectedCurrencyChange) onSelectedCurrencyChange(v)
                setIncomeCurrency(v)
              }}
              className="w-20 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
              <option value="INR">INR</option>
            </select>
          </div>
          
          {/* Income Summary - Collapsible */}
          <button
            onClick={() => setIsIncomeExpanded(!isIncomeExpanded)}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Income</p>
                <p className="text-base font-bold text-green-600">
                  {income.amount > 0 ? formatCurrencyExplicit(income.amount, viewCurrency) : 'Tap to set'}
                </p>
              </div>
            </div>
            <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isIncomeExpanded ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Income Edit Form - Expanded */}
          {isIncomeExpanded && (
            <div className="p-3 bg-gray-50 rounded-xl space-y-3">
              {incomeError && (
                <div className="text-xs text-red-600 p-2 bg-red-50 rounded-lg">{incomeError}</div>
              )}
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={incomeAmount}
                  onChange={(e) => setIncomeAmount(e.target.value)}
                  className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter income amount"
                />
                <button
                  onClick={() => {
                    saveIncome()
                  }}
                  className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                  disabled={savingIncome}
                >
                  {savingIncome ? '...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Desktop Layout - Always visible */}
        <div className="hidden lg:block">
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm lg:text-base font-semibold text-gray-900">Monthly Income</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {new Date(selectedYear, selectedMonth - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' })}
            </span>
          </div>
          
          {incomeError && (
            <div className="text-xs text-red-600 mb-3 p-2 bg-red-50 rounded-lg">{incomeError}</div>
          )}

          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="input min-w-[140px]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'long' })}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="input w-24"
            >
              {Array.from({ length: 7 }, (_, i) => year - 3 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={viewCurrency}
              onChange={(e) => {
                const v = e.target.value
                if (onSelectedCurrencyChange) onSelectedCurrencyChange(v)
                setIncomeCurrency(v)
              }}
              className="input w-24"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
              <option value="INR">INR</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
              className="input w-32"
              placeholder="0.00"
            />
            <button
              onClick={saveIncome}
              className="btn-primary whitespace-nowrap"
              disabled={savingIncome}
            >
              {savingIncome ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards - Mobile Compact */}
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-4 lg:gap-4">
      {cards.map((stat) => {
        const IconComponent = stat.icon
        const isDeficitCard = stat.name === 'Deficit Rate' || (stat.name === 'Total Balance' && stat.value.startsWith('-'))
        const gradientBg = isDeficitCard 
          ? 'bg-gradient-to-br from-red-50 to-red-100' 
          : 'bg-gradient-to-br from-primary-50 to-indigo-100'
        const iconBg = isDeficitCard ? 'bg-red-500' : 'bg-primary-600'
        const textColor = isDeficitCard ? 'text-red-600' : 'text-gray-900'
        
        return (
          <div 
            key={stat.name} 
            className={`relative overflow-hidden rounded-xl ${gradientBg} p-2.5 lg:p-4 shadow-sm`}
          >
            {/* Mobile: Compact Vertical Layout */}
            <div className="flex flex-col lg:hidden">
              <div className={`w-6 h-6 ${iconBg} rounded-lg flex items-center justify-center mb-1.5 shadow-sm`}>
                <IconComponent className="h-3 w-3 text-white" />
              </div>
              <p className="text-[9px] font-medium text-gray-500 leading-tight">{stat.name}</p>
              <p className={`text-sm font-bold ${textColor} tracking-tight mt-0.5`}>{stat.compactValue}</p>
            </div>
            
            {/* Desktop: Horizontal Layout */}
            <div className="hidden lg:flex items-center gap-3 h-full">
              <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center shadow-lg flex-shrink-0`}>
                <IconComponent className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 mb-0.5">{stat.name}</p>
                <p className={`text-xl font-bold ${textColor} tracking-tight`}>{stat.value}</p>
              </div>
            </div>
            
            {/* Decorative circle - smaller on mobile */}
            <div className={`absolute -right-2 -bottom-2 w-10 h-10 lg:w-16 lg:h-16 ${isDeficitCard ? 'bg-red-200' : 'bg-primary-200'} rounded-full opacity-20`}></div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
