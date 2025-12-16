import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { SparklesIcon, RefreshCwIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon } from 'lucide-react'
import { getApiUrl } from '@/lib/config'

interface AIInsightsWidgetProps {
  month: number
  year: number
  currency: string
}

interface InsightData {
  status: 'Healthy' | 'Caution' | 'Alert'
  color: 'green' | 'yellow' | 'red'
  title: string
  summary: string
  highlights: Array<{ icon: string; text: string }>
  generatedAt?: string
  periodLabel?: string
}

export default function AIInsightsWidget({ month, year, currency }: AIInsightsWidgetProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch data for the selected month to send to AI
  const { data: monthlyData, isLoading: loadingData } = useQuery({
    queryKey: ['ai-insights-data', user?.uid, month, year, currency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return null
      
      const expensesRef = collection(db, 'expenses', user.uid, 'items')
      let expenses: any[] = []
      let periodLabel = ''

      // 1. Try Current Month
      const startMonth = new Date(year, month - 1, 1).toISOString().slice(0, 10)
      const endMonth = new Date(year, month, 0).toISOString().slice(0, 10)
      
      let q = query(
        expensesRef,
        where('occurred_on', '>=', startMonth),
        where('occurred_on', '<=', endMonth),
        where('currency', '==', currency)
      )
      let snap = await getDocs(q)
      
      if (!snap.empty) {
        expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      }
      periodLabel = `Month: ${new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })} ${year}`

      // Fetch income for the same period as expenses
      const incomeRef = collection(db, 'monthly_income', user.uid, 'items')
      let totalIncome = 0
      
      // Current month - fetch just that month's income
      const qInc = query(
        incomeRef,
        where('month', '==', month),
        where('year', '==', year),
        where('currency', '==', currency)
      )
      const incSnap = await getDocs(qInc)
      if (!incSnap.empty) {
        totalIncome = Number(incSnap.docs[0].data().amount || 0)
      }

      return { expenses, income: { amount: totalIncome, currency }, periodLabel }
    }
  })

  // Fetch insights (from DB only initially)
  const { data: insights, isLoading: loadingInsights } = useQuery<InsightData | null>({
    queryKey: ['ai-insights-result', user?.uid, month, year, currency, monthlyData?.periodLabel],
    enabled: !!monthlyData && monthlyData.expenses.length > 0,
    queryFn: async () => {
      if (!user?.uid) return null
      const docId = `${year}-${month}-${currency}`
      const insightRef = doc(db, 'insights', user.uid, 'items', docId)
      const insightSnap = await getDoc(insightRef)
      
      if (!insightSnap.exists()) return null
      
      const data = insightSnap.data() as InsightData
      // If the cached insight is for a different period scope (e.g. was 'Last 6 Months' but now we have 'Last 30 Days' data),
      // ignore the cache so user can regenerate relevant insights.
      if (data.periodLabel !== monthlyData?.periodLabel) {
        return null
      }
      
      return data
    }
  })

  const generateInsights = async () => {
    if (!user?.uid || !monthlyData) return
    setIsRefreshing(true)
    try {
      const res = await fetch(getApiUrl('/api/ai/analytics-insights'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenses: monthlyData.expenses,
          income: monthlyData.income,
          month,
          year,
          currency,
          periodLabel: monthlyData.periodLabel
        })
      })
      
      if (!res.ok) throw new Error('Failed to fetch insights')
      const json = await res.json()
      const parsed = JSON.parse(json.insights)
      
      const insightData: InsightData = {
        ...parsed,
        generatedAt: new Date().toISOString(),
        periodLabel: monthlyData.periodLabel
      }
      
      // Save to Firestore
      const docId = `${year}-${month}-${currency}`
      const insightRef = doc(db, 'insights', user.uid, 'items', docId)
      await setDoc(insightRef, insightData)
      
      // Update Cache
      queryClient.setQueryData(['ai-insights-result', user.uid, month, year, currency, monthlyData.periodLabel], insightData)
      
    } catch (e) {
      console.error('Generation failed:', e)
      alert('Failed to generate insights. Please try again.')
    } finally {
      setIsRefreshing(false)
    }
  }

  if (loadingData) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl"></div>

  if (!monthlyData || monthlyData.expenses.length === 0) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
        <div className="flex items-center gap-2 mb-2">
          <SparklesIcon className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-indigo-900">AI Financial Insights</h3>
        </div>
        <p className="text-sm text-indigo-700">
          No recent expenses found. Add some transactions to unlock AI-powered insights!
        </p>
      </div>
    )
  }

  const getStatusColor = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-100 text-green-800 border-green-200'
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'red': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Healthy': return <CheckCircleIcon className="w-5 h-5 text-green-600" />
      case 'Caution': return <InfoIcon className="w-5 h-5 text-yellow-600" />
      case 'Alert': return <AlertTriangleIcon className="w-5 h-5 text-red-600" />
      default: return <SparklesIcon className="w-5 h-5 text-indigo-600" />
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SparklesIcon className="w-5 h-5" />
            <h3 className="font-semibold">Financial Pulse</h3>
            {monthlyData.periodLabel && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full text-white/90">
                {monthlyData.periodLabel}
              </span>
            )}
            {/* Debug: Show income being used */}
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full text-white/90">
              Income: {monthlyData.income.amount.toLocaleString()} {monthlyData.income.currency}
            </span>
          </div>
          {insights && (
            <button 
              onClick={generateInsights} 
              disabled={isRefreshing}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 self-start sm:self-auto"
              title="Refresh Insights"
            >
              <RefreshCwIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {loadingInsights ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-3/4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="h-20 bg-gray-50 rounded-lg"></div>
              <div className="h-20 bg-gray-50 rounded-lg"></div>
              <div className="h-20 bg-gray-50 rounded-lg"></div>
            </div>
          </div>
        ) : !insights ? (
          <div className="text-center py-6">
            <div className="mb-4 text-gray-500 text-sm">
              Get AI-powered analysis of your spending habits for this period.
            </div>
            <button
              onClick={generateInsights}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRefreshing ? (
                <>
                  <RefreshCwIcon className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Generate Insights
                </>
              )}
            </button>
          </div>
        ) : (
          <div>
            {/* Header Section */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border mb-2 ${getStatusColor(insights.color)}`}>
                  {getStatusIcon(insights.status)}
                  {insights.status}
                </div>
                <h4 className="text-lg font-bold text-gray-900">{insights.title}</h4>
                <p className="text-gray-600 text-sm mt-1">{insights.summary}</p>
              </div>
            </div>

            {/* Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
              {insights.highlights.map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/50 transition-colors">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-xs font-medium text-gray-700 leading-tight">{item.text}</p>
                </div>
              ))}
            </div>
            
            {insights.generatedAt && (
              <div className="mt-4 text-xs text-gray-400 text-right">
                Updated: {new Date(insights.generatedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

