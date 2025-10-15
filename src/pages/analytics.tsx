import Head from 'next/head'
import Layout from '@/components/Layout'
import { usePreferences } from '@/contexts/PreferencesContext'
import Charts from '@/components/Charts'
import { TrendingUpIcon, DollarSignIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useMemo, useState } from 'react'

export default function Analytics() {
  const { formatCurrencyExplicit, currency: prefCurrency } = usePreferences()
  const { user } = useAuth()
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [viewCurrency, setViewCurrency] = useState(prefCurrency || 'USD')

  const startOfMonth = useMemo(() => new Date(selectedYear, selectedMonth - 1, 1), [selectedMonth, selectedYear])
  const endOfMonth = useMemo(() => new Date(selectedYear, selectedMonth, 0), [selectedMonth, selectedYear])
  const startISO = useMemo(() => startOfMonth.toISOString().slice(0,10), [startOfMonth])
  const endISO = useMemo(() => endOfMonth.toISOString().slice(0,10), [endOfMonth])

  // No conversion for Analytics; filter by selected currency only

  // Total spend for selected month with currency conversion
  const { data: spendTotal = 0 } = useQuery({
    queryKey: ['analytics-spend-total', user?.id, startISO, endISO, viewCurrency],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('amount, currency, occurred_on')
        .eq('user_id', user!.id)
        .gte('occurred_on', startISO)
        .lte('occurred_on', endISO)
        .eq('currency', viewCurrency)
      if (error) throw error
      const total = (data || []).reduce((acc, r: any) => acc + Number(r.amount || 0), 0)
      return total
    }
  })

  // Monthly income for selected month with currency conversion
  const { data: incomeAmt = 0 } = useQuery({
    queryKey: ['analytics-income', user?.id, selectedMonth, selectedYear, viewCurrency],
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
      const originalAmount = Number(data?.amount || 0)
      return originalAmount
    }
  })

  // Average daily spend for the selected month
  const daysInMonth = useMemo(() => endOfMonth.getDate(), [endOfMonth])
  const avgDailySpend = useMemo(() => (daysInMonth > 0 ? spendTotal / daysInMonth : 0), [spendTotal, daysInMonth])
  const savings = useMemo(() => incomeAmt - spendTotal, [incomeAmt, spendTotal])
  const isOverspending = useMemo(() => savings < 0, [savings])
  const isCurrentMonth = useMemo(() => {
    const d = new Date()
    return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth
  }, [selectedMonth, selectedYear])
  const daysLeft = useMemo(() => {
    if (!isCurrentMonth) return null
    const today = new Date()
    return Math.max(0, Math.ceil((endOfMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
  }, [isCurrentMonth, endOfMonth])
  return (
    <>
      <Head>
  <title>Analytics - Expenso</title>
        <meta name="description" content="Analyze your spending patterns and trends" />
      </Head>

      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600 mt-2">Insights into your spending patterns and trends</p>
          </div>

          {/* Period and Currency selection */}
          <div className="card mb-6">
            {/* Mobile Layout - Stacked with Labels */}
            <div className="flex flex-col gap-4 lg:hidden">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="input w-full"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'long' })}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="input w-full"
                  >
                    {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                  <select
                    value={viewCurrency}
                    onChange={(e) => setViewCurrency(e.target.value)}
                    className="input w-full"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                    <option value="INR">INR</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Desktop Layout - Horizontal without Labels */}
            <div className="hidden lg:flex items-center gap-3">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="input min-w-[200px]"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'long' })}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="input w-28"
              >
                {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={viewCurrency}
                onChange={(e) => setViewCurrency(e.target.value)}
                className="input w-32"
                title="Analytics currency"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
                <option value="INR">INR</option>
                <option value="JPY">JPY</option>
              </select>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-6 mb-8">
            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <div className="p-3 rounded-full bg-primary-100 flex-shrink-0">
                    <DollarSignIcon className="w-6 h-6 text-primary-600" />
                  </div>
                  <div className="ml-4 min-w-0">
                    <p className="text-sm font-medium text-gray-600">Average Daily Spend</p>
                    <p className="text-lg lg:text-2xl font-bold text-gray-900">{formatCurrencyExplicit(avgDailySpend, viewCurrency)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <div className={`p-3 rounded-full flex-shrink-0 ${isOverspending ? 'bg-red-100' : 'bg-success-100'}`}>
                    <TrendingUpIcon className={`w-6 h-6 ${isOverspending ? 'text-red-600 rotate-180' : 'text-success-600'}`} />
                  </div>
                  <div className="ml-4 min-w-0">
                    <p className="text-sm font-medium text-gray-600">{isOverspending ? 'Deficit' : 'Savings'}</p>
                    <p className={`text-lg lg:text-2xl font-bold ${isOverspending ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrencyExplicit(Math.abs(savings), viewCurrency)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {isCurrentMonth && (
              <div className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className="p-3 rounded-full bg-warning-100 flex-shrink-0">
                      <span className="w-6 h-6 inline-flex items-center justify-center text-warning-700 font-semibold">⏳</span>
                    </div>
                    <div className="ml-4 min-w-0">
                      <p className="text-sm font-medium text-gray-600">Days left in month</p>
                      <p className="text-lg lg:text-2xl font-bold text-gray-900">{daysLeft}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Charts */}
          <Charts month={selectedMonth} year={selectedYear} currency={viewCurrency} />

          {/* Spending Insights */}
          <div className="mt-8">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending Insights</h3>
              <div className="space-y-2 text-sm text-gray-700">
                <p>Total spending: <span className="font-semibold">{formatCurrencyExplicit(spendTotal, viewCurrency)}</span></p>
                <p>Income: <span className="font-semibold">{formatCurrencyExplicit(incomeAmt, viewCurrency)}</span></p>
                <p>Average daily: <span className="font-semibold">{formatCurrencyExplicit(avgDailySpend, viewCurrency)}</span></p>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  )
}
