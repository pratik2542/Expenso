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
import { supabase } from '@/lib/supabaseClient'

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
    queryKey: ['categories', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user!.id)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    }
  })

  const definedCategoryNames = categories.map(c => c.name)

  // Sum by category for the selected month with currency conversion
  const { data: categoryData = [] } = useQuery<{ name: string; value: number }[]>({
    queryKey: ['chart-category', user?.id, startISO, endISO, viewCurrency, definedCategoryNames.join(',')],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('category, amount, currency, occurred_on')
        .eq('user_id', user!.id)
        .gte('occurred_on', startISO)
        .lte('occurred_on', endISO)
        .eq('currency', viewCurrency)
      if (error) throw error
      const map: Record<string, number> = {}
      for (const r of data || []) {
        const rawCategory = (r as any).category
        // Normalize the category to combine duplicates
        const normalizedCategory = normalizeCategory(rawCategory, definedCategoryNames)
        const originalAmount = Number((r as any).amount || 0)
        map[normalizedCategory] = (map[normalizedCategory] || 0) + originalAmount
      }
      const items = Object.entries(map).map(([name, value]) => ({ name, value }))
      items.sort((a, b) => b.value - a.value)
      return items
    }
  })

  // Last 6 months spending trend (ending at selected month) with currency conversion
  const { data: monthlyData = [] } = useQuery<{ month: string; amount: number }[]>({
    queryKey: ['chart-monthly', user?.id, month, year, viewCurrency],
    enabled: !!user?.id,
    queryFn: async () => {
      const points: { month: string; amount: number }[] = []
      const base = new Date(year, month - 1, 1)
      for (let i = 5; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        const { data, error } = await supabase
          .from('expenses')
          .select('amount, currency, occurred_on')
          .eq('user_id', user!.id)
          .gte('occurred_on', start.toISOString().slice(0,10))
          .lte('occurred_on', end.toISOString().slice(0,10))
          .eq('currency', viewCurrency)
        if (error) throw error
        
        const total = (data || []).reduce((acc, r: any) => acc + Number(r.amount || 0), 0)
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
      </div>

      {/* Monthly Spending Trend */}
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
    </div>
  )
}
