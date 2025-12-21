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
      // Format in the original currency
      try {
        const formatted = new Intl.NumberFormat(undefined, { style: 'currency', currency: fromCurrency }).format(amount)
        setConvertedAmount(amount) // Keep original amount but will format with original currency
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

export default function Dashboard() {
  const { user } = useAuth()
  const { formatCurrency, formatCurrencyExplicit, formatDate, currency: prefCurrency, convertExistingData } = usePreferences()
  const [viewCurrency, setViewCurrency] = useState(prefCurrency)
  
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

  // Helper function to convert amount to preference currency
  const convertToPrefCurrency = async (amount: number, fromCurrency: string): Promise<number> => {
    if (!amount) return amount
    // If user chose to keep it mixed, do not convert; only include amounts already in preferred currency
    if (!convertExistingData) return fromCurrency === prefCurrency ? amount : 0
    if (fromCurrency === prefCurrency) return amount
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

  const { data: recentExpenses = [] } = useQuery<RecentExpense[]>({
    queryKey: ['recent-expenses', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      const expensesRef = collection(db, 'expenses', user!.uid, 'items')
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
    queryKey: ['dashboard-category', user?.uid, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)
      
      const expensesRef = collection(db, 'expenses', user!.uid, 'items')
      const q = query(
        expensesRef,
        where('occurred_on', '>=', thirtyDaysAgoStr),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      
      const map: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const c = data.category || 'Other'
        const originalAmount = Number(data.amount || 0)
        map[c] = (map[c] || 0) + originalAmount
      })
      
      const items = Object.entries(map).map(([name, value]) => ({ name, value }))
      items.sort((a, b) => b.value - a.value)
      return items.slice(0, 8) // Top 8 categories
    }
  })

  // Last 6 months spending trend
  const { data: monthlyData = [] } = useQuery<{ month: string; amount: number }[]>({
    queryKey: ['dashboard-monthly', user?.uid, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      const points: { month: string; amount: number }[] = []
      const today = new Date()
      
      // Get all expenses for the last 6 months at once
      const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1)
      const expensesRef = collection(db, 'expenses', user!.uid, 'items')
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
            return acc + Number(data.amount || 0)
          }
          return acc
        }, 0)
        
        points.push({ month: d.toLocaleString(undefined, { month: 'short' }), amount: total })
      }
      return points
    }
  })

  // Income history: list all monthly incomes for the user
  const { data: incomeHistory = [] } = useQuery<Array<{ month: number; year: number; amount: number; currency: string }>>({
    queryKey: ['dashboard-income-history', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      const incomeRef = collection(db, 'monthly_income', user!.uid, 'items')
      const q = query(incomeRef, orderBy('year', 'desc'), orderBy('month', 'desc'))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          month: Number(data.month),
          year: Number(data.year),
          amount: Number(data.amount || 0),
          currency: String(data.currency || 'USD')
        }
      })
    }
  })
  const [showIncomeHistory, setShowIncomeHistory] = useState(false)

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
  <title>Dashboard - Expenso</title>
        <meta name="description" content="Overview of your finances" />
      </Head>
      <RequireAuth>
      <Layout>
        <div className="max-w-7xl mx-auto space-y-4 lg:space-y-8">
          {/* Welcome Header - Mobile Optimized */}
          <div className="lg:flex lg:items-center lg:justify-between">
            {/* Mobile Header */}
            <div className="lg:hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Welcome back</p>
                  <h1 
                    className="text-xl font-bold text-gray-900 flex items-center gap-2"
                    onClick={() => setShowRealName(!showRealName)}
                  >
                    <span className="text-primary-600">
                      {loadingNickname ? '...' : (nickname || userFullName?.split(' ')[0] || 'User')}
                    </span>
                    <span className="text-2xl">👋</span>
                  </h1>
                  {showRealName && (
                    <p className="text-xs text-gray-500 mt-1">{userFullName || 'User'}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{new Date().toLocaleDateString(undefined, { weekday: 'short' })}</p>
                  <p className="text-sm font-medium text-gray-900">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                </div>
              </div>
            </div>
            
            {/* Desktop Header */}
            <div className="hidden lg:block">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Welcome back,{' '}
                <span 
                  className="relative inline-block cursor-pointer group"
                  onMouseEnter={() => setShowRealName(true)}
                  onMouseLeave={() => setShowRealName(false)}
                  onClick={() => setShowRealName(!showRealName)}
                >
                  <span className="text-primary-600 border-b-2 border-dashed border-primary-300 hover:border-primary-500 transition-colors">
                    {loadingNickname ? 'Loading...' : (nickname || userFullName?.split(' ')[0] || 'User')}
                  </span>
                  {showRealName && (
                    <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-4 py-2 bg-gray-900 text-white text-base font-medium rounded-lg shadow-lg whitespace-nowrap z-10 animate-in fade-in slide-in-from-top-1 duration-200">
                      {userFullName || 'User'}
                      <span className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-gray-900 rotate-45"></span>
                    </span>
                  )}
                </span>
                ! 👋
              </h1>
              <p className="text-gray-600 mt-1">Here's what's happening with your finances.</p>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
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
          
          {/* AI Insights Widget */}
          <AIInsightsWidget 
            month={selectedMonth} 
            year={selectedYear} 
            currency={viewCurrency} 
          />

        {/* Income History (all months) */}
        <div className="card !p-4 lg:!p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Income History</h3>
            <button 
              className="px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors" 
              onClick={() => setShowIncomeHistory((s) => !s)}
            >
              {showIncomeHistory ? 'Hide' : 'Show'}
            </button>
          </div>
          {showIncomeHistory && (
            <div className="mt-4">
              {/* Mobile View - Modern Card Layout */}
              <div className="block lg:hidden space-y-2">
                {incomeHistory.map((row, idx) => (
                  <div 
                    key={`${row.year}-${row.month}-${idx}`} 
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                        <span className="text-green-600 font-bold text-sm">
                          {new Date(row.year, row.month - 1, 1).toLocaleString(undefined, { month: 'short' }).slice(0, 3)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(row.year, row.month - 1, 1).toLocaleString(undefined, { month: 'long' })}
                        </p>
                        <p className="text-xs text-gray-500">{row.year}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-green-600">
                        {formatCurrencyExplicit(row.amount, row.currency)}
                      </p>
                      <p className="text-xs text-gray-400">{row.currency}</p>
                    </div>
                  </div>
                ))}
                {incomeHistory.length === 0 && (
                  <div className="text-center py-8 text-sm text-gray-500">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    No income history found
                  </div>
                )}
              </div>

              {/* Desktop View - Table Layout */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {incomeHistory.map((row, idx) => (
                      <tr key={`${row.year}-${row.month}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm text-gray-900">{new Date(row.year, row.month - 1, 1).toLocaleString(undefined, { month: 'long' })}</td>
                        <td className="px-6 py-3 text-sm text-gray-900">{row.year}</td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-right">{formatCurrencyExplicit(row.amount, row.currency)}</td>
                        <td className="px-6 py-3 text-sm text-gray-600">{row.currency}</td>
                      </tr>
                    ))}
                    {incomeHistory.length === 0 && (
                      <tr>
                        <td className="px-6 py-3 text-sm text-gray-500 text-center" colSpan={4}>No income history found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

          {/* Recent Expenses */}
          <div className="card !p-4 lg:!p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base lg:text-lg font-semibold text-gray-900">Recent Expenses</h2>
              <Link href="/expenses" className="text-sm font-medium text-primary-600 hover:text-primary-500 flex items-center gap-1">
                View all
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            
            {/* Mobile View - Modern Card Layout */}
            <div className="block lg:hidden space-y-2">
              {recentExpenses.map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 active:scale-[0.98] transition-transform">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-base font-bold text-red-500">
                        {e.category?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{e.note || 'No note'}</p>
                      <p className="text-xs text-gray-500">{e.category} · {formatDate(e.occurred_on, { month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-base font-bold text-gray-900">
                      <ConvertedAmount 
                        amount={e.amount} 
                        fromCurrency={e.currency} 
                        prefCurrency={prefCurrency} 
                        formatCurrency={formatCurrency} 
                        convertExistingData={convertExistingData}
                      />
                    </p>
                  </div>
                </div>
              ))}
              {recentExpenses.length === 0 && (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">No recent expenses</p>
                  <Link href="/expenses" className="text-sm text-primary-600 font-medium mt-2 inline-block">
                    Add your first expense
                  </Link>
                </div>
              )}
            </div>

            {/* Desktop View - Table Layout */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {recentExpenses.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{e.note || 'No note'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{e.category}</td>
                      <td className="px-6 py-3 text-sm text-gray-900 text-right">
                        <ConvertedAmount 
                          amount={e.amount} 
                          fromCurrency={e.currency} 
                          prefCurrency={prefCurrency} 
                          formatCurrency={formatCurrency} 
                          convertExistingData={convertExistingData}
                        />
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500 text-right">{formatDate(e.occurred_on, { month: 'short', day: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recentExpenses.length === 0 && (
                <div className="text-center py-10 text-sm text-gray-500">No recent expenses</div>
              )}
            </div>
          </div>

          {/* Charts and Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* Monthly Spending Trend */}
            <div className="card !p-4 lg:!p-6">
              <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Monthly Spending</h3>
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
                      tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : value}
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
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Avg/Month</p>
                        <p className="text-sm font-bold text-indigo-600">
                          {formatCurrencyExplicit(avg, viewCurrency)}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Highest</p>
                        <p className="text-sm font-bold text-amber-600">
                          {maxMonth?.month || '-'}
                        </p>
                      </div>
                      <div className={`bg-gradient-to-br rounded-xl p-3 ${change <= 0 ? 'from-green-50 to-emerald-50' : 'from-red-50 to-rose-50'}`}>
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">vs Last Mo</p>
                        <p className={`text-sm font-bold ${change <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change === 0 ? '-' : `${change > 0 ? '+' : ''}${change.toFixed(0)}%`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* Category Breakdown */}
            <div className="card !p-4 lg:!p-6">
              <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Category Breakdown (Last 30 Days)</h3>
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
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => [formatCurrencyExplicit(Number(value), viewCurrency), 'Amount']}
                          contentStyle={{ 
                            backgroundColor: '#1f2937', 
                            border: 'none', 
                            borderRadius: '12px',
                            padding: '8px 12px'
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
                        <span className="text-xs text-gray-700">{category.name}</span>
                        <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">
                          {formatCurrencyExplicit(category.value, viewCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-52 lg:h-64 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">No expenses in the last 30 days</p>
                </div>
              )}
            </div>
          </div>
        </div>
        </Layout>
      </RequireAuth>
    </>
  )
}


