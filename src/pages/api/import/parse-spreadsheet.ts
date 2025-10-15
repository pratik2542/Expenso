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
    // Try common formats first: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, e.g.
    // Normalize to a parsable format for Date
    // Prefer explicit parsing
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
    if (dmy) {
      let [_, dd, mm, yy] = dmy
      if (yy.length === 2) yy = `20${yy}`
      const d = new Date(Number(yy), Number(mm) - 1, Number(dd))
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
    const mdy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
    if (mdy) {
      let [_, mm, dd, yy] = mdy
      if (yy.length === 2) yy = `20${yy}`
      const d = new Date(Number(yy), Number(mm) - 1, Number(dd))
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
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
    console.error('[parse-spreadsheet] Method not allowed:', req.method)
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` })
  }

  console.log('[parse-spreadsheet] Starting file upload processing')
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
    const bodyRows = rows.slice(headerIdx + 1)

    // Build column index map
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

    const hasAmount = headerMap['amount'] !== undefined
    const hasDebit = headerMap['debit'] !== undefined
    const hasCredit = headerMap['credit'] !== undefined

    const expenses: ParsedExpense[] = []
    for (const r of bodyRows) {
      if (!Array.isArray(r)) continue
      // Date
      const dateCell = headerMap['date'] !== undefined ? r[headerMap['date']] : undefined
      const occurred_on = parseExcelDate(dateCell)
      if (!occurred_on) continue

      // Amount
      let amount: number | null = null
      if (hasAmount) {
        amount = toNumber(r[headerMap['amount']])
      } else if (hasDebit || hasCredit) {
        const debitVal = hasDebit ? toNumber(r[headerMap['debit']]) : null
        const creditVal = hasCredit ? toNumber(r[headerMap['credit']]) : null
        const hasDebitVal = typeof debitVal === 'number' && Number.isFinite(debitVal)
        const hasCreditVal = typeof creditVal === 'number' && Number.isFinite(creditVal)
        const debitMag = hasDebitVal ? Math.abs(debitVal as number) : 0
        const creditMag = hasCreditVal ? Math.abs(creditVal as number) : 0
        // Debits as positive spends, credits as negative refunds
        if (hasDebitVal || hasCreditVal) {
          amount = debitMag - creditMag
          if (!hasDebitVal && hasCreditVal) amount = -creditMag
        }
      }
      if (amount === null || !Number.isFinite(amount)) continue

      // Currency
      let currency: string | undefined
      if (headerMap['currency'] !== undefined) {
        const raw = r[headerMap['currency']]
        currency = String(raw || '').toUpperCase().trim() || undefined
      }
      if (!currency) {
        // Try detect from amount cell string
        const amtCell = hasAmount ? r[headerMap['amount']] : (hasDebit ? r[headerMap['debit']] : (hasCredit ? r[headerMap['credit']] : undefined))
        currency = detectCurrencyFromSymbolOrCode(amtCell)
      }
      if (!currency) currency = 'USD'

      // Merchant/Description
      let merchant: string | undefined
      if (headerMap['description'] !== undefined) {
        const raw = r[headerMap['description']]
        merchant = String(raw || '').trim() || undefined
      }

      // Category
      let category: string | undefined
      if (headerMap['category'] !== undefined) {
        const raw = r[headerMap['category']]
        category = String(raw || '').trim() || undefined
      }

      // Payment method
      let payment_method: string | undefined
      if (headerMap['payment_method'] !== undefined) {
        const raw = r[headerMap['payment_method']]
        payment_method = String(raw || '').trim() || undefined
      }

      const candidate: ParsedExpense = {
        amount: Number(amount),
        currency,
        merchant: merchant || undefined,
        payment_method: payment_method || undefined,
        note: undefined,
        occurred_on,
        category: category || undefined,
      }
      // Exclude credit card payment receipts (negative payments)
      const text = `${merchant || ''}`.toLowerCase()
      const isPaymentReceipt = Number(candidate.amount) < 0 && /(payment received|credit card payment|card payment|payment thank you|bill payment|autopay|auto pay|payment processed|thank you for your payment)/i.test(text)
      if (!isPaymentReceipt) expenses.push(candidate)
    }
    // Build a redacted text representation of the sheet to send to AI extractor (primary path)
    function redactSensitive(input: string): string {
      let text = input
      text = text.replace(/\b(?:account|acct|card|iban|routing|sort code|account number|card number)[^\n]*?[\d][\d\-\s]{3,}\b/gi, '[REDACTED]')
      text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => (m.replace(/\d/g, 'X')))
      text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
      text = text.replace(/\+?\d[\d\s\-()]{7,}\d/g, '[REDACTED_PHONE]')
      text = text.replace(/^\s*(billing address|mailing address|address|customer name|name):.*$/gim, (line) => line.split(':')[0] + ': [REDACTED]')
      if (process.env.AI_STRICT_PRIVACY === '1') {
        text = text.replace(/\d{9,}/g, (m) => 'X'.repeat(m.length))
        text = text.replace(/(?:\d{4}[\-\s]){2,3}\d{3,4}/g, (m) => m.replace(/\d/g, 'X'))
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

    function prepareStatementText(input: string): string {
      const lines = input
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length > 0)
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

    async function callPerplexity(prompt: string): Promise<ParsedExpense[]> {
      const apiKey = process.env.PERPLEXITY_API_KEY
      if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY')
      const system = `You are a finance assistant. Extract all expense transactions from provided bank/credit card statement text. Return structured JSON only. Do not include any personally identifiable information (PII) and do not extract account summaries.`
      const user = `The input below is a list of NUMBERED LINES from a bank/credit card statement (from an Excel/CSV export). Extract transactions strictly from these lines.\n\n${prompt}\n\nRules:\n- Output an "expenses" array that follows the order of the numbered lines. Do not sort or group.\n- Use ISO date YYYY-MM-DD. If two dates appear (e.g., transaction date and posting date), use the LATER/POSTED date for occurred_on. Do NOT put any dates in the note.\n- Currency codes must be ISO 4217 (e.g., CAD, USD, INR).\n- If merchant is missing, omit the field.\n- If payment method is missing, omit the field.\n- Category is optional; guess only if obvious, else omit.\n- Note content: Make it a short, human-friendly purpose (e.g., "Car rental", "Dinner at hotel"). Do NOT include any dates or phrases like "Transaction date ...; Posting date ..." in the note.\n- Signs: Purchases/charges must be positive; refunds/credits/reversals/cashbacks must be negative. There can be MANY negative transactions—do not drop them. Preserve minus signs and parentheses exactly.\n- Include very small amounts.\n- Only extract transactions explicitly present in the lines. Do not infer, summarize, or aggregate.\n- IMPORTANT: If the same date/merchant/amount appears as separate numbered lines multiple times, output SEPARATE objects for each occurrence with its line_index. Do NOT deduplicate or merge counts.\n- Include "line_index" for each transaction: the NUMBER (1-based) of the line that contains the amount/transaction.\n- Output must conform to the provided JSON schema.`
      const url = 'https://api.perplexity.ai/chat/completions'
      const model = process.env.PERPLEXITY_MODEL || 'sonar'
      if (debugEnabled()) console.log('[AI Parse XLS Debug] calling Perplexity', { promptHash: hashOf(prompt), chars: prompt.length })
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
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'expenses_schema',
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  expenses: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        amount: { type: 'number' },
                        currency: { type: 'string' },
                        direction: { type: 'string', enum: ['debit', 'credit'] },
                        merchant: { type: 'string' },
                        payment_method: { type: 'string' },
                        note: { type: 'string' },
                        occurred_on: { type: 'string' },
                        category: { type: 'string' },
                        line_index: { type: 'integer' }
                      },
                      required: ['amount', 'currency', 'occurred_on', 'line_index']
                    }
                  }
                },
                required: ['expenses']
              }
            },
          },
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Perplexity API error: ${resp.status} ${text}`)
      }
      const json = await resp.json()
      const content = json?.choices?.[0]?.message?.content || '{}'
      let parsed: any
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content
      } catch (e) {
        throw new Error('Model returned non-JSON output')
      }
      const arr: any[] = Array.isArray(parsed?.expenses) ? parsed.expenses : []
      // Sanitize and normalize like PDF route
      return arr
        .map((e) => {
          const parsedAmount = parseAmountMaybeString((e as any).amount)
          let amt = typeof (e as any).amount === 'number' ? (e as any).amount : (parsedAmount ?? NaN)
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
          return {
            amount: signed,
            currency: String(e.currency || 'USD').toUpperCase(),
            merchant: e.merchant || undefined,
            payment_method: e.payment_method || undefined,
            note: e.note || undefined,
            occurred_on: e.occurred_on,
            category: e.category || undefined,
            line_index: Number.isFinite(Number((e as any).line_index)) ? Number((e as any).line_index) : undefined,
          }
        })
        .filter((e) => typeof e.amount === 'number' && !Number.isNaN(e.amount) && typeof e.occurred_on === 'string')
    }

    function chunkText(text: string, maxLen = 9000): string[] {
      const chunks: string[] = []
      const lines = text.split(/\n/)
      let current = ''
      for (const line of lines) {
        const toAdd = (current ? '\n' : '') + line
        if (current.length + toAdd.length > maxLen) {
          if (current) chunks.push(current)
          if (line.length > maxLen) {
            let start = 0
            while (start < line.length) {
              chunks.push(line.slice(start, start + maxLen))
              start += maxLen
            }
            current = ''
          } else {
            current = line
          }
        } else {
          current += toAdd
        }
      }
      if (current) chunks.push(current)
      return chunks
    }

    // Convert sheet rows to a plain-text representation for AI
    const tableText = rows.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()).join(' | ') : '')).filter(Boolean).join('\n')
    const redacted = redactSensitive(tableText)
    const prepared = prepareStatementText(redacted)

    // If external calls disabled, return local parse
    if (process.env.AI_DISABLE_EXTERNAL === '1') {
      return res.status(200).json({ success: true, expenses })
    }

    try {
      let extracted: ParsedExpense[] = []
      if (prepared.length <= 20000) {
        extracted = await callPerplexity(prepared)
      } else {
        const chunks = chunkText(prepared, 9000)
        const all: ParsedExpense[] = []
        for (const c of chunks) {
          const part = await callPerplexity(c)
          all.push(...part)
        }
        extracted = all
      }
      // Prefer AI results; if none, fallback to local parsed rows
      if (extracted.length > 0) {
        // Filter out negative card payments from AI output
        const filtered = extracted.filter((e) => {
          const txt = `${e.merchant || ''} ${e.note || ''}`.toLowerCase()
          const isPaymentReceipt = Number(e.amount) < 0 && /(payment received|credit card payment|card payment|payment thank you|bill payment|autopay|auto pay|payment processed|thank you for your payment)/i.test(txt)
          return !isPaymentReceipt
        })
        return res.status(200).json({ success: true, expenses: filtered })
      }
      return res.status(200).json({ success: true, expenses })
    } catch (e: any) {
      // On AI error, fallback to local parsed rows
      return res.status(200).json({ success: true, expenses })
    }
  } catch (e: any) {
    console.error('parse-spreadsheet error', e)
    return res.status(500).json({ success: false, error: e?.message || 'Internal Error' })
  }
}
