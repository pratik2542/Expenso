import React, { Fragment, useMemo, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X } from 'lucide-react'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useAuth } from '@/contexts/AuthContext'
import { analytics } from '@/lib/firebaseClient'
import { logEvent } from 'firebase/analytics'

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
  } | null
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/firebaseClient'
import { collection, query as fbQuery, getDocs, addDoc, updateDoc, doc, orderBy } from 'firebase/firestore'

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
  if (!dateStr) return new Date().toISOString().split('T')[0]
  
  // If already YYYY-MM-DD, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr

  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }
  return new Date().toISOString().split('T')[0]
}

export default function AddExpenseModal({ open, onClose, onAdded, mode = 'add', expense = null }: AddExpenseModalProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // Load categories for dropdown
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = collection(db, 'categories', user.uid, 'items')
      const q = fbQuery(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }))
    }
  })
  const definedCategoryNames = categories.map((c: any) => c.name)
  const { currency: prefCurrency } = usePreferences()
  const [formData, setFormData] = useState({
    amount: '',
    currency: prefCurrency || 'USD',
    merchant: '',
    payment_method: 'Credit Card',
    note: '',
    occurred_on: new Date().toISOString().split('T')[0],
    category: '',
    attachment: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string>('')
  const [parsedExpenses, setParsedExpenses] = useState<Array<{
    amount: number
    currency: string
    merchant?: string
    payment_method?: string
    note?: string
    occurred_on: string
    category?: string
    selected?: boolean
  }>>([])
  const [overrideCurrency, setOverrideCurrency] = useState<string>('')
  const [overridePaymentMethod, setOverridePaymentMethod] = useState<string>('')
  const [paymentMethodTouched, setPaymentMethodTouched] = useState<boolean>(false)
  const defaultPaymentMethodForCurrency = (cur?: string) => {
    if (!cur) return ''
    if (cur === 'CAD') return 'Credit Card'
    if (cur === 'INR') return 'Debit Card'
    return ''
  }
  // PDF Converter Modal state
  const [showPdfConverterModal, setShowPdfConverterModal] = useState<boolean>(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  
  // (removed duplicate useAuth declaration)
  
  // Track if we've already initialized the form to prevent constant resets
  const [initialized, setInitialized] = React.useState(false)
  
  // When opening in edit mode, seed form with existing expense
  React.useEffect(() => {
    if (open && !initialized) {
      if (mode === 'edit' && expense) {
        setFormData({
          amount: String(expense.amount ?? ''),
          currency: expense.currency || prefCurrency || 'USD',
          merchant: expense.merchant || '',
          payment_method: expense.payment_method || 'Credit Card',
          note: expense.note || '',
          occurred_on: (expense.occurred_on || new Date().toISOString()).split('T')[0],
          category: normalizeCategory(expense.category, definedCategoryNames) || '',
          attachment: expense.attachment || '',
        })
        setError(null)
      } else if (mode === 'add') {
        setFormData({
          amount: '',
          currency: prefCurrency || 'USD',
          merchant: '',
          payment_method: 'Credit Card',
          note: '',
          occurred_on: new Date().toISOString().split('T')[0],
          category: '',
          attachment: '',
        })
        setParsedExpenses([])
        setError(null)
      }
      setInitialized(true)
    }
    
    // Reset initialization flag when modal closes
    if (!open && initialized) {
      setInitialized(false)
      setParsedExpenses([])
      if (mode !== 'edit') {
        setFormData({
          amount: '',
          currency: prefCurrency || 'USD',
          merchant: '',
          payment_method: 'Credit Card',
          note: '',
          occurred_on: new Date().toISOString().split('T')[0],
          category: '',
          attachment: '',
        })
      }
    }
  }, [open, mode, expense, definedCategoryNames, prefCurrency, initialized])
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const expenseData = {
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        merchant: formData.merchant || 'Unknown',
        payment_method: formData.payment_method || 'Credit Card',
        note: formData.note || '',
        occurred_on: formData.occurred_on,
        category: formData.category || 'Other',
        attachment: formData.attachment || null,
      }
      
      if (mode === 'edit' && expense?.id) {
        const expenseDocRef = doc(db, 'expenses', user.uid, 'items', expense.id)
        await updateDoc(expenseDocRef, expenseData)
      } else {
        const expensesRef = collection(db, 'expenses', user.uid, 'items')
        await addDoc(expensesRef, {
          ...expenseData,
          created_at: new Date().toISOString()
        })
        
        // Track expense creation event
        if (analytics && typeof window !== 'undefined') {
          logEvent(analytics as any, 'expense_created', {
            category: expenseData.category,
            amount: expenseData.amount,
            currency: expenseData.currency,
            payment_method: expenseData.payment_method
          })
        }
      }
    } catch (error: any) {
      setLoading(false)
      setError(error.message)
      return
    }
    setLoading(false)
    onAdded()
    onClose()
    if (mode !== 'edit') {
      setFormData({
        amount: '',
  currency: prefCurrency || 'USD',
        merchant: '',
        payment_method: 'Credit Card',
        note: '',
        occurred_on: new Date().toISOString().split('T')[0],
        category: '',
        attachment: '',
      })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Please select an image under 5MB.')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64String = reader.result as string
      setFormData(prev => ({ ...prev, attachment: base64String }))
    }
    reader.readAsDataURL(file)
  }

  const selectedCount = useMemo(() => parsedExpenses.filter(p => p.selected !== false).length, [parsedExpenses])

  const updateParsedRow = (idx: number, patch: Partial<{ amount: number; currency: string; merchant?: string; payment_method?: string; note?: string; occurred_on: string; category?: string; selected?: boolean }>) => {
    setParsedExpenses(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row))
  }

  // Add a new category for the current user, avoiding duplicates (case-insensitive)
  const addCategory = async (nameRaw: string): Promise<{ id: string | undefined, name: string } | null> => {
    const name = (nameRaw || '').trim()
    if (!name) { alert('Category name cannot be empty.'); return null }
    if (!user?.uid) { alert('You must be signed in to add categories.'); return null }

    const existing = (categories as any[]).find(c => String(c.name).toLowerCase() === name.toLowerCase())
    if (existing) {
      // Already exists, just use it
      return { id: (existing as any).id, name: existing.name }
    }

    try {
      const categoriesRef = collection(db, 'categories', user.uid, 'items')
      const docRef = await addDoc(categoriesRef, {
        name,
        created_at: new Date().toISOString()
      })
      
      const newCategory = { id: docRef.id, name }
      
      // Optimistically update cache so dropdowns reflect new category immediately
      queryClient.setQueryData(['categories', user.uid], (prev: any) => {
        const arr = Array.isArray(prev) ? prev.slice() : []
        if (!arr.some((c: any) => String(c.name).toLowerCase() === name.toLowerCase())) {
          arr.push(newCategory)
        }
        return arr
      })
      return newCategory
    } catch (error: any) {
      // If unique constraint or similar, try to recover by finding it again
      const fallback = (categories as any[]).find(c => String(c.name).toLowerCase() === name.toLowerCase())
      if (fallback) return { id: (fallback as any).id, name: fallback.name }
      alert(error.message || 'Failed to add category')
      return null
    }
  }

  const [converterUrl, setConverterUrl] = useState<string>('')
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null)

  const handleSelectPDF = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Just open the converter modal immediately
    setShowPdfConverterModal(true)
    setImportError(null)
    setParsedExpenses([])
    setImportStatus('')
  }

  const closeConverterModal = () => {
    setShowPdfConverterModal(false)
    // Cleanup any pending message listeners
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current)
      messageHandlerRef.current = null
    }
  }

  const analyzeSelectedPDF = () => {
    // Open the PDF converter in a modal
    setShowPdfConverterModal(true)
    setImportStatus('')
    setImportLoading(false)
    setImportError(null)
    // Build converter URL with embed hints and target origin
    if (typeof window !== 'undefined') {
      const origin = window.location.origin
      const url = `https://expenso-pdfexcel.vercel.app/?embed=1&targetOrigin=${encodeURIComponent(origin)}`
      setConverterUrl(url)
    } else {
      setConverterUrl('https://expenso-pdfexcel.vercel.app/?embed=1')
    }
    
    // Listen for message from iframe
    const handleMessage = (event: MessageEvent) => {
      // Verify the message is from our trusted domain
      if (event.origin !== 'https://expenso-pdfexcel.vercel.app') return
      
      if (event.data.type === 'TRANSACTIONS_EXTRACTED') {
        const transactions = event.data.transactions || []
        
        if (!Array.isArray(transactions) || transactions.length === 0) {
          setImportError('No transactions found or processing cancelled.')
          return
        }
        
        // Determine a sensible default payment method based on currency
        const currencyCounts = transactions.reduce<Record<string, number>>((acc, r) => {
          const c = (r.currency || '').toUpperCase()
          if (!c) return acc
          acc[c] = (acc[c] || 0) + 1
          return acc
        }, {})
        const dominantCurrency = Object.entries(currencyCounts).sort((a,b) => b[1]-a[1])[0]?.[0]
        const defaultPM = defaultPaymentMethodForCurrency(dominantCurrency)
        
        // Map transactions
        const mapped = transactions.map((t: any) => ({
          amount: Math.abs(t.debit || t.credit || 0),
          currency: t.currency || 'USD',
          merchant: t.description || '',
          payment_method: defaultPM || 'Credit Card',
          note: '',
          occurred_on: formatDateToISO(t.date),
          category: normalizeCategory(t.category || t.description, definedCategoryNames) || 'Other',
        }))
        
        setParsedExpenses(mapped)
        setImportStatus(`Extracted ${mapped.length} transactions. Review and import them.`)
        setImportError(null)
        // Close modal and cleanup listener
        closeConverterModal()
      }
    }
    
    window.addEventListener('message', handleMessage)
    messageHandlerRef.current = handleMessage
    
    // Timeout after 10 minutes
    const timeoutId = setTimeout(() => {
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current)
        messageHandlerRef.current = null
      }
      setImportError('PDF processing took too long. Please try again.')
      closeConverterModal()
    }, 10 * 60 * 1000)
    // Attach to ref so we can clear if needed
    if (iframeRef.current) (iframeRef.current as any).__timeoutId = timeoutId
  }

  // Optional fallback: open converter in a popup if iframe cannot communicate
  const openPopupConverter = () => {
    // Build URL with same params
    let url = converterUrl
    if (!url) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      url = `https://expenso-pdfexcel.vercel.app/?embed=1&targetOrigin=${encodeURIComponent(origin)}`
    }
    const popup = window.open(url, 'PDFConverter', 'width=1100,height=800,resizable=yes,scrollbars=yes')
    if (!popup) {
      setImportError('Popup blocked. Please allow popups and try again.')
      return
    }
    // Reuse the same message handler
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://expenso-pdfexcel.vercel.app') return
      if (event.data.type === 'TRANSACTIONS_EXTRACTED') {
        const transactions = event.data.transactions || []
        if (!Array.isArray(transactions) || transactions.length === 0) {
          setImportError('No transactions found or processing cancelled.')
          return
        }
        const currencyCounts = transactions.reduce<Record<string, number>>((acc, r) => {
          const c = (r.currency || '').toUpperCase()
          if (!c) return acc
          acc[c] = (acc[c] || 0) + 1
          return acc
        }, {})
        const dominantCurrency = Object.entries(currencyCounts).sort((a,b) => b[1]-a[1])[0]?.[0]
        const defaultPM = defaultPaymentMethodForCurrency(dominantCurrency)
        const mapped = transactions.map((t: any) => ({
          amount: Math.abs(t.debit || t.credit || 0),
          currency: t.currency || 'USD',
          merchant: t.description || '',
          payment_method: defaultPM || 'Credit Card',
          note: '',
          occurred_on: formatDateToISO(t.date),
          category: normalizeCategory(t.category || t.description, definedCategoryNames) || 'Other',
        }))
        setParsedExpenses(mapped)
        setImportStatus(`Extracted ${mapped.length} transactions. Review and import them.`)
        setImportError(null)
        // Close any modal and popup
        setShowPdfConverterModal(false)
        try { popup.close() } catch {}
        window.removeEventListener('message', handleMessage)
        messageHandlerRef.current = null
      }
    }
    window.addEventListener('message', handleMessage)
    messageHandlerRef.current = handleMessage
  }

  const toggleSelect = (idx: number) => {
    setParsedExpenses(prev => prev.map((row, i) => i === idx ? { ...row, selected: row.selected === false ? true : false } : row))
  }

  const handleUploadSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Reset state
    setImportError(null)
    setParsedExpenses([])
    setImportStatus('Uploading Excel/CSV...')
    setImportLoading(true)
    
    try {
      const form = new FormData()
      form.append('file', file)
      
      setImportStatus('Reading spreadsheet...')
      
      const resp = await fetch('/api/import/parse-spreadsheet', {
        method: 'POST',
        body: form,
      })
      
      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '')
        throw new Error(`Upload failed (${resp.status}): ${errorText || resp.statusText}`)
      }
      
      setImportStatus('Parsing transactions...')
      
      const json = await resp.json()
      if (!json.success) throw new Error(json.error || 'Parse failed')
      
      const rows = (json.expenses as any[])
      if (!Array.isArray(rows) || rows.length === 0) {
        setParsedExpenses([])
        setImportError('No transactions found in the uploaded spreadsheet. Try another sheet or adjust column headers.')
      } else {
        // Determine default payment method from dominant currency (CAD→Credit, INR→Debit)
        const currencyCounts = rows.reduce<Record<string, number>>((acc, r) => {
          const c = (r.currency || '').toUpperCase()
          if (!c) return acc
          acc[c] = (acc[c] || 0) + 1
          return acc
        }, {})
        const dominantCurrency = Object.entries(currencyCounts).sort((a,b) => b[1]-a[1])[0]?.[0]
        const defaultPM = defaultPaymentMethodForCurrency(dominantCurrency)

        if (defaultPM) {
          setOverridePaymentMethod(defaultPM)
          setPaymentMethodTouched(false)
        } else {
          setOverridePaymentMethod('')
          setPaymentMethodTouched(false)
        }

        setParsedExpenses(rows.map((e) => ({ ...e, selected: true, payment_method: defaultPM || e.payment_method })))
        setImportStatus(`Successfully extracted ${rows.length} transactions!`)
        // Clear success message after 2 seconds
        setTimeout(() => setImportStatus(''), 2000)
      }
    } catch (err: any) {
      setImportError(err?.message || 'Failed to import')
      console.error('Spreadsheet upload error:', err)
    } finally {
      setImportLoading(false)
      // Reset file input to allow re-selecting the same file
      e.target.value = ''
    }
  }

  const importSelected = async () => {
    if (!user) return
    const rows = parsedExpenses.filter(r => r.selected !== false)
    if (rows.length === 0) return
    setImportLoading(true)
    setImportError(null)
    try {
      const cleanNote = (raw?: string, category?: string, merchant?: string) => {
        const str = String(raw || '')
        // Remove phrases like 'Transaction date ...; Posting date ...' and any embedded dates
        const removedPairs = str.replace(/\bTransaction date\b[^;\n]*;\s*\bPosting date\b[^\n]*/gi, '').trim()
        // Remove standalone date-like patterns (e.g., Aug 27, 2025 or 2025-08-27)
        const noDates = removedPairs
          .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}\b/gi, '')
          .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
          .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
        if (noDates.length > 0) return noDates
        if (category && category.trim().length > 0) return category
        if (merchant && merchant.trim().length > 0) return merchant
        return ''
      }

      const expensesRef = collection(db, 'expenses', user.uid, 'items')
      const payload = rows.map(r => ({
        amount: Number(r.amount),
        currency: r.currency || prefCurrency || 'CAD',
        merchant: r.merchant || 'Unknown',
        payment_method: r.payment_method || 'Credit Card',
        note: cleanNote(r.note, r.category, r.merchant),
        occurred_on: (r.occurred_on || new Date().toISOString().slice(0,10)).slice(0,10),
        category: r.category || 'Other',
        created_at: new Date().toISOString()
      }))
      // Insert all expenses
      await Promise.all(payload.map(expense => addDoc(expensesRef, expense)))
      setParsedExpenses([])
      onAdded()
      onClose()
    } catch (e: any) {
      setImportError(e?.message || 'Failed to import')
    } finally {
      setImportLoading(false)
    }
  }

  return (
    <>
      {/* Beautiful full-screen loading overlay */}
      {importLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-blue-50 via-green-50 to-emerald-50">
          <div className="text-center">
            {/* Animated money/bank icon */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                {/* Outer ring */}
                <div className="absolute inset-0 animate-ping opacity-20">
                  <svg className="w-32 h-32 text-green-500" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                {/* Middle ring */}
                <div className="absolute inset-0 animate-pulse">
                  <svg className="w-32 h-32 text-emerald-500" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4"/>
                  </svg>
                </div>
                {/* Bank/Receipt icon */}
                <div className="relative animate-bounce">
                  <svg className="w-32 h-32 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" opacity="0.3"/>
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z"/>
                    <path d="M6 9h12v2H6V9zm0 4h8v2H6v-2z"/>
                  </svg>
                </div>
              </div>
            </div>
            
            {/* Status text */}
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold text-gray-800">
                {importStatus}
              </h3>
              <p className="text-sm text-gray-600">
                Extracting your transactions
              </p>
              {/* Animated dots */}
              <div className="flex justify-center gap-2 mt-4">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <Transition.Root show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-7xl sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>
                
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:ml-0 sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 mb-4">
                      {mode === 'edit' ? 'Edit Expense' : 'Add New Expense'}
                    </Dialog.Title>
                    
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {error && <div className="text-sm text-error-600 bg-error-50 border border-error-100 rounded p-2">{error}</div>}
                      {/* Import from PDF / Excel */}
                      {mode === 'add' && (
                        <div className="rounded border border-gray-200 p-3">
                          <div className="flex flex-col gap-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">Import from Statement (PDF or Excel/CSV)</div>
                              <div className="text-xs text-gray-500">Upload a bank/credit card statement. PDF uses AI extraction; Excel/CSV parses directly.</div>
                            </div>
                            
                            {/* Status Message */}
                            {importStatus && (
                              <div className="bg-blue-50 border border-blue-200 rounded-md p-2 flex items-center gap-2">
                                <div className="flex-shrink-0">
                                  {importLoading ? (
                                    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  ) : (
                                    <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                                <div className="text-xs font-medium text-gray-700">{importStatus}</div>
                              </div>
                            )}
                            
                            <div className="flex flex-col gap-2 items-stretch">
                              {/* AI is always used with masking by default; toggle removed for simplicity */}

                              <input 
                                id="uploadPdfInput" 
                                type="file" 
                                accept="application/pdf" 
                                className="hidden" 
                                onChange={handleSelectPDF} 
                                disabled={importLoading}
                                aria-label="Upload PDF statement"
                              />
                              <button 
                                type="button"
                                className={`btn-secondary cursor-pointer text-center ${importLoading ? 'opacity-60 pointer-events-none' : ''}`}
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  analyzeSelectedPDF()
                                }}
                                disabled={importLoading}
                              >
                                {importLoading ? 'Processing...' : 'Upload PDF'}
                              </button>
                              
                              <input 
                                id="uploadSheetInput" 
                                type="file" 
                                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" 
                                className="hidden" 
                                onChange={handleUploadSpreadsheet} 
                                disabled={importLoading}
                                aria-label="Upload Excel or CSV statement"
                              />
                              <label 
                                htmlFor="uploadSheetInput" 
                                className={`btn-secondary cursor-pointer text-center ${importLoading ? 'opacity-60 pointer-events-none' : ''}`}
                              >
                                {importLoading ? 'Uploading...' : 'Upload Excel/CSV'}
                              </label>
                            </div>
                          </div>
                          {importError && <div className="mt-2 text-xs text-error-600 bg-error-50 border border-error-100 rounded p-2">{importError}</div>}
                          {parsedExpenses.length > 0 && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                <div className="text-sm text-gray-700">Parsed expenses: {parsedExpenses.length} • Selected: {selectedCount}</div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-600">Currency:</label>
                                  <select
                                    value={overrideCurrency || ''}
                                    onChange={(e) => {
                                      const cur = e.target.value
                                      setOverrideCurrency(cur)
                                      if (cur) {
                                        setParsedExpenses(prev => prev.map(p => ({ ...p, currency: cur })))
                                        // If user hasn't manually set payment method, default it based on selected currency
                                        if (!paymentMethodTouched) {
                                          const pm = defaultPaymentMethodForCurrency(cur)
                                          setOverridePaymentMethod(pm)
                                          if (pm) setParsedExpenses(prev => prev.map(p => ({ ...p, payment_method: pm })))
                                        }
                                      }
                                    }}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                                  >
                                    <option value="">— keep detected —</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="GBP">GBP</option>
                                    <option value="CAD">CAD</option>
                                    <option value="AUD">AUD</option>
                                    <option value="INR">INR</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-600">Payment method:</label>
                                  <select
                                    value={overridePaymentMethod || ''}
                                    onChange={(e) => {
                                      const pm = e.target.value
                                      setOverridePaymentMethod(pm)
                                      setPaymentMethodTouched(true)
                                      if (pm) setParsedExpenses(prev => prev.map(p => ({ ...p, payment_method: pm })))
                                    }}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                                  >
                                    <option value="">— keep detected —</option>
                                    <option value="Credit Card">Credit Card</option>
                                    <option value="Debit Card">Debit Card</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Digital Wallet">Digital Wallet</option>
                                    <option value="Interact">Interact</option>
                                    <option value="Cash">Cash</option>
                                  </select>
                                </div>
                                <div className="space-x-2">
                                  <button type="button" className="btn-secondary" onClick={() => setParsedExpenses(prev => prev.map(p => ({ ...p, selected: true })))}>Select all</button>
                                  <button type="button" className="btn-secondary" onClick={() => setParsedExpenses(prev => prev.map(p => ({ ...p, selected: false })))}>Clear</button>
                                </div>
                              </div>
                              <div className="max-h-60 overflow-auto border rounded">
                                <div className="overflow-x-auto">
                                  <table className="min-w-full w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left sticky left-0 bg-gray-50 w-12">Pick</th>
                    <th className="px-2 py-2 text-left w-24">Date</th>
                    <th className="px-2 py-2 text-right w-20">Amount</th>
                    <th className="px-2 py-2 text-left w-16">Currency</th>
                    <th className="px-2 py-2 text-left min-w-32">Merchant</th>
                    <th className="px-2 py-2 text-left w-24">Payment</th>
                    <th className="px-2 py-2 text-left w-24">Category</th>
                    <th className="px-2 py-2 text-left text-xs text-gray-500 min-w-24">Raw Category</th>
                  </tr>
                  </thead>
                                    <tbody>
                                      {parsedExpenses.map((p, idx) => (
                                        <tr key={idx} className="border-t">
                                          <td className="px-2 py-2 sticky left-0 bg-white"><input type="checkbox" checked={p.selected !== false} onChange={() => toggleSelect(idx)} /></td>
                                          <td className="px-2 py-2 whitespace-nowrap">
                                            <input
                                              type="date"
                                              value={p.occurred_on}
                                              onChange={(ev) => updateParsedRow(idx, { occurred_on: ev.target.value })}
                                              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white w-full"
                                            />
                                          </td>
                                          <td className="px-2 py-2 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1">
                                              <span>{p.amount}</span>
                                              <button
                                                type="button"
                                                onClick={() => updateParsedRow(idx, { amount: -p.amount })}
                                                className="text-xs text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded border border-gray-200 hover:border-gray-300 flex-shrink-0"
                                                title="Toggle amount sign (+/-)"
                                              >
                                                ±
                                              </button>
                                            </div>
                                          </td>
                                          <td className="px-2 py-2 whitespace-nowrap">{p.currency}</td>
                                          <td className="px-2 py-2">
                                            <input
                                              type="text"
                                              value={p.merchant || ''}
                                              onChange={(ev) => updateParsedRow(idx, { merchant: ev.target.value })}
                                              placeholder="Enter merchant"
                                              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white w-full"
                                            />
                                          </td>
                                          <td className="px-2 py-2">
                                            <select
                                              value={p.payment_method || ''}
                                              onChange={(ev) => updateParsedRow(idx, { payment_method: ev.target.value || undefined })}
                                              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                                            >
                                              <option value="">—</option>
                                              <option value="Credit Card">Credit Card</option>
                                              <option value="Debit Card">Debit Card</option>
                                              <option value="Bank Transfer">Bank Transfer</option>
                                              <option value="Digital Wallet">Digital Wallet</option>
                                              <option value="Interact">Interact</option>
                                              <option value="Cash">Cash</option>
                                            </select>
                                          </td>
                                          <td className="px-2 py-2">
                                            <select
                                              value={p.category || ''}
                                              onChange={async (ev) => {
                                                const val = ev.target.value
                                                if (val === '__add__') {
                                                  const newName = window.prompt('Enter new category name:')
                                                  if (newName && newName.trim()) {
                                                    const created = await addCategory(newName)
                                                    if (created) updateParsedRow(idx, { category: created.name })
                                                  }
                                                  // Do not set to '__add__'
                                                  return
                                                }
                                                updateParsedRow(idx, { category: val || undefined })
                                              }}
                                              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                                            >
                                              <option value="">—</option>
                                              {definedCategoryNames.map((name: string) => (
                                                <option key={name} value={name}>{name}</option>
                                              ))}
                                              {!definedCategoryNames.includes('Other') && (
                                                <option value="Other">Other</option>
                                              )}
                                              <option value="__add__">+ Add new…</option>
                                            </select>
                                          </td>
                                          <td className="px-2 py-2 text-xs text-gray-500">{p.category ? p.category : <span className="italic text-gray-400">—</span>}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                              <div className="mt-2 flex justify-end">
                                <button type="button" className="btn-primary disabled:opacity-60" onClick={importSelected} disabled={importLoading || selectedCount === 0}>
                                  {importLoading ? 'Importing…' : `Import ${selectedCount} selected`}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div>
                        <label htmlFor="note" className="label">
                          Note
                        </label>
                        <input
                          type="text"
                          name="note"
                          id="note"
                          value={formData.note}
                          onChange={handleInputChange}
                          className="input"
                          placeholder="Enter expense note (optional)"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="amount" className="label">
                            Amount
                          </label>
                          <input
                            type="number"
                            name="amount"
                            id="amount"
                            required
                            step="any"
                            value={formData.amount}
                            onChange={handleInputChange}
                            className="input"
                            placeholder="0.00 (use negative for refund)"
                          />
                        </div>

                        <div>
                          <label htmlFor="occurred_on" className="label">
                            Date
                          </label>
                          <input
                            type="date"
                            name="occurred_on"
                            id="occurred_on"
                            required
                            value={formData.occurred_on}
                            onChange={handleInputChange}
                            className="input"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="currency" className="label">
                            Currency
                          </label>
                          <select
                            name="currency"
                            id="currency"
                            required
                            value={formData.currency}
                            onChange={handleInputChange}
                            className="input"
                          >
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="CAD">CAD (C$)</option>
                            <option value="AUD">AUD (A$)</option>
                            <option value="INR">INR (₹)</option>
                            <option value="JPY">JPY (¥)</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="payment_method" className="label">
                            Payment Method
                          </label>
                          <select
                            name="payment_method"
                            id="payment_method"
                            required
                            value={formData.payment_method}
                            onChange={handleInputChange}
                            className="input"
                          >
                            <option value="Credit Card">Credit Card</option>
                            <option value="Debit Card">Debit Card</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Digital Wallet">Digital Wallet</option>
                            <option value="Interact">Interact</option>
                            <option value="Cash">Cash</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="category" className="label">
                          Category
                        </label>
                        <select
                          name="category"
                          id="category"
                          required
                          value={formData.category}
                          onChange={async (e) => {
                            const val = e.target.value
                            if (val === '__add__') {
                              const newName = window.prompt('Enter new category name:')
                              if (newName && newName.trim()) {
                                const created = await addCategory(newName)
                                if (created) {
                                  setFormData(prev => ({ ...prev, category: created.name }))
                                  return
                                }
                              }
                              // If cancelled or failed, don't change the select
                              return
                            }
                            handleInputChange(e)
                          }}
                          className="input"
                        >
                          <option value="">Select a category</option>
                          {definedCategoryNames.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__add__">+ Add new…</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="merchant" className="label">
                          Merchant
                        </label>
                        <input
                          type="text"
                          name="merchant"
                          id="merchant"
                          required
                          value={formData.merchant}
                          onChange={handleInputChange}
                          className="input"
                          placeholder="Where did you spend?"
                        />
                      </div>

                      <div>
                        <label htmlFor="attachment" className="label">
                          Bill Attachment (Optional)
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="file"
                            id="attachment"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                          <label
                            htmlFor="attachment"
                            className="flex-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Choose File
                          </label>
                          <label
                            htmlFor="attachment-camera"
                            className="flex-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500 sm:flex-none"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Camera
                          </label>
                          <input
                            type="file"
                            id="attachment-camera"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">Max 5MB • JPG, PNG, etc.</p>
                        {formData.attachment && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <p className="text-xs font-medium text-gray-700 mb-2">Attached Image:</p>
                                <img 
                                  src={formData.attachment} 
                                  alt="Bill preview" 
                                  className="h-24 w-auto object-contain border rounded bg-white" 
                                />
                              </div>
                              <button 
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, attachment: '' }))
                                  // Reset file inputs
                                  const fileInput = document.getElementById('attachment') as HTMLInputElement
                                  const cameraInput = document.getElementById('attachment-camera') as HTMLInputElement
                                  if (fileInput) fileInput.value = ''
                                  if (cameraInput) cameraInput.value = ''
                                }}
                                className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                                title="Remove attachment"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:space-x-3 sm:flex-row-reverse">
                        <button
                          type="submit"
                          className="btn-primary w-full sm:w-auto sm:flex-initial disabled:opacity-60"
                          disabled={loading}
                        >
                          {loading ? (mode === 'edit' ? 'Updating…' : 'Saving...') : (mode === 'edit' ? 'Update Expense' : 'Add Expense')}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary w-full sm:w-auto sm:flex-initial"
                          onClick={onClose}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>

    {/* PDF Converter Modal */}
    <Transition.Root show={showPdfConverterModal} as={Fragment}>
  <Dialog as="div" className="relative z-50" onClose={closeConverterModal}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 flex items-center justify-center p-2 sm:p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all w-full h-full sm:w-11/12 sm:h-[85vh] lg:w-5/6 lg:h-[90vh] flex flex-col">
              <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block z-10">
                <button
                  type="button"
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  onClick={closeConverterModal}
                >
                  <span className="sr-only">Close</span>
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
                <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                  PDF Converter - Upload and Convert PDF to Transactions
                </Dialog.Title>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openPopupConverter}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    title="Open in popup if iframe is blocked"
                  >
                    Open in popup
                  </button>
                </div>
              </div>
              
              {/* Iframe container - takes up remaining space */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  ref={iframeRef}
                  src={converterUrl || 'https://expenso-pdfexcel.vercel.app/?embed=1'}
                  className="w-full h-full border-0"
                  title="PDF Converter"
                  allow="clipboard-write"
                  onLoad={() => {
                    // Send handshake to child so it knows we're an iframe parent
                    try {
                      const origin = window.location.origin
                      iframeRef.current?.contentWindow?.postMessage({ type: 'EXPENSO_PARENT_HANDSHAKE', origin }, 'https://expenso-pdfexcel.vercel.app')
                    } catch {}
                  }}
                />
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
    </>
  )
}
