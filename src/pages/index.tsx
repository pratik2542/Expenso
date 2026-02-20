import Head from 'next/head'
import Link from 'next/link'
import React, { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts'
import Layout from '@/components/Layout'
import StatsCards from '@/components/StatsCards'
import AIInsightsWidget from '@/components/AIInsightsWidget'
import { RequireAuth } from '@/components/RequireAuth'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, orderBy, limit, doc, setDoc } from 'firebase/firestore'
import { usePreferences } from '@/contexts/PreferencesContext'
import { SparklesIcon } from 'lucide-react'
import { getApiUrl } from '@/lib/config'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { useRouter } from 'next/router'
import { Capacitor } from '@capacitor/core'

const palette = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#22c55e', '#eab308', '#f97316']

interface RecentExpense {
  id: string
  amount: number
  currency: string
  merchant?: string
  payment_method?: string
  note?: string
  occurred_on: string
  category: string
  type?: 'income' | 'expense' | 'transfer'
  transferAmount?: number
}

import LandingPage from '@/components/LandingPage'

// Component to display amount with color based on type
function ConvertedAmount({ amount, currency, formatCurrencyExplicit, type, transferAmount }: {
  amount: number,
  currency: string,
  formatCurrencyExplicit: (amt: number, code: string) => string,
  type?: string,
  transferAmount?: number
}) {
  // Transfer: use transferAmount and show in blue without sign
  if (type === 'transfer' && transferAmount !== undefined) {
    return <span className="text-blue-600">{formatCurrencyExplicit(transferAmount, currency)}</span>
  }

  // Income/Expense: green/red with +/- sign
  const absAmount = Math.abs(amount)
  const isIncome = type === 'income'
  const sign = isIncome ? '+' : '-'
  const colorClass = isIncome ? 'text-green-600' : 'text-red-600'

  return <span className={colorClass}>{sign}{formatCurrencyExplicit(absAmount, currency)}</span>
}

function DashboardContent() {
  const { user } = useAuth()
  const { getCollection, currentEnvironment } = useEnvironment()
  const { formatCurrency, formatCurrencyExplicit, formatDate, currency: prefCurrency, loading: prefsLoading } = usePreferences()
  const [viewCurrency, setViewCurrency] = useState(currentEnvironment.currency || prefCurrency || 'USD')

  // Sync viewCurrency with environment currency when it changes
  useEffect(() => {
    if (currentEnvironment.currency) {
      setViewCurrency(currentEnvironment.currency)
    } else if (prefCurrency) {
      setViewCurrency(prefCurrency)
    }
  }, [currentEnvironment.currency, prefCurrency])

  // Get current month/year for AI insights (controlled by StatsCards selector)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // AI-generated nickname state
  const [nickname, setNickname] = useState<string | null>(null)
  const [showRealName, setShowRealName] = useState(false)
  const [loadingNickname, setLoadingNickname] = useState(false)

  // Load nickname from Firestore on mount
  useEffect(() => {
    if (!user?.uid) return

    const loadNickname = async () => {
      try {
        const userSettingsRef = collection(db, 'user_settings')
        const q = query(userSettingsRef, where('user_id', '==', user.uid))
        const querySnapshot = await getDocs(q)
        const settingsRow = !querySnapshot.empty ? querySnapshot.docs[0].data() : null

        if (settingsRow?.nickname) {
          setNickname(settingsRow.nickname)
        }
      } catch (error) {
        console.error('Failed to load nickname:', error)
      }
    }

    loadNickname()
  }, [user?.uid])

  const { data: recentExpenses = [] } = useQuery<RecentExpense[]>({
    queryKey: ['recent-expenses', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      const expensesRef = getCollection('expenses')
      const q = query(expensesRef, orderBy('occurred_on', 'desc'), limit(5))
      const snapshot = await getDocs(q)

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RecentExpense[]
    }
  })

  // Category breakdown for last 30 days
  const { data: categoryData = [] } = useQuery<{ name: string; value: number }[]>({
    queryKey: ['dashboard-category', user?.uid, viewCurrency, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)

      const expensesRef = getCollection('expenses')
      const q = query(
        expensesRef,
        where('occurred_on', '>=', thirtyDaysAgoStr),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)

      const map: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        // Only include expenses (negative amounts or type='expense')
        const isExpense = data.type === 'expense' || (!data.type && data.amount < 0) || data.amount < 0
        if (!isExpense) return

        const c = data.category || 'Other'
        const originalAmount = Math.abs(Number(data.amount || 0))
        map[c] = (map[c] || 0) + originalAmount
      })

      const items = Object.entries(map).map(([name, value]) => ({ name, value }))
      items.sort((a, b) => b.value - a.value)
      return items.slice(0, 8) // Top 8 categories
    }
  })

  // Last 6 months spending trend
  const { data: monthlyData = [] } = useQuery<{ month: string; amount: number }[]>({
    queryKey: ['dashboard-monthly', user?.uid, viewCurrency, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      const points: { month: string; amount: number }[] = []
      const today = new Date()

      // Get all expenses for the last 6 months at once
      const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1)
      const expensesRef = getCollection('expenses')
      const q = query(
        expensesRef,
        where('occurred_on', '>=', sixMonthsAgo.toISOString().slice(0, 10)),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)

      // Group by month
      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        const startStr = start.toISOString().slice(0, 10)
        const endStr = end.toISOString().slice(0, 10)

        const total = snapshot.docs.reduce((acc: number, doc) => {
          const data = doc.data()
          const occurredOn = data.occurred_on
          if (occurredOn >= startStr && occurredOn <= endStr) {
            // Only include expenses (negative amounts or type='expense')
            const isExpense = data.type === 'expense' || (!data.type && data.amount < 0) || data.amount < 0
            if (isExpense) {
              return acc + Math.abs(Number(data.amount || 0))
            }
          }
          return acc
        }, 0)

        points.push({ month: d.toLocaleString(undefined, { month: 'short' }), amount: total })
      }
      return points
    }
  })



  // Fetch user's full name from settings
  const { data: userFullName } = useQuery<string>({
    queryKey: ['user-full-name', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user) return ''

      // Try to get full name from user_settings
      const userSettingsRef = collection(db, 'user_settings')
      const q = query(userSettingsRef, where('user_id', '==', user.uid))
      const querySnapshot = await getDocs(q)
      const settingsRow = !querySnapshot.empty ? querySnapshot.docs[0].data() : null

      // Return full_name from settings, fallback to displayName, then email username
      return settingsRow?.full_name || user.displayName || user.email?.split('@')[0] || 'User'
    }
  })

  // Fetch or generate nickname (cached in Firestore to avoid repeated API calls)
  useQuery({
    queryKey: ['user-nickname', user?.uid, userFullName],
    enabled: !!user?.uid && !nickname && !!userFullName,
    staleTime: Infinity, // Never refetch - nickname is permanent
    gcTime: Infinity, // Keep in cache forever (renamed from cacheTime in v5)
    queryFn: async () => {
      if (!user || !userFullName) return null

      setLoadingNickname(true)
      try {
        // First check if nickname already exists in Firestore
        const userSettingsRef = collection(db, 'user_settings')
        const q = query(userSettingsRef, where('user_id', '==', user.uid))
        const querySnapshot = await getDocs(q)
        const settingsRow = !querySnapshot.empty ? querySnapshot.docs[0].data() : null

        if (settingsRow?.nickname) {
          console.log('💾 Using cached nickname from Firestore:', settingsRow.nickname)
          setNickname(settingsRow.nickname)
          return settingsRow.nickname
        }

        // If no cached nickname, generate a new one
        console.log('🎲 Generating new nickname for:', userFullName)
        const response = await fetch(getApiUrl('/api/ai/generate-nickname'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: userFullName })
        })
        if (!response.ok) throw new Error('Failed to generate nickname')
        const data = await response.json()
        console.log('✅ AI Generated Nickname for "' + userFullName + '":', data.nickname)
        console.log('👤 Full name:', userFullName)
        console.log('🔤 4-letter code:', data.nickname)

        // Save to Firestore for future use
        const docRef = !querySnapshot.empty ? querySnapshot.docs[0].ref : doc(db, 'user_settings', user.uid)
        await setDoc(docRef, {
          user_id: user.uid,
          nickname: data.nickname,
          updated_at: new Date().toISOString()
        }, { merge: true })

        setNickname(data.nickname)
        return data.nickname
      } catch (error) {
        console.error('Nickname generation failed:', error)
        // Fallback to first name or email username
        const fallback = userFullName.split(' ')[0] || user.email?.split('@')[0] || 'User'
        setNickname(fallback)
        return null
      } finally {
        setLoadingNickname(false)
      }
    }
  })

  return (
    <>
      <Head>
        <title>AI Expense Tracker & Manager | Smart Personal Finance App</title>
        <meta name="description" content="Expenso is the best AI-powered expense tracker and manager. Track expenses, manage budgets, and get AI insights for your personal finances. Free expense manager app." />
        <meta name="keywords" content="expenso, expense tracker, expense manager, ai expense tracker, expense ai manager, ai expense manager, personal finance, budget manager, expense app, money manager, spending tracker, finance app" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://expense-ai-manager.vercel.app/" />
        <meta property="og:title" content="AI Expense Tracker & Manager" />
        <meta property="og:description" content="Smart AI-powered expense tracker and manager. Track expenses, manage budgets, and get insights for better financial decisions." />
        <meta property="og:image" content="https://expense-ai-manager.vercel.app/calculatorImg.png" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://expense-ai-manager.vercel.app/" />
        <meta property="twitter:title" content="AI Expense Tracker & Manager" />
        <meta property="twitter:description" content="Smart AI-powered expense tracker and manager. Track expenses, manage budgets, and get insights." />
        <meta property="twitter:image" content="https://expense-ai-manager.vercel.app/calculatorImg.png" />

        {/* Additional SEO */}
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Expenso" />
        <link rel="canonical" href="https://expense-ai-manager.vercel.app/" />
      </Head>
      <RequireAuth>
        <Layout>
          <div className="max-w-7xl mx-auto space-y-4 lg:space-y-6">
            {/* Integrated Header with Filters */}
            <div className="card !p-4 lg:!p-6 dark:bg-gray-800 dark:border-gray-700">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
                {/* Welcome Section */}
                <div className="flex flex-row items-center justify-between lg:justify-start gap-4 lg:gap-12">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                      <span className="text-2xl">👋</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Welcome back</p>
                      <h1
                        className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate"
                        onClick={() => setShowRealName(!showRealName)}
                        onMouseEnter={() => setShowRealName(true)}
                        onMouseLeave={() => setShowRealName(false)}
                      >
                        {showRealName ? userFullName || 'User' : (loadingNickname ? '...' : (nickname || userFullName?.split(' ')[0] || 'User'))}
                      </h1>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-[10px] lg:text-sm text-gray-500 dark:text-gray-400 font-medium bg-gray-50 dark:bg-gray-700/50 px-2 lg:px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700 whitespace-nowrap">
                      {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Filters Section - 2x2 on Mobile, 1x4 on Tablet, Flex on Desktop */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:flex lg:items-center gap-2 w-full lg:w-auto mt-2 lg:mt-0">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full lg:w-auto px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'short' })}</option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full lg:w-24 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <div className="w-full lg:w-auto px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[80px] text-center">
                    {viewCurrency}
                  </div>
                  <button
                    onClick={() => {
                      const aiSection = document.getElementById('ai-insights-section')
                      if (aiSection) {
                        aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    }}
                    className="w-full lg:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md active:scale-95"
                  >
                    <SparklesIcon className="w-3.5 h-3.5" />
                    AI Pulse
                  </button>
                </div>
              </div>
            </div>

            <StatsCards
              selectedCurrency={viewCurrency}
              onSelectedCurrencyChange={setViewCurrency}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onSelectedMonthChange={setSelectedMonth}
              onSelectedYearChange={setSelectedYear}
            />

            {/* Recent Expenses */}
            <div className="card !p-4 lg:!p-6 dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white">Recent Expenses</h2>
                <Link href="/expenses" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 flex items-center gap-1">
                  View all
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* Mobile View - Modern Card Layout */}
              <div className="block lg:hidden space-y-2">
                {recentExpenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-600 active:scale-[0.98] transition-transform">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-base font-bold text-red-500 dark:text-red-400">
                          {e.category?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.note || 'No note'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{e.category} · {formatDate(e.occurred_on, { month: 'short', day: 'numeric' })}</p>
                      </div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className="text-base font-bold">
                        <ConvertedAmount
                          amount={e.amount}
                          currency={e.currency}
                          formatCurrencyExplicit={formatCurrencyExplicit}
                          type={e.type}
                          transferAmount={e.transferAmount}
                        />
                      </p>
                    </div>
                  </div>
                ))}
                {recentExpenses.length === 0 && (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">No recent expenses</p>
                    <Link href="/expenses" className="text-sm text-primary-600 dark:text-primary-400 font-medium mt-2 inline-block">
                      Add your first expense
                    </Link>
                  </div>
                )}
              </div>

              {/* Desktop View - Table Layout */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Note</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                    {recentExpenses.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-white">{e.note || 'No note'}</td>
                        <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">{e.category}</td>
                        <td className="px-6 py-3 text-sm font-medium text-right">
                          <ConvertedAmount
                            amount={e.amount}
                            currency={e.currency}
                            formatCurrencyExplicit={formatCurrencyExplicit}
                            type={e.type}
                            transferAmount={e.transferAmount}
                          />
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400 text-right">{formatDate(e.occurred_on, { month: 'short', day: 'numeric' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recentExpenses.length === 0 && (
                  <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">No recent expenses</div>
                )}
              </div>
            </div>

            {/* Charts and Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              {/* Monthly Spending Trend */}
              <div className="card !p-4 lg:!p-6 dark:bg-gray-800 dark:border-gray-700">
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">Monthly Spending</h3>
                <div className="h-52 lg:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d1d5db" />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      />
                      <Tooltip
                        formatter={(value) => [formatCurrencyExplicit(Number(value), viewCurrency), 'Spent']}
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '8px 12px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                        }}
                        labelStyle={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}
                        itemStyle={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}
                      />
                      <Bar
                        dataKey="amount"
                        fill="url(#barGradient)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={50}
                      />
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Monthly Stats Summary */}
                {monthlyData.length > 0 && (() => {
                  const amounts = monthlyData.map(d => d.amount).filter(a => a > 0);
                  const total = amounts.reduce((sum, a) => sum + a, 0);
                  const avg = amounts.length > 0 ? total / amounts.length : 0;
                  const maxAmount = Math.max(...amounts, 0);
                  const maxMonth = monthlyData.find(d => d.amount === maxAmount);
                  const currentMonth = monthlyData[monthlyData.length - 1];
                  const prevMonth = monthlyData[monthlyData.length - 2];
                  const change = prevMonth && prevMonth.amount > 0
                    ? ((currentMonth?.amount || 0) - prevMonth.amount) / prevMonth.amount * 100
                    : 0;

                  return (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Avg/Month</p>
                          <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                            {formatCurrencyExplicit(avg, viewCurrency)}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Highest</p>
                          <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                            {maxMonth?.month || '-'}
                          </p>
                        </div>
                        <div className={`bg-gradient-to-br rounded-xl p-3 ${change <= 0 ? 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20' : 'from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20'}`}>
                          <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">vs Last Mo</p>
                          <p className={`text-sm font-bold ${change <= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {change === 0 ? '-' : `${change > 0 ? '+' : ''}${change.toFixed(0)}%`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Category Breakdown */}
              <div className="card !p-4 lg:!p-6 dark:bg-gray-800 dark:border-gray-700">
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">Category Breakdown (Last 30 Days)</h3>
                {categoryData.length > 0 ? (
                  <>
                    <div className="h-52 lg:h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius="55%"
                            outerRadius="85%"
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => [formatCurrencyExplicit(Number(value), viewCurrency), 'Amount']}
                            contentStyle={{
                              backgroundColor: 'rgb(31, 41, 55)',
                              border: 'none',
                              borderRadius: '12px',
                              padding: '8px 12px',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}
                            itemStyle={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Category List with Amounts - 2 Column Grid */}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      {categoryData.map((category, idx) => (
                        <div key={category.name} className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: palette[idx % palette.length] }}
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-300">{category.name}</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                            {formatCurrencyExplicit(category.value, viewCurrency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-52 lg:h-64 text-center">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3">
                      <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">No expenses in the last 30 days</p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Insights Widget */}
            <div id="ai-insights-section">
              <AIInsightsWidget
                month={selectedMonth}
                year={selectedYear}
                currency={viewCurrency}
              />
            </div>
          </div>
        </Layout>
      </RequireAuth>
    </>
  )
}

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    // If on mobile (native) and not logged in, redirect to auth immediately
    if (!loading && !user && isNative) {
      router.replace('/auth')
    }
  }, [loading, user, router, isNative])

  if (loading) {
    // On web, prefer rendering the SEO landing page immediately so crawlers (and users)
    // see meaningful content instead of a blank spinner while auth initializes.
    if (!isNative) {
      return <LandingPage />
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400"></div>
      </div>
    )
  }

  if (!user) {
    // On native, show nothing (or spinner) while redirecting to avoid flashing Landing Page
    if (isNative) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400"></div>
        </div>
      )
    }
    return <LandingPage />
  }

  return <DashboardContent />
}
