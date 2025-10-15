import { CreditCardIcon, TrendingUpIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useState, useEffect } from 'react'
import { usePreferences } from '@/contexts/PreferencesContext'

function startEndOfMonth(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const toISO = (x: Date) => x.toISOString().slice(0, 10)
  return { start: toISO(start), end: toISO(end) }
}

export default function StatsCards({ selectedCurrency, onSelectedCurrencyChange }: { selectedCurrency?: string; onSelectedCurrencyChange?: (code: string) => void } = {}) {
  const { user } = useAuth()
  const { formatCurrencyExplicit, currency: prefCurrency } = usePreferences()
  const now = new Date()
  const { start, end } = startEndOfMonth(now)
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  // Month/Year selection for editing income (defaults to current)
  const [selectedMonth, setSelectedMonth] = useState(month)
  const [selectedYear, setSelectedYear] = useState(year)
  const { start: selectedStart, end: selectedEnd } = startEndOfMonth(new Date(selectedYear, selectedMonth - 1, 1))

  // In mixed mode, we don't convert. Use the selected incomeCurrency as the view currency for all cards.
  // Inline editor state for income and the currency filter for all cards
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeCurrency, setIncomeCurrency] = useState(prefCurrency || 'USD')
  const viewCurrency = selectedCurrency || incomeCurrency
  const [savingIncome, setSavingIncome] = useState(false)
  const [incomeError, setIncomeError] = useState<string | null>(null)

  const { data: spending = { amount: 0, currency: prefCurrency || 'USD' }, isLoading: loadingSpend } = useQuery({
    queryKey: ['monthly-spend-total', user?.id, selectedStart, selectedEnd, viewCurrency],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('amount, currency, occurred_on')
        .eq('user_id', user!.id)
        .gte('occurred_on', selectedStart)
        .lte('occurred_on', selectedEnd)
        .eq('currency', viewCurrency)
      if (error) throw error
      const total = (data || []).reduce((acc, row: any) => acc + Number(row.amount || 0), 0)
      return { amount: total, currency: viewCurrency }
    }
  })

  const { data: budget = { amount: 0, currency: prefCurrency || 'USD' }, isLoading: loadingBudget } = useQuery({
    queryKey: ['monthly-budget-total', user?.id, selectedMonth, selectedYear, viewCurrency],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('amount, currency')
        .eq('user_id', user!.id)
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .eq('currency', viewCurrency)
      if (error) throw error
      const total = (data || []).reduce((acc, row: any) => acc + Number(row.amount || 0), 0)
      return { amount: total, currency: viewCurrency }
    }
  })

  // Monthly Income for current month
  const queryClient = useQueryClient()
  const { data: income = { amount: 0, currency: prefCurrency || 'USD' }, isLoading: loadingIncome } = useQuery({
    queryKey: ['monthly-income', user?.id, selectedMonth, selectedYear, viewCurrency],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_income')
        .select('amount, currency')
        .eq('user_id', user!.id)
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .eq('currency', viewCurrency)
        .maybeSingle()
      if (error && !(`${error.message}`.includes('does not exist'))) throw error
      const originalAmount = Number(data?.amount ?? 0)
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
      const payload = {
        user_id: user.id,
        month: selectedMonth,
        year: selectedYear,
        currency: viewCurrency,
        amount: amt,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('monthly_income')
        .upsert(payload, { onConflict: 'user_id,year,month' })
      if (error) {
        const msg = `${error.message}`.includes('does not exist')
          ? 'Database table missing. Run migration to create monthly_income.'
          : error.message
        setIncomeError(msg)
      } else {
        queryClient.invalidateQueries({ queryKey: ['monthly-income', user.id, selectedMonth, selectedYear, viewCurrency] })
      }
    } finally {
      setSavingIncome(false)
    }
  }

  const cards: Array<{ name: string; value: string; icon: any }> = []

  // Monthly Spending card
  if (!loadingSpend) {
    cards.push({
      name: `Monthly Spending`,
      value: formatCurrencyExplicit(spending.amount, viewCurrency),
      icon: CreditCardIcon,
    })
  }

  // Budget Used card (only if a budget exists)
  if (!loadingBudget && budget.amount > 0) {
    const usedPct = budget.amount > 0 ? Math.min(100, (spending.amount / budget.amount) * 100) : 0
    cards.push({
      name: 'Budget Used',
      value: `${usedPct.toFixed(0)}%`,
      icon: TrendingUpIcon,
    })
  }

  // Total Balance & Savings Rate (requires income)
  if (!loadingIncome) {
    const incomeAmt = Number(income.amount || 0)
    if (incomeAmt > 0) {
      const balance = incomeAmt - spending.amount
      cards.unshift({
        name: 'Total Balance',
        value: formatCurrencyExplicit(balance, viewCurrency),
        icon: TrendingUpIcon,
      })
  const savingsRate = incomeAmt > 0 ? Math.max(0, Math.min(100, (balance / incomeAmt) * 100)) : 0
      cards.push({
        name: 'Savings Rate',
        value: `${savingsRate.toFixed(0)}%`,
        icon: TrendingUpIcon,
      })
    }
  }

  if (cards.length === 0) return null

  return (
    <div className="space-y-4">
      {/* Monthly Income editor */}
      <div className="card">
        {/* Header - always visible */}
        <div className="text-sm font-medium text-gray-700 mb-3">
          Monthly Income
          <span className="hidden sm:inline"> ({new Date(selectedYear, selectedMonth - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })})</span>
        </div>
        {incomeError && (
          <div className="text-xs text-red-600 mb-3">{incomeError}</div>
        )}
        
        {/* Mobile Layout - Stacked */}
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="input text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'short' })}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="input text-sm"
            >
              {Array.from({ length: 7 }, (_, i) => year - 3 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={viewCurrency}
              onChange={(e) => {
                const v = e.target.value
                if (onSelectedCurrencyChange) onSelectedCurrencyChange(v)
                setIncomeCurrency(v)
              }}
              className="input text-sm"
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
              className="input text-sm"
              placeholder="Amount"
            />
          </div>
          <button
            onClick={saveIncome}
            className="btn-primary w-full"
            disabled={savingIncome}
          >
            {savingIncome ? 'Saving…' : 'Save Income'}
          </button>
        </div>

        {/* Desktop Layout - Horizontal */}
        <div className="hidden sm:flex items-center gap-2">
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((stat) => {
        const IconComponent = stat.icon
        return (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <IconComponent className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">{stat.name}</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">{stat.value}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
