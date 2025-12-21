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
        periodLabel = `Month: ${new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })} ${year}`
      } else {
        // 2. Try Last 30 Days
        const d30 = new Date(); d30.setDate(d30.getDate() - 30);
        const s30 = d30.toISOString().slice(0, 10)
        q = query(expensesRef, where('occurred_on', '>=', s30), where('currency', '==', currency))
        snap = await getDocs(q)
        
        if (!snap.empty) {
           expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
           periodLabel = 'Last 30 Days'
        } else {
           // 3. Try Last 6 Months
           const d180 = new Date(); d180.setDate(d180.getDate() - 180);
           const s180 = d180.toISOString().slice(0, 10)
           q = query(expensesRef, where('occurred_on', '>=', s180), where('currency', '==', currency))
           snap = await getDocs(q)

           if (!snap.empty) {
              expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
              periodLabel = 'Last 6 Months'
           } else {
              // 4. Try Last Year
              const d365 = new Date(); d365.setDate(d365.getDate() - 365);
              const s365 = d365.toISOString().slice(0, 10)
              q = query(expensesRef, where('occurred_on', '>=', s365), where('currency', '==', currency))
              snap = await getDocs(q)
              
              if (!snap.empty) {
                 expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                 periodLabel = 'Last Year'
              }
           }
        }
      }

      // Fetch income for the same period as expenses
      const incomeRef = collection(db, 'monthly_income', user.uid, 'items')
      let totalIncome = 0
      
      if (periodLabel === '' || periodLabel.startsWith('Month:')) {
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
      } else {
        // For historical periods (30 days, 6 months, 1 year), sum all income in that range
        let lookbackMonths = 1
        if (periodLabel === 'Last 30 Days') lookbackMonths = 1
        else if (periodLabel === 'Last 6 Months') lookbackMonths = 6
        else if (periodLabel === 'Last Year') lookbackMonths = 12
        
        // Get all income records for this currency and sum the relevant months
        const qInc = query(incomeRef, where('currency', '==', currency))
        const incSnap = await getDocs(qInc)
        
        const now = new Date()
        incSnap.docs.forEach(doc => {
          const data = doc.data()
          const incomeMonth = Number(data.month)
          const incomeYear = Number(data.year)
          const incomeDate = new Date(incomeYear, incomeMonth - 1, 1)
          const monthsAgo = (now.getFullYear() - incomeYear) * 12 + (now.getMonth() + 1 - incomeMonth)
          
          if (monthsAgo >= 0 && monthsAgo < lookbackMonths) {
            totalIncome += Number(data.amount || 0)
          }
        })
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
      {/* Mobile Header */}
      <div className="lg:hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <SparklesIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Financial Pulse</h3>
              {monthlyData?.periodLabel && (
                <p className="text-[10px] text-white/80">{monthlyData.periodLabel}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {monthlyData?.income.amount > 0 && (
              <span className="text-[10px] bg-white/20 px-2 py-1 rounded-full">
                💰 {monthlyData.income.amount.toLocaleString()}
              </span>
            )}
            {insights && (
              <button 
                onClick={generateInsights} 
                disabled={isRefreshing}
                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-50"
                title="Refresh Insights"
              >
                <RefreshCwIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SparklesIcon className="w-5 h-5" />
            <h3 className="font-semibold">Financial Pulse</h3>
            {monthlyData?.periodLabel && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full text-white/90">
                {monthlyData.periodLabel}
              </span>
            )}
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full text-white/90">
              Income: {monthlyData?.income.amount.toLocaleString()} {monthlyData?.income.currency}
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

      {/* Content */}
      <div className="p-4 lg:p-6">
        {loadingInsights ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-3/4"></div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3 mt-4">
              <div className="h-16 lg:h-20 bg-gray-50 rounded-lg"></div>
              <div className="h-16 lg:h-20 bg-gray-50 rounded-lg"></div>
              <div className="h-16 lg:h-20 bg-gray-50 rounded-lg"></div>
            </div>
          </div>
        ) : !insights ? (
          <div className="text-center py-4 lg:py-6">
            <div className="mb-3 lg:mb-4 text-gray-500 text-xs lg:text-sm">
              Get AI-powered analysis of your spending habits.
            </div>
            <button
              onClick={generateInsights}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25"
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
            {/* Mobile Status + Title */}
            <div className="lg:hidden">
              <div className="flex items-center gap-2 mb-2">
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(insights.color)}`}>
                  {getStatusIcon(insights.status)}
                  {insights.status}
                </div>
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1">{insights.title}</h4>
              <p className="text-gray-600 text-xs leading-relaxed">{insights.summary}</p>
            </div>

            {/* Desktop Status + Title */}
            <div className="hidden lg:block">
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
            </div>

            {/* Mobile Highlights - 2 Column Grid */}
            <div className="lg:hidden mt-3 grid grid-cols-2 gap-2">
              {insights.highlights.map((item, idx) => (
                <div key={idx} className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-2.5 border border-gray-100">
                  <div className="text-lg mb-1">{item.icon}</div>
                  <p className="text-[10px] font-medium text-gray-700 leading-tight">{item.text}</p>
                </div>
              ))}
            </div>

            {/* Desktop Highlights Grid */}
            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
              {insights.highlights.map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/50 transition-colors">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-xs font-medium text-gray-700 leading-tight">{item.text}</p>
                </div>
              ))}
            </div>
            
            {insights.generatedAt && (
              <div className="mt-3 lg:mt-4 text-[10px] lg:text-xs text-gray-400 text-right">
                Updated: {new Date(insights.generatedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

