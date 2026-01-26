import type { NextApiRequest, NextApiResponse } from 'next'
import formidable, { File as FormidableFile } from 'formidable'
import fs from 'fs'
import * as XLSX from 'xlsx'
import crypto from 'crypto'

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}

type ParsedExpense = {
  amount: number
  currency: string
  merchant?: string
  payment_method?: string
  note?: string
  occurred_on: string
  category?: string
}

type ApiResponse =
  | { success: true; expenses: ParsedExpense[] }
  | { success: false; error: string }

async function readFile(file: FormidableFile): Promise<Buffer> {
  const filepath = Array.isArray(file.filepath) ? file.filepath[0] : file.filepath
  return fs.promises.readFile(filepath)
}

function detectCurrencyFromSymbolOrCode(val: unknown): string | undefined {
  if (typeof val === 'string') {
    const s = val
    if (/\bUSD\b|\$/i.test(s)) return 'USD'
    if (/\bCAD\b|C\$/i.test(s)) return 'CAD'
    if (/\bEUR\b|€/i.test(s)) return 'EUR'
    if (/\bGBP\b|£/i.test(s)) return 'GBP'
    if (/\bINR\b|₹/i.test(s)) return 'INR'
    if (/\bJPY\b|¥/i.test(s)) return 'JPY'
    if (/\bAUD\b|A\$/i.test(s)) return 'AUD'
  }
  return undefined
}

function toNumber(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  if (typeof val !== 'string') return null
  const raw = val.trim()
  if (!raw) return null
  const isParenNeg = /^\(.*\)$/.test(raw)
  const normalized = raw.replace(/[\u2212\u2012\u2013\u2014]/g, '-')
  const cleaned = normalized.replace(/[^0-9.\-]/g, '')
  let num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  if (isParenNeg && num > 0) num = -num
  return num
}

function parseExcelDate(val: unknown): string | null {
  // console.log(`[DEBUG] parseExcelDate input: ${val} (${typeof val})`)
  if (val == null) return null
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString().slice(0, 10)
    return null
  }
  if (typeof val === 'number') {
    // Excel serial date: days since 1899-12-30
    const epoch = new Date(1899, 11, 30)
    const ms = epoch.getTime() + Math.round(val * 24 * 60 * 60 * 1000)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return null

    // ISO format YYYY-MM-DD
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

    // Slash or dash separated: part1/part2/part3
    const partsMatch = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
    if (partsMatch) {
      let [_, p1, p2, p3] = partsMatch
      let y = Number(p3)
      if (p3.length === 2) y += 2000 // Assume 20xx

      const n1 = Number(p1)
      const n2 = Number(p2)

      // Heuristic:
      // If n1 > 12, it must be DD/MM/YYYY (since MM cannot be > 12)
      if (n1 > 12) {
        const d = new Date(y, n2 - 1, n1)
        if (!isNaN(d.getTime())) {
          console.log(`[DEBUG] Parsed ${s} as DD/MM/YYYY -> ${d.toISOString().slice(0, 10)}`)
          return d.toISOString().slice(0, 10)
        }
      }

      // If n2 > 12, it must be MM/DD/YYYY (since MM cannot be > 12)
      if (n2 > 12) {
        const d = new Date(y, n1 - 1, n2)
        if (!isNaN(d.getTime())) {
          console.log(`[DEBUG] Parsed ${s} as MM/DD/YYYY -> ${d.toISOString().slice(0, 10)}`)
          return d.toISOString().slice(0, 10)
        }
      }

      // Ambiguous case (both <= 12). Prefer MM/DD/YYYY for US/Canada context
      const d = new Date(y, n1 - 1, n2)
      if (!isNaN(d.getTime())) {
        console.log(`[DEBUG] Parsed ${s} as MM/DD/YYYY (ambiguous) -> ${d.toISOString().slice(0, 10)}`)
        return d.toISOString().slice(0, 10)
      }
    }

    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return null
}

const headerAliases = {
  date: [
    'date', 'transaction date', 'txn date', 'trans date', 'posted date', 'post date', 'posting date', 'date posted', 'value date', 'occurred_on', 'occurred on'
  ] as string[],
  amount: [
    'amount', 'transaction amount', 'expense amount', 'purchase amount', 'amt', 'amount cad', 'amount usd', 'amount inr'
  ] as string[],
  debit: ['debit', 'withdrawal', 'charge', 'spent', 'dr', 'debit amount'] as string[],
  credit: ['credit', 'deposit', 'refund', 'cr', 'payment', 'credit amount'] as string[],
  currency: ['currency', 'curr', 'ccy', 'currency code', 'iso currency'] as string[],
  description: [
    'description', 'merchant', 'details', 'memo', 'narration', 'payee', 'reference', 'notes', 'particulars', 'statement description', 'desc', 'statement text'
  ] as string[],
  category: ['category', 'type', 'expense category'] as string[],
  payment_method: ['payment method', 'method', 'card', 'channel', 'account'] as string[],
}

function normalizeHeader(h: unknown): string {
  const raw = String(h || '')
  // Insert spaces for camelCase boundaries before lowercasing
  const withSpaces = raw.replace(/([a-z])([A-Z])/g, '$1 $2')
  return withSpaces
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findHeaderRow(rows: any[][]): number {
  const maxScan = Math.min(rows.length, 10)
  let bestIdx = -1
  let bestScore = 0
  for (let i = 0; i < maxScan; i++) {
    const r = rows[i]
    if (!Array.isArray(r)) continue
    let score = 0
    for (const cell of r) {
      const n = normalizeHeader(cell)
      if (!n) continue
      for (const key of Object.keys(headerAliases) as (keyof typeof headerAliases)[]) {
        if (headerAliases[key].some(a => n.includes(a))) score += 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx >= 0 ? bestIdx : 0
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }
  const form = formidable({ maxFileSize: 15 * 1024 * 1024, multiples: false })

  try {
    const { files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err: Error | null, fields: formidable.Fields, files: formidable.Files) => {
        if (err) return reject(err)
        resolve({ fields, files })
      })
    })

    const file = (files?.file || files?.excel || files?.spreadsheet) as FormidableFile | FormidableFile[] | undefined
    const selected = Array.isArray(file) ? file[0] : file
    if (!selected) return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' })

    const data = await readFile(selected)
    const wb = XLSX.read(data, { type: 'buffer', cellDates: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) return res.status(400).json({ success: false, error: 'No sheets found in the uploaded file' })
    const ws = wb.Sheets[sheetName]

    // Get rows as arrays to find headers
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false }) as any[][]
    if (!rows || rows.length === 0) return res.status(400).json({ success: false, error: 'No rows in the spreadsheet' })
    const headerIdx = findHeaderRow(rows)
    const headerRow = rows[headerIdx] || []

    // Build column index map for AI date recovery only
    const headerMap: Record<string, number> = {}
    headerRow.forEach((cell, idx) => {
      const n = normalizeHeader(cell)
      if (!n) return
      for (const key of Object.keys(headerAliases) as (keyof typeof headerAliases)[]) {
        if (headerAliases[key].some(a => n.includes(a))) {
          if (headerMap[key] === undefined) headerMap[key] = idx
        }
      }
    })

    // Build a redacted text representation of the sheet to send to AI extractor
    function redactSensitive(input: string): string {
      let text = input
      // Only redact in description/note fields, not in amount/date columns
      // Redact account numbers and card numbers (13-19 digits)
      text = text.replace(/\b(?:account|acct|card|iban|routing|sort code|account number|card number)[^\n|]*?[\d][\d\-\s]{10,}\b/gi, '[REDACTED]')
      text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
        // Don't redact if it looks like a transaction amount (has decimal or is in amount column context)
        if (m.includes('.') || /^\d{1,6}[.\d]*$/.test(m.replace(/[ -]/g, ''))) return m
        return m.replace(/\d/g, 'X')
      })
      text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
      // Only redact phone numbers that are clearly phone numbers (with + or in specific formats)
      // Don't redact transaction IDs or reference numbers
      text = text.replace(/\+\d{10,15}\b/g, '[REDACTED_PHONE]')
      text = text.replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, (m) => {
        // If it's in a context that suggests it's a transaction ID, don't redact
        if (m.includes('TFR') || m.includes('UPI') || m.includes('NEFT')) return m
        return '[REDACTED_PHONE]'
      })
      text = text.replace(/^\s*(billing address|mailing address|address|customer name|name):.*$/gim, (line) => line.split(':')[0] + ': [REDACTED]')
      if (process.env.AI_STRICT_PRIVACY === '1') {
        // Only redact very long numbers that are clearly not transaction amounts
        text = text.replace(/\b\d{12,}\b/g, (m) => {
          // Don't redact if it looks like a balance or large transaction amount
          if (m.includes('.') || m.length <= 12) return m
          return 'X'.repeat(m.length)
        })
        text = text.replace(/(?:\d{4}[\-\s]){2,3}\d{3,4}/g, (m) => {
          // Don't redact if it's in a date-like format in a date column
          if (m.match(/^\d{4}[-/]\d{2}[-/]\d{2,4}$/)) return m
          return m.replace(/\d/g, 'X')
        })
        text = text.replace(/^.*\b(SSN|SIN|Passport|Driver'?s? License|DL No\.|PAN|Aadhaar|GSTIN)\b.*$/gim, '[REDACTED_LINE]')
      }
      const extras = (process.env.AI_EXTRA_REDACT_WORDS || '').split(',').map(s => s.trim()).filter(Boolean)
      if (extras.length > 0) {
        for (const word of extras) {
          const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const re = new RegExp(safe, 'gi')
          text = text.replace(re, '[REDACTED_CUSTOM]')
        }
      }
      return text
    }

    function prepareStatementText(input: string, headerRow?: any[]): string {
      const lines = input
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      
      // Check if header is already marked in the input
      const hasHeaderMarker = lines.some(l => l.startsWith('HEADER:'))
      
      // If header is already in the input, just number the lines
      if (hasHeaderMarker) {
        let dataRowNum = 1
        return lines.map((l) => {
          // Keep header marker, number data rows starting from 1
          if (l.startsWith('HEADER:')) {
            return l.replace('HEADER:', 'COLUMN HEADERS (identify which columns contain dates, amounts, descriptions, etc.):')
          }
          return `${dataRowNum++}. ${l}`
        }).join('\n')
      }
      
      // If header not in input but we have headerRow info, add it
      if (headerRow && headerRow.length > 0) {
        const headerLine = headerRow.map(c => String(c ?? '').trim()).join(' | ')
        return `COLUMN HEADERS (identify which columns contain dates, amounts, descriptions, etc.):\n${headerLine}\n\nTRANSACTION DATA:\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
      }
      
      return lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
    }

    function debugEnabled() {
      return process.env.DEBUG_AI_PARSE === '1'
    }

    function hashOf(text: string): string {
      try {
        return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
      } catch {
        let h = 0
        for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
        return Math.abs(h).toString(16)
      }
    }

    function parseAmountMaybeString(val: unknown): number | null {
      if (typeof val === 'number') return Number.isFinite(val) ? val : null
      if (typeof val !== 'string') return null
      const raw = val.trim()
      const isParenNeg = /^\(.*\)$/.test(raw)
      const normalized = raw.replace(/[\u2212\u2012\u2013\u2014]/g, '-')
      const cleaned = normalized.replace(/[^0-9.\-]/g, '')
      let num = Number(cleaned)
      if (!Number.isFinite(num)) return null
      if (isParenNeg && num > 0) num = -num
      return num
    }

    function processRawExpenses(arr: any[]): ParsedExpense[] {
      // Calculate median transaction amount to detect balance values
      const amounts = arr
        .map(e => {
          const parsed = parseAmountMaybeString((e as any).amount)
          return typeof (e as any).amount === 'number' ? (e as any).amount : (parsed ?? null)
        })
        .filter((a): a is number => typeof a === 'number' && Number.isFinite(a) && a > 0)
      
      const medianAmount = amounts.length > 0 
        ? [...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)]
        : 0
      
      // Flag amounts that are suspiciously large (likely balance values)
      // If an amount is more than 10x the median, it's probably a balance
      const suspiciousThreshold = medianAmount > 0 ? medianAmount * 10 : 100000
      
      return arr
        .map((e) => {
          const parsedAmount = parseAmountMaybeString((e as any).amount)
          let amt = typeof (e as any).amount === 'number' ? (e as any).amount : (parsedAmount ?? NaN)
          
          // Validate amount - if it looks like a balance (very large compared to other transactions), log warning
          if (typeof amt === 'number' && Number.isFinite(amt) && Math.abs(amt) > suspiciousThreshold && medianAmount > 0) {
            console.warn(`[WARNING] Suspiciously large amount detected (likely balance, not transaction): ${amt} for line ${(e as any).line_index}. Median transaction: ${medianAmount}`)
            // Don't filter it out, but log the warning - AI should have caught this, but we're being defensive
          }
          
          const noteLower = String((e as any).note || '').toLowerCase()
          const merchantLower = String((e as any).merchant || '').toLowerCase()
          const direction = String((e as any).direction || '').toLowerCase()
          const refundLike = /(refund|refunded|credit|cr\b|reversal|chargeback|payment received|cashback|return|deposit credit|adjustment credit|credit interest|rebate|reimbursement)/i.test(`${noteLower} ${merchantLower}`)
          let signed = amt
          if (typeof signed === 'number' && Number.isFinite(signed)) {
            if (direction === 'credit' && signed > 0) signed = -Math.abs(signed)
            else if (direction === 'debit' && signed < 0) signed = Math.abs(signed)
            else if (!direction && refundLike && signed > 0) signed = -Math.abs(signed)
          }
          let occurred_on = e.occurred_on
          // If AI returns an invalid date (e.g. 2025-11-XX), try to recover it from the original row using manual parser
          if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred_on) || occurred_on.includes('XX')) {
            const idx = Number((e as any).line_index)
            if (Number.isFinite(idx) && idx >= 1 && rows[idx - 1]) {
              const row = rows[idx - 1]
              // Try to find date using the header map if available
              if (headerMap['date'] !== undefined) {
                const manualDate = parseExcelDate(row[headerMap['date']])
                if (manualDate) {
                  console.log(`[DEBUG] Recovered date for line ${idx} from manual parser: ${manualDate}`)
                  occurred_on = manualDate
                }
              } else {
                // Fallback: scan row for any date-like cell
                for (const cell of row) {
                  const d = parseExcelDate(cell)
                  if (d) {
                    console.log(`[DEBUG] Recovered date for line ${idx} by scanning row: ${d}`)
                    occurred_on = d
                    break
                  }
                }
              }
            }
          }

          // Ensure we pass the final date through the parser one last time to be safe
          const finalDate = parseExcelDate(occurred_on) || occurred_on

          return {
            amount: signed,
            currency: String(e.currency || 'USD').toUpperCase(),
            merchant: e.merchant || undefined,
            payment_method: e.payment_method || undefined,
            note: e.note || undefined,
            occurred_on: finalDate,
            category: e.category || undefined,
            line_index: Number.isFinite(Number((e as any).line_index)) ? Number((e as any).line_index) : undefined,
          }
        })
        .filter((e) => typeof e.amount === 'number' && !Number.isNaN(e.amount) && typeof e.occurred_on === 'string')
    }

    async function callGemini(prompt: string): Promise<ParsedExpense[]> {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) throw new Error('Missing GEMINI_API_KEY')

      if (debugEnabled()) console.log('[AI Parse Gemini] calling Gemini...')

      const system = `You are an expert finance assistant specialized in parsing bank and credit card statements from ANY bank worldwide. You can intelligently understand different statement formats, column structures, date formats, currency formats, and transaction types regardless of language or header names.`
      const user = `Below is a bank/credit card statement exported from Excel/CSV. The format may be from ANY bank in the world with ANY column names in ANY language.

CRITICAL: You must intelligently identify:
- DATE columns: Look for dates in ANY format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.). If multiple date columns exist (transaction date, posting date, value date), use the LATER/POSTED date. Ignore [REDACTED_PHONE] or other redaction placeholders - focus on actual date patterns.
- TRANSACTION AMOUNT columns: Identify columns containing the TRANSACTION AMOUNT (NOT the running balance). Look for columns named "debit", "credit", "amount", "transaction amount", "withdrawal", "deposit", etc. These columns contain the actual transaction value. If a column contains [REDACTED_PHONE] or non-numeric text, it's NOT the amount column - look for columns with numeric values.
- BALANCE columns: Identify columns named "balance", "running balance", "account balance", "closing balance", etc. **CRITICAL: DO NOT USE BALANCE VALUES AS TRANSACTION AMOUNTS.** Balance columns show the account balance AFTER the transaction, not the transaction amount itself. If you see values like 165874.32 or 210611.31, these are likely balance values, NOT transaction amounts.
- DESCRIPTION/MERCHANT columns: Identify columns containing transaction descriptions, merchant names, payee names, or transaction details. These may contain [REDACTED] placeholders - extract what you can from the visible parts.
- DEBIT/CREDIT columns: If separate debit and credit columns exist, they are MUTUALLY EXCLUSIVE - only one will have a value per transaction. If debit has a value, use that as positive amount. If credit has a value, use that as negative amount (or positive if it's an expense credit like refund). **If a column contains [REDACTED_PHONE] or descriptions instead of numbers, that column is misidentified - look for the actual numeric amount columns.**
- CURRENCY: Detect from currency symbols, codes, or separate currency columns. Default to USD if unclear.

⚠️ CRITICAL RULES:
- NEVER use balance/running balance values as transaction amounts. Balance is the account total AFTER the transaction, not the transaction amount.
- If you see [REDACTED_PHONE] or [REDACTED] in a column that should contain amounts or dates, that column has been redacted - look for the actual data in other columns or use the column structure to infer the correct mapping.

${prompt}

EXTRACTION RULES:
1. Extract ALL transactions from the data rows (ignore header rows and summary rows).

2. AMOUNT EXTRACTION (CRITICAL):
   - Look for columns named "debit", "credit", "amount", "transaction amount", "withdrawal", "deposit", "charge", "payment"
   - If separate "debit" and "credit" columns exist:
     * If "debit" column has a value, that IS the transaction amount (use as positive for expenses)
     * If "credit" column has a value, that IS the transaction amount (use as negative for income/refunds, or positive if it's a refund that should be negative expense)
     * NEVER use both debit and credit for the same transaction - they are mutually exclusive
   - If a single "amount" column exists, use that value
   - **NEVER use "balance" or "running balance" column values as transaction amounts** - balance shows account total, not transaction value
   - If you see a balance column with large values (like 165874.32, 210611.31), that is NOT the transaction amount - ignore it

3. For each transaction, output:
   - amount: The ACTUAL TRANSACTION AMOUNT (NOT balance) as a NUMBER
     * Positive for purchases, charges, withdrawals, debits (money going out)
     * Negative for refunds, credits, deposits (money coming in, or refunds of expenses)
   - currency: ISO 4217 currency code (USD, CAD, EUR, GBP, INR, JPY, AUD, etc.)
   - occurred_on: ISO date format YYYY-MM-DD (use the posting/effective date if multiple dates exist)
   - merchant: Extract merchant/payee name from description field (e.g., "PARMARR U", "JIO Post", "AIR INDIA") - omit if unclear
   - payment_method: Payment method if identifiable (UPI, NEFT, card, check, transfer, etc.) - omit if unclear
   - note: Short human-friendly description extracted from description field (e.g., "JIO Post", "Home Loan", "Shopping") - NO dates, transaction IDs, or bank codes in note
   - category: Expense category if obvious (optional, omit if unclear)
   - direction: "debit" or "credit" based on transaction type
   - line_index: The line number from the input (1-based)

4. SIGN CONVENTIONS:
   - Purchases, charges, withdrawals, debits: POSITIVE amounts
   - Refunds, credits, deposits, reversals: NEGATIVE amounts
   - If the bank uses parentheses for negatives, convert them to negative numbers
   - If debit column has value, amount is positive. If credit column has value, amount is negative (for expense tracking)

5. DATE HANDLING:
   - Parse dates in ANY format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.)
   - If multiple dates per transaction, use the POSTING/EFFECTIVE date (usually the later one)
   - Output dates as YYYY-MM-DD only

6. CURRENCY DETECTION:
   - Look for currency symbols, codes, or separate currency columns
   - If multiple currencies in one statement, extract the currency for each transaction
   - If currency is unclear, default to USD

7. IMPORTANT:
   - Extract EVERY transaction row, even if amounts are very small
   - Do NOT skip transactions
   - Do NOT aggregate or summarize
   - Preserve the exact order of transactions
   - If the same transaction appears multiple times, extract each occurrence separately
   - Ignore header rows, footer rows, and summary/total rows

Output valid JSON with this structure:
{"expenses": [{"amount": number, "currency": string, "occurred_on": string, "line_index": number, "merchant"?: string, "payment_method"?: string, "note"?: string, "category"?: string, "direction"?: "debit"|"credit"}]}`

      const body = {
        contents: [{
          role: "user",
          parts: [{ text: system + "\n\n" + user }]
        }],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: "application/json",
          response_schema: {
            type: "OBJECT",
            properties: {
              expenses: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    amount: { type: "NUMBER" },
                    currency: { type: "STRING" },
                    direction: { type: "STRING", enum: ["debit", "credit"] },
                    merchant: { type: "STRING" },
                    payment_method: { type: "STRING" },
                    note: { type: "STRING" },
                    occurred_on: { type: "STRING" },
                    category: { type: "STRING" },
                    line_index: { type: "INTEGER" }
                  },
                  required: ["amount", "currency", "occurred_on", "line_index"]
                }
              }
            }
          }
        }
      }

      // Try multiple Gemini models in order of preference
      // Using valid model identifiers from the API
      const models = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash-001',
        'gemini-flash-latest',
        'gemini-pro-latest',
      ]

      let lastError: Error | null = null

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

          console.log(`[AI Parse Gemini] Trying model: ${model}`)

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })

          if (!response.ok) {
            const err = await response.text().catch(() => '')
            throw new Error(`Gemini API error (${model}): ${response.status} ${err}`)
          }

          const result = await response.json()
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text

          if (!text) {
            console.error(`[AI Parse Gemini] Model ${model} returned no text. Full result:`, JSON.stringify(result).substring(0, 500))
            throw new Error(`Gemini (${model}) returned no text`)
          }

          if (debugEnabled()) {
            console.log(`[AI Parse Gemini] Model ${model} response preview:`, text.substring(0, 200))
          }

          let parsed: any
          try {
            // Handle markdown code blocks (```json ... ```) if present
            let jsonText = text.trim()
            jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
            parsed = JSON.parse(jsonText)
          } catch (e) {
            console.error(`[AI Parse Gemini] Model ${model} returned invalid JSON:`, text.substring(0, 200))
            throw new Error(`Gemini (${model}) returned invalid JSON`)
          }

          const rawExpenses = Array.isArray(parsed?.expenses) ? parsed.expenses : []
          console.log(`[AI Parse Gemini] Model ${model} returned ${rawExpenses.length} raw expenses`)

          if (rawExpenses.length === 0) {
            console.warn(`[AI Parse Gemini] Model ${model} parsed JSON but got 0 expenses. Parsed object:`, JSON.stringify(parsed).substring(0, 300))
          }

          const expenses = processRawExpenses(rawExpenses)
          console.log(`[AI Parse Gemini] After processing, ${expenses.length} expenses remain`)

          if (expenses.length > 0) {
            console.log(`[AI Parse Gemini] Successfully used model: ${model}. First expense:`, expenses[0])
            return expenses
          }

          throw new Error(`Gemini (${model}) returned empty expenses array after processing`)
        } catch (error: any) {
          console.warn(`[AI Parse Gemini] Model ${model} failed:`, error.message)
          lastError = error
          // Continue to next model
        }
      }

      // All models failed
      throw lastError || new Error('All Gemini models failed')
    }

    async function callPerplexity(prompt: string): Promise<ParsedExpense[]> {
      const apiKey = process.env.PERPLEXITY_API_KEY
      if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY')
      const system = `You are an expert finance assistant specialized in parsing bank and credit card statements from ANY bank worldwide. You can intelligently understand different statement formats, column structures, date formats, currency formats, and transaction types regardless of language or header names. Return structured JSON only. Do not include any personally identifiable information (PII) and do not extract account summaries.`
      const user = `Below is a bank/credit card statement exported from Excel/CSV. The format may be from ANY bank in the world with ANY column names in ANY language.

CRITICAL: You must intelligently identify:
- DATE columns: Look for dates in ANY format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.). If multiple date columns exist (transaction date, posting date, value date), use the LATER/POSTED date. Ignore [REDACTED_PHONE] or other redaction placeholders - focus on actual date patterns.
- TRANSACTION AMOUNT columns: Identify columns containing the TRANSACTION AMOUNT (NOT the running balance). Look for columns named "debit", "credit", "amount", "transaction amount", "withdrawal", "deposit", etc. These columns contain the actual transaction value. If a column contains [REDACTED_PHONE] or non-numeric text, it's NOT the amount column - look for columns with numeric values.
- BALANCE columns: Identify columns named "balance", "running balance", "account balance", "closing balance", etc. **CRITICAL: DO NOT USE BALANCE VALUES AS TRANSACTION AMOUNTS.** Balance columns show the account balance AFTER the transaction, not the transaction amount itself. If you see values like 165874.32 or 210611.31, these are likely balance values, NOT transaction amounts.
- DESCRIPTION/MERCHANT columns: Identify columns containing transaction descriptions, merchant names, payee names, or transaction details. These may contain [REDACTED] placeholders - extract what you can from the visible parts.
- DEBIT/CREDIT columns: If separate debit and credit columns exist, they are MUTUALLY EXCLUSIVE - only one will have a value per transaction. If debit has a value, use that as positive amount. If credit has a value, use that as negative amount (or positive if it's an expense credit like refund). **If a column contains [REDACTED_PHONE] or descriptions instead of numbers, that column is misidentified - look for the actual numeric amount columns.**
- CURRENCY: Detect from currency symbols, codes, or separate currency columns. Default to USD if unclear.

⚠️ CRITICAL RULES:
- NEVER use balance/running balance values as transaction amounts. Balance is the account total AFTER the transaction, not the transaction amount.
- If you see [REDACTED_PHONE] or [REDACTED] in a column that should contain amounts or dates, that column has been redacted - look for the actual data in other columns or use the column structure to infer the correct mapping.

${prompt}

EXTRACTION RULES:
1. Extract ALL transactions from the data rows (ignore header rows and summary rows).

2. AMOUNT EXTRACTION (CRITICAL):
   - Look for columns named "debit", "credit", "amount", "transaction amount", "withdrawal", "deposit", "charge", "payment"
   - If separate "debit" and "credit" columns exist:
     * If "debit" column has a value, that IS the transaction amount (use as positive for expenses)
     * If "credit" column has a value, that IS the transaction amount (use as negative for income/refunds, or positive if it's a refund that should be negative expense)
     * NEVER use both debit and credit for the same transaction - they are mutually exclusive
   - If a single "amount" column exists, use that value
   - **NEVER use "balance" or "running balance" column values as transaction amounts** - balance shows account total, not transaction value
   - If you see a balance column with large values (like 165874.32, 210611.31), that is NOT the transaction amount - ignore it

3. For each transaction, output:
   - amount: The ACTUAL TRANSACTION AMOUNT (NOT balance) as a NUMBER
     * Positive for purchases, charges, withdrawals, debits (money going out)
     * Negative for refunds, credits, deposits (money coming in, or refunds of expenses)
   - currency: ISO 4217 currency code (USD, CAD, EUR, GBP, INR, JPY, AUD, etc.)
   - occurred_on: ISO date format YYYY-MM-DD (use the posting/effective date if multiple dates exist)
   - merchant: Extract merchant/payee name from description field (e.g., "PARMARR U", "JIO Post", "AIR INDIA") - omit if unclear
   - payment_method: Payment method if identifiable (UPI, NEFT, card, check, transfer, etc.) - omit if unclear
   - note: Short human-friendly description extracted from description field (e.g., "JIO Post", "Home Loan", "Shopping") - NO dates, transaction IDs, or bank codes in note
   - category: Expense category if obvious (optional, omit if unclear)
   - direction: "debit" or "credit" based on transaction type
   - line_index: The line number from the input (1-based)

4. SIGN CONVENTIONS:
   - Purchases, charges, withdrawals, debits: POSITIVE amounts
   - Refunds, credits, deposits, reversals: NEGATIVE amounts
   - If the bank uses parentheses for negatives, convert them to negative numbers
   - If debit column has value, amount is positive. If credit column has value, amount is negative (for expense tracking)
   - There can be MANY negative transactions—do not drop them

5. DATE HANDLING:
   - Parse dates in ANY format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.)
   - If multiple dates per transaction, use the POSTING/EFFECTIVE date (usually the later one)
   - Output dates as YYYY-MM-DD only
   - Do NOT put any dates in the note field

6. CURRENCY DETECTION:
   - Look for currency symbols, codes, or separate currency columns
   - If multiple currencies in one statement, extract the currency for each transaction
   - If currency is unclear, default to USD

7. IMPORTANT:
   - Extract EVERY transaction row, even if amounts are very small
   - Do NOT skip transactions
   - Do NOT aggregate or summarize
   - Preserve the exact order of transactions
   - If the same transaction appears multiple times, extract each occurrence separately with its line_index
   - Ignore header rows, footer rows, and summary/total rows
   - Only extract transactions explicitly present in the lines

Output must be valid JSON with this structure:
{"expenses": [{"amount": number, "currency": string, "occurred_on": string, "line_index": number, "merchant"?: string, "payment_method"?: string, "note"?: string, "category"?: string, "direction"?: "debit"|"credit"}]}`
      const url = 'https://api.perplexity.ai/chat/completions'
      // Use sonar-pro for better JSON support, fallback to sonar
      const model = process.env.PERPLEXITY_MODEL || 'sonar-pro'
      if (debugEnabled()) console.log('[AI Parse XLS Debug] calling Perplexity', { model, promptHash: hashOf(prompt), chars: prompt.length })

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0,
          max_tokens: 8192,
        }),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Perplexity API error: ${resp.status} ${text}`)
      }

      const json = await resp.json()
      const content = json?.choices?.[0]?.message?.content || '{}'

      if (debugEnabled()) {
        console.log('[AI Parse Perplexity] Response preview:', typeof content === 'string' ? content.substring(0, 200) : content)
      }

      let parsed: any
      try {
        // Handle markdown code blocks (```json ... ```) and extract JSON from mixed content
        let jsonContent = typeof content === 'string' ? content : JSON.stringify(content)
        
        // First, try to extract JSON from markdown code blocks
        const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i)
        if (jsonBlockMatch) {
          jsonContent = jsonBlockMatch[1]
        } else {
          // Remove markdown code block markers if present
          jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
          
          // Try to find JSON object in the content (might have analysis text before/after)
          const jsonObjectMatch = jsonContent.match(/\{[\s\S]*"expenses"[\s\S]*\}/)
          if (jsonObjectMatch) {
            jsonContent = jsonObjectMatch[0]
          }
        }
        
        parsed = JSON.parse(jsonContent)
      } catch (e) {
        console.error('[AI Parse Perplexity] Failed to parse JSON. Content:', content.substring(0, 500))
        throw new Error(`Model returned non-JSON output: ${content.substring(0, 100)}...`)
      }

      const arr: any[] = Array.isArray(parsed?.expenses) ? parsed.expenses : []

      if (arr.length === 0) {
        console.warn('[AI Parse Perplexity] Parsed successfully but got 0 expenses. Response:', JSON.stringify(parsed).substring(0, 200))
      }

      return processRawExpenses(arr)
    }


    function chunkText(text: string, maxLen = 6000): string[] {
      // Reduced chunk size to avoid token limits with verbose descriptions
      const chunks: string[] = []
      const lines = text.split(/\n/)
      
      // Find header line to include in each chunk
      const headerLine = lines.find(l => l.includes('COLUMN HEADERS') || l.startsWith('HEADER:'))
      
      let current = headerLine ? headerLine + '\n\n' : ''
      let lineNum = 1
      
      for (const line of lines) {
        // Skip header line if already added
        if (line === headerLine || line.includes('COLUMN HEADERS')) continue
        
        const toAdd = (current && !current.endsWith('\n\n') ? '\n' : '') + line
        if (current.length + toAdd.length > maxLen) {
          if (current.trim()) {
            chunks.push(current.trim())
          }
          // Start new chunk with header if available
          current = headerLine ? headerLine + '\n\n' : ''
          if (line.trim()) {
            current += line
          }
        } else {
          current += toAdd
        }
        lineNum++
      }
      if (current.trim()) chunks.push(current.trim())
      return chunks
    }

    // Convert sheet rows to a plain-text representation for AI
    // Format: header row first, then data rows, with clear column separation
    const formatRow = (row: any[], isHeader = false): string => {
      if (!Array.isArray(row)) return ''
      const cells = row.map(c => {
        const val = String(c ?? '').trim()
        // Keep empty cells as empty strings to preserve column structure
        return val || ''
      })
      const rowText = cells.join(' | ')
      return isHeader ? `HEADER: ${rowText}` : rowText
    }
    
    // Build table text with header clearly marked
    const headerText = formatRow(headerRow, true)
    const dataRows = rows.slice(headerIdx + 1).map(r => formatRow(Array.isArray(r) ? r : []))
    const tableText = [headerText, ...dataRows].filter(Boolean).join('\n')
    
    const redacted = redactSensitive(tableText)
    const prepared = prepareStatementText(redacted, headerRow)

    // If external calls disabled, return error
    if (process.env.AI_DISABLE_EXTERNAL === '1') {
      return res.status(500).json({ success: false, error: 'AI parsing is disabled. Manual parsing has been removed.' })
    }

    let extracted: ParsedExpense[] = []
    let perplexityError: any = null

    // Try Perplexity first
    try {
      // Reduced threshold for chunking to handle verbose descriptions better
      // 64 rows with long descriptions can easily exceed token limits
      if (prepared.length <= 15000) {
        extracted = await callPerplexity(prepared)
      } else {
        console.log(`[AI Parse] File is large (${prepared.length} chars), chunking into smaller pieces...`)
        const chunks = chunkText(prepared, 6000)
        console.log(`[AI Parse] Split into ${chunks.length} chunks`)
        const all: ParsedExpense[] = []
        for (let i = 0; i < chunks.length; i++) {
          console.log(`[AI Parse] Processing chunk ${i + 1}/${chunks.length}...`)
          const part = await callPerplexity(chunks[i])
          all.push(...part)
        }
        extracted = all
      }
      
      // If Perplexity returned empty results, treat it as a failure and try Gemini
      if (extracted.length === 0) {
        console.warn('[AI Parse] Perplexity returned 0 expenses, trying Gemini fallback')
        perplexityError = new Error('Perplexity returned empty expenses array')
        throw perplexityError
      }
    } catch (perplexError: any) {
      console.warn('[AI Parse] Perplexity failed, trying Gemini fallback:', perplexError.message)
      perplexityError = perplexError

      // Try Gemini as fallback
      try {
        // Use same chunking strategy for Gemini
        if (prepared.length <= 15000) {
          extracted = await callGemini(prepared)
        } else {
          console.log(`[AI Parse Gemini] File is large (${prepared.length} chars), chunking into smaller pieces...`)
          const chunks = chunkText(prepared, 6000)
          console.log(`[AI Parse Gemini] Split into ${chunks.length} chunks`)
          const all: ParsedExpense[] = []
          for (let i = 0; i < chunks.length; i++) {
            console.log(`[AI Parse Gemini] Processing chunk ${i + 1}/${chunks.length}...`)
            const part = await callGemini(chunks[i])
            all.push(...part)
          }
          extracted = all
        }
      } catch (geminiError: any) {
        console.error('[AI Parse] All AI models failed')
        return res.status(500).json({
          success: false,
          error: `Failed to parse spreadsheet. Perplexity error: ${perplexityError?.message || 'Unknown error'}. Gemini error: ${geminiError.message}`
        })
      }
    }

    // Filter out negative card payments from AI output
    if (extracted.length > 0) {
      console.log(`[DEBUG] AI extracted ${extracted.length} expenses. First one:`, extracted[0])
      const filtered = extracted.filter((e) => {
        const txt = `${e.merchant || ''} ${e.note || ''}`.toLowerCase()
        const isPaymentReceipt = Number(e.amount) < 0 && /(payment received|credit card payment|card payment|payment thank you|bill payment|autopay|auto pay|payment processed|thank you for your payment)/i.test(txt)
        return !isPaymentReceipt
      })
      return res.status(200).json({ success: true, expenses: filtered })
    }

    // No results from AI
    return res.status(500).json({ success: false, error: 'AI parsing returned no expenses. Please check your file format.' })

  } catch (e: any) {
    console.error('parse-spreadsheet error', e)
    return res.status(500).json({ success: false, error: e?.message || 'Internal Error' })
  }
}
