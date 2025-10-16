import type { NextApiRequest, NextApiResponse } from 'next'
import formidable, { File as FormidableFile } from 'formidable'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { PDFDocument, rgb } from 'pdf-lib'

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
  
}

export const runtime = 'nodejs'

type ParsedExpense = {
  amount: number
  currency: string
  merchant?: string
  payment_method?: string
  note?: string
  occurred_on: string
  category?: string
  // Optional index of the numbered statement line this transaction came from (1-based)
  line_index?: number
}

type ApiResponse =
  | { success: true; expenses: ParsedExpense[]; usage?: any }
  | { success: false; error: string }

async function readFile(file: FormidableFile): Promise<Buffer> {
  const filepath = Array.isArray(file.filepath) ? file.filepath[0] : file.filepath
  return fs.promises.readFile(filepath)
}

// Try to load pdfjs in a way that works across Node/runtime variants & Next/Vercel bundling
async function loadPdfjs(): Promise<any> {
  const candidates = [
    'pdfjs-dist/legacy/build/pdf.js', // Prefer legacy CJS in Node serverless
    'pdfjs-dist/build/pdf.js',
    'pdfjs-dist/legacy/build/pdf.mjs',
    'pdfjs-dist/build/pdf.mjs',
    'pdfjs-dist',
  ]
  const debug = debugEnabled()
  // Prefer require() in server bundlers so the module gets included and resolved
  let req: any
  try { req = eval('require') } catch {}
  if (req) {
    for (const p of candidates) {
      try {
        if (debug) console.log('[AI Parse Debug] Trying to require pdfjs from', p)
        const mod: any = req(p)
        const lib = (mod && typeof (mod as any).getDocument === 'function')
          ? mod
          : (mod && (mod as any).default && typeof (mod as any).default.getDocument === 'function')
            ? (mod as any).default
            : undefined
        if (lib) {
          try { if ((lib as any).GlobalWorkerOptions) { (lib as any).GlobalWorkerOptions.workerSrc = undefined } } catch {}
          return lib
        }
        if (debug) console.log('[AI Parse Debug] require() module has no getDocument for', p)
      } catch (e: any) {
        if (debug) console.log('[AI Parse Debug] require() failed for', p, '-', e?.message || e)
      }
    }
  }
  for (const p of candidates) {
    try {
      if (debug) console.log('[AI Parse Debug] Trying to load pdfjs from', p)
      const mod: any = await import(p)
      const lib = (mod && typeof (mod as any).getDocument === 'function')
        ? mod
        : (mod && (mod as any).default && typeof (mod as any).default.getDocument === 'function')
          ? (mod as any).default
          : undefined
      if (lib) {
        try {
          // Force no worker in serverless/Node
          if ((lib as any).GlobalWorkerOptions) {
            ;(lib as any).GlobalWorkerOptions.workerSrc = undefined
          }
        } catch {}
        return lib
      }
      if (debug) console.log('[AI Parse Debug] Module loaded but no getDocument exported for', p)
    } catch (e: any) {
      if (debug) console.log('[AI Parse Debug] pdfjs load failed for', p, '-', e?.message || e)
    }
  }
  throw new Error('pdfjs not available in this runtime')
}

// Fast text extraction: Use pdf.js directly for password support (pdf-parse doesn't forward passwords correctly)
async function extractTextFast(file: FormidableFile, password?: string): Promise<string> {
  const data = await readFile(file)
  
  if (debugEnabled()) console.log('[AI Parse Debug] extractTextFast, password provided:', !!password)
  
  // For password-protected PDFs, we must use pdf.js directly
  // pdf-parse doesn't properly forward the password parameter to its internal pdf.js instance
  try {
    // Polyfill browser globals that pdf.js needs in Node.js environment
    if (typeof (global as any).DOMMatrix === 'undefined') {
      ;(global as any).DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        constructor() {}
      }
    }
    
    // Try to load pdf.js - prefer legacy build .mjs files for Node.js
    let pdfjsLib: any
    const attempts = [
      // Try dynamic import of legacy mjs (should work on Vercel)
      async () => {
        const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
        return mod.default || mod
      },
      // Try main package (may use modern build but we polyfilled DOMMatrix)
      async () => {
        const mod: any = await import('pdfjs-dist')
        return mod.default || mod
      },
      // Try require as last resort
      () => {
        try { return require('pdfjs-dist') } catch { return null }
      },
    ]
    
    for (const attempt of attempts) {
      try {
        if (debugEnabled()) console.log('[AI Parse Debug] Trying pdf.js load attempt')
        const lib = await attempt()
        if (lib && typeof lib.getDocument === 'function') {
          pdfjsLib = lib
          if (debugEnabled()) console.log('[AI Parse Debug] pdf.js loaded successfully')
          break
        }
      } catch (e: any) {
        if (debugEnabled()) console.log('[AI Parse Debug] Load attempt failed:', e?.message)
      }
    }
    
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
      throw new Error('pdf.js not available')
    }
    
    // Disable worker for serverless - provide a dummy path that won't be used due to disableWorker: true
    // pdf.js validates that workerSrc is set, even when worker is disabled
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.js'
    }

    
    if (debugEnabled()) console.log('[AI Parse Debug] pdf.js loaded successfully')
    
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(data),
      password: password || undefined,
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    })
    
    // Set up password callback if password provided
    if (password && typeof loadingTask.onPassword === 'function') {
      loadingTask.onPassword((updatePassword: (pw: string) => void, reason: number) => {
        if (debugEnabled()) console.log('[AI Parse Debug] onPassword callback triggered, reason:', reason)
        updatePassword(password)
      })
    }
    
    const pdfDocument = await loadingTask.promise
    let text = ''
    
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .filter(Boolean)
        .join(' ')
      text += (text ? '\n' : '') + pageText
    }
    
    if (debugEnabled()) console.log('[AI Parse Debug] Extracted text length:', text.length)
    
    if (!text.trim()) {
      throw new Error('PDF contains no extractable text')
    }
    
    return text
  } catch (e: any) {
    const name = e?.name || 'Error'
    const message = e?.message || String(e)
    console.error('[AI Parse Error] PDF extraction failed:', { name, message, passwordProvided: !!password })
    
    // Handle password-related errors
    if (name === 'PasswordException' || /password/i.test(message)) {
      if (!password) {
        throw new Error('This PDF is password-protected. Please provide the correct password and try again.')
      } else if (/incorrect/i.test(message) || /invalid/i.test(message)) {
        throw new Error('Incorrect password for this PDF.')
      } else {
        throw new Error('This PDF is password-protected. Please provide the correct password and try again.')
      }
    }
    
    if (/pdf\.js not available/i.test(message)) {
      throw new Error('PDF processing is temporarily unavailable. Please try uploading a CSV or XLSX file instead.')
    }
    
    // For other errors
    throw new Error('Could not extract text from PDF. The file may be corrupted or use an unsupported format.')
  }
}

// Structured text extraction using pdfjs positions to preserve columns (no redaction)
async function extractTextWithColumns(file: FormidableFile, password?: string): Promise<string> {
  const data = await readFile(file)
  let pdfjsLib: any
  try {
    pdfjsLib = await loadPdfjs()
  } catch (e) {
    // Fallback to fast extractor if pdfjs not available
    return extractTextFast(file, password)
  }
  const uint8Data = new Uint8Array(data)
  let pdfDocument: any
  try {
    const loadingTask: any = pdfjsLib.getDocument({
      data: uint8Data,
      password: password || undefined,
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    })
    if (password && typeof (loadingTask as any)?.onPassword === 'function') {
      loadingTask.onPassword((updatePassword: (pw: string) => void, _reason: number) => {
        updatePassword(password)
      })
    }
    pdfDocument = await loadingTask.promise
  } catch (e: any) {
    const msg = e?.message || ''
    if (/Password/i.test(msg) || e?.name === 'PasswordException') {
      if (/Incorrect/i.test(msg) || e?.code === 2) {
        throw new Error('Incorrect password for this PDF.')
      }
      throw new Error('This PDF is password-protected. Please provide the correct password and try again.')
    }
    throw e
  }
  const items: Array<{ text: string; x: number; y: number; width: number; height: number }> = []
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })
    for (const it of textContent.items) {
      if ('str' in it && it.str) {
        const tx = it.transform
        const x = tx[4]
        const y = viewport.height - tx[5]
        const width = it.width
        const height = it.height
        items.push({ text: it.str, x, y: y - height, width, height })
      }
    }
  }
  // Sort by rows then columns
  const sorted = items.sort((a, b) => {
    const dy = a.y - b.y
    if (Math.abs(dy) > 3) return dy
    return a.x - b.x
  })
  let text = ''
  let currentY = -999
  let line = ''
  let lastX = 0
  for (const it of sorted) {
    if (Math.abs(it.y - currentY) > 3) {
      if (line.trim()) text += line.trim() + '\n'
      line = ''
      lastX = 0
      currentY = it.y
    }
    const gap = it.x - lastX
    if (lastX > 0) {
      if (gap > 30) line += '  |  '
      else if (gap > 10) line += '  '
      else if (gap > 2) line += ' '
    }
    line += it.text
    lastX = it.x + it.width
  }
  if (line.trim()) text += line.trim() + '\n'
  return text
}

// Build a row/column grid from PDF text items preserving columns
async function extractRowsWithColumns(file: FormidableFile, password?: string): Promise<string[][]> {
  const data = await readFile(file)
  let pdfjsLib: any
  try {
    pdfjsLib = await loadPdfjs()
  } catch (e) {
    // Fallback to simple fast text => single-column rows
    const text = await extractTextFast(file, password)
    return text.split(/\r?\n/).map(l => [l])
  }
  const uint8Data = new Uint8Array(data)
  let pdfDocument: any
  try {
    const loadingTask: any = pdfjsLib.getDocument({
      data: uint8Data,
      password: password || undefined,
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    })
    if (password && typeof loadingTask?.onPassword === 'function') {
      loadingTask.onPassword((updatePassword: (pw: string) => void, _reason: number) => {
        updatePassword(password)
      })
    }
    pdfDocument = await loadingTask.promise
  } catch (e: any) {
    const msg = e?.message || ''
    if (/Password/i.test(msg) || e?.name === 'PasswordException') {
      if (/Incorrect/i.test(msg) || e?.code === 2) {
        throw new Error('Incorrect password for this PDF.')
      }
      throw new Error('This PDF is password-protected. Please provide the correct password and try again.')
    }
    throw e
  }
  type Item = { text: string; x: number; y: number; w: number; h: number }
  const items: Item[] = []
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })
    for (const it of textContent.items) {
      if ('str' in it && it.str) {
        const tx = it.transform
        const x = tx[4]
        const y = viewport.height - tx[5]
        items.push({ text: it.str, x, y: y - it.height, w: it.width, h: it.height })
      }
    }
  }
  // Group items into rows by y proximity
  const sorted = items.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x))
  const rows: Item[][] = []
  for (const it of sorted) {
    const last = rows[rows.length - 1]
    if (!last) rows.push([it])
    else {
      const yDiff = Math.abs(it.y - last[0].y)
      if (yDiff <= 3) last.push(it)
      else rows.push([it])
    }
  }
  // For each row, split into columns based on x gaps
  const result: string[][] = []
  for (const r of rows) {
    r.sort((a, b) => a.x - b.x)
    const cols: string[] = []
    let current = ''
    let lastX = 0
    for (let i = 0; i < r.length; i++) {
      const it = r[i]
      if (i === 0) {
        current = it.text
        lastX = it.x + it.w
        continue
      }
      const gap = it.x - lastX
      if (gap > 30) {
        // new column
        cols.push(current.trim())
        current = it.text
      } else if (gap > 10) {
        current += '  ' + it.text
      } else if (gap > 2) {
        current += ' ' + it.text
      } else {
        current += it.text
      }
      lastX = it.x + it.w
    }
    if (current.trim()) cols.push(current.trim())
    // Skip empty rows
    if (cols.some(c => c && c.trim().length > 0)) result.push(cols)
  }
  return result
}

// Extract rows/columns per page
async function extractPagesWithColumns(file: FormidableFile, password?: string): Promise<string[][][]> {
  const data = await readFile(file)
  let pdfjsLib: any
  try {
    pdfjsLib = await loadPdfjs()
  } catch (e) {
    // Fallback: single page with fast text
    const text = await extractTextFast(file, password)
    return [text.split(/\r?\n/).map(l => [l])]
  }
  const uint8Data = new Uint8Array(data)
  let pdfDocument: any
  try {
    const loadingTask: any = pdfjsLib.getDocument({
      data: uint8Data,
      password: password || undefined,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    })
    if (password && typeof loadingTask?.onPassword === 'function') {
      loadingTask.onPassword((updatePassword: (pw: string) => void, _reason: number) => {
        updatePassword(password)
      })
    }
    pdfDocument = await loadingTask.promise
  } catch (e: any) {
    const msg = e?.message || ''
    if (/Password/i.test(msg) || e?.name === 'PasswordException') {
      if (debugEnabled()) console.log('[AI Parse Debug] Password exception in extractPagesWithColumns:', { name: e?.name, message: msg, passwordProvided: !!password })
      if (/Incorrect/i.test(msg) || e?.code === 2) {
        throw new Error('Incorrect password for this PDF.')
      }
      throw new Error('This PDF is password-protected. Please provide the correct password and try again.')
    }
    throw e
  }
  const pages: string[][][] = []
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })
    type Item = { text: string; x: number; y: number; w: number; h: number }
    const items: Item[] = []
    for (const it of textContent.items) {
      if ('str' in it && it.str) {
        const tx = it.transform
        const x = tx[4]
        const y = viewport.height - tx[5]
        items.push({ text: it.str, x, y: y - it.height, w: it.width, h: it.height })
      }
    }
    // sort and build rows for this page
    const sorted = items.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x))
    const rowItems: Item[][] = []
    for (const it of sorted) {
      const last = rowItems[rowItems.length - 1]
      if (!last) rowItems.push([it])
      else {
        const yDiff = Math.abs(it.y - last[0].y)
        if (yDiff <= 3) last.push(it)
        else rowItems.push([it])
      }
    }
    const rows: string[][] = []
    for (const r of rowItems) {
      r.sort((a, b) => a.x - b.x)
      const cols: string[] = []
      let current = ''
      let lastX = 0
      for (let i = 0; i < r.length; i++) {
        const it = r[i]
        if (i === 0) {
          current = it.text
          lastX = it.x + it.w
          continue
        }
        const gap = it.x - lastX
        if (gap > 30) { cols.push(current.trim()); current = it.text }
        else if (gap > 10) current += '  ' + it.text
        else if (gap > 2) current += ' ' + it.text
        else current += it.text
        lastX = it.x + it.w
      }
      if (current.trim()) cols.push(current.trim())
      if (cols.some(c => c && c.trim().length > 0)) rows.push(cols)
    }
    pages.push(rows)
  }
  return pages
}

// Visual redaction (simplified): extract text with password support and return original buffer
// Note: pdf-lib cannot open encrypted PDFs reliably; we skip drawing and only return text+buffer.
async function redactPdfVisually(file: FormidableFile, password?: string): Promise<{ buffer: Buffer; text: string }> {
  const data = await readFile(file)
  // Try pdf-parse with password first
  try {
    const pdfParseMod: any = await import('pdf-parse')
    const pdfParse = pdfParseMod?.default || pdfParseMod
    const parsed = await pdfParse(data, password ? { password } : undefined)
    if (parsed && typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
      return { buffer: data, text: String(parsed.text) }
    }
  } catch (e) {
    // continue to pdfjs fallback
  }
  // Fallback to pdfjs with password
  try {
    const pdfjsLib: any = await loadPdfjs()
    const loadingTask: any = pdfjsLib.getDocument({
      data: new Uint8Array(data),
      password: password || undefined,
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    })
    if (password && typeof loadingTask?.onPassword === 'function') {
      loadingTask.onPassword((updatePassword: (pw: string) => void, _reason: number) => {
        updatePassword(password)
      })
    }
    const pdfDocument = await loadingTask.promise
    let text = ''
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const textContent = await page.getTextContent()
      const line = textContent.items
        .map((it: any) => ('str' in it && it.str ? it.str : ''))
        .filter(Boolean)
        .join(' ')
      text += (text ? '\n' : '') + line
    }
    return { buffer: data, text }
  } catch (e: any) {
    const msg = e?.message || ''
    if (/Password/i.test(msg) || e?.name === 'PasswordException') {
      if (/Incorrect/i.test(msg) || e?.code === 2) {
        throw new Error('Incorrect password for this PDF.')
      }
      throw new Error('This PDF is password-protected. Please provide the correct password and try again.')
    }
    if (debugEnabled()) console.error('[AI Parse Debug] pdfjs fallback failed in redactPdfVisually:', msg)
    throw new Error('PDF processing engine unavailable on this runtime')
  }
}

function prepareStatementText(input: string): string {
  // Normalize whitespace on each line and number them to help the model reference distinct occurrences
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
  // Handle parentheses negatives (e.g., (12.34))
  const isParenNeg = /^\(.*\)$/.test(raw)
  // Normalize unicode minus to ASCII hyphen
  const normalized = raw.replace(/[\u2212\u2012\u2013\u2014]/g, '-')
  // Remove currency symbols and thousands separators
  const cleaned = normalized.replace(/[^0-9.\-]/g, '')
  let num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  if (isParenNeg && num > 0) num = -num
  return num
}

// Server-side masking of common PII patterns before sending to external AI providers
function sanitizeTextForAI(text: string): string {
  let out = text
  // Emails
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
  // Credit card numbers (4x4) and long digit sequences (8+)
  out = out.replace(/\b(?:\d{4}[\s\-]?){3}\d{4}\b/g, '[CARD]')
  out = out.replace(/\b\d[\d\s\-]{7,}\b/g, '[NUM]')
  // Phone numbers
  out = out.replace(/\+?\d[\d\s\-()]{7,}\d/g, '[PHONE]')
  // Heuristic: redact values following common keys
  out = out.replace(/\b(Name|Customer|Holder|Owner)\s*:\s*[^\n]+/gi, (m) => m.replace(/:\s*[^\n]+$/, ': [REDACTED]'))
  // Custom extra words from env
  const extra = (process.env.AI_EXTRA_REDACT_WORDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const w of extra) {
    try {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      out = out.replace(re, '[REDACTED]')
    } catch {
      // ignore bad regex
    }
  }
  return out
}

async function callPerplexity(prompt: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<ParsedExpense[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY')

  // Instruct the model to return strict JSON matching our schema
  const system = `You are a finance assistant. Extract all expense transactions from provided bank/credit card statement text. Return structured JSON only. Do not include any personally identifiable information (PII) and do not extract account summaries.`
  const user = `The input below is a list of NUMBERED LINES from a bank/credit card statement (from an Excel/CSV export). Extract transactions strictly from these lines.\n\n${prompt}\n\nRules:\n- Output an "expenses" array that follows the order of the numbered lines. Do not sort or group.\n- Use ISO date YYYY-MM-DD. If two dates appear (e.g., transaction date and posting date), use the LATER/POSTED date for occurred_on. Do NOT put any dates in the note.\n- Currency codes must be ISO 4217 (e.g., CAD, USD, INR).\n- If merchant is missing, omit the field.\n- If payment method is missing, omit the field.\n- Category is optional; guess only if obvious, else omit.\n- Note content: Make it a short, human-friendly purpose (e.g., "Car rental", "Dinner at hotel"). Do NOT include any dates or phrases like "Transaction date ...; Posting date ..." in the note.\n- Signs: Purchases/charges must be positive; refunds/credits/reversals/cashbacks must be negative. There can be MANY negative transactions—do not drop them. Preserve minus signs and parentheses exactly.\n- Include very small amounts.\n- Only extract transactions explicitly present in the lines. Do not infer, summarize, or aggregate.\n- IMPORTANT: If the same date/merchant/amount appears as separate numbered lines multiple times, output SEPARATE objects for each occurrence with its line_index. Do NOT deduplicate or merge counts.\n- Include "line_index" for each transaction: the NUMBER (1-based) of the line that contains the amount/transaction.\n- Output must conform to the provided JSON schema.`
      
  // Perplexity API: we assume OpenAI-compatible endpoint for chat completions
  const url = 'https://api.perplexity.ai/chat/completions'
  const model = process.env.PERPLEXITY_MODEL || 'sonar'
  if (debugEnabled()) console.log('[AI Parse Debug] calling Perplexity', { promptHash: hashOf(prompt), chars: prompt.length })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 45000)
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
        }
      },
    }),
    signal: opts?.signal ?? controller.signal,
  })
  clearTimeout(timeout)

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Perplexity API error: ${resp.status} ${text}`)
  }
  const json = await resp.json()
  if (debugEnabled()) console.log('[AI Parse Debug] Perplexity response meta', {
    usage: json?.usage,
    choices: Array.isArray(json?.choices) ? json.choices.length : 0,
    contentType: typeof json?.choices?.[0]?.message?.content,
    contentLength: String(json?.choices?.[0]?.message?.content || '').length,
  })
  const content = json?.choices?.[0]?.message?.content || '{}'
  let parsed: any
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content
  } catch (e) {
    throw new Error('Model returned non-JSON output')
  }
  const expenses: any[] = Array.isArray(parsed?.expenses) ? parsed.expenses : []
  if (debugEnabled()) console.log('[AI Parse Debug] Perplexity expenses count', expenses.length)
  // Basic sanitization
  return expenses
    .map((e) => {
      // Coerce amount preserving sign, supporting strings and parentheses
      const parsedAmount = parseAmountMaybeString((e as any).amount)
      let amt = typeof (e as any).amount === 'number' ? (e as any).amount : (parsedAmount ?? NaN)
      const noteLower = String((e as any).note || '').toLowerCase()
      const merchantLower = String((e as any).merchant || '').toLowerCase()
      // Direction provided by the model (optional)
      const direction = String((e as any).direction || '').toLowerCase()
      
      // Check if this is an investment/savings transaction (should remain positive as expense)
      const isInvestmentOrSavings = /(investment|invest|savings|save|transfer.*deposit|special deposit|rrsp|tfsa|401k|ira|mutual fund|stock|bond|etf)/i.test(`${noteLower} ${merchantLower}`)
      
      // Expanded heuristic: refund/credit-like indicators (but exclude investments)
      const refundLike = !isInvestmentOrSavings && /(refund|refunded|credit|cr\b|reversal|chargeback|payment received|cashback|return|deposit credit|adjustment credit|credit interest|rebate|reimbursement)/i.test(`${noteLower} ${merchantLower}`)
      
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

function chunkText(text: string, maxLen = 8000): string[] {
  // Chunk on line boundaries so we don't split a numbered line across chunks
  const chunks: string[] = []
  const lines = text.split(/\n/)
  let current = ''
  for (const line of lines) {
    const toAdd = (current ? '\n' : '') + line
    if (current.length + toAdd.length > maxLen) {
      if (current) chunks.push(current)
      // If a single line is longer than maxLen, hard-split it to avoid infinite loop
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

function dedupeExpenses(rows: (ParsedExpense & { _srcChunk?: number })[]): (ParsedExpense & { _srcChunk?: number })[] {
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/\d+/g, '')
      .replace(/[^A-Z]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const refundLike = (r: ParsedExpense) =>
    /(REFUND|CREDIT|REVERSAL|CHARGEBACK|CASHBACK|RETURN|DEPOSIT CREDIT|ADJUSTMENT CREDIT|CREDIT INTEREST|REBATE|REIMBURSEMENT)/i.test(`${r.merchant || ''} ${r.note || ''}`)

  type Key = string
  const groups = new Map<Key, ParsedExpense & { _srcChunk?: number }>()

  for (const r of rows) {
    const date = (r.occurred_on || '').slice(0, 10)
    const currency = (r.currency || '').toUpperCase()
    const amount = Number(r.amount)
    const amountCentsAbs = Math.round(Math.abs(amount) * 100)
    const merchantNorm = r.merchant ? norm(r.merchant).slice(0, 24) : ''
    const noteNorm = r.note ? norm(r.note).slice(0, 24) : ''
    const ident = merchantNorm || noteNorm || ''
    const keyAbs = `${date}|${currency}|${amountCentsAbs}|${ident}`
    const lineIdx = Number.isFinite(Number((r as any).line_index)) ? Number((r as any).line_index) : undefined
    // If line_index is available (global numbering), use it to avoid collapsing distinct occurrences
    const key = `${lineIdx ?? 'N'}|${keyAbs}`

    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...r })
      continue
    }

    // Choose better between existing and r
    const pick = (a: ParsedExpense & { _srcChunk?: number }, b: ParsedExpense & { _srcChunk?: number }): ParsedExpense & { _srcChunk?: number } => {
      const aNeg = Number(a.amount) < 0
      const bNeg = Number(b.amount) < 0
      const aRefund = refundLike(a)
      const bRefund = refundLike(b)
      const aDir = ((a as any).direction || '').toString()
      const bDir = ((b as any).direction || '').toString()
      const aHasDir = !!aDir
      const bHasDir = !!bDir
      const aChunk = a._srcChunk || 0
      const bChunk = b._srcChunk || 0
      // If only one is refund-like, prefer that one's sign semantics
      if (aRefund !== bRefund) return aRefund ? (aNeg ? a : { ...a, amount: -Math.abs(Number(a.amount)) }) : (bNeg ? b : { ...b, amount: -Math.abs(Number(b.amount)) })
      // Prefer the one that has explicit direction from the model
      if (aHasDir !== bHasDir) return aHasDir ? a : b
      // If signs differ and refund-like or typical semantics suggest preference
      if (aNeg !== bNeg) {
        // Prefer negative if refund-like, else prefer positive
        const preferNegative = aRefund || bRefund
        if (preferNegative) return aNeg ? a : b
        return aNeg ? b : a
      }
      // Prefer with merchant present
      if (!!a.merchant !== !!b.merchant) return a.merchant ? a : b
      // Prefer with note present
      if (!!a.note !== !!b.note) return a.note ? a : b
      // Prefer with category present
      if (!!a.category !== !!b.category) return a.category ? a : b
      // Finally prefer later chunk as it tends to be more accurate per your logs
      if (aChunk !== bChunk) return aChunk > bChunk ? a : b
      // Otherwise keep the existing
      return a
    }

    const chosen = pick(existing, r)
    groups.set(key, chosen)
  }

  // Return one item per unique (line_index + key) group
  return Array.from(groups.values())
}

// --- Local-only heuristic parser: no external calls ---
function parseLocalExpenses(preparedText: string): ParsedExpense[] {
  const lines = preparedText.split(/\n/)
  // Detect global currency from full text
  const detectGlobalCurrency = (txt: string): string => {
    const lc = txt.toLowerCase()
    const score: Record<string, number> = { USD: 0, CAD: 0, EUR: 0, GBP: 0, INR: 0, AUD: 0 }
    const inc = (k: keyof typeof score, n = 1) => (score[k] += n)
    // Symbols
    if (/\$/.test(txt)) { inc('USD', 1); inc('CAD', 1); inc('AUD', 1) }
    if (/€/.test(txt)) inc('EUR', 3)
    if (/£/.test(txt)) inc('GBP', 3)
    if (/₹/.test(txt)) inc('INR', 5)
    // Codes and symbol variants
    const addCount = (re: RegExp, k: keyof typeof score, w = 2) => {
      const m = lc.match(re)
      if (m) inc(k, m.length * w)
    }
    addCount(/\bcad\b/g, 'CAD', 4)
    addCount(/\busd\b/g, 'USD', 4)
    addCount(/\beur\b/g, 'EUR', 4)
    addCount(/\bgbp\b/g, 'GBP', 4)
    addCount(/\binr\b/g, 'INR', 4)
    addCount(/\baud\b/g, 'AUD', 4)
    addCount(/\bcanadian\b/g, 'CAD', 2)
    addCount(/\bamerican\b|\bus\b/g, 'USD', 1)
    // Country cues
    addCount(/toronto|ontario|canada|cad\$/g, 'CAD', 2)
    addCount(/usa|united states|usd\$/g, 'USD', 2)
    // Choose max
    let best: keyof typeof score = 'USD'
    for (const k of Object.keys(score) as (keyof typeof score)[]) {
      if (score[k] > score[best]) best = k
    }
    return best
  }

  const detectLineCurrency = (s: string, fallback: string): string => {
    const u = s.toUpperCase()
    if (/(^|\s)CAD(\s|$)|C\$/.test(u)) return 'CAD'
    if (/(^|\s)USD(\s|$)|US\$/.test(u)) return 'USD'
    if (/(^|\s)EUR(\s|$)|€/.test(u)) return 'EUR'
    if (/(^|\s)GBP(\s|$)|£/.test(u)) return 'GBP'
    if (/(^|\s)INR(\s|$)|₹/.test(u)) return 'INR'
    if (/(^|\s)AUD(\s|$)|A\$/.test(u)) return 'AUD'
    return fallback
  }

  const globalCurrency = detectGlobalCurrency(preparedText)
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  }
  const currentYear = new Date().getFullYear()

  const toISO = (y: number, m: number, d: number) => {
    const mm = String(m).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }

  const parseDate = (s: string): string | null => {
    // YYYY-MM-DD
    const iso = s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
    if (iso) {
      const y = Number(iso[1]); const m = Number(iso[2]); const d = Number(iso[3])
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return toISO(y, m, d)
    }
    // DD Mon or Mon DD (optionally with year)
    const mon1 = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})(?:[,\s]+(20\d{2}))?\b/)
    if (mon1) {
      const d = Number(mon1[1]); const mon = mon1[2].slice(0,3).toLowerCase(); const y = mon1[3] ? Number(mon1[3]) : currentYear
      const m = monthMap[mon]
      if (m && d >= 1 && d <= 31) return toISO(y, m, d)
    }
    const mon2 = s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:[,\s]+(20\d{2}))?\b/)
    if (mon2) {
      const mon = mon2[1].slice(0,3).toLowerCase(); const d = Number(mon2[2]); const y = mon2[3] ? Number(mon2[3]) : currentYear
      const m = monthMap[mon]
      if (m && d >= 1 && d <= 31) return toISO(y, m, d)
    }
    // DD/MM/YYYY or MM/DD/YYYY (ambiguous) – assume first is day if >12
    const slash = s.match(/\b(\d{1,2})[\/](\d{1,2})[\/](20\d{2})\b/)
    if (slash) {
      let a = Number(slash[1]); let b = Number(slash[2]); const y = Number(slash[3])
      let d: number, m: number
      if (a > 12) { d = a; m = b } else if (b > 12) { d = b; m = a } else { d = a; m = b }
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return toISO(y, m, d)
    }
    return null
  }

  const extractAmount = (s: string): number | null => {
    // Ignore exchange rate contexts
    const lower = s.toLowerCase()
    const tokens = Array.from(s.matchAll(/\$?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\$?\d+\.\d{2}\)?/g)).map(m => m[0])
    if (!tokens.length) return null
    // Filter out values near 'exchange rate'
    const filtered = tokens.filter(t => !/exchange rate/i.test(lower))
    const pick = (filtered.length ? filtered : tokens)
    // Heuristic: if multiple, prefer the one not at end of line (to avoid balances)
    let cand = pick[0]
    if (pick.length >= 2) {
      // choose the token closest to middle of the string
      const mids = pick.map(t => Math.abs(s.indexOf(t) - s.length / 2))
      cand = pick[mids.indexOf(Math.min(...mids))]
    }
    // Normalize
    const isParen = /^\(.*\)$/.test(cand)
    cand = cand.replace(/[,$]/g, '').replace(/^\$/, '').replace(/^\(/, '').replace(/\)$/, '')
    const n = Number(cand)
    if (!Number.isFinite(n)) return null
    return isParen ? -Math.abs(n) : n
  }

  const cleanupMerchant = (s: string): string => {
    // Remove long numeric codes and extra spaces
    let out = s
      .replace(/\b\d{7,}\b/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    // Remove common noise words
    out = out.replace(/\b(TRANSACTION DATE|POSTING DATE|ACTIVITY DESCRIPTION|WITHDRAWALS?|DEPOSITS?|BALANCE|FOREIGN CURRENCY|EXCHANGE RATE|VISA DEBIT PURCHASE|INTERAC|CONTACTLESS|ATM WITHDRAWAL|AUTOMATIC PAYMENT|MISC PAYMENT)\b/ig, '').trim()
    // Limit length
    if (out.length > 64) out = out.slice(0, 64)
    return out || undefined as any
  }

  const results: ParsedExpense[] = []
  const refundLikeRe = /(refund|refunded|credit\b|cr\b|reversal|chargeback|payment received|cashback|return|deposit credit|adjustment credit|credit interest|rebate|reimbursement)/i
  for (const line of lines) {
    // Expect lines like: `12. JUN 28 | JUN 30 | MERCHANT | $109.61`
    const m = line.match(/^\s*(\d+)\.\s*(.*)$/)
    const body = m ? m[2] : line
    const lineIndex = m ? Number(m[1]) : undefined

    const date = parseDate(body)
    const amt = extractAmount(body)
    if (amt === null || !date) continue
    // Determine sign
    let signedAmt = amt
    const hasExplicitMinus = /(^|\s)[-]?(\$)?\d[\d,]*\.\d{2}/.test(body) && /-\s*\$?\d/.test(body)
    const refundLike = refundLikeRe.test(body)
    if (hasExplicitMinus || refundLike) {
      signedAmt = -Math.abs(amt)
    }
    // Derive merchant: remove date and amount tokens from body
    let merchantRaw = body
    const dateIso = date
    // remove obvious date substrings
    merchantRaw = merchantRaw.replace(/\b(\d{1,2}\s+[A-Za-z]{3,9}|[A-Za-z]{3,9}\s+\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/]\d{1,2}[\/]20\d{2})\b/g, ' ')
    // remove amount-like tokens
    merchantRaw = merchantRaw.replace(/\$?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\$?\d+\.\d{2}\)?/g, ' ')
    const merchant = cleanupMerchant(merchantRaw)

    results.push({
      amount: signedAmt,
      currency: detectLineCurrency(body, globalCurrency),
      merchant,
      occurred_on: dateIso,
      note: undefined,
      category: undefined,
      line_index: lineIndex,
    })
  }
  return results
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PDF-Password')

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
    const { files, fields } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err: Error | null, fields: formidable.Fields, files: formidable.Files) => {
        if (err) return reject(err)
        resolve({ fields, files })
      })
    })

    const file = (files?.file || files?.pdf || files?.statement) as FormidableFile | FormidableFile[] | undefined
    const selected = Array.isArray(file) ? file[0] : file
    const textFieldRaw = (fields && (fields as any).text) as any
    const textField = Array.isArray(textFieldRaw) ? textFieldRaw[0] : textFieldRaw
    if (!selected && !(typeof textField === 'string' && textField.trim())) {
      return res.status(400).json({ success: false, error: 'No file uploaded and no text provided. Upload a PDF using field "file" or provide a "text" field.' })
    }

    // Optional password from query, form, or header (prefer query on Vercel; headers can be mutated)
    const providedPassword = (() => {
      const fq = req.query || {}
      const qpw = Array.isArray(fq.password) ? fq.password[0] : fq.password
      const fpw = (fields && (fields as any).password) as any
      const fpwVal = Array.isArray(fpw) ? fpw[0] : fpw
      
      // Try multiple header variations (Vercel might lowercase them)
      let hpw: string | undefined
      for (const key of Object.keys(req.headers)) {
        if (key.toLowerCase() === 'x-pdf-password') {
          const val = req.headers[key]
          hpw = Array.isArray(val) ? val[0] : val
          break
        }
      }
      
      // Debug logging for Vercel environment
      console.log('[Password Debug] Sources:', {
        query: qpw ? `present (${String(qpw).length} chars)` : 'missing',
        formField: fpwVal ? `present (${String(fpwVal).length} chars)` : 'missing',
        header: hpw ? `present (${String(hpw).length} chars)` : 'missing',
        chosen: ((): string => {
          if (typeof qpw === 'string' && qpw.trim()) return 'query'
          if (typeof fpwVal === 'string' && fpwVal.trim()) return 'form'
          if (typeof hpw === 'string' && hpw.trim()) return 'header'
          return 'none'
        })(),
        allHeaders: Object.keys(req.headers).filter(k => /password/i.test(k))
      })
      
      // Prefer query string first, then form field, then header (custom headers may be altered by proxies)
      if (typeof qpw === 'string' && qpw.trim()) return qpw.trim()
      if (typeof fpwVal === 'string' && fpwVal.trim()) return fpwVal.trim()
      if (typeof hpw === 'string' && hpw.trim()) return hpw.trim()
      return undefined
    })()
    if (debugEnabled()) console.log('[AI Parse Debug] Password provided:', providedPassword ? `yes (${providedPassword.length} chars)` : 'no')

    // Flags from querystring
    const q = req.query || {}
    const redactEnvDefault = process.env.AI_DEFAULT_REDACT === '1'
    const redactFlag = (Array.isArray(q.redact) ? q.redact[0] : q.redact) === '1' || redactEnvDefault
    // Masking ON by default unless explicitly disabled
    const maskFlag = (Array.isArray(q.mask) ? q.mask[0] : q.mask) !== '0'

    // Build an Excel-like table from rows/columns for higher model accuracy
    // Build per-page table text for higher recall
    let pagesTables: string[] = []
    if (typeof textField === 'string' && textField.trim()) {
      // Client-side provided text; trust it and skip PDF engines
      if (debugEnabled()) console.log('[AI Parse Debug] using provided text field; skipping PDF engines')
      const t = textField.trim()
      const masked = maskFlag ? sanitizeTextForAI(t) : t
      pagesTables = [prepareStatementText(masked)]
    } else if (selected) {
      if (redactFlag) {
        if (debugEnabled()) console.log('[AI Parse Debug] using visual PDF redaction mode')
        const out = await redactPdfVisually(selected, providedPassword)
        const prepared = prepareStatementText(maskFlag ? sanitizeTextForAI(out.text) : out.text)
        pagesTables = [prepared]
      } else {
        if (debugEnabled()) console.log('[AI Parse Debug] extracting per-page rows/columns grid for table text')
        const pages = await extractPagesWithColumns(selected, providedPassword)
        pagesTables = pages.map((grid, i) => {
          const t = grid.map(row => row.map(c => String(c ?? '').trim()).join(' | ')).join('\n')
          const masked = maskFlag ? sanitizeTextForAI(t) : t
          return prepareStatementText(masked)
        })
      }
    }
    const preparedAll = pagesTables.join('\n')
    if (debugEnabled()) console.log('[AI Parse Debug] prepared text length:', preparedAll.length)
    if (!preparedAll || !preparedAll.trim()) {
      return res.status(400).json({ success: false, error: 'Could not extract text from PDF' })
    }

    // Preview mode: return only metadata and the numbered text (no external AI call)
    const previewFlag = Array.isArray(q.preview) ? q.preview[0] : q.preview
    if (previewFlag === '1') {
      if (debugEnabled()) console.log('[AI Parse Debug] preview requested.')
      return res.status(200).json({
        success: true,
        expenses: [],
        usage: {
          preview: {
            promptHash: hashOf(preparedAll),
            length: preparedAll.length,
            // Provide a very small head/tail sample to inspect redaction without dumping full content
            head: preparedAll.slice(0, 400),
            tail: preparedAll.length > 800 ? preparedAll.slice(-400) : undefined,
          }
        }
      })
    }

  // Always use external AI (masked by default); local parser is not used unless we add a failure fallback

    // Optionally chunk long texts
    // Process in chunks to avoid missing later pages; merge & dedupe
    // Prefer a single full-text call to avoid double extraction across chunks when within size limits
    // External path:
    // Call the model per page and merge, avoiding over-aggregation
    const all: (ParsedExpense & { _srcChunk?: number })[] = []
    for (let i = 0; i < pagesTables.length; i++) {
      const prepared = pagesTables[i]
      if (!prepared || !prepared.trim()) continue
      if (debugEnabled()) console.log(`[AI Parse Debug] page ${i+1}/${pagesTables.length} length`, prepared.length)
      // If page content is long, chunk within the page as last resort
      if (prepared.length <= 20000) {
        try {
          const part = await callPerplexity(prepared, { timeoutMs: 35000 })
          all.push(...part.map(p => ({ ...p, _srcChunk: i + 1 })))
        } catch (e: any) {
          // Fallback to intra-page chunks
          const chunks = chunkText(prepared, 6000)
          for (const c of chunks) {
            try {
              const sub = await callPerplexity(c, { timeoutMs: 25000 })
              all.push(...sub.map(p => ({ ...p, _srcChunk: i + 1 })))
            } catch (err) {
              console.warn(`[AI Parse Warn] page ${i+1} sub-chunk failed:`, err instanceof Error ? err.message : err)
            }
          }
        }
      } else {
        const chunks = chunkText(prepared, 6000)
        for (const c of chunks) {
          try {
            const sub = await callPerplexity(c, { timeoutMs: 25000 })
            all.push(...sub.map(p => ({ ...p, _srcChunk: i + 1 })))
          } catch (err) {
            console.warn(`[AI Parse Warn] page ${i+1} chunk failed:`, err instanceof Error ? err.message : err)
          }
        }
      }
    }
    // Do not dedupe across pages to avoid collapsing similar rows on different pages
    const cleaned = all.map(({ _srcChunk, ...rest }) => rest)
    return res.status(200).json({ success: true, expenses: cleaned })
  } catch (e: any) {
    console.error('parse-statement error', e)
    const msg = e?.message || ''
    if (/password-protected/i.test(msg) || /PasswordException/i.test(String(e?.name)) || /password/i.test(msg)) {
      return res.status(400).json({ success: false, error: 'This PDF is password-protected. Please provide the correct password and try again.' })
    }
    if (/pdf processing engine unavailable/i.test(msg) || /pdfjs not available/i.test(msg)) {
      // Surface a friendlier message rather than 500
      return res.status(400).json({ success: false, error: 'We could not read this PDF on the current server environment. Please try uploading a non-password-protected copy or export a CSV/XLSX instead.' })
    }
    return res.status(500).json({ success: false, error: msg || 'Internal Error' })
  }
}
