import Head from 'next/head'
import Layout from '@/components/Layout'
import React, { useState, useEffect, useMemo } from 'react'
import { usePreferences } from '@/contexts/PreferencesContext'
import Charts from '@/components/Charts'
import { TrendingUpIcon, SendIcon, RefreshCwIcon, SparklesIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { getApiUrl } from '@/lib/config'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Expense {
  id: string
  amount: number
  currency: string
  merchant?: string
  payment_method?: string
  note?: string
  occurred_on: string
  category: string
  attachment?: string
  type?: string
}

function getCurrencySymbol(currency: string): string {
  switch (currency) {
    case 'USD': return '$'
    case 'CAD': return 'CA$'
    case 'EUR': return '€'
    case 'GBP': return '£'
    case 'INR': return '₹'
    case 'JPY': return '¥'
    default: return '$'
  }
}

type DateRangePreset = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'all-time' | 'custom'

export default function Analytics() {
  const { formatCurrencyExplicit, currency: prefCurrency } = usePreferences()
  const { user } = useAuth()
  const now = new Date()
  const { getCollection, currentEnvironment } = useEnvironment()
  const [viewCurrency, setViewCurrency] = useState(currentEnvironment.currency || prefCurrency || 'USD')

  // Date range filter state
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('this-month')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Sync viewCurrency with environment currency when it changes
  useEffect(() => {
    if (currentEnvironment.currency) {
      setViewCurrency(currentEnvironment.currency)
    }
  }, [currentEnvironment.currency])

  // AI Insights state
  const [aiInsights, setAiInsights] = useState<string | null>(null)
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false)
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null)
  const [userQuestion, setUserQuestion] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai', content: string }>>([])
  const [chatLoading, setChatLoading] = useState(false)

  // Calculate date range based on preset or custom dates
  const { startISO, endISO, periodLabel } = useMemo(() => {
    let start: Date
    let end: Date
    let label: string

    switch (dateRangePreset) {
      case 'this-month':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        label = start.toLocaleString('default', { month: 'long', year: 'numeric' })
        break
      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        end = new Date(now.getFullYear(), now.getMonth(), 0)
        label = start.toLocaleString('default', { month: 'long', year: 'numeric' })
        break
      case 'this-year':
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear(), 11, 31)
        label = `${now.getFullYear()}`
        break
      case 'last-year':
        start = new Date(now.getFullYear() - 1, 0, 1)
        end = new Date(now.getFullYear() - 1, 11, 31)
        label = `${now.getFullYear() - 1}`
        break
      case 'custom':
        if (customStartDate && customEndDate) {
          start = new Date(customStartDate)
          end = new Date(customEndDate)
          label = `${start.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`
        } else {
          // Default to this month if custom dates not set
          start = new Date(now.getFullYear(), now.getMonth(), 1)
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          label = 'Custom Range'
        }
        break
      case 'all-time':
      default:
        // For all-time, use a very old start date
        start = new Date(2000, 0, 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        label = 'All Time'
        break
    }

    return {
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      periodLabel: label
    }
  }, [dateRangePreset, customStartDate, customEndDate, now])

  // No conversion for Analytics; filter by selected currency only

  // Fetch expenses for the selected date range
  const { data: periodExpenses = [] } = useQuery<Expense[]>({
    queryKey: ['analytics-expenses-list', user?.uid, startISO, endISO, viewCurrency, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      try {
        const expensesRef = getCollection('expenses')
        const q = query(
          expensesRef,
          where('occurred_on', '>=', startISO),
          where('occurred_on', '<=', endISO),
          where('currency', '==', viewCurrency)
        )
        const snapshot = await getDocs(q)
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Expense[]
      } catch (error) {
        return []
      }
    }
  })

  // Fetch income records for the selected date range (from expenses collection)
  const periodIncomeTotal = useMemo(() => {
    return periodExpenses
      .filter(exp => exp.type === 'income')
      .reduce((acc, exp) => acc + Math.abs(Number(exp.amount || 0)), 0)
  }, [periodExpenses])

  // Calculate total spending (exclude income records)
  const spendTotal = useMemo(() => {
    return periodExpenses
      .filter(exp => exp.type !== 'income')
      .reduce((acc, exp) => acc + Math.abs(Number(exp.amount || 0)), 0)
  }, [periodExpenses])

  // Function to generate AI insights
  const generateAIInsights = async () => {
    if (periodExpenses.length === 0) {
      setAiInsightsError('No expenses found for this period to analyze')
      return
    }

    setAiInsightsLoading(true)
    setAiInsightsError(null)

    try {
      // Optimize payload - only send essential fields (separate income and expenses)
      const optimizedExpenses = periodExpenses
        .filter(e => e.type !== 'income')
        .map(e => ({
          id: e.id,
          amount: e.amount,
          currency: e.currency,
          merchant: e.merchant,
          payment_method: e.payment_method,
          note: e.note?.substring(0, 100),
          occurred_on: e.occurred_on,
          category: e.category
        }))

      const incomeRecords = periodExpenses
        .filter(e => e.type === 'income')
        .map(e => ({
          id: e.id,
          amount: e.amount,
          currency: e.currency,
          merchant: e.merchant,
          note: e.note?.substring(0, 100),
          occurred_on: e.occurred_on,
          category: e.category
        }))

      const resp = await fetch(getApiUrl('/api/ai/analytics-insights'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user?.uid || 'anonymous'
        },
        body: JSON.stringify({
          expenses: optimizedExpenses,
          income: { amount: periodIncomeTotal, currency: viewCurrency },
          incomeRecords,
          currency: viewCurrency,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          format: 'markdown',
          periodLabel
        })
      })

      if (!resp.ok) throw new Error('Failed to generate insights')
      const json = await resp.json()
      setAiInsights(json.insights)
    } catch (e: any) {
      setAiInsightsError(e.message || 'Error generating insights')
    } finally {
      setAiInsightsLoading(false)
    }
  }

  // Function to ask a question
  const askQuestion = async () => {
    if (!userQuestion.trim()) return

    if (periodExpenses.length === 0) {
      setChatHistory(prev => [...prev,
      { role: 'user', content: userQuestion },
      { role: 'ai', content: `No expenses found for ${periodLabel} to analyze. Please add some expenses first.` }
      ])
      setUserQuestion('')
      return
    }

    const question = userQuestion.trim()
    setChatHistory(prev => [...prev, { role: 'user', content: question }])
    setUserQuestion('')
    setChatLoading(true)

    try {
      // Optimize payload - only send essential fields (separate income and expenses)
      const optimizedExpenses = periodExpenses
        .filter(e => e.type !== 'income')
        .map(e => ({
          id: e.id,
          amount: e.amount,
          currency: e.currency,
          merchant: e.merchant,
          payment_method: e.payment_method,
          note: e.note?.substring(0, 100),
          occurred_on: e.occurred_on,
          category: e.category
        }))

      const incomeRecords = periodExpenses
        .filter(e => e.type === 'income')
        .map(e => ({
          id: e.id,
          amount: e.amount,
          currency: e.currency,
          merchant: e.merchant,
          note: e.note?.substring(0, 100),
          occurred_on: e.occurred_on,
          category: e.category
        }))

      const resp = await fetch(getApiUrl('/api/ai/analytics-insights'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user?.uid || 'anonymous'
        },
        body: JSON.stringify({
          expenses: optimizedExpenses,
          income: { amount: periodIncomeTotal, currency: viewCurrency },
          incomeRecords,
          currency: viewCurrency,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          question,
          chatHistory: chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
          periodLabel
        })
      })

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: 'Unknown error' }))
        const errorMsg = errorData.error || resp.statusText || 'Server error'
        throw new Error(`${errorMsg} (${resp.status})`)
      }
      const json = await resp.json()
      setChatHistory(prev => [...prev, { role: 'ai', content: json.insights }])
    } catch (e: any) {
      const errorMsg = e.message || 'Failed to get answer'
      console.error('Ask AI error:', errorMsg)
      setChatHistory(prev => [...prev, {
        role: 'ai',
        content: `Sorry, I encountered an error: ${errorMsg}\n\nPlease check your internet connection and try again.`
      }])
    } finally {
      setChatLoading(false)
    }
  }

  // Calculate stats based on the period
  const daysInPeriod = useMemo(() => {
    const start = new Date(startISO)
    const end = new Date(endISO)
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }, [startISO, endISO])

  const avgDailySpend = useMemo(() => (daysInPeriod > 0 ? spendTotal / daysInPeriod : 0), [spendTotal, daysInPeriod])
  const savings = useMemo(() => periodIncomeTotal - spendTotal, [periodIncomeTotal, spendTotal])
  const isOverspending = useMemo(() => savings < 0, [savings])
  return (
    <>
      <Head>
        <title>Analytics - Expenso</title>
        <meta name="description" content="Analyze your spending patterns and trends" />
      </Head>

      <Layout>
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-8">
          {/* Header - Mobile Optimized */}
          <div className="mb-4 lg:mb-8">
            {/* Mobile Header */}
            <div className="lg:hidden">
              <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
              <p className="text-sm text-gray-500 mt-0.5">Spending insights & trends</p>
            </div>

            {/* Desktop Header */}
            <div className="hidden lg:block">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Insights into your spending patterns and trends</p>
            </div>
          </div>

          {/* Period and Currency selection - Modern Redesign */}
          <div className="card !p-4 lg:!p-6 mb-4 lg:mb-6 dark:bg-gray-800 dark:border-gray-700">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Date Range Presets */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Time Period</label>
                <div className="grid grid-cols-3 lg:flex lg:flex-wrap gap-2">
                  {[
                    { value: 'this-month' as const, label: 'This Month' },
                    { value: 'last-month' as const, label: 'Last Month' },
                    { value: 'this-year' as const, label: 'This Year' },
                    { value: 'last-year' as const, label: 'Last Year' },
                    { value: 'all-time' as const, label: 'All Time' },
                    { value: 'custom' as const, label: 'Custom' },
                  ].map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setDateRangePreset(preset.value)}
                      className={`px-3 lg:px-4 py-2 rounded-xl text-xs lg:text-sm font-medium transition-all ${dateRangePreset === preset.value
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Range Inputs */}
                {dateRangePreset === 'custom' && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="input text-sm w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End Date</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="input text-sm w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Currency Display */}
              <div className="lg:ml-4">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Currency</label>
                <div className="px-3 lg:px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 w-full lg:w-32 text-center">
                  {viewCurrency}
                </div>
              </div>
            </div>

            {/* Period Display */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Analyzing:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{periodLabel}</span>
              </div>
            </div>
          </div>

          {/* Quick Stats - Mobile Optimized */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-6 mb-4 lg:mb-8">
            <div className="bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-900/20 dark:to-rose-900/20 rounded-2xl p-3 lg:p-5 shadow-sm dark:shadow-gray-900/20">
              <div className="flex flex-col lg:flex-row lg:items-center">
                <div className="hidden lg:block p-2 sm:p-3 rounded-full bg-red-100 dark:bg-red-900/30 flex-shrink-0">
                  <span className="w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center text-red-600 dark:text-red-400 font-semibold text-base sm:text-lg">{getCurrencySymbol(viewCurrency)}</span>
                </div>
                <div className="lg:ml-4">
                  <p className="text-[10px] lg:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Spending</p>
                  <p className="text-base lg:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                    {spendTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-3 lg:p-5 shadow-sm dark:shadow-gray-900/20">
              <div className="flex flex-col lg:flex-row lg:items-center">
                <div className="hidden lg:block p-2 sm:p-3 rounded-full bg-green-100 dark:bg-green-900/30 flex-shrink-0">
                  <TrendingUpIcon className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="lg:ml-4">
                  <p className="text-[10px] lg:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Income</p>
                  <p className="text-base lg:text-2xl font-bold text-green-600 dark:text-green-400 mt-0.5">
                    {periodIncomeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary-50 to-indigo-100 dark:from-primary-900/30 dark:to-indigo-900/30 rounded-2xl p-3 lg:p-5 shadow-sm dark:shadow-gray-900/20">
              <div className="flex flex-col lg:flex-row lg:items-center">
                <div className="hidden lg:block p-2 sm:p-3 rounded-full bg-primary-100 dark:bg-primary-900/30 flex-shrink-0">
                  <span className="w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-base sm:text-lg">📊</span>
                </div>
                <div className="lg:ml-4">
                  <p className="text-[10px] lg:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Daily Avg</p>
                  <p className="text-base lg:text-2xl font-bold text-primary-600 dark:text-primary-400 mt-0.5">
                    {avgDailySpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className={`${isOverspending ? 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/20' : 'bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20'} rounded-2xl p-3 lg:p-5 shadow-sm dark:shadow-gray-900/20`}>
              <div className="flex flex-col lg:flex-row lg:items-center">
                <div className={`hidden lg:block p-2 sm:p-3 rounded-full flex-shrink-0 ${isOverspending ? 'bg-red-100 dark:bg-red-900/30' : 'bg-success-100 dark:bg-success-900/30'}`}>
                  <TrendingUpIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${isOverspending ? 'text-red-600 dark:text-red-400 rotate-180' : 'text-success-600 dark:text-success-400'}`} />
                </div>
                <div className="lg:ml-4">
                  <p className="text-[10px] lg:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{isOverspending ? 'Deficit' : 'Savings'}</p>
                  <p className={`text-base lg:text-2xl font-bold mt-0.5 ${isOverspending ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                    {Math.abs(savings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <Charts startDate={startISO} endDate={endISO} currency={viewCurrency} periodLabel={periodLabel} />

          {/* AI Insights Section - Combined */}
          <div className="mt-6 lg:mt-8 space-y-4 lg:space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 p-3 lg:p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center lg:hidden">
                      <SparklesIcon className="w-4 h-4" />
                    </div>
                    <SparklesIcon className="w-5 h-5 hidden lg:block" />
                    <div>
                      <h3 className="text-sm lg:text-lg font-semibold">AI Assistant</h3>
                      <p className="text-[10px] lg:text-xs text-white/80">
                        Insights & analysis for {periodLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={generateAIInsights}
                    disabled={aiInsightsLoading || periodExpenses.length === 0}
                    className="p-2 lg:px-3 lg:py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <RefreshCwIcon className={`w-4 h-4 ${aiInsightsLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden lg:inline text-sm font-medium">{aiInsightsLoading ? 'Analyzing...' : 'Auto Insights'}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 lg:p-6 space-y-4">
                {/* Auto-generated Insights */}
                {aiInsightsError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-xs lg:text-sm">
                    {aiInsightsError}
                  </div>
                )}

                {!aiInsights && !aiInsightsLoading && !aiInsightsError && chatHistory.length === 0 && (
                  <div className="text-center py-6 lg:py-8 text-gray-500 dark:text-gray-400">
                    <div className="w-12 h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                      <SparklesIcon className="w-6 h-6 lg:w-7 lg:h-7 text-purple-500 dark:text-purple-400" />
                    </div>
                    <p className="text-sm lg:text-base font-medium">AI-Powered Financial Analysis</p>
                    <p className="text-xs lg:text-sm mt-1 text-gray-400 dark:text-gray-500">Generate insights or ask questions about your finances</p>
                  </div>
                )}

                {aiInsightsLoading && (
                  <div className="text-center py-6 lg:py-8">
                    <div className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400">
                      <RefreshCwIcon className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Analyzing spending data...</span>
                    </div>
                  </div>
                )}

                {aiInsights && !aiInsightsLoading && (
                  <div className="prose prose-sm max-w-none">
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-3 lg:p-4 border border-purple-100 dark:border-purple-800">
                      <div className="flex items-center gap-2 mb-3">
                        <SparklesIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-300">Auto-Generated Insights</h4>
                      </div>
                      <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed text-xs lg:text-sm">
                        {aiInsights.split('\n').map((line, i) => {
                          const trimmed = line.trim()
                          if (!trimmed) return <div key={i} className="h-2" />

                          // Helper to render bold text
                          const renderText = (text: string) => {
                            return text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={j} className="text-gray-900 dark:text-white font-semibold">{part.slice(2, -2)}</strong>
                              }
                              return part
                            })
                          }

                          // Headers
                          if (trimmed.startsWith('# ')) {
                            return <h2 key={i} className="text-base lg:text-lg font-bold text-indigo-900 dark:text-indigo-300 mt-4 lg:mt-6 mb-3 flex items-center gap-2 border-b border-indigo-100 dark:border-indigo-800/50 pb-1">{renderText(trimmed.replace(/^#\s*/, ''))}</h2>
                          }
                          if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
                            return <h3 key={i} className="text-sm lg:text-base font-bold text-indigo-800 dark:text-indigo-400 mt-3 lg:mt-4 mb-2">{renderText(trimmed.replace(/^###?\s*/, ''))}</h3>
                          }

                          // List items
                          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                            return (
                              <div key={i} className="flex items-start gap-2 mb-1.5 lg:mb-2 pl-1 lg:pl-2">
                                <span className="text-indigo-400 dark:text-indigo-500 mt-1 flex-shrink-0">•</span>
                                <div className="text-gray-700 dark:text-gray-300">{renderText(trimmed.replace(/^[-*]\s*/, ''))}</div>
                              </div>
                            )
                          }

                          // Numbered lists
                          if (/^\d+\.\s/.test(trimmed)) {
                            return (
                              <div key={i} className="flex items-start gap-2 mb-1.5 lg:mb-2 pl-1 lg:pl-2">
                                <span className="text-indigo-600 dark:text-indigo-400 font-medium min-w-[1.25rem] lg:min-w-[1.5rem] flex-shrink-0">{trimmed.match(/^\d+\./)?.[0]}</span>
                                <div className="text-gray-700 dark:text-gray-300">{renderText(trimmed.replace(/^\d+\.\s*/, ''))}</div>
                              </div>
                            )
                          }

                          return <p key={i} className="mb-1.5 lg:mb-2 text-gray-700 dark:text-gray-300">{renderText(line)}</p>
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Divider - only show if there are insights or chat history */}
                {(aiInsights || chatHistory.length > 0) && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-3 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">Ask Questions</span>
                    </div>
                  </div>
                )}

                {/* Chat History */}
                {chatHistory.length > 0 && (
                  <div className="max-h-72 lg:max-h-96 overflow-y-auto space-y-2 lg:space-y-3 border border-gray-200 dark:border-gray-700 rounded-xl p-2 lg:p-3 bg-gray-50 dark:bg-gray-800">
                    {chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[90%] lg:max-w-[85%] rounded-xl px-3 py-2 lg:px-4 lg:py-3 ${msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-100 shadow-sm'
                            }`}
                        >
                          <div className="text-xs lg:text-sm prose prose-sm max-w-none prose-strong:text-gray-900 dark:prose-strong:text-white prose-headings:text-gray-900 dark:prose-headings:text-white text-gray-700 dark:text-gray-100 dark:prose-p:text-gray-100 dark:prose-li:text-gray-100">
                            {(() => {
                              // Check if message contains chart data
                              const chartMatch = msg.content.match(/```chart-data\s*([\s\S]*?)```/)
                              if (chartMatch) {
                                try {
                                  const chartData = JSON.parse(chartMatch[1])
                                  const textContent = msg.content.replace(/```chart-data[\s\S]*?```/, '').trim()
                                  return (
                                    <>
                                      {textContent && (
                                        <div className="mb-3 lg:mb-4">
                                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {textContent}
                                          </ReactMarkdown>
                                        </div>
                                      )}
                                      <div className="bg-white dark:bg-gray-800 p-3 lg:p-4 rounded-lg border border-gray-200 dark:border-gray-600 mt-3 lg:mt-4">
                                        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200 text-xs lg:text-sm">{chartData.title}</h4>
                                        <ResponsiveContainer width="100%" height={200}>
                                          {chartData.type === 'line' ? (
                                            <LineChart data={chartData.data}>
                                              <CartesianGrid strokeDasharray="3 3" />
                                              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                              <YAxis tick={{ fontSize: 10 }} />
                                              <Tooltip />
                                              <Legend wrapperStyle={{ fontSize: 10 }} />
                                              {chartData.dataKeys.map((key: string, idx: number) => (
                                                <Line key={key} type="monotone" dataKey={key} stroke={idx === 0 ? '#3b82f6' : '#ef4444'} name={chartData.labels[idx]} />
                                              ))}
                                            </LineChart>
                                          ) : chartData.type === 'bar' ? (
                                            <BarChart data={chartData.data}>
                                              <CartesianGrid strokeDasharray="3 3" />
                                              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                              <YAxis tick={{ fontSize: 10 }} />
                                              <Tooltip />
                                              <Legend wrapperStyle={{ fontSize: 10 }} />
                                              {chartData.dataKeys.map((key: string, idx: number) => (
                                                <Bar key={key} dataKey={key} fill={idx === 0 ? '#3b82f6' : '#ef4444'} name={chartData.labels[idx]} />
                                              ))}
                                            </BarChart>
                                          ) : (
                                            <PieChart>
                                              <Pie data={chartData.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label stroke="none">
                                                {chartData.data.map((entry: any, idx: number) => (
                                                  <Cell key={`cell-${idx}`} fill={['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'][idx % 5]} />
                                                ))}
                                              </Pie>
                                              <Tooltip />
                                              <Legend wrapperStyle={{ fontSize: 10 }} />
                                            </PieChart>
                                          )}
                                        </ResponsiveContainer>
                                      </div>
                                    </>
                                  )
                                } catch (e) {
                                  // Silent fail - render as regular text
                                }
                              }
                              // Regular text rendering with full markdown support
                              return (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <RefreshCwIcon className="w-4 h-4 animate-spin" />
                            <span className="text-xs">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Question Input */}
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={userQuestion}
                      onChange={(e) => setUserQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          askQuestion()
                        }
                      }}
                      placeholder="Ask a question about your finances..."
                      className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400"
                      disabled={chatLoading}
                    />
                    <button
                      onClick={askQuestion}
                      disabled={chatLoading || !userQuestion.trim()}
                      className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <SendIcon className="w-4 h-4" />
                      <span className="hidden lg:inline text-sm font-medium">Ask</span>
                    </button>
                  </div>

                  {/* Example Questions */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      'Top category?',
                      'Spending trend?',
                      'Saving rate?',
                      'Top merchants?'
                    ].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setUserQuestion(q)}
                        className="text-[10px] lg:text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors text-center"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Basic Stats Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 lg:p-6">
              <h3 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white mb-3 lg:mb-4">Quick Summary - {periodLabel}</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Spending</p>
                  <p className="font-bold text-sm lg:text-lg text-gray-900 dark:text-white mt-0.5">{formatCurrencyExplicit(spendTotal, viewCurrency)}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Income</p>
                  <p className="font-bold text-sm lg:text-lg text-green-600 dark:text-green-400 mt-0.5">{formatCurrencyExplicit(periodIncomeTotal, viewCurrency)}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-primary-900/30 dark:to-indigo-900/30 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Daily Avg</p>
                  <p className="font-bold text-sm lg:text-lg text-primary-600 dark:text-primary-400 mt-0.5">{formatCurrencyExplicit(avgDailySpend, viewCurrency)}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Transactions</p>
                  <p className="font-bold text-sm lg:text-lg text-purple-600 dark:text-purple-400 mt-0.5">{periodExpenses.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  )
}
