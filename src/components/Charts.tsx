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
import { usePreferences } from '@/contexts/PreferencesContext'
import { useAuth } from '@/contexts/AuthContext'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'

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

export default function Charts({ month, year, currency }: { month: number; year: number; currency?: string }) {
  const { formatCurrencyExplicit, currency: prefCurrency } = usePreferences()
  const { user } = useAuth()
  const { startISO, endISO } = useMemo(() => {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0)
    return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10) }
  }, [month, year])
  const viewCurrency = currency || prefCurrency

  // Load user's defined categories for normalization
  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['categories', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = collection(db, 'categories', user.uid, 'items')
      const q = query(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }))
    }
  })

  const definedCategoryNames = categories.map(c => c.name)

  // Sum by category for the selected month with currency conversion
  const { data: categoryData = [] } = useQuery<{ name: string; value: number }[]>({
    queryKey: ['chart-category', user?.uid, startISO, endISO, viewCurrency, definedCategoryNames.join(',')],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const expensesRef = collection(db, 'expenses', user.uid, 'items')
      const q = query(
        expensesRef,
        where('occurred_on', '>=', startISO),
        where('occurred_on', '<=', endISO),
        where('currency', '==', viewCurrency)
      )
      const snapshot = await getDocs(q)
      const map: Record<string, number> = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const rawCategory = data.category
        // Normalize the category to combine duplicates
        const normalizedCategory = normalizeCategory(rawCategory, definedCategoryNames)
        const originalAmount = Number(data.amount || 0)
        map[normalizedCategory] = (map[normalizedCategory] || 0) + originalAmount
      })
      const items = Object.entries(map).map(([name, value]) => ({ name, value }))
      items.sort((a, b) => b.value - a.value)
      return items
    }
  })

  // Last 6 months spending trend (ending at selected month) with currency conversion
  const { data: monthlyData = [] } = useQuery<{ month: string; amount: number }[]>({
    queryKey: ['chart-monthly', user?.uid, month, year, viewCurrency],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const points: { month: string; amount: number }[] = []
      const base = new Date(year, month - 1, 1)
      for (let i = 5; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        
        const expensesRef = collection(db, 'expenses', user.uid, 'items')
        const q = query(
          expensesRef,
          where('occurred_on', '>=', start.toISOString().slice(0,10)),
          where('occurred_on', '<=', end.toISOString().slice(0,10)),
          where('currency', '==', viewCurrency)
        )
        const snapshot = await getDocs(q)
        const total = snapshot.docs.reduce((acc, doc) => acc + Number(doc.data().amount || 0), 0)
        points.push({ month: d.toLocaleString(undefined, { month: 'short' }), amount: total })
      }
      return points
    }
  })
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Expenses by Category */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Expenses by Category</h3>
        {categoryData.length > 0 ? (
          <>
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
            <div className="mt-4 grid grid-cols-2 gap-2">
              {categoryData.map((category, idx) => (
                <div key={category.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: palette[idx % palette.length] }}
                  ></div>
                  <span className="text-xs text-gray-600 truncate">{category.name}</span>
                  <span className="text-xs font-medium text-gray-900">{formatCurrencyExplicit(category.value, viewCurrency)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            <p className="text-sm">No expenses this month</p>
          </div>
        )}
      </div>

      {/* Monthly Spending Trend */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Spending Trend</h3>
        {monthlyData.some(d => d.amount > 0) ? (
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
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">No spending history found</p>
          </div>
        )}
      </div>
    </div>
  )
}
