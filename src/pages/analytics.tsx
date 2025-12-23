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

      try {
        const expensesRef = collection(db, 'expenses', user.uid, 'items')
        const q = query(
          expensesRef,
          where('occurred_on', '>=', startISO),
          where('occurred_on', '<=', endISO),
          where('currency', '==', viewCurrency)
        )
        const snapshot = await getDocs(q)
        const total = snapshot.docs.reduce((acc, doc) => {
          const data = doc.data()
          return acc + Number(data.amount || 0)
        }, 0)
        return total
      } catch (error) {
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
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': user?.uid || 'anonymous'
        },
        body: JSON.stringify({
          expenses: monthExpenses,
          income: { amount: incomeAmt, currency: viewCurrency },
          month: selectedMonth,
          year: selectedYear,
          currency: viewCurrency,
          format: 'markdown'
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
      // Use absolute URL for API calls in native app
      const baseUrl = 'https://expenso-ex.vercel.app'
      const apiUrl = `${baseUrl}/api/ai/analytics-insights`
      
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': user?.uid || 'anonymous'
        },
        body: JSON.stringify({
          expenses: expensesToUse,
          income: { amount: incomeToUse, currency: viewCurrency },
          incomeRecords: incomeRecordsToUse,
          month: selectedMonth,
          year: selectedYear,
          currency: viewCurrency,
          question,
          periodLabel: chatScope === 'all' ? 'All Time Data' : undefined
        })
      })
      
      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`Server error (${resp.status}): ${errorText}`)
      }
      const json = await resp.json()
      setChatHistory(prev => [...prev, { role: 'ai', content: json.insights }])
    } catch (e: any) {
      const errorMsg = e.message || 'Failed to get answer'
      setChatHistory(prev => [...prev, { role: 'ai', content: `Sorry, I encountered an error: ${errorMsg}\n\nPlease check your internet connection and try again.` }])
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
              <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
              <p className="text-gray-600 mt-2">Insights into your spending patterns and trends</p>
            </div>
          </div>

          {/* Period and Currency selection - Mobile Optimized */}
          <div className="card !p-3 lg:!p-6 mb-4 lg:mb-6">
            {/* Mobile Layout - Equal Width Pills */}
            <div className="grid grid-cols-3 gap-2 lg:hidden">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'short' })}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"
              >
                {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={viewCurrency}
                onChange={(e) => setViewCurrency(e.target.value)}
                className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"
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

          {/* Quick Stats - Mobile Optimized */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-6 mb-4 lg:mb-8">
            <div className="bg-gradient-to-br from-primary-50 to-indigo-100 rounded-2xl p-3 lg:p-5 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center">
                <div className="hidden lg:block p-2 sm:p-3 rounded-full bg-primary-100 flex-shrink-0">
                  <span className="w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center text-primary-600 font-semibold text-base sm:text-lg">{getCurrencySymbol(viewCurrency)}</span>
                </div>
                <div className="lg:ml-4">
                  <p className="text-[10px] lg:text-sm font-medium text-gray-500 uppercase tracking-wide">Daily Avg</p>
                  <p className="text-base lg:text-2xl font-bold text-gray-900 mt-0.5">{formatCurrencyExplicit(avgDailySpend, viewCurrency)}</p>
                </div>
              </div>
            </div>

            <div className={`${isOverspending ? 'bg-gradient-to-br from-red-50 to-red-100' : 'bg-gradient-to-br from-green-50 to-emerald-100'} rounded-2xl p-3 lg:p-5 shadow-sm`}>
              <div className="flex flex-col lg:flex-row lg:items-center">
                <div className={`hidden lg:block p-2 sm:p-3 rounded-full flex-shrink-0 ${isOverspending ? 'bg-red-100' : 'bg-success-100'}`}>
                  <TrendingUpIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${isOverspending ? 'text-red-600 rotate-180' : 'text-success-600'}`} />
                </div>
                <div className="lg:ml-4">
                  <p className="text-[10px] lg:text-sm font-medium text-gray-500 uppercase tracking-wide">{isOverspending ? 'Deficit' : 'Savings'}</p>
                  <p className={`text-base lg:text-2xl font-bold mt-0.5 ${isOverspending ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatCurrencyExplicit(Math.abs(savings), viewCurrency)}
                  </p>
                </div>
              </div>
            </div>

            {isCurrentMonth && (
              <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-3 lg:p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center">
                  <div className="hidden lg:block p-2 sm:p-3 rounded-full bg-warning-100 flex-shrink-0">
                    <span className="w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center text-warning-700 font-semibold">⏳</span>
                  </div>
                  <div className="lg:ml-4">
                    <p className="text-[10px] lg:text-sm font-medium text-gray-500 uppercase tracking-wide">Days Left</p>
                    <p className="text-base lg:text-2xl font-bold text-gray-900 mt-0.5">{daysLeft} days</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Charts */}
          <Charts month={selectedMonth} year={selectedYear} currency={viewCurrency} />

          {/* AI Insights Section */}
          <div className="mt-6 lg:mt-8 space-y-4 lg:space-y-6">
            {/* AI Generated Insights */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Header - Gradient */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-3 lg:p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center lg:hidden">
                      <SparklesIcon className="w-4 h-4" />
                    </div>
                    <SparklesIcon className="w-5 h-5 hidden lg:block" />
                    <div>
                      <h3 className="text-sm lg:text-lg font-semibold">AI Spending Insights</h3>
                      <p className="text-[10px] lg:text-xs text-white/80 lg:hidden">
                        {new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={generateAIInsights}
                    disabled={aiInsightsLoading || monthExpenses.length === 0}
                    className="p-2 lg:px-3 lg:py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <RefreshCwIcon className={`w-4 h-4 ${aiInsightsLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden lg:inline text-sm font-medium">{aiInsightsLoading ? 'Analyzing...' : 'Generate'}</span>
                  </button>
                </div>
              </div>
              
              <div className="p-4 lg:p-6">
                {aiInsightsError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs lg:text-sm mb-4">
                    {aiInsightsError}
                  </div>
                )}
                
                {!aiInsights && !aiInsightsLoading && !aiInsightsError && (
                  <div className="text-center py-6 lg:py-8 text-gray-500">
                    <div className="w-12 h-12 lg:w-14 lg:h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <SparklesIcon className="w-6 h-6 lg:w-7 lg:h-7 text-purple-400" />
                    </div>
                    <p className="text-sm lg:text-base">Tap to analyze your spending patterns</p>
                    <p className="text-xs lg:text-sm mt-1 text-gray-400">AI will identify trends and recommendations</p>
                  </div>
                )}
                
                {aiInsightsLoading && (
                  <div className="text-center py-6 lg:py-8">
                    <div className="inline-flex items-center gap-2 text-purple-600">
                      <RefreshCwIcon className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Analyzing spending data...</span>
                    </div>
                  </div>
                )}
                
                {aiInsights && !aiInsightsLoading && (
                  <div className="prose prose-sm max-w-none">
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-3 lg:p-4 border border-purple-100">
                      <div className="whitespace-pre-wrap text-gray-700 leading-relaxed text-xs lg:text-sm">
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
                            return <h3 key={i} className="text-base lg:text-lg font-bold text-indigo-900 mt-3 lg:mt-4 mb-2 flex items-center gap-2">{renderText(trimmed.replace(/^###\s*/, ''))}</h3>
                          }
                          if (trimmed.startsWith('##')) {
                            return <h2 key={i} className="text-lg lg:text-xl font-bold text-indigo-900 mt-4 lg:mt-5 mb-2 lg:mb-3">{renderText(trimmed.replace(/^##\s*/, ''))}</h2>
                          }

                          // List items
                          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                            return (
                              <div key={i} className="flex items-start gap-2 mb-1.5 lg:mb-2 pl-1 lg:pl-2">
                                <span className="text-indigo-400 mt-1 flex-shrink-0">•</span>
                                <div className="text-gray-700">{renderText(trimmed.replace(/^[-*]\s*/, ''))}</div>
                              </div>
                            )
                          }

                          // Numbered lists
                          if (/^\d+\.\s/.test(trimmed)) {
                             return (
                              <div key={i} className="flex items-start gap-2 mb-1.5 lg:mb-2 pl-1 lg:pl-2">
                                <span className="text-indigo-600 font-medium min-w-[1.25rem] lg:min-w-[1.5rem] flex-shrink-0">{trimmed.match(/^\d+\./)?.[0]}</span>
                                <div className="text-gray-700">{renderText(trimmed.replace(/^\d+\.\s*/, ''))}</div>
                              </div>
                            )
                          }

                          return <p key={i} className="mb-1.5 lg:mb-2 text-gray-700">{renderText(line)}</p>
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ask AI Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-3 lg:p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center lg:hidden">
                      <SparklesIcon className="w-4 h-4" />
                    </div>
                    <SparklesIcon className="w-5 h-5 hidden lg:block" />
                    <h3 className="text-sm lg:text-lg font-semibold">Ask AI</h3>
                  </div>
                  {/* Scope Toggle */}
                  <div className="flex items-center gap-1 bg-white/20 rounded-lg p-0.5">
                    <button
                      onClick={() => setChatScope('month')}
                      className={`px-2 lg:px-3 py-1 text-[10px] lg:text-xs font-medium rounded-md transition-colors ${
                        chatScope === 'month' 
                          ? 'bg-white text-blue-600' 
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      Month
                    </button>
                    <button
                      onClick={() => setChatScope('all')}
                      className={`px-2 lg:px-3 py-1 text-[10px] lg:text-xs font-medium rounded-md transition-colors ${
                        chatScope === 'all' 
                          ? 'bg-white text-blue-600' 
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      All Time
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-3 lg:p-4">
                <p className="text-xs lg:text-sm text-gray-600 mb-3">
                  {chatScope === 'all' 
                    ? `Ask about all your ${viewCurrency} finances.`
                    : `Ask about ${new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })} spending.`
                  }
                  {chatScope === 'all' && allExpenses.length > 0 && (
                    <span className="text-blue-600 font-medium">
                      {' '}({allExpenses.length} transactions)
                    </span>
                  )}
                </p>
                
                {/* Chat History */}
                {chatHistory.length > 0 && (
                  <div className="mb-3 max-h-72 lg:max-h-96 overflow-y-auto space-y-2 lg:space-y-3 border rounded-xl p-2 lg:p-3 bg-gray-50">
                    {chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[90%] lg:max-w-[85%] rounded-xl px-3 py-2 lg:px-4 lg:py-3 ${
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-200 text-gray-700 shadow-sm'
                          }`}
                        >
                          <div className="text-xs lg:text-sm prose prose-sm max-w-none prose-headings:font-semibold prose-p:my-1 lg:prose-p:my-2 prose-ul:my-1 lg:prose-ul:my-2 prose-li:my-0 prose-strong:text-gray-900 prose-table:w-full prose-th:bg-gray-100 prose-th:p-2 prose-th:text-left prose-td:p-2 prose-td:border prose-th:border">
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
                                      <div className="bg-white p-3 lg:p-4 rounded-lg border mt-3 lg:mt-4">
                                        <h4 className="font-semibold mb-2 text-gray-800 text-xs lg:text-sm">{chartData.title}</h4>
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
                                              <Pie data={chartData.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
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
                        <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2 text-gray-500">
                            <RefreshCwIcon className="w-4 h-4 animate-spin" />
                            <span className="text-xs">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Question Input */}
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
                    placeholder="Ask a question..."
                    className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={askQuestion}
                    disabled={chatLoading || !userQuestion.trim()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <SendIcon className="w-4 h-4" />
                    <span className="hidden lg:inline text-sm font-medium">Ask</span>
                  </button>
                </div>
                
                {/* Example Questions - Grid on mobile */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(chatScope === 'all' ? [
                    'Saving rate?',
                    'Best month?',
                    'Avg spending?',
                    'Savings trend?'
                  ] : [
                    'Top category?',
                    'Cut expenses?',
                    'On budget?',
                    'Top merchants?'
                  ]).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setUserQuestion(q)}
                      className="text-[10px] lg:text-xs px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors text-center"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Basic Stats Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
              <h3 className="text-sm lg:text-lg font-semibold text-gray-900 mb-3 lg:mb-4">Quick Summary</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 uppercase tracking-wide">Spending</p>
                  <p className="font-bold text-sm lg:text-lg text-gray-900 mt-0.5">{formatCurrencyExplicit(spendTotal, viewCurrency)}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 uppercase tracking-wide">Income</p>
                  <p className="font-bold text-sm lg:text-lg text-green-600 mt-0.5">{formatCurrencyExplicit(incomeAmt, viewCurrency)}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 uppercase tracking-wide">Daily Avg</p>
                  <p className="font-bold text-sm lg:text-lg text-blue-600 mt-0.5">{formatCurrencyExplicit(avgDailySpend, viewCurrency)}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-violet-100 rounded-xl p-3">
                  <p className="text-[10px] lg:text-xs text-gray-500 uppercase tracking-wide">Transactions</p>
                  <p className="font-bold text-sm lg:text-lg text-purple-600 mt-0.5">{monthExpenses.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  )
}
