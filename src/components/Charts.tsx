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
  Tooltip,
  ComposedChart,
  Line,
  Area
} from 'recharts'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useAuth } from '@/contexts/AuthContext'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { useEnvironment } from '@/contexts/EnvironmentContext'

const palette = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#22c55e', '#eab308', '#f97316']

// Category mapping to normalize different variations
const CATEGORY_MAP: Record<string, string> = {
  'food & dining': 'Food & Dining',
  'food': 'Food & Dining',
  'dining': 'Food & Dining',
  'restaurant': 'Food & Dining',
  'groceries': 'Groceries',
  'grocery': 'Groceries',
  'transportation': 'Transportation',
  'transport': 'Transportation',
  'shopping': 'Shopping',
  'bills & utilities': 'Bills & Utilities',
  'bills': 'Bills & Utilities',
  'utilities': 'Bills & Utilities',
  'entertainment': 'Entertainment',
  'travel': 'Travel',
  'health': 'Health',
  'healthcare': 'Health',
  'insurance': 'Insurance',
  'investment': 'Investment',
  'investments': 'Investment',
  'rent': 'Rent',
  'emi': 'EMI',
  'car rental': 'Car rental',
  'other': 'Other',
}

function normalizeCategory(raw?: string, definedCategories?: string[]): string {
  if (!raw) return 'Other'
  const lower = raw.trim().toLowerCase()
  // Direct match to defined categories
  if (definedCategories && definedCategories.some(c => c.toLowerCase() === lower)) {
    return definedCategories.find(c => c.toLowerCase() === lower) || 'Other'
  }
  // Map via alias
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower]
  // Fuzzy match: contains
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return val
  }
  return 'Other'
}

export default function Charts({ startDate, endDate, currency, periodLabel }: { startDate: string; endDate: string; currency?: string; periodLabel?: string }) {
  const { formatCurrencyExplicit, currency: prefCurrency } = usePreferences()
  const { user } = useAuth()
  const { getCollection, currentEnvironment } = useEnvironment()
  const viewCurrency = currency || prefCurrency

  // Load user's defined categories for normalization
  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['categories', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = getCollection('categories')
      const q = query(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }))
    }
  })

  const definedCategoryNames = categories.map(c => c.name)

  // Sum by category for the selected period with currency conversion
  const { data: categoryData = [] } = useQuery<{ name: string; value: number }[]>({
    queryKey: ['chart-category', user?.uid, startDate, endDate, viewCurrency, currentEnvironment.id, definedCategoryNames.join(',')],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const expensesRef = getCollection('expenses')
      const q = query(
        expensesRef,
        where('occurred_on', '>=', startDate),
        where('occurred_on', '<=', endDate),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      const map: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const amount = Number(data.amount || 0)

        // Only include expenses (exclude income and transfers)
        const isIncome = data.type === 'income' || (!data.type && amount > 0)
        const isTransfer = data.type === 'transfer'
        if (isIncome || isTransfer) return

        const rawCategory = data.category
        // Normalize the category to combine duplicates
        const normalizedCategory = normalizeCategory(rawCategory, definedCategoryNames)
        const absAmount = Math.abs(amount)
        map[normalizedCategory] = (map[normalizedCategory] || 0) + absAmount
      })
      const items = Object.entries(map).map(([name, value]) => ({ name, value }))
      items.sort((a, b) => b.value - a.value)
      return items
    }
  })

  // Last 6 months spending trend (ending at selected period) with currency conversion
  const { data: monthlyData = [] } = useQuery<{ month: string; spending: number; income: number }[]>({
    queryKey: ['chart-monthly', user?.uid, startDate, endDate, viewCurrency, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const points: { month: string; spending: number; income: number }[] = []
      const endDateObj = new Date(endDate)

      // Generate 6 data points ending at the endDate
      for (let i = 5; i >= 0; i--) {
        const d = new Date(endDateObj.getFullYear(), endDateObj.getMonth() - i, 1)
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        const currentMonth = d.getMonth() + 1
        const currentYear = d.getFullYear()

        // Fetch expenses for this month
        const expensesRef = getCollection('expenses')
        const expenseQuery = query(
          expensesRef,
          where('occurred_on', '>=', start.toISOString().slice(0, 10)),
          where('occurred_on', '<=', end.toISOString().slice(0, 10)),
          where('currency', '==', viewCurrency)
        )
        const expenseSnapshot = await getDocs(expenseQuery)

        let spendingTotal = 0
        let incomeTotal = 0

        expenseSnapshot.docs.forEach(doc => {
          const data = doc.data()
          const amount = Math.abs(Number(data.amount || 0))

          // Separate income from expenses
          if (data.type === 'income') {
            incomeTotal += amount
          } else if (data.type === 'expense' || data.amount < 0) {
            spendingTotal += amount
          }
        })

        console.log(`Chart data for ${currentMonth}/${currentYear}:`, {
          spending: spendingTotal,
          income: incomeTotal,
          totalRecords: expenseSnapshot.size
        })

        points.push({
          month: d.toLocaleString(undefined, { month: 'short' }),
          spending: spendingTotal,
          income: incomeTotal
        })
      }
      return points
    }
  })
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* Expenses by Category */}
      <div className="card dark:bg-gray-800 dark:border-gray-700">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2 sm:mb-4">
          Expenses by Category
          {periodLabel && <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">({periodLabel})</span>}
        </h3>
        {categoryData.length > 0 ? (
          <>
            <div className="h-56 sm:h-64">
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
                    activeIndex={-1}
                    activeShape={false}
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, props) => [formatCurrencyExplicit(Number(value), viewCurrency), props.payload.name]}
                    labelFormatter={() => ''}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 sm:mt-4 grid grid-cols-2 gap-2">
              {categoryData.map((category, idx) => (
                <div key={category.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: palette[idx % palette.length] }}
                  ></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{category.name}</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{formatCurrencyExplicit(category.value, viewCurrency)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-56 sm:h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700 rounded-lg border border-dashed border-gray-200 dark:border-gray-600">
            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            <p className="text-sm">No expenses this month</p>
          </div>
        )}
      </div>

      {/* Monthly Income vs Spending Trend */}
      <div className="card dark:bg-gray-800 dark:border-gray-700">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2 sm:mb-4">Income vs Spending Trend</h3>
        {monthlyData.some(d => d.spending > 0 || d.income > 0) ? (
          <>
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value, name) => [
                      formatCurrencyExplicit(Number(value), viewCurrency),
                      name === 'income' ? 'Income' : 'Spending'
                    ]}
                  />
                  <Bar dataKey="income" fill="#3b82f6" radius={[4, 4, 0, 0]} name="income" />
                  <Line
                    type="monotone"
                    dataKey="spending"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="spending"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex items-center justify-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-blue-500"></div>
                <span className="text-gray-600 dark:text-gray-400">Income</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-gray-600 dark:text-gray-400">Spending</span>
              </div>
            </div>
          </>
        ) : (
          <div className="h-56 sm:h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700 rounded-lg border border-dashed border-gray-200 dark:border-gray-600">
            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">No data found</p>
          </div>
        )}
      </div>
    </div>
  )
}
