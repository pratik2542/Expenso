import React, { Fragment, useMemo, useRef, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X, ExternalLink, ArrowDownCircle, ArrowUpCircle, Upload, Check, AlertCircle, FileSpreadsheet, FileText } from 'lucide-react'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useAuth } from '@/contexts/AuthContext'
import { analytics } from '@/lib/firebaseClient'
import { logEvent } from 'firebase/analytics'
import { compressImage, formatBytes } from '@/utils/imageCompression'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query as fbQuery, getDocs, addDoc, updateDoc, doc, orderBy, runTransaction, getDoc } from 'firebase/firestore'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { Account } from '@/types/models'
import { getApiUrl } from '@/lib/config'

interface AddExpenseModalProps {
  open: boolean
  onClose: () => void
  onAdded: () => void
  mode?: 'add' | 'edit'
  expense?: {
    id: string
    amount: number
    currency: string
    merchant?: string
    payment_method?: string
    note?: string
    occurred_on: string
    category: string
    attachment?: string
    type?: 'income' | 'expense' | 'transfer'
    account_id?: string
    transferAmount?: number
    toAccountId?: string
  } | null
  initialImportMode?: boolean
}

const CATEGORY_MAP: Record<string, string> = {
  retail: 'Shopping',
  groceries: 'Groceries',
  food: 'Food & Dining',
  dining: 'Food & Dining',
  restaurant: 'Food & Dining',
  entertainment: 'Entertainment',
  travel: 'Travel',
  transport: 'Transportation',
  transportation: 'Transportation',
  gas: 'Gas',
  fuel: 'Gas',
  healthcare: 'Healthcare',
  medical: 'Healthcare',
  bills: 'Bills & Utilities',
  utilities: 'Bills & Utilities',
  shopping: 'Shopping',
  other: 'Other',
  salary: 'Salary',
  paycheck: 'Salary',
  income: 'Income',
  deposit: 'Income'
}

function normalizeCategory(raw?: string, definedCategories?: string[]): string {
  if (!raw) return ''
  const lower = raw.trim().toLowerCase()
  if (definedCategories && definedCategories.some(c => c.toLowerCase() === lower)) {
    return definedCategories.find(c => c.toLowerCase() === lower) || ''
  }
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower]
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return val
  }
  return ''
}

function formatDateToISO(dateStr?: string): string {
  const now = new Date()
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  if (!dateStr) return localToday
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    // If it was a timestamp, convert to local YYYY-MM-DD
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return localToday
}

export default function AddExpenseModal({ open, onClose, onAdded, mode = 'add', expense = null, initialImportMode = false }: AddExpenseModalProps) {
  const { user } = useAuth()
  const { currentEnvironment, getCollection } = useEnvironment()
  const queryClient = useQueryClient()

  // Load categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = getCollection('categories')
      const q = fbQuery(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        type: doc.data().type || 'expense' // default to expense for backward compatibility
      }))
    }
  })

  // Pre-compute expense and income categories
  const expenseCategories = useMemo(() =>
    [...new Set(categories.filter((c: any) => c.type === 'expense').map((c: any) => c.name))],
    [categories]
  )
  const incomeCategories = useMemo(() =>
    [...new Set(categories.filter((c: any) => c.type === 'income').map((c: any) => c.name))],
    [categories]
  )

  // Load Accounts
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const accountsRef = getCollection('accounts')
      const snapshot = await getDocs(accountsRef)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Account[]
    }
  })

  // Ensure there's a default "None" or similar if no accounts exist? 
  // We'll require an account if any exist, effectively.

  const { currency: prefCurrency, paymentMethods } = usePreferences()

  const [formData, setFormData] = useState({
    amount: '',
    currency: currentEnvironment.currency || prefCurrency || 'USD',
    merchant: '',
    payment_method: '', // Will store Account Name for legacy/display
    account_id: '',
    note: '',
    occurred_on: (() => {
      // For today's date, use current time. For older dates, use start of day
      const now = new Date()
      return now.toISOString()
    })(),
    category: '',
    attachment: '',
    type: 'expense' as 'expense' | 'income' | 'transfer',
    toAccountId: ''
  })

  // Get categories based on transaction type
  const definedCategoryNames = useMemo(() =>
    formData.type === 'income' ? incomeCategories : expenseCategories,
    [formData.type, incomeCategories, expenseCategories]
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Import state
  const [isImportMode, setIsImportMode] = useState(initialImportMode)
  const [importMediaType, setImportMediaType] = useState<'none' | 'pdf' | 'excel'>('none')
  
  // Reset import mode when modal opens with initialImportMode
  useEffect(() => {
    if (open && initialImportMode) {
      setIsImportMode(true)
      setImportMediaType('none')
      setParsedExpenses([])
      setImportFile(null)
    } else if (!open && !initialImportMode) {
      // Only reset if closing and not in initial import mode
      setIsImportMode(false)
      setImportMediaType('none')
    }
  }, [open, initialImportMode])
  const [importing, setImporting] = useState(false)
  const [parsedExpenses, setParsedExpenses] = useState<any[]>([])
  const [selectedImportIndices, setSelectedImportIndices] = useState<number[]>([])
  const [importAccount, setImportAccount] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [debugStatus, setDebugStatus] = useState<string>('')

  // Initialize form
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && expense) {
        // For transfers, use transferAmount instead of amount
        const displayAmount = expense.type === 'transfer' && expense.transferAmount
          ? String(expense.transferAmount)
          : String(Math.abs(expense.amount ?? 0))

        setFormData({
          amount: displayAmount,
          currency: expense.currency || currentEnvironment.currency || 'USD',
          merchant: expense.merchant || '',
          payment_method: expense.payment_method || '',
          account_id: expense.account_id || '',
          note: expense.note || '',
          occurred_on: formatDateToISO(expense.occurred_on),
          category: normalizeCategory(expense.category, definedCategoryNames) || '',
          attachment: expense.attachment || '',
          type: expense.type || 'expense',
          toAccountId: expense.toAccountId || ''
        })
      } else {
        // Default to first account if available
        const defaultAcc = accounts[0]
        setFormData({
          amount: '',
          currency: currentEnvironment.currency || 'USD',
          merchant: '',
          payment_method: defaultAcc ? defaultAcc.name : 'Cash',
          account_id: defaultAcc ? defaultAcc.id : '',
          note: '',
          occurred_on: new Date().toISOString(),
          category: '',
          attachment: '',
          type: 'expense',
          toAccountId: ''
        })
      }
      setError(null)
      // Only reset import mode if not opening with initialImportMode
      // Don't reset if initialImportMode is true - let the other useEffect handle it
      if (!initialImportMode) {
        setIsImportMode(false)
        setImportMediaType('none')
      }
      setParsedExpenses([])
      setPdfModalOpen(false)
      setImportFile(null)
    }
  }, [open, mode, expense, accounts, currentEnvironment, initialImportMode])

  // Sync currency with environment when it changes (but not during edit mode)
  useEffect(() => {
    if (mode !== 'edit' && currentEnvironment.currency) {
      setFormData(prev => {
        if (prev.currency !== currentEnvironment.currency) {
          return { ...prev, currency: currentEnvironment.currency }
        }
        return prev
      })
    }
  }, [currentEnvironment.currency, mode])

  // Clear category if it doesn't exist in the new type's categories when switching between income/expense
  useEffect(() => {
    if (formData.category && !definedCategoryNames.includes(formData.category) && formData.category !== 'Other') {
      setFormData(prev => ({ ...prev, category: '' }))
    }
  }, [formData.type, definedCategoryNames])

  // Listen for PDF import messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Debug logging
      console.log('Message received:', event.origin, event.data)

      // Relaxed origin verify for debugging
      // We accept messages from the known tool URL or localhost
      const allowedOrigins = [
        'https://expenso-pdfexcel.vercel.app',
        'http://localhost:3000',
        window.location.origin // Allow self for testing
      ]

      const isAllowed = allowedOrigins.some(o => event.origin.includes(o)) || event.origin.includes('vercel.app')

      if (!isAllowed) {
        console.warn('Ignored message from:', event.origin)
        return
      }

      let data = event.data

      // Handle stringified JSON if applicable
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (e) {
          // Not JSON, ignore
          return
        }
      }

      if (data && data.expenses && Array.isArray(data.expenses)) {
        const msg = `Success! Received ${data.expenses.length} expenses.`
        setDebugStatus(msg)

        setParsedExpenses(data.expenses.map((e: any, i: number) => ({ ...e, _tempId: i })))
        setSelectedImportIndices(data.expenses.map((_: any, i: number) => i)) // Select all by default

        // Close modal and show results
        setPdfModalOpen(false)
        setIsImportMode(true)
      }
      // Handle the PDF tool's format: {type: "TRANSACTIONS_EXTRACTED", transactions: [...]}
      else if (data && data.type === 'TRANSACTIONS_EXTRACTED' && Array.isArray(data.transactions)) {
        const msg = `Success! Received ${data.transactions.length} transactions from PDF.`
        setDebugStatus(msg)

        // Map PDF tool format to our expected format
        const mappedExpenses = data.transactions.map((txn: any, i: number) => {
          // Parse amount - positive for expenses, negative for income
          let amount = parseFloat(txn.amount || txn.debit || txn.credit || 0)

          // If it has a credit field, it's income (negative)
          if (txn.credit && parseFloat(txn.credit) > 0) {
            amount = -parseFloat(txn.credit)
          } else if (txn.debit && parseFloat(txn.debit) > 0) {
            amount = parseFloat(txn.debit)
          }

          return {
            _tempId: i,
            amount: amount,
            currency: txn.currency || 'USD',
            merchant: txn.description || txn.merchant || 'Unknown',
            occurred_on: txn.date ? formatDateToISO(txn.date) : new Date().toISOString().split('T')[0],
            category: txn.category || 'Other',
            raw_category: txn.category || '',
            payment_method: 'Credit Card',
            note: txn.note || ''
          }
        })

        setParsedExpenses(mappedExpenses)
        setSelectedImportIndices(mappedExpenses.map((_: any, i: number) => i)) // Select all by default

        // Close modal and show results
        setPdfModalOpen(false)
        setIsImportMode(true)
      }
      else {
        // Log generic objects to debug status to see what we're getting
        if (typeof data === 'object') {
          setDebugStatus(`Received data: ${JSON.stringify(data).slice(0, 100)}`)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setError(null)

    try {
      const amountVal = parseFloat(formData.amount)
      if (isNaN(amountVal) || amountVal <= 0) throw new Error('Invalid amount')

      // Handle Transfer Type
      if (formData.type === 'transfer') {
        if (!formData.account_id || !formData.toAccountId) {
          throw new Error('Please select both source and destination accounts')
        }
        if (formData.account_id === formData.toAccountId) {
          throw new Error('Source and destination accounts must be different')
        }

        await runTransaction(db, async (transaction) => {
          if (mode === 'edit' && expense) {
            // EDITING A TRANSFER
            const oldAmount = expense.transferAmount || 0
            const oldFromAccountId = expense.account_id
            const oldToAccountId = expense.toAccountId
            const newFromAccountId = formData.account_id
            const newToAccountId = formData.toAccountId!

            // Collect all unique account IDs we need to read
            const accountIds = new Set([oldFromAccountId, oldToAccountId, newFromAccountId, newToAccountId].filter(Boolean))

            // Read all accounts once
            const accountDocs = new Map()
            for (const accId of accountIds) {
              if (accId) {
                const accRef = doc(getCollection('accounts'), accId)
                const accDoc = await transaction.get(accRef)
                if (accDoc.exists()) {
                  accountDocs.set(accId, accDoc)
                }
              }
            }

            // Calculate balance changes for each account
            const balanceChanges = new Map()

            // Revert old transfer
            if (oldFromAccountId && accountDocs.has(oldFromAccountId)) {
              balanceChanges.set(oldFromAccountId, (balanceChanges.get(oldFromAccountId) || 0) + oldAmount)
            }
            if (oldToAccountId && accountDocs.has(oldToAccountId)) {
              balanceChanges.set(oldToAccountId, (balanceChanges.get(oldToAccountId) || 0) - oldAmount)
            }

            // Apply new transfer
            if (newFromAccountId && accountDocs.has(newFromAccountId)) {
              balanceChanges.set(newFromAccountId, (balanceChanges.get(newFromAccountId) || 0) - amountVal)
            }
            if (newToAccountId && accountDocs.has(newToAccountId)) {
              balanceChanges.set(newToAccountId, (balanceChanges.get(newToAccountId) || 0) + amountVal)
            }

            // Apply all balance changes
            for (const [accId, change] of balanceChanges.entries()) {
              if (change !== 0) {
                const accDoc = accountDocs.get(accId)
                const currentBal = accDoc.data().balance || 0
                const accRef = doc(getCollection('accounts'), accId)
                transaction.update(accRef, { balance: currentBal + change })
              }
            }

            // Update transfer record
            const expenseRef = doc(getCollection('expenses'), expense.id)
            transaction.update(expenseRef, {
              amount: 0,
              currency: formData.currency,
              merchant: `Transfer to ${accounts.find(a => a.id === formData.toAccountId)?.name}`,
              payment_method: formData.payment_method || accounts.find(a => a.id === formData.account_id)?.name || null,
              account_id: formData.account_id,
              note: formData.note || `Transferred ${formData.currency} ${amountVal} to ${accounts.find(a => a.id === formData.toAccountId)?.name}`,
              occurred_on: formData.occurred_on,
              category: 'Transfer',
              type: 'transfer',
              toAccountId: formData.toAccountId,
              transferAmount: amountVal
            })
          } else {
            // ADDING NEW TRANSFER
            const fromAccRef = doc(getCollection('accounts'), formData.account_id)
            const toAccRef = doc(getCollection('accounts'), formData.toAccountId!)
            const fromAccDoc = await transaction.get(fromAccRef)
            const toAccDoc = await transaction.get(toAccRef)

            if (!fromAccDoc.exists() || !toAccDoc.exists()) {
              throw new Error('One or both accounts not found')
            }

            const fromBalance = fromAccDoc.data().balance || 0
            const toBalance = toAccDoc.data().balance || 0

            transaction.update(fromAccRef, { balance: fromBalance - amountVal })
            transaction.update(toAccRef, { balance: toBalance + amountVal })

            // Create transfer record
            const expensesRef = getCollection('expenses')
            const transferRef = doc(expensesRef)
            transaction.set(transferRef, {
              amount: 0, // Transfers don't affect net worth
              currency: formData.currency,
              merchant: `Transfer to ${accounts.find(a => a.id === formData.toAccountId)?.name}`,
              payment_method: formData.payment_method || accounts.find(a => a.id === formData.account_id)?.name || null,
              account_id: formData.account_id,
              note: formData.note || `Transferred ${formData.currency} ${amountVal} to ${accounts.find(a => a.id === formData.toAccountId)?.name}`,
              occurred_on: formData.occurred_on,
              category: 'Transfer',
              type: 'transfer',
              toAccountId: formData.toAccountId,
              transferAmount: amountVal,
              created_at: new Date().toISOString()
            })
          }
        })

        setLoading(false)
        onAdded()
        onClose()
        return
      }

      // Store income as positive, expenses as negative for proper calculations
      const storedAmount = formData.type === 'income' ? amountVal : -amountVal

      const expenseData = {
        amount: storedAmount,
        currency: formData.currency,
        merchant: formData.merchant || (formData.type === 'income' ? 'Income Source' : 'Unknown'),
        payment_method: formData.payment_method || null,
        account_id: formData.account_id || null,
        note: formData.note || '',
        occurred_on: formData.occurred_on,
        category: formData.category || 'Other',
        attachment: formData.attachment || null,
        type: formData.type
      }

      await runTransaction(db, async (transaction) => {
        // ===== READS FIRST (Required by Firestore) =====

        // Read old account if editing
        let oldAccDoc = null
        if (mode === 'edit' && expense && expense.account_id) {
          const oldAccRef = doc(getCollection('accounts'), expense.account_id)
          oldAccDoc = await transaction.get(oldAccRef)
        }

        // Read new account
        let newAccDoc = null
        if (formData.account_id) {
          const accRef = doc(getCollection('accounts'), formData.account_id)
          newAccDoc = await transaction.get(accRef)
        }

        // ===== WRITES SECOND =====

        if (mode === 'edit' && expense && expense.id) {
          // EDITING: Handle account balance updates
          const oldAmount = expense.amount
          const newAmount = storedAmount
          const oldAccountId = expense.account_id
          const newAccountId = formData.account_id

          if (oldAccountId === newAccountId && oldAccountId) {
            // Same account: calculate net change and apply once
            const netChange = newAmount - oldAmount
            if (oldAccDoc && oldAccDoc.exists() && netChange !== 0) {
              const oldAccRef = doc(getCollection('accounts'), oldAccountId)
              const currentBal = oldAccDoc.data().balance || 0
              transaction.update(oldAccRef, { balance: currentBal + netChange })
            }
          } else {
            // Different accounts: revert from old, apply to new
            if (oldAccountId && oldAccDoc && oldAccDoc.exists()) {
              const oldAccRef = doc(getCollection('accounts'), oldAccountId)
              const currentBal = oldAccDoc.data().balance || 0
              transaction.update(oldAccRef, { balance: currentBal - oldAmount })
            }
            if (newAccountId && newAccDoc && newAccDoc.exists()) {
              const newAccRef = doc(getCollection('accounts'), newAccountId)
              const currentBal = newAccDoc.data().balance || 0
              transaction.update(newAccRef, { balance: currentBal + newAmount })
            }
          }
        } else {
          // ADDING: Simply apply the new transaction
          if (formData.account_id && newAccDoc && newAccDoc.exists()) {
            const accRef = doc(getCollection('accounts'), formData.account_id)
            const currentBal = newAccDoc.data().balance || 0
            transaction.update(accRef, { balance: currentBal + storedAmount })
          }
        }

        // 3. Write Expense Document
        if (mode === 'edit' && expense?.id) {
          const expenseRef = doc(getCollection('expenses'), expense.id)
          transaction.update(expenseRef, expenseData)
        } else {
          const expensesRef = getCollection('expenses')
          const newExpenseRef = doc(expensesRef) // Auto-gen ID
          transaction.set(newExpenseRef, {
            ...expenseData,
            created_at: new Date().toISOString()
          })
        }
      })

    } catch (error: any) {
      setLoading(false)
      setError(error.message)
      return
    }

    setLoading(false)
    onAdded()
    onClose()

  }

  const handleImportUpload = async () => {
    if (!importFile) return
    setImporting(true)
    setError(null)
    setParsedExpenses([])

    try {
      const formData = new FormData()
      formData.append('file', importFile)

      const endpoint = getApiUrl('/api/import/parse-spreadsheet')

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Import failed')

      setParsedExpenses(data.expenses.map((e: any, i: number) => ({ ...e, _tempId: i })))
      setSelectedImportIndices(data.expenses.map((_: any, i: number) => i)) // Select all by default
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const handleSaveImported = async () => {
    if (!user || !importAccount) {
      setError('Please select an account for these transactions')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const selected = parsedExpenses.filter((_, i) => selectedImportIndices.includes(i))
      if (selected.length === 0) return

      await runTransaction(db, async (transaction) => {
        const accRef = doc(getCollection('accounts'), importAccount)
        const accDoc = await transaction.get(accRef)
        if (!accDoc.exists()) throw new Error('Account not found')

        const currentBal = accDoc.data().balance || 0
        let netChange = 0

        selected.forEach(exp => {
          // Standardize: income as positive, expense as negative
          let storedAmount = 0;
          let type = 'expense';
          if (exp.amount < 0) {
            // Income: store as positive
            storedAmount = Math.abs(exp.amount);
            type = 'income';
            netChange += storedAmount; // Add income to balance
          } else {
            // Expense: store as negative
            storedAmount = -Math.abs(exp.amount);
            type = 'expense';
            netChange -= Math.abs(exp.amount); // Subtract expense from balance
          }

          const newRef = doc(getCollection('expenses'));
          transaction.set(newRef, {
            amount: storedAmount, // Store: positive for income, negative for expense
            currency: exp.currency || 'USD',
            merchant: exp.merchant || 'Unknown',
            payment_method: exp.payment_method || 'Imported',
            account_id: importAccount,
            note: exp.note || '',
            occurred_on: exp.occurred_on,
            category: exp.category || 'Uncategorized',
            attachment: null,
            type,
            created_at: new Date().toISOString()
          });
        });

        transaction.update(accRef, { balance: currentBal + netChange });
      });

      onAdded()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAccountChange = (accId: string) => {
    const acc = accounts.find(a => a.id === accId)
    if (acc) {
      setFormData(prev => ({
        ...prev,
        account_id: acc.id,
        payment_method: acc.name,
        currency: acc.currency // Auto-switch currency to account currency? Yes, usually.
      }))
    } else {
      setFormData(prev => ({ ...prev, account_id: '', payment_method: 'Cash' }))
    }
  }

  // Simplified file handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Images only'); return }
    try {
      const compressedBase64 = await compressImage(file, 1920, 1920, 0.8)
      setFormData(prev => ({ ...prev, attachment: compressedBase64 }))
    } catch { alert('Failed processing image') }
  }

  const themeColor = formData.type === 'income' ? 'green' : formData.type === 'transfer' ? 'blue' : 'primary'
  const ThemeIcon = formData.type === 'income' ? ArrowDownCircle : formData.type === 'transfer' ? ArrowDownCircle : ArrowUpCircle

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 pb-safe text-center sm:items-center sm:p-0" style={{ paddingBottom: 'max(calc(5rem + env(safe-area-inset-bottom, 0px)), 5rem)' }}>
            <Dialog.Panel className={`relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full ${isImportMode && parsedExpenses.length > 0
              ? 'sm:max-w-7xl' // Large for import table
              : isImportMode
                ? 'sm:max-w-2xl' // Medium for import options
                : 'sm:max-w-lg' // Small for manual entry
              } sm:p-6`} style={{ marginBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }}>
              <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="w-full">
                {/* Toggle Type */}
                <div className="flex justify-center mb-6">
                  <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-xl flex gap-1">
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, type: 'expense' }))}
                      className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${formData.type === 'expense'
                        ? 'bg-white dark:bg-gray-600 text-red-600 dark:text-red-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, type: 'income' }))}
                      className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${formData.type === 'income'
                        ? 'bg-white dark:bg-gray-600 text-green-600 dark:text-green-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                      Income
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, type: 'transfer', toAccountId: '' }))}
                      className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${formData.type === 'transfer'
                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                      Transfer
                    </button>
                  </div>
                </div>

                {/* PDF Tool Modal - Responsive */}
                <Transition.Root show={pdfModalOpen} as={Fragment}>
                  <Dialog as="div" className="relative z-[60]" onClose={() => setPdfModalOpen(false)}>
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" />
                    <div className="fixed inset-0 z-10 overflow-y-auto">
                      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
                        <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 w-full max-w-[95vw] lg:max-w-[90vw] h-[90vh] lg:h-[85vh] shadow-2xl transition-all flex flex-col">
                          <div className="flex justify-between items-center px-4 py-3 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">PDF Converter Tool</h3>
                            <button
                              onClick={() => setPdfModalOpen(false)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <X className="h-6 w-6" />
                            </button>
                          </div>
                          <div className="flex-1 w-full bg-gray-50 overflow-hidden">
                            <iframe
                              src="https://expenso-pdfexcel.vercel.app"
                              className="w-full h-full border-0"
                              title="PDF Converter"
                              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                            />
                          </div>
                        </Dialog.Panel>
                      </div>
                    </div>
                  </Dialog>
                </Transition.Root>
                <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 dark:text-white mb-4 text-center">
                  <div className="flex justify-center items-center gap-2 mb-4">
                    <button
                      onClick={() => { setIsImportMode(false); setImportMediaType('none') }}
                      className={`px-3 py-1 rounded-full text-sm ${!isImportMode ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                      Manual Entry
                    </button>
                    <button
                      onClick={() => { setIsImportMode(true); setImportMediaType('none') }}
                      className={`px-3 py-1 rounded-full text-sm ${isImportMode ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                      Import File
                    </button>
                  </div>
                  {isImportMode ? 'Import Transactions' : (mode === 'edit' ? 'Edit Transaction' : (formData.type === 'income' ? 'Add Income' : 'Add Expense'))}
                </Dialog.Title>

                {isImportMode ? (
                  <div className="space-y-4">
                    {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}


                    {/* Selection Screen */}
                    {importMediaType === 'none' && !parsedExpenses.length && (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <button
                          onClick={() => {
                            setDebugStatus('Opening PDF Modal...')
                            setPdfModalOpen(true)
                          }}
                          className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all group"
                        >
                          <FileText className="h-10 w-10 text-gray-400 dark:text-gray-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 mb-3" />
                          <span className="font-medium text-gray-900 dark:text-white">Import PDF</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">Bank Statements</span>
                        </button>

                        <button
                          onClick={() => setImportMediaType('excel')}
                          className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
                        >
                          <FileSpreadsheet className="h-10 w-10 text-gray-400 dark:text-gray-500 group-hover:text-green-600 dark:group-hover:text-green-400 mb-3" />
                          <span className="font-medium text-gray-900 dark:text-white">Import Excel/CSV</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">Spreadsheets</span>
                        </button>
                      </div>
                    )}



                    {/* Excel Import UI */}
                    {importMediaType === 'excel' && !parsedExpenses.length && (
                      <div className="space-y-4">
                        <button
                          onClick={() => setImportMediaType('none')}
                          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
                        >
                          ← Back to options
                        </button>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Account</label>
                          <select
                            value={importAccount}
                            onChange={e => setImportAccount(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white py-2 text-base focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                          >
                            <option value="">Select Account...</option>
                            {accounts.map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                            ))}
                          </select>
                        </div>

                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors">
                          <input
                            type="file"
                            id="file-upload"
                            className="hidden"
                            accept=".csv,.xlsx,.xls"
                            onChange={e => {
                              if (e.target.files?.[0]) {
                                setImportFile(e.target.files[0])
                              }
                            }}
                          />
                          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                            <Upload className="h-8 w-8 text-gray-400 mb-2" />
                            <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                              {importFile ? importFile.name : 'Click to upload Excel/CSV'}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">.xlsx, .xls, .csv</span>
                          </label>
                          {importFile && (
                            <button
                              onClick={handleImportUpload}
                              disabled={importing || !importAccount}
                              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                            >
                              {importing ? 'Parsing...' : 'Process File'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Results Table (Shared) - Editable */}
                    {parsedExpenses.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            Parsed expenses: <strong>{parsedExpenses.length}</strong> • Selected: <strong>{selectedImportIndices.length}</strong>
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => setSelectedImportIndices(parsedExpenses.map((_, i) => i))} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Select all</button>
                            <button onClick={() => setSelectedImportIndices([])} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">Clear</button>
                          </div>
                        </div>

                        {/* Account, Currency & Payment Method Selectors */}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Account *</label>
                            <select
                              value={importAccount}
                              onChange={e => setImportAccount(e.target.value)}
                              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white py-2 text-base focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                              required
                            >
                              <option value="">Select Account</option>
                              {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Currency Override</label>
                            <select
                              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white py-2 text-base focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                              onChange={(e) => {
                                if (e.target.value && e.target.value !== '') {
                                  // Apply currency to all selected items
                                  const updated = parsedExpenses.map((exp, i) =>
                                    selectedImportIndices.includes(i) ? { ...exp, currency: e.target.value } : exp
                                  )
                                  setParsedExpenses(updated)
                                }
                              }}
                            >
                              <option value="">— keep detected —</option>
                              <option value={currentEnvironment.currency || 'USD'}>
                                {currentEnvironment.currency || 'USD'} (Environment Default)
                              </option>
                              <option disabled>──────────</option>
                              <option value="USD">USD - US Dollar</option>
                              <option value="EUR">EUR - Euro</option>
                              <option value="GBP">GBP - British Pound</option>
                              <option value="CAD">CAD - Canadian Dollar</option>
                              <option value="AUD">AUD - Australian Dollar</option>
                              <option value="JPY">JPY - Japanese Yen</option>
                              <option value="CHF">CHF - Swiss Franc</option>
                              <option value="CNY">CNY - Chinese Yuan</option>
                              <option value="INR">INR - Indian Rupee</option>
                              <option value="MXN">MXN - Mexican Peso</option>
                              <option value="BRL">BRL - Brazilian Real</option>
                              <option value="ZAR">ZAR - South African Rand</option>
                              <option value="SGD">SGD - Singapore Dollar</option>
                              <option value="HKD">HKD - Hong Kong Dollar</option>
                              <option value="NZD">NZD - New Zealand Dollar</option>
                              <option value="SEK">SEK - Swedish Krona</option>
                              <option value="NOK">NOK - Norwegian Krone</option>
                              <option value="KRW">KRW - South Korean Won</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Method Override</label>
                            <select
                              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white py-2 text-base focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                              onChange={(e) => {
                                if (e.target.value && e.target.value !== '') {
                                  // Apply payment method to all parsed expenses
                                  const updated = parsedExpenses.map((exp) => ({
                                    ...exp,
                                    payment_method: e.target.value
                                  }))
                                  setParsedExpenses(updated)
                                }
                              }}
                            >
                              <option value="">— keep detected —</option>
                              <option value="Credit Card">Credit Card</option>
                              <option value="Debit Card">Debit Card</option>
                              <option value="Cash">Cash</option>
                              <option value="Bank Transfer">Bank Transfer</option>
                              <option value="UPI">UPI</option>
                              <option value="NEFT">NEFT</option>
                              <option value="Imported">Imported</option>
                            </select>
                          </div>
                        </div>

                        <div className="max-h-96 overflow-y-auto border dark:border-gray-600 rounded-md">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600 text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                              <tr>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                  <input
                                    type="checkbox"
                                    checked={selectedImportIndices.length === parsedExpenses.length}
                                    onChange={(e) => setSelectedImportIndices(e.target.checked ? parsedExpenses.map((_, i) => i) : [])}
                                    className="rounded text-primary-600 focus:ring-primary-500"
                                  />
                                </th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Income</th>
                                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Expense</th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Currency</th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Merchant</th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Payment</th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Category</th>
                                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Raw Category</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                              {parsedExpenses.map((exp, idx) => {
                                const isIncome = exp.amount < 0
                                const absAmount = Math.abs(exp.amount)
                                return (
                                  <tr key={idx} className={selectedImportIndices.includes(idx) ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <input
                                        type="checkbox"
                                        checked={selectedImportIndices.includes(idx)}
                                        onChange={e => {
                                          if (e.target.checked) setSelectedImportIndices([...selectedImportIndices, idx])
                                          else setSelectedImportIndices(selectedImportIndices.filter(i => i !== idx))
                                        }}
                                        className="rounded text-primary-600 focus:ring-primary-500"
                                      />
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <input
                                        type="date"
                                        value={exp.occurred_on}
                                        onChange={e => {
                                          const updated = [...parsedExpenses]
                                          updated[idx].occurred_on = e.target.value
                                          setParsedExpenses(updated)
                                        }}
                                        className="w-32 text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5"
                                      />
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right">
                                      {isIncome ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={absAmount}
                                          onChange={e => {
                                            const updated = [...parsedExpenses]
                                            updated[idx].amount = -Math.abs(parseFloat(e.target.value) || 0)
                                            setParsedExpenses(updated)
                                          }}
                                          className="w-20 text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-1 py-0.5 text-right text-green-600 dark:text-green-400 font-medium"
                                        />
                                      ) : (
                                        <span className="text-gray-300 dark:text-gray-600">—</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right">
                                      {!isIncome ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={absAmount}
                                          onChange={e => {
                                            const updated = [...parsedExpenses]
                                            updated[idx].amount = Math.abs(parseFloat(e.target.value) || 0)
                                            setParsedExpenses(updated)
                                          }}
                                          className="w-20 text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-1 py-0.5 text-right text-gray-900 dark:text-white font-medium"
                                        />
                                      ) : (
                                        <span className="text-gray-300">—</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <input
                                        type="text"
                                        value={exp.currency || 'USD'}
                                        onChange={e => {
                                          const updated = [...parsedExpenses]
                                          updated[idx].currency = e.target.value
                                          setParsedExpenses(updated)
                                        }}
                                        className="w-16 text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5 uppercase"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="text"
                                        value={exp.merchant || ''}
                                        onChange={e => {
                                          const updated = [...parsedExpenses]
                                          updated[idx].merchant = e.target.value
                                          setParsedExpenses(updated)
                                        }}
                                        className="w-full text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5"
                                      />
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <select
                                        value={exp.payment_method || ''}
                                        onChange={e => {
                                          const updated = [...parsedExpenses]
                                          updated[idx].payment_method = e.target.value || undefined
                                          setParsedExpenses(updated)
                                        }}
                                        className="w-full text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5"
                                      >
                                        <option value="">— detected —</option>
                                        {paymentMethods.map(method => (
                                          <option key={method} value={method}>{method}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <select
                                        value={exp.category || 'Other'}
                                        onChange={e => {
                                          const updated = [...parsedExpenses]
                                          updated[idx].category = e.target.value
                                          setParsedExpenses(updated)
                                        }}
                                        className="w-full text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5"
                                      >
                                        {definedCategoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                                        <option value="Other">Other</option>
                                      </select>
                                    </td>
                                    <td className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400">
                                      {exp.raw_category || exp.category || 'Other'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setParsedExpenses([])
                              setImportMediaType('none')
                            }}
                            className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm font-medium px-3 py-2"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveImported}
                            disabled={loading || selectedImportIndices.length === 0}
                            className="inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                          >
                            {loading ? 'Importing...' : `Import ${selectedImportIndices.length} selected`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Amount</label>
                        <div className="relative rounded-2xl shadow-sm overflow-hidden border-2 border-gray-100 dark:border-gray-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-all">
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={formData.amount}
                            onChange={e => setFormData({ ...formData, amount: e.target.value })}
                            className={`block w-full bg-gray-50 dark:bg-gray-900/50 dark:text-white pl-4 pr-24 py-4 text-3xl font-bold border-none focus:ring-0 placeholder:text-gray-300 dark:placeholder:text-gray-700`}
                            placeholder="0.00"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                            <div
                              className="h-10 flex items-center rounded-xl bg-white dark:bg-gray-800 py-0 pl-3 pr-4 text-sm font-semibold text-gray-700 dark:text-gray-200 opacity-60 cursor-not-allowed select-none"
                              style={{ minWidth: '60px', justifyContent: 'center' }}
                            >
                              {(() => {
                                switch(formData.currency) {
                                  case 'USD': return '🇺🇸 USD';
                                  case 'EUR': return '🇪🇺 EUR';
                                  case 'GBP': return '🇬🇧 GBP';
                                  case 'CAD': return '🇨🇦 CAD';
                                  case 'INR': return '🇮🇳 INR';
                                  case 'AED': return '🇦🇪 AED';
                                  case 'AUD': return '🇦🇺 AUD';
                                  case 'JPY': return '🇯🇵 JPY';
                                  case 'SAR': return '🇸🇦 SAR';
                                  case 'QAR': return '🇶🇦 QAR';
                                  case 'SGD': return '🇸🇬 SGD';
                                  default: return formData.currency;
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {formData.type === 'transfer' ? (
                        <>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Date</label>
                            <input
                              type="date"
                              required
                              value={formData.occurred_on}
                              onChange={e => setFormData({ ...formData, occurred_on: e.target.value })}
                              className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">From Account</label>
                              <select
                                value={formData.account_id}
                                onChange={e => handleAccountChange(e.target.value)}
                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 transition-all font-medium"
                                required
                              >
                                <option value="">Select Source Account</option>
                                {accounts.map(acc => (
                                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">To Account</label>
                              <select
                                value={formData.toAccountId}
                                onChange={e => setFormData({ ...formData, toAccountId: e.target.value })}
                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 transition-all font-medium"
                                required
                              >
                                <option value="">Select Destination Account</option>
                                {accounts.filter(acc => acc.id !== formData.account_id).map(acc => (
                                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Payment Method</label>
                            <select
                              value={formData.payment_method || ''}
                              onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                              className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 transition-all font-medium"
                            >
                              <option value="">Select Payment Method</option>
                              {paymentMethods.map(method => (
                                <option key={method} value={method}>{method}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Date</label>
                              <input
                                type="date"
                                required
                                value={formData.occurred_on}
                                onChange={e => setFormData({ ...formData, occurred_on: e.target.value })}
                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Account</label>
                              <select
                                value={formData.account_id}
                                onChange={e => handleAccountChange(e.target.value)}
                                className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                              >
                                <option value="" disabled>Select Account</option>
                                {accounts.map(acc => (
                                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                                ))}
                                {/* Fallback for no accounts */}
                                {accounts.length === 0 && <option value="">Cash (Default)</option>}
                              </select>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Category and Payment Method - Hide for transfers */}
                      {formData.type !== 'transfer' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                              {formData.type === 'income' ? 'Income Category' : 'Expense Category'}
                            </label>
                            <select
                              value={formData.category}
                              onChange={e => setFormData({ ...formData, category: e.target.value })}
                              className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                            >
                              <option value="">Select a category...</option>
                              {definedCategoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Payment Method</label>
                            <select
                              value={formData.payment_method || ''}
                              onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                              className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                            >
                              <option value="">Select Payment Method</option>
                              {paymentMethods.map(method => (
                                <option key={method} value={method}>{method}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Merchant/Source */}
                      {formData.type !== 'transfer' && (
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                            {formData.type === 'income' ? 'Source' : 'Merchant'}
                          </label>
                          <input
                            type="text"
                            value={formData.merchant}
                            onChange={e => setFormData({ ...formData, merchant: e.target.value })}
                            className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-0 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 font-medium"
                            placeholder={formData.type === 'income' ? 'e.g. Employer, Client' : 'e.g. Uber, Walmart'}
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Note (Optional)</label>
                        <input
                          type="text"
                          value={formData.note}
                          onChange={e => setFormData({ ...formData, note: e.target.value })}
                          className="block w-full rounded-xl border-2 border-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white px-4 py-2.5 text-sm focus:border-primary-500 focus:ring-0 transition-all font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Attachment</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 dark:file:bg-primary-900/30 file:text-primary-700 dark:file:text-primary-400 hover:file:bg-primary-100 dark:hover:file:bg-primary-900/50"
                        />
                        {formData.attachment && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Image attached</p>}
                      </div>

                      <div className="mt-8 flex flex-col-reverse sm:grid sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          className="w-full justify-center rounded-xl bg-gray-100 dark:bg-gray-700 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                          onClick={onClose}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className={`w-full justify-center rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/20 transition-all active:scale-[0.98] ${formData.type === 'income'
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/20'
                            : formData.type === 'transfer'
                              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-blue-500/20'
                              : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800'
                            }`}
                        >
                          {loading ? 'Saving...' : 'Save Transaction'}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog >
    </Transition.Root >
  )
}
