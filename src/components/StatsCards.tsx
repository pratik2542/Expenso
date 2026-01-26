import { CreditCardIcon, TrendingUpIcon, ChevronDownIcon, PencilIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore'
import { useState, useEffect } from 'react'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useEnvironment } from '@/contexts/EnvironmentContext'

function startEndOfMonth(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const toISO = (x: Date) => x.toISOString().slice(0, 10)
  return { start: toISO(start), end: toISO(end) }
}

interface StatsCardsProps {
  selectedCurrency?: string
  onSelectedCurrencyChange?: (code: string) => void
  selectedMonth?: number
  selectedYear?: number
  onSelectedMonthChange?: (month: number) => void
  onSelectedYearChange?: (year: number) => void
}

export default function StatsCards({
  selectedCurrency,
  onSelectedCurrencyChange,
  selectedMonth: controlledMonth,
  selectedYear: controlledYear,
  onSelectedMonthChange,
  onSelectedYearChange
}: StatsCardsProps = {}) {
  const { user } = useAuth()
  const { getCollection, currentEnvironment } = useEnvironment()
  const { formatCurrencyExplicit, currency: prefCurrency, loading: prefsLoading } = usePreferences()
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [localMonth, setLocalMonth] = useState(month)
  const [localYear, setLocalYear] = useState(year)
  const [incomeCurrency, setIncomeCurrency] = useState(currentEnvironment.currency || prefCurrency || 'USD')

  const selectedMonth = controlledMonth ?? localMonth
  const selectedYear = controlledYear ?? localYear

  const setSelectedMonth = (m: number) => {
    if (onSelectedMonthChange) onSelectedMonthChange(m)
    else setLocalMonth(m)
  }

  const setSelectedYear = (y: number) => {
    if (onSelectedYearChange) onSelectedYearChange(y)
    else setLocalYear(y)
  }

  const { start: selectedStart, end: selectedEnd } = startEndOfMonth(new Date(selectedYear, selectedMonth - 1, 1))
  const viewCurrency = selectedCurrency || incomeCurrency

  // Sync incomeCurrency with environment currency when it changes
  useEffect(() => {
    if (currentEnvironment.currency) {
      setIncomeCurrency(currentEnvironment.currency)
    } else if (!prefsLoading && prefCurrency) {
      setIncomeCurrency(prefCurrency)
    }
  }, [currentEnvironment.currency, prefCurrency, prefsLoading])

  const { data: totals = { spending: 0, income: 0, currency: viewCurrency } } = useQuery({
    queryKey: ['monthly-totals', user?.uid, selectedStart, selectedEnd, viewCurrency, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return { spending: 0, income: 0, currency: viewCurrency }
      const expensesRef = getCollection('expenses')
      const q = query(
        expensesRef,
        where('occurred_on', '>=', selectedStart),
        where('occurred_on', '<=', selectedEnd),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)

      let spendingTotal = 0
      let incomeTotal = 0

      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const amount = Number(data.amount || 0)
        const isIncome = data.type === 'income'

        if (isIncome) {
          incomeTotal += Math.abs(amount)
        } else {
          // It's an expense if it's not income and not a transfer
          // Note: transfers are usually handled differently or filtered out here
          if (data.type !== 'transfer') {
            spendingTotal += Math.abs(amount)
          }
        }
      })

      return { spending: spendingTotal, income: incomeTotal, currency: viewCurrency }
    }
  })

  const { data: budget = { amount: 0 } } = useQuery({
    queryKey: ['monthly-budget-total', user?.uid, selectedMonth, selectedYear, viewCurrency, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return { amount: 0, currency: viewCurrency }
      const budgetsRef = getCollection('budgets')
      const q = query(
        budgetsRef,
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      const total = snapshot.docs.reduce((acc, doc) => acc + Number(doc.data().amount || 0), 0)
      return { amount: total, currency: viewCurrency }
    }
  })

  // We still keep the monthly_income query for the "expected/budgeted" income if stored there, 
  // but we'll use totals.income for the primary display as it includes actual transactions.
  const { data: budgetedIncome = { amount: 0 } } = useQuery({
    queryKey: ['monthly-budgeted-income', user?.uid, selectedMonth, selectedYear, viewCurrency, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return { amount: 0 }
      const incomeRef = getCollection('monthly_income')
      const q = query(
        incomeRef,
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      if (snapshot.empty) return { amount: 0 }
      return { amount: Number(snapshot.docs[0].data().amount ?? 0) }
    }
  })

  const incomeAmt = totals.income || budgetedIncome.amount

  // Compact currency formatter
  const formatCompact = (amount: number, currency: string) => {
    const absAmount = Math.abs(amount)
    const sign = amount < 0 ? '-' : ''
    let symbol = ''
    try {
      symbol = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(0).replace(/[\d.,\s]/g, '')
    } catch { symbol = currency + ' ' }

    if (absAmount >= 1000000) return `${sign}${symbol}${(absAmount / 1000000).toFixed(1)}M`
    if (absAmount >= 10000) return `${sign}${symbol}${(absAmount / 1000).toFixed(1)}K`
    if (absAmount >= 1000) return `${sign}${symbol}${(absAmount / 1000).toFixed(2)}K`
    return formatCurrencyExplicit(amount, currency)
  }

  const cards: Array<{ name: string; value: string; compactValue: string; icon: any }> = []

  // Total Income
  cards.push({
    name: 'Total Income',
    value: formatCurrencyExplicit(incomeAmt, viewCurrency),
    compactValue: formatCompact(incomeAmt, viewCurrency),
    icon: TrendingUpIcon,
  })

  // Monthly Spending card
  cards.push({
    name: `Monthly Spending`,
    value: formatCurrencyExplicit(totals.spending, viewCurrency),
    compactValue: formatCompact(totals.spending, viewCurrency),
    icon: CreditCardIcon,
  })

  // Budget Used card
  if (budget.amount > 0) {
    const usedPct = Math.min(100, (totals.spending / budget.amount) * 100)
    cards.push({
      name: 'Budget Used',
      value: `${usedPct.toFixed(0)}%`,
      compactValue: `${usedPct.toFixed(0)}%`,
      icon: TrendingUpIcon,
    })
  }

  // Total Balance & Savings Rate
  if (incomeAmt > 0) {
    const balance = incomeAmt - totals.spending
    const isDeficit = balance < 0

    cards.unshift({
      name: 'Total Balance',
      value: formatCurrencyExplicit(balance, viewCurrency),
      compactValue: formatCompact(balance, viewCurrency),
      icon: TrendingUpIcon,
    })

    const savingsRate = ((balance / incomeAmt) * 100)
    cards.push({
      name: isDeficit ? 'Deficit Rate' : 'Savings Rate',
      value: `${Math.abs(savingsRate).toFixed(0)}%${isDeficit ? ' over' : ''}`,
      compactValue: `${Math.abs(savingsRate).toFixed(0)}%${isDeficit ? ' over' : ''}`,
      icon: TrendingUpIcon,
    })
  }

  if (cards.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {cards.map((stat) => {
        const IconComponent = stat.icon
        const isDeficitCard = stat.name === 'Deficit Rate' || (stat.name === 'Total Balance' && stat.value.startsWith('-'))
        const gradientBg = isDeficitCard
          ? 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/20'
          : 'bg-gradient-to-br from-primary-50 to-indigo-100 dark:from-primary-900/20 dark:to-indigo-900/20'
        const iconBg = isDeficitCard ? 'bg-red-500 dark:bg-red-600' : 'bg-primary-600 dark:bg-primary-500'
        const textColor = isDeficitCard ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'

        return (
          <div key={stat.name} className={`relative overflow-hidden rounded-xl ${gradientBg} p-2.5 lg:p-4 shadow-sm dark:shadow-gray-900/20`}>
            {/* Mobile layout */}
            <div className="flex flex-col lg:hidden">
              <div className={`w-6 h-6 ${iconBg} rounded-lg flex items-center justify-center mb-1.5 shadow-sm`}>
                <IconComponent className="h-3 w-3 text-white" />
              </div>
              <p className="text-[9px] font-medium text-gray-500 dark:text-gray-400 leading-tight">{stat.name}</p>
              <p className={`text-sm font-bold ${textColor} tracking-tight mt-0.5`}>{stat.compactValue}</p>
            </div>

            {/* Desktop layout */}
            <div className="hidden lg:flex items-center gap-3 h-full">
              <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center shadow-lg flex-shrink-0`}>
                <IconComponent className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">{stat.name}</p>
                <p className={`text-xl font-bold ${textColor} tracking-tight`}>{stat.value}</p>
              </div>
            </div>
            <div className={`absolute -right-2 -bottom-2 w-10 h-10 lg:w-16 lg:h-16 ${isDeficitCard ? 'bg-red-200 dark:bg-red-900/30' : 'bg-primary-200 dark:bg-primary-900/30'} rounded-full opacity-20`}></div>
          </div>
        )
      })}
    </div>
  )
}
