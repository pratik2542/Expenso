import { NextApiRequest, NextApiResponse } from 'next'
import { checkRateLimit, sanitizeInput, validateExpense, sanitizeError } from '@/lib/security'

export const config = {
  maxDuration: 60, // Increase timeout to 60 seconds for AI processing
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increase body size limit to 10mb for large expense datasets
    },
  },
};

type Expense = {
  id: string
  amount: number
  currency: string
  merchant?: string
  payment_method?: string
  note?: string
  occurred_on: string
  category: string
}

type IncomeData = {
  amount: number
  currency: string
}

type IncomeRecord = {
  id: string
  amount: number
  currency: string
  merchant?: string
  note?: string
  occurred_on: string
  category?: string
}

type MonthlyIncomeRecord = {
  month: number
  year: number
  amount: number
  currency: string
}

interface AnalyticsRequest {
  expenses: Expense[]
  income?: IncomeData
  incomeRecords?: IncomeRecord[] // Individual income transactions
  monthlyIncomeRecords?: MonthlyIncomeRecord[] // Monthly income breakdown (for backwards compatibility)
  month: number
  year: number
  currency: string
  question?: string // Optional user question
  chatHistory?: Array<{ role: 'user' | 'ai', content: string }> // Previous conversation for context
  periodLabel?: string // Optional override for the time period header
  format?: 'json' | 'markdown' // Output format: 'json' for dashboard widget, 'markdown' for analytics page
}

async function callPerplexityForInsights(prompt: string, isJson: boolean = true, conversationHistory?: Array<{ role: string, content: string }>): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('Missing Perplexity API key')

  // Build messages array with conversation history
  const messages: Array<{ role: string, content: string }> = [
    {
      role: 'system', content: isJson
        ? 'You are a high-performance financial intelligence engine. Provide brutal, data-driven accuracy. Return ONLY valid JSON. No conversational filler.'
        : 'You are a senior financial analyst. Provide concise, high-signal insights using tight markdown. No fluff.'
    }
  ]

  // Add conversation history if provided (for follow-up questions)
  if (conversationHistory && conversationHistory.length > 0) {
    conversationHistory.forEach(msg => {
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      })
    })
  }

  // Add the current prompt
  messages.push({ role: 'user', content: prompt })

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages,
      temperature: 0.2
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Perplexity API error: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  let text = result.choices[0]?.message?.content || ''

  // Clean up markdown code blocks if JSON format
  if (isJson) {
    text = text.replace(/```json/g, '').replace(/```/g, '').trim()
  }

  return text
}

interface CalculatedMetrics {
  totalIncome: number
  totalSpend: number
  netSavings: number
  savingsRate: number
  isDeficit: boolean
  financialStatus: string
  statusColor: string
}

async function generateInsights(data: AnalyticsRequest): Promise<{ text: string; metrics: CalculatedMetrics }> {
  const { expenses, income, incomeRecords, monthlyIncomeRecords, month, year, currency, question, chatHistory, periodLabel, format = 'json' } = data

  // Calculate some stats
  const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0)
  const categorySpend = expenses.reduce((acc, e) => {
    const cat = e.category || 'Other'
    acc[cat] = (acc[cat] || 0) + e.amount
    return acc
  }, {} as Record<string, number>)

  const merchantSpend = expenses.reduce((acc, e) => {
    const merchant = e.merchant || 'Unknown'
    acc[merchant] = (acc[merchant] || 0) + e.amount
    return acc
  }, {} as Record<string, number>)

  // Calculate monthly breakdown of expenses for all-time analysis
  const monthlyExpenseBreakdown = expenses.reduce((acc, e) => {
    const date = new Date(e.occurred_on)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    acc[key] = (acc[key] || 0) + e.amount
    return acc
  }, {} as Record<string, number>)

  // Calculate monthly breakdown by category (for answering questions like "how much did I spend on groceries in October?")
  const monthlyCategoryBreakdown = expenses.reduce((acc, e) => {
    const date = new Date(e.occurred_on)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const cat = e.category || 'Other'
    if (!acc[monthKey]) acc[monthKey] = {}
    acc[monthKey][cat] = (acc[monthKey][cat] || 0) + e.amount
    return acc
  }, {} as Record<string, Record<string, number>>)

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })
  const timeHeader = periodLabel || `Month: ${monthName} ${year}`
  const isAllTime = periodLabel === 'All Time Data'

  // Build monthly category breakdown section for All Time queries
  let monthlyCategorySection = ''
  if (isAllTime && Object.keys(monthlyCategoryBreakdown).length > 0) {
    monthlyCategorySection = `
=== MONTHLY SPENDING BY CATEGORY (USE THIS DATA TO ANSWER MONTH-SPECIFIC QUESTIONS) ===
${Object.entries(monthlyCategoryBreakdown)
        .sort((a, b) => b[0].localeCompare(a[0])) // Sort by date descending
        .map(([monthKey, categories]) => {
          const [yr, mo] = monthKey.split('-')
          const monthLabel = new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
          const monthTotal = Object.values(categories).reduce((sum, amt) => sum + amt, 0)
          const categoryList = Object.entries(categories)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amt]) => `  ${cat}: ${amt.toFixed(2)} ${currency}`)
            .join('\n')
          return `${monthLabel} (Total: ${monthTotal.toFixed(2)} ${currency}):\n${categoryList}`
        })
        .join('\n\n')}
===================================================================================
`
  }

  // Build income section based on whether we have detailed records or just a total
  let incomeSection = ''
  let incomeDetailedSection = ''

  if (incomeRecords && incomeRecords.length > 0) {
    const totalIncome = incomeRecords.reduce((sum, r) => sum + Math.abs(r.amount), 0)
    incomeDetailedSection = `
Income Records:
${incomeRecords
        .sort((a, b) => new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime())
        .map(r => `- ${r.occurred_on}: ${Math.abs(r.amount).toFixed(2)} ${r.currency} from ${r.merchant || 'Unknown'} (${r.category || 'Income'})${r.note ? ` - ${r.note}` : ''}`)
        .join('\n')}

Total Income for Period: ${totalIncome.toFixed(2)} ${currency}
`
    incomeSection = `Monthly Income: ${totalIncome.toFixed(2)} ${currency}`
  } else if (monthlyIncomeRecords && monthlyIncomeRecords.length > 0) {
    const totalIncome = monthlyIncomeRecords.reduce((sum, r) => sum + r.amount, 0)
    const overallSavingsRate = totalIncome > 0 ? ((totalIncome - totalSpend) / totalIncome * 100) : 0

    incomeSection = `Total Income (All Time): ${totalIncome.toFixed(2)} ${currency}
Overall Savings Rate: ${overallSavingsRate.toFixed(1)}%
Total Saved: ${(totalIncome - totalSpend).toFixed(2)} ${currency}

Monthly Income Records:
${monthlyIncomeRecords
        .sort((a, b) => (b.year - a.year) || (b.month - a.month))
        .map(r => {
          const monthKey = `${r.year}-${String(r.month).padStart(2, '0')}`
          const expenseForMonth = monthlyExpenseBreakdown[monthKey] || 0
          const savings = r.amount - expenseForMonth
          const savingsRate = r.amount > 0 ? ((savings / r.amount) * 100).toFixed(1) : 'N/A'
          return `- ${new Date(r.year, r.month - 1).toLocaleString('default', { month: 'short', year: 'numeric' })}: Income ${r.amount.toFixed(2)}, Spent ${expenseForMonth.toFixed(2)}, Saved ${savings.toFixed(2)} (${savingsRate}%)`
        })
        .join('\n')}`
  } else {
    incomeSection = `Monthly Income: ${income?.amount?.toFixed(2) || 'Not set'} ${currency}`
  }

  // Calculate key financial metrics that the AI MUST use (not invent)
  const totalIncome = incomeRecords
    ? incomeRecords.reduce((sum, r) => sum + Math.abs(r.amount), 0)
    : monthlyIncomeRecords
      ? monthlyIncomeRecords.reduce((sum, r) => sum + r.amount, 0)
      : (income?.amount || 0)

  const netSavings = totalIncome - totalSpend
  const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100) : 0
  const isDeficit = netSavings < 0

  // Financial health status based on actual numbers
  let financialStatus = 'Healthy'
  let statusColor = 'green'
  if (isDeficit) {
    financialStatus = 'Alert'
    statusColor = 'red'
  } else if (savingsRate < 10) {
    financialStatus = 'Caution'
    statusColor = 'yellow'
  } else if (savingsRate < 20) {
    financialStatus = 'Caution'
    statusColor = 'yellow'
  }

  // Pre-calculated metrics section - AI MUST use these exact values
  const calculatedMetrics = `
=== PRE-CALCULATED METRICS (USE THESE EXACT VALUES - DO NOT RECALCULATE) ===
Total Income: ${totalIncome.toFixed(2)} ${currency}
Total Spending: ${totalSpend.toFixed(2)} ${currency}
Net Savings: ${netSavings.toFixed(2)} ${currency} ${isDeficit ? '(DEFICIT - spending exceeds income!)' : ''}
Savings Rate: ${savingsRate.toFixed(1)}% ${isDeficit ? '(NEGATIVE - user is overspending!)' : ''}
Financial Status: ${financialStatus} (${statusColor})
=============================================================================
`

  const expensesSummary = `
${calculatedMetrics}
Period: ${timeHeader}
Currency: ${currency}
Total Spending: ${totalSpend.toFixed(2)} ${currency}
${incomeSection}
${incomeDetailedSection}
Number of Transactions: ${expenses.length}
${monthlyCategorySection}
Spending by Category (All Time Totals):
${Object.entries(categorySpend)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `- ${cat}: ${amt.toFixed(2)} ${currency} (${((amt / totalSpend) * 100).toFixed(1)}%)`)
      .join('\n')}

Top Merchants/Payees:
${Object.entries(merchantSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([merchant, amt]) => `- ${merchant}: ${amt.toFixed(2)} ${currency}`)
      .join('\n')}

${question
      ? `All Transactions ${isAllTime ? '(sorted by date)' : `for ${timeHeader} (sorted by date)`}:
${expenses
        .sort((a, b) => new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime())
        .map(e => `- ${e.occurred_on}: ${e.amount} ${e.currency} at ${e.merchant || 'Unknown'} (${e.category || 'Other'})${e.note ? ` - ${e.note}` : ''}`)
        .join('\n')}`
      : `Recent Transactions (last 10):
${expenses
        .sort((a, b) => new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime())
        .slice(0, 10)
        .map(e => `- ${e.occurred_on}: ${e.amount} ${e.currency} at ${e.merchant || 'Unknown'} (${e.category || 'Other'})${e.note ? ` - ${e.note}` : ''}`)
        .join('\n')}`}
`

  let prompt: string
  const useJsonFormat = format === 'json' && !question

  if (question) {
    // User asked a specific question - return markdown
    prompt = `You are a financial analyst. Based on the following expense data, answer the user's question accurately.

DATA START >>>
${expensesSummary}
<<< DATA END

User's Question: ${question}

CRITICAL INSTRUCTIONS:
1. ALL TRANSACTIONS ${isAllTime ? 'across all time' : `for ${timeHeader}`} are listed in the "All Transactions" section above with their EXACT DATES. Use this to answer date-specific questions.
2. The "MONTHLY SPENDING BY CATEGORY" section contains EXACT spending amounts for each category in each month.
3. DO NOT say data is not available if it is clearly provided in the sections above.
4. For date questions (like "when did I pay rent${isAllTime ? '?' : ' this month?'}"), look in the "All Transactions" section and find the exact transaction with its date.
5. If the user asks to "generate a graph" or "create a chart", include a special JSON block in your response with the format:
   \`\`\`chart-data
   {
     "type": "line" | "bar" | "pie",
     "title": "Chart Title",
     "data": [{"name": "Jan", "value1": 100, "value2": 200}, ...],
     "dataKeys": ["value1", "value2"],
     "labels": ["Income", "Expense"]
   }
   \`\`\`
6. Be specific and accurate - use the exact dates, amounts, and merchants from the data provided.
7. Use markdown formatting for your response.`
  } else if (format === 'markdown') {
    // Analytics page - detailed markdown insights
    prompt = `Analyze this financial data and provide a high-signal executive summary.
 
${expensesSummary}

Response Structure:

# 💎 Alpha Insights
- Concise, data-backed observation on spending velocity or anomalies.
- Primary efficiency leak identified with exact impact.

# 🎯 Top Vectors
- List top 3 categories by % impact. format: **Category**: $Amount (% of total)

# 🚀 Optimization Strategy
- One high-impact, actionable move to increase savings rate.
- Specific merchant or habit to cut for immediate ROI.

# ⚖️ Risk Assessment
- Critical flag or "Stable" status.

Style: Sharp, professional, zero-fluff. Use high-quality professional emojis.`
  } else {
    // Dashboard widget - concise JSON format
    prompt = `Analyze the provided expense data for ${timeHeader}.
  
${expensesSummary}

Return ONLY a valid JSON object (no markdown, no filler) with this structure:
{
  "status": "Healthy" | "Caution" | "Alert",
  "color": "green" | "yellow" | "red",
  "title": "A sharp, data-driven headline (max 4 words)",
  "summary": "Impactful single-sentence analysis (max 12 words)",
  "highlights": [
    { "icon": "💵", "text": "Net cash flow status (max 6 words)" },
    { "icon": "🔥", "text": "Dominant spend vector (max 6 words)" },
    { "icon": "🏢", "text": "Key merchant insight (max 6 words)" },
    { "icon": "⚡", "text": "Savings rate efficiency (max 6 words)" },
    { "icon": "🎯", "text": "One primary actionable move (max 6 words)" }
  ]
}

IMPORTANT: Total income, spending, and savings rate are PROVIDED in PRE-CALCULATED METRICS. Use these EXACT numbers.`
  }

  // Try Gemini First
  try {
    console.log('[AI Insights] Trying Gemini API...')
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[AI Insights] Missing Gemini API key')
      throw new Error('Missing Gemini API key')
    }

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 8192, // Increased to account for thinking tokens in 2.5 models
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    }

    // Using gemini-2.5-flash for best balance of speed, intelligence and rate limits
    // Added fallback to 1.5-flash for 503 Overloaded errors
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )

    if (!response.ok && response.status === 503) {
      console.log('[AI Insights] Gemini 2.5 overloaded, trying 1.5 Flash...')
      // Fallback to 1.5 Flash
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      )
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('[AI Insights] Gemini API error:', response.status, errorText)
      throw new Error(`Gemini API error: ${response.status} ${errorText}`)
    }

    const result = await response.json()

    // Gemini 2.5 may have different response structure
    let text = ''
    const candidate = result?.candidates?.[0]
    if (candidate?.content?.parts) {
      // Check all parts for text content
      for (const part of candidate.content.parts) {
        if (part.text) {
          text = part.text
          break
        }
      }
    }

    // Clean up markdown code blocks if JSON format
    if (useJsonFormat) {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim()
    }

    if (!text) {
      console.error('[AI Insights] Gemini returned no text. Full response:', JSON.stringify(result, null, 2))
      throw new Error('No response from Gemini')
    }

    console.log('[AI Insights] Gemini successful')
    const metrics: CalculatedMetrics = {
      totalIncome,
      totalSpend,
      netSavings,
      savingsRate,
      isDeficit,
      financialStatus,
      statusColor
    }

    return { text, metrics }

  } catch (geminiError: any) {
    console.error('[AI Insights] Gemini failed:', geminiError.message)
    // Fallback to Perplexity
    try {
      console.log('[AI Insights] Trying Perplexity API...')
      const perplexityText = await callPerplexityForInsights(prompt, useJsonFormat, chatHistory)
      console.log('[AI Insights] Perplexity successful')
      const metrics: CalculatedMetrics = {
        totalIncome,
        totalSpend,
        netSavings,
        savingsRate,
        isDeficit,
        financialStatus,
        statusColor
      }
      return { text: perplexityText, metrics }
    } catch (perplexityError: any) {
      console.error('[AI Insights] Perplexity also failed:', perplexityError.message)
      throw new Error('AI service temporarily unavailable')
    }
  }
}

import { setCorsHeaders } from '@/lib/cors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Extract user ID from headers or body for rate limiting
  const userId = req.headers['x-user-id'] as string || 'anonymous'

  // Check rate limit (30 requests per minute)
  if (checkRateLimit(userId, 30, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const { expenses, income, incomeRecords, month, year, currency, question, periodLabel, format } = req.body as AnalyticsRequest

  // Validate inputs
  if (!Array.isArray(expenses)) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  if (!month || !year || !currency) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  // Validate expense data structure
  const invalidExpenses = expenses.filter(e => !validateExpense(e))
  if (invalidExpenses.length > 0) {
    return res.status(400).json({ error: 'Invalid expense data' })
  }

  // Sanitize question input
  const sanitizedQuestion = question ? sanitizeInput(question) : undefined

  try {
    console.log('[AI Insights] Starting generation...')
    console.log('[AI Insights] Expenses count:', expenses.length)
    console.log('[AI Insights] Period:', { month, year, currency })

    const { text, metrics } = await generateInsights({
      expenses,
      income,
      incomeRecords,
      month,
      year,
      currency,
      question: sanitizedQuestion,
      periodLabel,
      format
    })

    console.log('[AI Insights] Generation successful')

    // For JSON format (dashboard widget), validate and correct AI's response if needed
    if (format === 'json' && !question) {
      try {
        const parsed = JSON.parse(text)
        let corrected = false

        // Validate status/color based on actual financial situation
        if (metrics.isDeficit) {
          // User is in deficit - must be Alert/red
          if (parsed.status !== 'Alert' || parsed.color !== 'red') {
            parsed.status = 'Alert'
            parsed.color = 'red'
            corrected = true
          }
        } else if (metrics.savingsRate < 10) {
          // Low savings rate - should be Caution/yellow at minimum
          if (parsed.status === 'Healthy' && parsed.color === 'green') {
            parsed.status = 'Caution'
            parsed.color = 'yellow'
            corrected = true
          }
        }

        // Validate the savings rate highlight (4th item, index 3)
        if (parsed.highlights && parsed.highlights[3]) {
          const highlight = parsed.highlights[3]
          const highlightText = highlight.text.toLowerCase()

          // Extract any percentage from AI's response
          const aiPercentMatch = highlightText.match(/(\d+(?:\.\d+)?)\s*%/)
          const aiPercent = aiPercentMatch ? parseFloat(aiPercentMatch[1]) : null

          // Check if AI's percentage is significantly wrong (more than 5% difference)
          const actualRate = Math.abs(metrics.savingsRate)
          const percentDiff = aiPercent !== null ? Math.abs(aiPercent - actualRate) : 999

          if (percentDiff > 5 || (metrics.isDeficit && !highlightText.includes('deficit') && !highlightText.includes('over'))) {
            // AI got it wrong - correct it
            if (metrics.isDeficit) {
              highlight.text = `Deficit: ${actualRate.toFixed(0)}% overspending alert!`
            } else {
              highlight.text = `${actualRate.toFixed(0)}% savings rate achieved.`
            }
            corrected = true
          }
        }

        if (corrected) {
          return res.status(200).json({ insights: JSON.stringify(parsed), corrected: true })
        }

        return res.status(200).json({ insights: text })
      } catch (parseError) {
        // If parsing fails, return original text
        return res.status(200).json({ insights: text })
      }
    }

    return res.status(200).json({ insights: text })
  } catch (e: any) {
    console.error('[AI Insights] Error:', e.message)
    console.error('[AI Insights] Stack:', e.stack)
    return res.status(500).json({ error: sanitizeError(e) })
  }
}
