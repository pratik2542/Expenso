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
import { RequireAuth } from '@/components/RequireAuth'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { usePreferences } from '@/contexts/PreferencesContext'

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
  return (
    <>
      <Head>
  <title>Dashboard - Expenso</title>
        <meta name="description" content="Overview of your finances" />
      </Head>
      <RequireAuth>
      <Layout>
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Heading */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-2">Snapshot of your current spending & performance</p>

          </div>

            <StatsCards selectedCurrency={viewCurrency} onSelectedCurrencyChange={setViewCurrency} />
        {/* Income History (all months) */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Income History</h3>
            <button className="btn-secondary text-sm" onClick={() => setShowIncomeHistory((s) => !s)}>
              {showIncomeHistory ? 'Hide' : 'Show'}
            </button>
          </div>
          {showIncomeHistory && (
            <div className="mt-4">
              {/* Mobile View - Card Layout */}
              <div className="block sm:hidden space-y-3">
                {incomeHistory.map((row, idx) => (
                  <div key={`${row.year}-${row.month}-${idx}`} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(row.year, row.month - 1, 1).toLocaleString(undefined, { month: 'long' })} {row.year}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                        {row.currency}
                      </span>
                    </div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatCurrencyExplicit(row.amount, row.currency)}
                    </div>
                  </div>
                ))}
                {incomeHistory.length === 0 && (
                  <div className="text-center py-6 text-sm text-gray-500">
                    No income history found
                  </div>
                )}
              </div>

              {/* Desktop View - Table Layout */}
              <div className="hidden sm:block overflow-x-auto">
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
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Expenses</h2>
              <Link href="/expenses" className="text-sm font-medium text-primary-600 hover:text-primary-500">View all</Link>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {recentExpenses.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 sm:px-6 py-3 text-sm font-medium text-gray-900">{e.note || 'No note'}</td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-gray-600">{e.category}</td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-gray-900 text-right">
                        <ConvertedAmount 
                          amount={e.amount} 
                          fromCurrency={e.currency} 
                          prefCurrency={prefCurrency} 
                          formatCurrency={formatCurrency} 
                          convertExistingData={convertExistingData}
                        />
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-sm text-gray-500 text-right">{formatDate(e.occurred_on, { month: 'short', day: 'numeric' })}</td>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Spending Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => [formatCurrencyExplicit(Number(value), viewCurrency), 'Amount']} />
                    <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown (Last 30 Days)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [formatCurrencyExplicit(Number(value), viewCurrency), 'Amount']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {categoryData.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {categoryData.map((category, idx) => (
                    <div key={category.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: palette[idx % palette.length] }}
                      ></div>
                      <span className="text-xs text-gray-600 truncate">{category.name}</span>
                      <span className="text-xs font-medium text-gray-900">{formatCurrency(category.value)}</span>
                    </div>
                  ))}
                </div>
              )}
              {categoryData.length === 0 && (
                <div className="text-center py-4 text-sm text-gray-500">No expenses in the last 30 days</div>
              )}
            </div>
          </div>
        </div>
        </Layout>
      </RequireAuth>
    </>
  )
}

// Force dynamic rendering to avoid any static caching between servers
export async function getServerSideProps() {
  return { props: {} }
}
