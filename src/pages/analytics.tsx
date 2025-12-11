import Head from 'next/head'
import Layout from '@/components/Layout'
import { usePreferences } from '@/contexts/PreferencesContext'
import Charts from '@/components/Charts'
import { TrendingUpIcon, DollarSignIcon, SparklesIcon, SendIcon, RefreshCwIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { getApiUrl } from '@/lib/config'

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
}

export default function Analytics() {
  const { formatCurrencyExplicit, currency: prefCurrency } = usePreferences()
  const { user } = useAuth()
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [viewCurrency, setViewCurrency] = useState(prefCurrency || 'USD')
  
  // AI Insights state
  const [aiInsights, setAiInsights] = useState<string | null>(null)
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false)
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null)
  const [userQuestion, setUserQuestion] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{role: 'user' | 'ai', content: string}>>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatScope, setChatScope] = useState<'month' | 'all'>('month') // Toggle for chat data scope
  
  console.log('AnalyticsPage - User:', user?.uid, 'Loading:', !user)

  const startOfMonth = useMemo(() => new Date(selectedYear, selectedMonth - 1, 1), [selectedMonth, selectedYear])
  const endOfMonth = useMemo(() => new Date(selectedYear, selectedMonth, 0), [selectedMonth, selectedYear])
  const startISO = useMemo(() => startOfMonth.toISOString().slice(0,10), [startOfMonth])
  const endISO = useMemo(() => endOfMonth.toISOString().slice(0,10), [endOfMonth])

  // No conversion for Analytics; filter by selected currency only

  // Fetch all expenses for the selected month (for AI insights)
  const { data: monthExpenses = [] } = useQuery<Expense[]>({
    queryKey: ['analytics-expenses-list', user?.uid, startISO, endISO, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      try {
        const expensesRef = collection(db, 'expenses', user.uid, 'items')
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
        console.error('Analytics expenses list query failed:', error)
        return []
      }
    }
  })

  // Fetch ALL expenses for the user (for "All Time" chat scope)
  const { data: allExpenses = [] } = useQuery<Expense[]>({
    queryKey: ['analytics-all-expenses', user?.uid, viewCurrency],
    enabled: !!user?.uid && chatScope === 'all',
    queryFn: async () => {
      if (!user?.uid) return []
      try {
        const expensesRef = collection(db, 'expenses', user.uid, 'items')
        const q = query(
          expensesRef,
          where('currency', '==', viewCurrency)
        )
        const snapshot = await getDocs(q)
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Expense[]
      } catch (error) {
        console.error('All expenses query failed:', error)
        return []
      }
    }
  })

  // Fetch all income records for all time (with month/year breakdown)
  interface IncomeRecord {
    month: number
    year: number
    amount: number
    currency: string
  }
  
  const { data: allTimeIncomeData = [] } = useQuery<IncomeRecord[]>({
    queryKey: ['analytics-all-income-detailed', user?.uid, viewCurrency],
    enabled: !!user?.uid && chatScope === 'all',
    queryFn: async () => {
      if (!user?.uid) return []
      try {
        const incomeRef = collection(db, 'monthly_income', user.uid, 'items')
        const q = query(incomeRef, where('currency', '==', viewCurrency))
        const snapshot = await getDocs(q)
        return snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            month: data.month,
            year: data.year,
            amount: Number(data.amount || 0),
            currency: data.currency
          }
        })
      } catch (error) {
        console.error('All income query failed:', error)
        return []
      }
    }
  })
  
  // Calculate total income for all time
  const allTimeIncomeTotal = useMemo(() => {
    return allTimeIncomeData.reduce((acc, inc) => acc + inc.amount, 0)
  }, [allTimeIncomeData])

  // Total spend for selected month with currency conversion
  const { data: spendTotal = 0 } = useQuery({
    queryKey: ['analytics-spend-total', user?.uid, startISO, endISO, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return 0
      console.log('Fetching analytics spend for user:', user.uid, 'period:', startISO, 'to', endISO, 'currency:', viewCurrency)
      try {
        const expensesRef = collection(db, 'expenses', user.uid, 'items')
        const q = query(
          expensesRef,
          where('occurred_on', '>=', startISO),
          where('occurred_on', '<=', endISO),
          where('currency', '==', viewCurrency)
        )
        const snapshot = await getDocs(q)
        console.log('Analytics expenses snapshot:', snapshot.docs.length, 'documents')
        const total = snapshot.docs.reduce((acc, doc) => {
          const data = doc.data()
          return acc + Number(data.amount || 0)
        }, 0)
        console.log('Analytics spend total:', total)
        return total
      } catch (error) {
        console.error('Analytics spend query failed:', error)
        // Return 0 if query fails (likely due to missing index)
        return 0
      }
    }
  })

  // Monthly income for selected month with currency conversion
  const { data: incomeAmt = 0 } = useQuery({
    queryKey: ['analytics-income', user?.uid, selectedMonth, selectedYear, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return 0
      try {
        const incomeRef = collection(db, 'monthly_income', user.uid, 'items')
        const q = query(
          incomeRef,
          where('month', '==', selectedMonth),
          where('year', '==', selectedYear),
          where('currency', '==', viewCurrency)
        )
        const snapshot = await getDocs(q)
        if (snapshot.empty) return 0
        const data = snapshot.docs[0].data()
        return Number(data.amount || 0)
      } catch (error) {
        console.error('Analytics income query failed:', error)
        // Return 0 if query fails (likely due to missing index)
        return 0
      }
    }
  })

  // Function to generate AI insights
  const generateAIInsights = async () => {
    if (monthExpenses.length === 0) {
      setAiInsightsError('No expenses found for this month to analyze')
      return
    }
    
    setAiInsightsLoading(true)
    setAiInsightsError(null)
    
    try {
      const resp = await fetch(getApiUrl('/api/ai/analytics-insights'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenses: monthExpenses,
          income: { amount: incomeAmt, currency: viewCurrency },
          month: selectedMonth,
          year: selectedYear,
          currency: viewCurrency,
          format: 'markdown' // Request detailed markdown format for analytics page
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
    
    const expensesToUse = chatScope === 'all' ? allExpenses : monthExpenses
    const incomeToUse = chatScope === 'all' ? allTimeIncomeTotal : incomeAmt
    const incomeRecordsToUse = chatScope === 'all' ? allTimeIncomeData : null
    const periodLabel = chatScope === 'all' 
      ? 'All Time' 
      : new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    
    if (expensesToUse.length === 0) {
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
      const resp = await fetch(getApiUrl('/api/ai/analytics-insights'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenses: expensesToUse,
          income: { amount: incomeToUse, currency: viewCurrency },
          incomeRecords: incomeRecordsToUse, // Pass monthly income breakdown for all-time analysis
          month: selectedMonth,
          year: selectedYear,
          currency: viewCurrency,
          question,
          periodLabel: chatScope === 'all' ? 'All Time Data' : undefined
        })
      })
      
      if (!resp.ok) throw new Error('Failed to get answer')
      const json = await resp.json()
      setChatHistory(prev => [...prev, { role: 'ai', content: json.insights }])
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'ai', content: `Error: ${e.message || 'Failed to get answer'}` }])
    } finally {
      setChatLoading(false)
    }
  }

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
          <div className="card mb-4 sm:mb-6">
            {/* Mobile Layout - Stacked with Labels */}
            <div className="flex flex-col gap-2 sm:gap-4 lg:hidden">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Month</label>
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
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Year</label>
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
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Currency</label>
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
          <div className="space-y-3 sm:space-y-4 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-6 mb-6 sm:mb-8">
            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <div className="p-2 sm:p-3 rounded-full bg-primary-100 flex-shrink-0">
                    <DollarSignIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-sm font-medium text-gray-600">Average Daily Spend</p>
                    <p className="text-lg lg:text-2xl font-bold text-gray-900">{formatCurrencyExplicit(avgDailySpend, viewCurrency)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <div className={`p-2 sm:p-3 rounded-full flex-shrink-0 ${isOverspending ? 'bg-red-100' : 'bg-success-100'}`}>
                    <TrendingUpIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${isOverspending ? 'text-red-600 rotate-180' : 'text-success-600'}`} />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
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
                    <div className="p-2 sm:p-3 rounded-full bg-warning-100 flex-shrink-0">
                      <span className="w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center text-warning-700 font-semibold">⏳</span>
                    </div>
                    <div className="ml-3 sm:ml-4 min-w-0">
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

          {/* AI Insights Section */}
          <div className="mt-8 space-y-6">
            {/* AI Generated Insights */}
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">AI Spending Insights</h3>
                </div>
                <button
                  onClick={generateAIInsights}
                  disabled={aiInsightsLoading || monthExpenses.length === 0}
                  className="btn-secondary inline-flex items-center justify-center gap-2 text-purple-700 border-purple-200 hover:bg-purple-50 disabled:opacity-50 w-full sm:w-auto"
                >
                  <RefreshCwIcon className={`w-4 h-4 ${aiInsightsLoading ? 'animate-spin' : ''}`} />
                  {aiInsightsLoading ? 'Analyzing...' : 'Generate Insights'}
                </button>
              </div>
              
              {aiInsightsError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                  {aiInsightsError}
                </div>
              )}
              
              {!aiInsights && !aiInsightsLoading && !aiInsightsError && (
                <div className="text-center py-8 text-gray-500">
                  <SparklesIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Click "Generate Insights" to get AI-powered analysis of your spending patterns.</p>
                  <p className="text-sm mt-1">The AI will analyze where you're spending most and provide recommendations.</p>
                </div>
              )}
              
              {aiInsightsLoading && (
                <div className="text-center py-8">
                  <div className="inline-flex items-center gap-2 text-purple-600">
                    <RefreshCwIcon className="w-5 h-5 animate-spin" />
                    <span>Analyzing your spending data...</span>
                  </div>
                </div>
              )}
              
              {aiInsights && !aiInsightsLoading && (
                <div className="prose prose-sm max-w-none">
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-100">
                    <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                      {aiInsights.split('\n').map((line, i) => {
                        const trimmed = line.trim()
                        if (!trimmed) return <div key={i} className="h-2" />

                        // Helper to render bold text
                        const renderText = (text: string) => {
                          return text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={j} className="text-gray-900 font-semibold">{part.slice(2, -2)}</strong>
                            }
                            return part
                          })
                        }

                        // Headers
                        if (trimmed.startsWith('###')) {
                          return <h3 key={i} className="text-lg font-bold text-indigo-900 mt-4 mb-2 flex items-center gap-2">{renderText(trimmed.replace(/^###\s*/, ''))}</h3>
                        }
                        if (trimmed.startsWith('##')) {
                          return <h2 key={i} className="text-xl font-bold text-indigo-900 mt-5 mb-3">{renderText(trimmed.replace(/^##\s*/, ''))}</h2>
                        }

                        // List items
                        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                          return (
                            <div key={i} className="flex items-start gap-2 mb-2 pl-2">
                              <span className="text-indigo-400 mt-1.5 flex-shrink-0">•</span>
                              <div className="text-gray-700">{renderText(trimmed.replace(/^[-*]\s*/, ''))}</div>
                            </div>
                          )
                        }

                        // Numbered lists
                        if (/^\d+\.\s/.test(trimmed)) {
                           return (
                            <div key={i} className="flex items-start gap-2 mb-2 pl-2">
                              <span className="text-indigo-600 font-medium min-w-[1.5rem] flex-shrink-0">{trimmed.match(/^\d+\./)?.[0]}</span>
                              <div className="text-gray-700">{renderText(trimmed.replace(/^\d+\.\s*/, ''))}</div>
                            </div>
                          )
                        }

                        return <p key={i} className="mb-2 text-gray-700">{renderText(line)}</p>
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ask AI Section */}
            <div className="card">
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Ask AI About Your Finances</h3>
                </div>
                {/* Scope Toggle */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-full sm:w-auto">
                  <button
                    onClick={() => setChatScope('month')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      chatScope === 'month' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => setChatScope('all')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      chatScope === 'all' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All Time
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {chatScope === 'all' 
                  ? `Ask any question about all your ${viewCurrency} finances across all time.`
                  : `Ask any question about your spending data for ${new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}.`
                }
                {chatScope === 'all' && allExpenses.length > 0 && (
                  <span className="ml-1 text-blue-600 font-medium">
                    ({allExpenses.length} transactions, {allTimeIncomeData.length} income records)
                  </span>
                )}
              </p>
              
              {/* Chat History */}
              {chatHistory.length > 0 && (
                <div className="mb-4 max-h-96 overflow-y-auto space-y-3 border rounded-lg p-3 bg-gray-50">
                  {chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-4 py-2 ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-700'
                        }`}
                      >
                        <div className="whitespace-pre-wrap text-sm">
                          {msg.content.split('\n').map((line, j) => {
                            const parts = line.split(/(\*\*[^*]+\*\*)/g)
                            return (
                              <p key={j} className={line.startsWith('-') ? 'ml-2' : ''}>
                                {parts.map((part, k) => {
                                  if (part.startsWith('**') && part.endsWith('**')) {
                                    return <strong key={k}>{part.slice(2, -2)}</strong>
                                  }
                                  return part
                                })}
                              </p>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
                        <div className="flex items-center gap-2 text-gray-500">
                          <RefreshCwIcon className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Question Input */}
              <div className="flex flex-col sm:flex-row gap-2">
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
                  placeholder="e.g., What's my biggest spending category?"
                  className="input flex-1 text-sm"
                  disabled={chatLoading}
                />
                <button
                  onClick={askQuestion}
                  disabled={chatLoading || !userQuestion.trim()}
                  className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
                >
                  <SendIcon className="w-4 h-4" />
                  Ask
                </button>
              </div>
              
              {/* Example Questions */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500 w-full sm:w-auto">Try:</span>
                {(chatScope === 'all' ? [
                  'What is my saving rate in last 6 months?',
                  'Which month did I save the most?',
                  'What\'s my average monthly spending?',
                  'How are my savings trending?'
                ] : [
                  'Where am I spending the most?',
                  'How can I reduce my expenses?',
                  'Am I on track with my budget?',
                  'What are my top 3 merchants?'
                ]).map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setUserQuestion(q)
                    }}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Basic Stats Card */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-600">Total Spending</p>
                  <p className="font-semibold text-lg">{formatCurrencyExplicit(spendTotal, viewCurrency)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-600">Income</p>
                  <p className="font-semibold text-lg">{formatCurrencyExplicit(incomeAmt, viewCurrency)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-600">Daily Average</p>
                  <p className="font-semibold text-lg">{formatCurrencyExplicit(avgDailySpend, viewCurrency)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-600">Transactions</p>
                  <p className="font-semibold text-lg">{monthExpenses.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  )
}
