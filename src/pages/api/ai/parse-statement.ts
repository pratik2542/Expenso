import type { NextApiRequest, NextApiResponse } from 'next'
import formidable, { File as FormidableFile } from 'formidable'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { PDFDocument, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs'

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

// Visual redaction: overlay black boxes on PII while preserving layout
async function redactPdfVisually(file: FormidableFile): Promise<{ buffer: Buffer; text: string }> {
  try {
    const data = await readFile(file)
    
    // Convert Buffer to Uint8Array for pdfjs-dist
    const uint8Data = new Uint8Array(data)
    
    // Load with pdfjs to get text positions (more forgiving of PDF issues)
    // Configure pdfjs for Node.js environment (disable workers)
    const loadingTask = pdfjsLib.getDocument({ 
      data: uint8Data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0, // Suppress warnings
    })
    const pdfDocument = await loadingTask.promise
    
    if (debugEnabled()) {
      console.log('[AI Parse Debug] PDF loaded with pdfjs:', pdfDocument.numPages, 'pages')
    }
    
    // Try to load with pdf-lib for redaction (may fail on corrupted PDFs)
    let pdfDoc: PDFDocument | null = null
    try {
      pdfDoc = await PDFDocument.load(data, { 
        ignoreEncryption: true,
        updateMetadata: false,
      })
      if (debugEnabled()) {
        console.log('[AI Parse Debug] PDF loaded with pdf-lib for redaction')
      }
    } catch (pdfLibError) {
      if (debugEnabled()) {
        console.log('[AI Parse Debug] pdf-lib failed to load PDF (will skip visual redaction):', pdfLibError instanceof Error ? pdfLibError.message : 'Unknown error')
      }
      // Continue without visual redaction - just extract text
    }
  
  const allTextItems: Array<{
    text: string
    x: number
    y: number
    width: number
    height: number
    pageIndex: number
  }> = []
  
  // Extract text with positions from all pages
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })
    
    for (const item of textContent.items) {
      if ('str' in item && item.str) {
        const tx = item.transform
        const x = tx[4]
        const y = viewport.height - tx[5] // Flip Y for pdf-lib coordinate system
        const width = item.width
        const height = item.height
        
        allTextItems.push({
          text: item.str,
          x,
          y: y - height, // Adjust for baseline
          width,
          height,
          pageIndex: pageNum - 1
        })
      }
    }
  }
  
  // Patterns to redact
  const piiPatterns = [
    // Account numbers (8+ digits possibly with spaces/dashes)
    /\b\d[\d\s\-]{7,}\d\b/,
    // Email addresses
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    // Phone numbers
    /\+?\d[\d\s\-()]{7,}\d/,
    // Credit card patterns (4 groups of 4 digits)
    /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/,
  ]
  
  // Check for custom redaction words from env
  const customWords = (process.env.AI_EXTRA_REDACT_WORDS || '').split(',').map(s => s.trim()).filter(Boolean)
  
  const toRedact: typeof allTextItems = []
  
  for (const item of allTextItems) {
    let shouldRedact = false
    
    // Check patterns
    for (const pattern of piiPatterns) {
      if (pattern.test(item.text)) {
        shouldRedact = true
        break
      }
    }
    
    // Check custom words
    if (!shouldRedact) {
      for (const word of customWords) {
        if (item.text.toLowerCase().includes(word.toLowerCase())) {
          shouldRedact = true
          break
        }
      }
    }
    
    // Check for potential names (heuristic: capitalized words after "Name:" or similar)
    if (!shouldRedact && /^(name|customer|holder|owner):/i.test(item.text)) {
      shouldRedact = true
    }
    
    if (shouldRedact) {
      toRedact.push(item)
    }
  }
  
  // Draw black rectangles over PII (only if pdf-lib loaded successfully)
  let buffer = Buffer.from('')
  
  if (pdfDoc) {
    try {
      const pages = pdfDoc.getPages()
      for (const item of toRedact) {
        const page = pages[item.pageIndex]
        if (!page) continue
        
        const { height: pageHeight } = page.getSize()
        
        // Add padding to cover text completely
        const padding = 2
        page.drawRectangle({
          x: item.x - padding,
          y: pageHeight - item.y - item.height - padding, // Convert back to PDF coordinate system
          width: item.width + padding * 2,
          height: item.height + padding * 2,
          color: rgb(0, 0, 0), // Black
        })
      }
      
      // Save redacted PDF
      const redactedBytes = await pdfDoc.save()
      buffer = Buffer.from(redactedBytes)
      
      if (debugEnabled()) {
        console.log('[AI Parse Debug] Visual redaction complete, redacted', toRedact.length, 'items')
      }
    } catch (redactError) {
      // PDF structure is too corrupted for redaction - continue anyway
      if (debugEnabled()) {
        console.log('[AI Parse Debug] Failed to apply visual redaction (corrupted PDF structure):', redactError instanceof Error ? redactError.message : 'Unknown error')
      }
    }
  } else {
    if (debugEnabled()) {
      console.log('[AI Parse Debug] Skipping visual redaction (pdf-lib unavailable)')
    }
  }
  
    // Extract text preserving table structure using positions
    // Sort all items by Y position first, then X position
    const sortedItems = [...allTextItems].sort((a, b) => {
      const yDiff = a.y - b.y
      if (Math.abs(yDiff) > 3) return yDiff // Different rows
      return a.x - b.x // Same row, sort by X
    })
    
    let text = ''
    let currentY = -999
    let lineText = ''
    let lastX = 0
    
    for (const item of sortedItems) {
      // Check if this is a new line (Y position changed by more than 3 pixels)
      if (Math.abs(item.y - currentY) > 3) {
        // Save previous line
        if (lineText.trim()) {
          text += lineText.trim() + '\n'
        }
        lineText = ''
        lastX = 0
        currentY = item.y
      }
      
      // Check if this item was redacted
      const wasRedacted = toRedact.some(
        r => r.pageIndex === item.pageIndex && 
             Math.abs(r.x - item.x) < 1 && 
             Math.abs(r.y - item.y) < 1
      )
      
      // Add spacing based on horizontal gap (preserve columns)
      const gap = item.x - lastX
      if (lastX > 0) {
        if (gap > 30) {
          // Large gap = new column
          lineText += '  |  ' // Column separator with marker
        } else if (gap > 10) {
          lineText += '  ' // Medium gap = column
        } else if (gap > 2) {
          lineText += ' ' // Small gap = space between words
        }
      }
      
      if (wasRedacted) {
        lineText += '[REDACTED]'
      } else {
        lineText += item.text
      }
      
      lastX = item.x + item.width
    }
    
    // Don't forget the last line
    if (lineText.trim()) {
      text += lineText.trim() + '\n'
    }
    
    return { buffer, text }
  } catch (error) {
    console.error('[Visual Redaction Error]', error)
    
    // Provide user-friendly error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    if (errorMessage.includes('encrypted') || errorMessage.includes('password')) {
      throw new Error('PDF is password-protected. Please remove the password and try again.')
    } else if (errorMessage.includes('Invalid PDF')) {
      throw new Error('Invalid or corrupted PDF file. Please try downloading it again from your bank.')
    } else if (errorMessage.includes('Cannot read')) {
      throw new Error('Unable to read PDF file. The file may be corrupted.')
    }
    
    // Generic error for unknown issues
    throw new Error(`Failed to process PDF: ${errorMessage}`)
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

async function callPerplexity(prompt: string): Promise<ParsedExpense[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY')

  // Instruct the model to return strict JSON matching our schema
  const system = `You are an expert financial data extraction AI with 99.9% accuracy. Your specialty is parsing bank statements with perfect precision. CRITICAL: Every digit matters - 29.10 is NOT 1, and 1,900.00 is NOT missing!`
  const user = `Extract ALL transactions from this bank/credit card statement with PERFECT ACCURACY. Every digit, decimal, merchant name, and date must be EXACT.

${prompt}

⚠️ CRITICAL EXTRACTION RULES - UNIVERSAL FOR ALL STATEMENT FORMATS:

📋 STATEMENT FORMATS YOU MIGHT SEE:

**Format A - Horizontal Table:**
Date | Description | Withdrawals | Deposits | Balance
2 Jul | e-Transfer sent | 1,900.00 | | 3,822.53

**Format B - Vertical Columns:**
TRANSACTION DATE | POSTING DATE | ACTIVITY DESCRIPTION | AMOUNT ($)
JUN 28 | JUN 30 | LS 1000384172 ONTARIO | $109.61
JUL 01 | JUL 03 | PRESTO FARE/PGN87JJGN8 | $3.30

**Format C - Free-form:**
16 Apr ATMwithdrawal - TQ242986 880.00 1,103.38

🎯 HOW TO IDENTIFY THE AMOUNT (WORKS FOR ALL FORMATS):

✅ Amount characteristics:
- Has a dollar sign ($) OR decimal point with exactly 2 digits (.00, .50, .99)
- Format: X.XX or $X.XX or ($X.XX) for negatives
- May have comma separators: 1,234.56 or $1,234.56
- Negative amounts may use minus (-) or parentheses ()

❌ NOT amounts (ignore these):
- Long numeric codes: 74099865179000006074049 (no decimals, too many digits)
- Reference numbers after dashes: - TQ242986, - 2184
- Account numbers: usually 4-16 digits without decimals
- Exchange rates: "Exchange rate - 1.410594" (has context words)
- Phone numbers: 703-889-2611
- Postal codes: ON, QC
- Balance (if shown) is usually the LAST number on the line

📝 AMOUNT EXTRACTION STEP-BY-STEP:

Step 1: Find all numbers with decimals (X.XX format) or dollar signs ($)
Step 2: Eliminate reference codes (long numbers, alphanumeric, no decimals)
Step 3: Eliminate exchange rates (look for "exchange rate" text nearby)
Step 4: The number marked "AMOUNT" or in the amount column = transaction amount
Step 5: Copy EXACTLY as shown - preserve ALL digits

🔍 CONCRETE EXAMPLES - STUDY THESE:

Example 1 - Vertical format:
"JUN 28  |  JUN 30  |  LS 1000384172 ONTARIO BRAMPTON ON 74099865179000006074049  |  $109.61"
- "74099865179000006074049" = transaction code (20 digits, no decimals)
- "$109.61" = AMOUNT (has $ and decimals)
✅ CORRECT: amount = 109.61, merchant = "LS 1000384172 ONTARIO"

Example 2 - Foreign currency:
"JUL 01  |  JUL 02  |  CSRA US*EMBASSY MRV 703-889-2611 QC 74703405182100564989196 Foreign Currency - USD 185.00 Exchange rate - 1.410594  |  $260.96"
- "185.00" = foreign amount (ignore, not the charged amount)
- "1.410594" = exchange rate (ignore)
- "$260.96" = ACTUAL AMOUNT CHARGED (in your currency)
✅ CORRECT: amount = 260.96, merchant = "US*EMBASSY MRV"

Example 3 - Payment/credit:
"JUL 16  |  JUL 16  |  AUTOMATIC PAYMENT -THANK YOU  |  -$22.66"
- "-$22.66" = negative amount (payment received/credit)
✅ CORRECT: amount = -22.66 (negative), merchant = "AUTOMATIC PAYMENT"

Example 4 - Small amounts (don't confuse with "1"):
"JUL 01  |  JUL 03  |  PRESTO FARE/PGN87JJGN8 TORONTO ON 74064495183820144492402  |  $3.30"
- "74064495183820144492402" = transaction code
- "$3.30" = AMOUNT
✅ CORRECT: amount = 3.30
❌ WRONG: amount = 1 (where did this come from?)

🚨 CRITICAL ACCURACY RULES:

1. **Extract EVERY transaction** - even duplicates, even if same merchant/amount
2. **Preserve ALL digits** - 109.61 is NOT 109.6, 3.30 is NOT 3.3
3. **Check the format** - Look for $ symbol or "AMOUNT" column header
4. **Ignore codes** - Long numbers without decimals are NOT amounts
5. **Foreign currency** - Use the final charged amount (after exchange rate)
6. **Negative amounts** - Preserve the minus sign or note it's a credit

⚡ MERCHANT NAME EXTRACTION:

- Remove transaction codes (numeric strings)
- Remove location info (city names, ON, QC, postal codes)
- Remove reference codes after slashes (PRESTO FARE/PGN87JJGN8 → "PRESTO FARE")
- Keep the core business name: "LS 1000384172 ONTARIO" → "LS ONTARIO"

📅 DATE EXTRACTION:

- Use the TRANSACTION DATE (first date) if two dates shown
- Format as YYYY-MM-DD
- If year not shown, infer from context (use current or statement year)

⚠️ CRITICAL RULES - READ CAREFULLY:

1. AMOUNT EXTRACTION - ZERO TOLERANCE FOR ERRORS:
   
   ❌ COMMON MISTAKES TO AVOID:
   - 800.00 extracted as 80.00 (missing a zero) - WRONG!
   - 880.00 extracted as 88.00 or 100.00 - WRONG!
   - Using reference numbers as amounts - WRONG!
   - Using balance as amount - WRONG!
   
   ✅ HOW TO EXTRACT CORRECTLY:
   - Copy the EXACT number with ALL digits preserved
   - Amounts in statements ALWAYS have 2 decimal places: .00 or .XX
   - Look in the Withdrawal/Debit column (middle section of line)
   - Numbers after dashes are reference codes, NOT amounts
   - The last number on a line is usually the balance, NOT the amount
   
   CONCRETE EXAMPLES - Study these patterns:
   
   Example A: "25 Feb Visa Debit purchase - 6514 AFFIRM CANADA 43.03 6,977.88"
   Analysis: This line has multiple numbers:
   - "6514" = reference/auth code (appears after dash, NO decimals, 4 digits)
   - "43.03" = ACTUAL AMOUNT (has decimals, in withdrawal column)
   - "6,977.88" = running balance (largest number, at end of line)
   CORRECT: amount = 43.03 ✓
   WRONG: amount = 6514 ✗ (this is just a reference number)
   
   Example B: "26 Feb Contactless Interac purchase - 6394 SHREE HARI FOOD 39.55"
   Analysis:
   - "6394" = reference code (after dash)
   - "39.55" = ACTUAL AMOUNT
   CORRECT: amount = 39.55 ✓
   
   Example C: "Online Transfer to Deposit Account-8049 5,000.00 1,938.33"
   Analysis:
   - "8049" = account number (after dash)
   - "5,000.00" = ACTUAL AMOUNT
   - "1,938.33" = balance
   CORRECT: amount = 5000.00 ✓
   
   Example D: "18 Feb Investment SPECIAL DEPOSIT 50.00"
   Analysis:
   - "50.00" = ACTUAL AMOUNT (investment withdrawal)
   CORRECT: amount = 50.00 ✓
   
   Example E: "16 Apr ATMwithdrawal - TQ242986 880.00 1,103.38"
   Analysis:
   - "TQ242986" or "242986" = transaction reference code (after dash, part of transaction ID)
   - "880.00" = ACTUAL AMOUNT (has decimal, in middle)
   - "1,103.38" = balance (last number on line)
   CORRECT: amount = 880.00 ✓ (all three digits: 8-8-0)
   WRONG: amount = 88.00 ✗ (missing digit)
   WRONG: amount = 100 ✗ (wrong number)
   WRONG: amount = 242986 ✗ (reference code)
   WRONG: amount = 1103.38 ✗ (balance, not amount)
   
   Example F: "Misc Payment RBC CREDIT CARD 213.57 1,103.38"
   Analysis:
   - "213.57" = ACTUAL AMOUNT
   - "1,103.38" = balance
   CORRECT: amount = 213.57 ✓ (all digits: 2-1-3.5-7)
   WRONG: amount = 21.57 ✗ (missing digit)
   WRONG: amount = 1103.38 ✗ (balance)

2. RULES TO IDENTIFY REFERENCE NUMBERS (NOT AMOUNTS):
   - Appears immediately after a dash/hyphen (e.g., "- 6514", "- TQ242986", "Account-8049")
   - Usually 4-6 digits with NO decimal places, or alphanumeric codes (TQ242986, REF123456)
   - Labeled with keywords: "Ref", "Auth", "Conf", "ID", "Code", "#", "TQ", "TX"
   - Last 4 digits of card numbers
   - ATM transaction codes often start with letters like "TQ", "TX", "ATM" followed by numbers
   
3. RULES TO IDENTIFY BALANCES (NOT AMOUNTS):
   - Usually the LAST number on the line
   - Typically the LARGEST number on the line
   - Shows cumulative total, not individual transaction
   
4. DOUBLE-CHECK YOUR EXTRACTION:
   - Count the digits: 800.00 has THREE digits before decimal (8-0-0), not two!
   - Verify: 880.00 = 8, 8, 0, ., 0, 0 (all six characters must be preserved)
   - Verify: 213.57 = 2, 1, 3, ., 5, 7 (all six characters must be preserved)
   - If you extract 80.00 but the original shows 800.00, you made an ERROR
   - NEVER truncate, round, or modify the amount in any way
   
5. TRANSACTION AMOUNT CHARACTERISTICS:
   - Format: Always X.XX or XX.XX or XXX.XX or X,XXX.XX with EXACTLY 2 decimal places
   - Position: Middle section of line (after merchant/description, before balance)
   - Pattern: Has a decimal point with exactly 2 digits after it
   - May have thousand separators: 1,033.31 or 5,000.00
   - Bank statements don't have amounts like "880" without decimals - it's always "880.00"

6. STEP-BY-STEP EXTRACTION PROCESS:
   Step 1: Identify all numbers on the line
   Step 2: Eliminate reference codes (after dashes, alphanumeric, no decimals)
   Step 3: Eliminate the balance (last number, usually largest)
   Step 4: The remaining number with .XX format is your amount
   Step 5: Copy it EXACTLY as written - preserve EVERY digit
   Step 6: Verify digit count matches the original

7. MERCHANT/DESCRIPTION EXTRACTION:
   - Extract the business name EXACTLY as shown (preserve case, spelling)
   - Examples: "AFFIRM CANADA", "SHREE HARI FOOD", "RBC CREDIT CARD"
   - Do NOT include: dates, reference codes, transaction types
   - "Visa Debit purchase - 6514 AFFIRM CANADA" → merchant = "AFFIRM CANADA"
   - "ATMwithdrawal - TQ242986" → merchant = "ATM" (or "ATM Withdrawal")
   - "Misc Payment RBC CREDIT CARD" → merchant = "RBC CREDIT CARD"

8. WHAT TO EXTRACT:
   - ALL withdrawals, purchases, fees, charges (money out)
   - Investments, transfers to savings/investment accounts (even if labeled "deposit")
   - Loan payments, bill payments
   - DO NOT extract: payroll deposits, generic credits unless they're transfers/investments

OTHER RULES:
- Date format: YYYY-MM-DD (use posting date if two dates shown, or extract the date shown)
- Currency: ISO 4217 code (CAD, USD, EUR, etc.) - if not shown, infer from context or use CAD
- Signs: Withdrawals/purchases = positive; refunds/cashbacks = negative; investments = positive
- Category: Only if obvious (Investment, Savings, Food & Dining, etc.)
- Note: Short human-readable description (e.g., "ATM Withdrawal", "Credit Card Payment", "Grocery Shopping")
- line_index: The numbered line (1, 2, 3...) containing this transaction
- Extract transactions in order, don't skip any

🎯 ACCURACY CHECKPOINT:
Before submitting your response, verify EACH transaction:
✓ Amount has ALL digits preserved (800.00 not 80.00)
✓ Merchant name is accurate
✓ Date is in YYYY-MM-DD format
✓ No reference codes used as amounts
✓ No balance numbers used as amounts

Return JSON matching the schema.`

  // Perplexity API: we assume OpenAI-compatible endpoint for chat completions
  const url = 'https://api.perplexity.ai/chat/completions'
  const model = process.env.PERPLEXITY_MODEL || 'sonar'
  if (debugEnabled()) console.log('[AI Parse Debug] calling Perplexity', { promptHash: hashOf(prompt), chars: prompt.length })
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
  })

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

function chunkText(text: string, maxLen = 9000): string[] {
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
    console.error('[parse-statement] Method not allowed:', req.method)
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` })
  }

  console.log('[parse-statement] Starting file upload processing')
  const form = formidable({ maxFileSize: 15 * 1024 * 1024, multiples: false })
  try {
    const { files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err: Error | null, fields: formidable.Fields, files: formidable.Files) => {
        if (err) return reject(err)
        resolve({ fields, files })
      })
    })

    const file = (files?.file || files?.pdf || files?.statement) as FormidableFile | FormidableFile[] | undefined
    const selected = Array.isArray(file) ? file[0] : file
    if (!selected) return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' })

    // Use visual redaction with layout preservation
    if (debugEnabled()) console.log('[AI Parse Debug] using visual PDF redaction')
    const { buffer, text } = await redactPdfVisually(selected)
    if (debugEnabled()) console.log('[AI Parse Debug] visual redaction complete, text length:', text.length)
    
    const prepared = prepareStatementText(text)
    if (debugEnabled()) console.log('[AI Parse Debug] prepared text length:', prepared.length)
    if (!prepared || !prepared.trim()) {
      return res.status(400).json({ success: false, error: 'Could not extract text from PDF' })
    }

    // Preview mode: return only metadata and the redacted, numbered text (no external AI call)
    const q = req.query || {}
    const previewFlag = Array.isArray(q.preview) ? q.preview[0] : q.preview
    if (previewFlag === '1') {
      if (debugEnabled()) console.log('[AI Parse Debug] preview requested.')
      return res.status(200).json({
        success: true,
        expenses: [],
        usage: {
          preview: {
            promptHash: hashOf(prepared),
            length: prepared.length,
            // Provide a very small head/tail sample to inspect redaction without dumping full content
            head: prepared.slice(0, 400),
            tail: prepared.length > 800 ? prepared.slice(-400) : undefined,
          }
        }
      })
    }

    // Allow disabling external AI calls entirely via env
    if (process.env.AI_DISABLE_EXTERNAL === '1') {
      return res.status(503).json({ success: false, error: 'External AI calls are disabled by server policy (AI_DISABLE_EXTERNAL=1).' })
    }

    // Optionally chunk long texts
    // Process in chunks to avoid missing later pages; merge & dedupe
    // Prefer a single full-text call to avoid double extraction across chunks when within size limits
    if (prepared.length <= 20000) {
      if (debugEnabled()) console.log('[AI Parse Debug] using single-call mode (prepared length <= 20000)')
      const once = await callPerplexity(prepared)
      if (debugEnabled()) console.log('[AI Parse Debug] single-call returned', once.length)
      // Do NOT dedupe in single-call mode; we rely on the model to keep distinct occurrences separate
      return res.status(200).json({ success: true, expenses: once })
    } else {
      const chunks = chunkText(prepared, 9000)
      if (debugEnabled()) console.log('[AI Parse Debug] chunks count', chunks.length, 'chunk lens', chunks.map(c => c.length))
      const all: (ParsedExpense & { _srcChunk?: number })[] = []
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]
        if (debugEnabled()) console.log(`[AI Parse Debug] chunk ${i+1}/${chunks.length} hash`, hashOf(c))
        const part = await callPerplexity(c)
        if (debugEnabled()) console.log(`[AI Parse Debug] chunk ${i+1} returned`, part.length)
        const withMeta = part.map(p => ({ ...p, _srcChunk: i + 1 }))
        all.push(...withMeta)
      }
      if (debugEnabled()) console.log('[AI Parse Debug] total before dedupe', all.length)
      const mergedWithMeta = dedupeExpenses(all)
      const merged = mergedWithMeta.map(({ _srcChunk, ...rest }) => rest)
      if (debugEnabled()) console.log('[AI Parse Debug] total after dedupe', merged.length)
      return res.status(200).json({ success: true, expenses: merged })
    }
  } catch (e: any) {
    console.error('parse-statement error', e)
    return res.status(500).json({ success: false, error: e?.message || 'Internal Error' })
  }
}
