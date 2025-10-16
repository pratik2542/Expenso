import React, { Fragment, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X } from 'lucide-react'
// import { supabase } from '@/lib/supabaseClient' (already imported above)
import { usePreferences } from '@/contexts/PreferencesContext'
import { useAuth } from '@/contexts/AuthContext'

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
  } | null
}

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

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

export default function AddExpenseModal({ open, onClose, onAdded, mode = 'add', expense = null }: AddExpenseModalProps) {
  const { user } = useAuth()
  // Load categories for dropdown
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user!.id)
        .order('name')
      if (error) throw error
      return data || []
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
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string>('')
  const [useCloudAI, setUseCloudAI] = useState(true)
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
        })
      }
    }
  }, [open, mode, expense, definedCategoryNames, prefCurrency, initialized])
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setError(null)
    let error
    if (mode === 'edit' && expense?.id) {
      ;({ error } = await supabase.from('expenses')
        .update({
          amount: parseFloat(formData.amount),
          currency: formData.currency,
          merchant: formData.merchant || 'Unknown',
          payment_method: formData.payment_method || 'Credit Card',
          note: formData.note || '',
          occurred_on: formData.occurred_on,
          category: formData.category || 'Other',
        })
        .eq('id', expense.id)
        .eq('user_id', user.id)
      )
    } else {
      ;({ error } = await supabase.from('expenses').insert({
        user_id: user.id,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        merchant: formData.merchant || 'Unknown',
        payment_method: formData.payment_method || 'Credit Card',
        note: formData.note || '',
        occurred_on: formData.occurred_on,
        category: formData.category || 'Other',
      }))
    }
    setLoading(false)
    if (error) { setError(error.message); return }
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

  const selectedCount = useMemo(() => parsedExpenses.filter(p => p.selected !== false).length, [parsedExpenses])

  const handleUploadPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Reset state
    setImportError(null)
    setParsedExpenses([])
    setImportStatus('Uploading PDF...')
    setImportLoading(true)
    
    try {
      const form = new FormData()
      form.append('file', file)
      
      setImportStatus(useCloudAI ? 'Analyzing with Cloud AI (masked)…' : 'Analyzing locally…')
      const params = new URLSearchParams()
      if (useCloudAI) {
        params.set('external', '1')
        params.set('mask', '1')
      }
      const url = `/api/ai/parse-statement${params.toString() ? `?${params.toString()}` : ''}`
      const resp = await fetch(url, {
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
        setImportError('No transactions found in the uploaded PDF. Please check the file format and content.')
      } else {
        setParsedExpenses(rows.map((e) => ({ ...e, selected: true })))
        setImportStatus(`Successfully extracted ${rows.length} transactions!`)
        // Clear success message after 2 seconds
        setTimeout(() => setImportStatus(''), 2000)
      }
    } catch (err: any) {
      setImportError(err?.message || 'Failed to import')
      console.error('PDF upload error:', err)
    } finally {
      setImportLoading(false)
      // Reset file input to allow re-selecting the same file
      e.target.value = ''
    }
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
        setParsedExpenses(rows.map((e) => ({ ...e, selected: true })))
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

      const payload = rows.map(r => ({
        user_id: user.id,
        amount: Number(r.amount),
        currency: r.currency || prefCurrency || 'CAD',
        merchant: r.merchant || 'Unknown',
        payment_method: r.payment_method || 'Credit Card',
        note: cleanNote(r.note, r.category, r.merchant),
        occurred_on: (r.occurred_on || new Date().toISOString().slice(0,10)).slice(0,10),
        category: r.category || 'Other',
      }))
      const { error } = await supabase.from('expenses').insert(payload)
      if (error) throw error
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
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
                              {/* Cloud AI toggle */}
                              <label className="flex items-center gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={useCloudAI}
                                  onChange={(ev) => setUseCloudAI(ev.target.checked)}
                                  disabled={importLoading}
                                />
                                <span>Use Perplexity for extraction (PII masked by default)</span>
                              </label>
                              <p className="text-[11px] text-gray-500 ml-6 -mt-1">Server masks emails, long numbers, phone numbers, and name fields before sending.</p>

                              <input 
                                id="uploadPdfInput" 
                                type="file" 
                                accept="application/pdf" 
                                className="hidden" 
                                onChange={handleUploadPDF} 
                                disabled={importLoading}
                                aria-label="Upload PDF statement"
                              />
                              <label 
                                htmlFor="uploadPdfInput" 
                                className={`btn-secondary cursor-pointer text-center ${importLoading ? 'opacity-60 pointer-events-none' : ''}`}
                              >
                                {importLoading ? 'Uploading...' : 'Upload PDF'}
                              </label>
                              
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
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm text-gray-700">Parsed expenses: {parsedExpenses.length} • Selected: {selectedCount}</div>
                                <div className="space-x-2">
                                  <button type="button" className="btn-secondary" onClick={() => setParsedExpenses(prev => prev.map(p => ({ ...p, selected: true })))}>Select all</button>
                                  <button type="button" className="btn-secondary" onClick={() => setParsedExpenses(prev => prev.map(p => ({ ...p, selected: false })))}>Clear</button>
                                </div>
                              </div>
                              <div className="max-h-60 overflow-auto border rounded">
                                <div className="overflow-x-auto">
                                  <table className="min-w-[720px] w-full text-xs">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-2 text-left sticky left-0 bg-gray-50">Pick</th>
                                        <th className="px-2 py-2 text-left">Date</th>
                                        <th className="px-2 py-2 text-right">Amount</th>
                                        <th className="px-2 py-2 text-left">Currency</th>
                                        <th className="px-2 py-2 text-left">Merchant</th>
                                        <th className="px-2 py-2 text-left">Category</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                      {parsedExpenses.map((p, idx) => (
                                        <tr key={idx} className="border-t">
                                          <td className="px-2 py-2 sticky left-0 bg-white"><input type="checkbox" checked={p.selected !== false} onChange={() => toggleSelect(idx)} /></td>
                                          <td className="px-2 py-2 whitespace-nowrap">{p.occurred_on}</td>
                                          <td className="px-2 py-2 text-right whitespace-nowrap">{p.amount}</td>
                                          <td className="px-2 py-2 whitespace-nowrap">{p.currency}</td>
                                          <td className="px-2 py-2">{p.merchant || '—'}</td>
                                          <td className="px-2 py-2">{p.category || '—'}</td>
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
                          onChange={handleInputChange}
                          className="input"
                        >
                          <option value="">Select a category</option>
                          {definedCategoryNames.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
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
    </>
  )
}
