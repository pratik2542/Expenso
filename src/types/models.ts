export type AccountType = 'Bank' | 'Mobile Money' | 'Cash' | 'Credit Card' | 'Savings' | 'Investment' | 'Other'

export interface Environment {
    id: string
    name: string
    currency: string
    country?: string
    time_zone?: string
    theme?: string
    created_at: string
    // User ID is implicit from the collection parent
}

export interface Account {
    id: string
    name: string
    type: AccountType
    balance: number
    currency: string
    color?: string
    created_at: string
    archived?: boolean
}

export interface Expense {
    id: string
    amount: number
    currency: string
    merchant?: string
    description?: string // unifying with merchant?
    note?: string
    occurred_on: string
    created_at: string
    category: string
    attachment?: string
    type: 'income' | 'expense' // New field
    account_id?: string // New field
    payment_method?: string // Legacy field, kept for history
}

export interface Category {
    id: string
    name: string
    created_at: string
    type?: 'income' | 'expense' // Optional: categorize categories by type
}
