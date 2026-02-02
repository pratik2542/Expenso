import { MoreHorizontalIcon } from 'lucide-react'
import { usePreferences } from '@/contexts/PreferencesContext'

const expenses = [
  {
    id: 1,
    description: 'Grocery Shopping',
    category: 'Food & Dining',
    amount: -89.50,
    date: '2025-09-04',
    merchant: 'Whole Foods',
    account: 'Bank of America',
  },
  {
    id: 2,
    description: 'Gas Station',
    category: 'Transportation',
    amount: -45.20,
    date: '2025-09-03',
    merchant: 'Shell',
    account: 'Chase',
  },
  {
    id: 3,
    description: 'Coffee Shop',
    category: 'Food & Dining',
    amount: -5.75,
    date: '2025-09-03',
    merchant: 'Starbucks',
    account: 'Cash',
  },
  {
    id: 4,
    description: 'Salary Deposit',
    category: 'Income',
    amount: 3200.00,
    date: '2025-09-01',
    merchant: 'Company Inc.',
    account: 'Wells Fargo',
  },
  {
    id: 5,
    description: 'Netflix Subscription',
    category: 'Entertainment',
    amount: -15.99,
    date: '2025-09-01',
    merchant: 'Netflix',
    account: 'Credit Card',
  },
]

const categoryColors: { [key: string]: string } = {
  'Food & Dining': 'bg-red-100 text-red-800',
  'Transportation': 'bg-blue-100 text-blue-800',
  'Entertainment': 'bg-purple-100 text-purple-800',
  'Income': 'bg-green-100 text-green-800',
}

export default function ExpensesList() {
  const { formatCurrency, formatDate } = usePreferences()
  return (
    <div className="flow-root">
      <ul role="list" className="-my-5 divide-y divide-gray-200">
        {expenses.map((expense) => (
          <li key={expense.id} className="py-4">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  categoryColors[expense.category] || 'bg-gray-100 text-gray-800'
                }`}>
                  {expense.category}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {expense.description}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {expense.merchant} • {formatDate(expense.date)}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  Account: {expense.account}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`text-sm font-semibold ${
                  expense.amount < 0 ? 'text-error-600' : 'text-success-600'
                }`}>
                  {expense.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(expense.amount))}
                </div>
                <button className="p-1 rounded-full hover:bg-gray-100">
                  <MoreHorizontalIcon className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
