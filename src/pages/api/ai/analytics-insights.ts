import { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  maxDuration: 60, // Increase timeout to 60 seconds for AI processing
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
  month: number
  year: number
  amount: number
  currency: string
}

interface AnalyticsRequest {
  expenses: Expense[]
  income?: IncomeData
  incomeRecords?: IncomeRecord[] // Monthly income breakdown for all-time analysis
  month: number
  year: number
  currency: string
  question?: string // Optional user question
  periodLabel?: string // Optional override for the time period header
  format?: 'json' | 'markdown' // Output format: 'json' for dashboard widget, 'markdown' for analytics page
}

async function callPerplexityForInsights(prompt: string, isJson: boolean = true): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('Missing Perplexity API key')

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: isJson ? 'You are a helpful financial analyst. Return only JSON.' : 'You are a helpful financial analyst. Use markdown formatting.' },
        { role: 'user', content: prompt }
      ],
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
  const { expenses, income, incomeRecords, month, year, currency, question, periodLabel, format = 'json' } = data
  
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

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })
  const timeHeader = periodLabel || `Month: ${monthName} ${year}`
  const isAllTime = periodLabel === 'All Time Data'
  
  // Build income section based on whether we have detailed records or just a total
  let incomeSection = ''
  if (incomeRecords && incomeRecords.length > 0) {
    const totalIncome = incomeRecords.reduce((sum, r) => sum + r.amount, 0)
    const overallSavingsRate = totalIncome > 0 ? ((totalIncome - totalSpend) / totalIncome * 100) : 0
    
    incomeSection = `Total Income (All Time): ${totalIncome.toFixed(2)} ${currency}
Overall Savings Rate: ${overallSavingsRate.toFixed(1)}%
Total Saved: ${(totalIncome - totalSpend).toFixed(2)} ${currency}

Monthly Income Records:
${incomeRecords
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
    ? incomeRecords.reduce((sum, r) => sum + r.amount, 0) 
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
Number of Transactions: ${expenses.length}

Spending by Category:
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

Recent Transactions (last 10):
${expenses
  .sort((a, b) => new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime())
  .slice(0, 10)
  .map(e => `- ${e.occurred_on}: ${e.amount} ${e.currency} at ${e.merchant || 'Unknown'} (${e.category || 'Other'})${e.note ? ` - ${e.note}` : ''}`)
  .join('\n')}
`

  let prompt: string
  const useJsonFormat = format === 'json' && !question
  
  if (question) {
    // User asked a specific question - return markdown
    prompt = `You are a financial analyst. Based on the following expense data, answer the user's question.

${expensesSummary}

User's Question: ${question}

Provide a helpful, concise answer using markdown formatting. Include specific numbers and percentages where relevant.`
  } else if (format === 'markdown') {
    // Analytics page - detailed markdown insights
    prompt = `You are a friendly financial analyst. Analyze the following expense data and provide detailed insights.

${expensesSummary}

Please structure your response EXACTLY as follows:

### 📊 Key Insights
(2-3 important observations about spending patterns. Be specific and use **bold text** for emphasis.)

### 💸 Top Spending Areas
(Where the most money is going. Use percentages and specific amounts.)

### 💡 Smart Recommendations
(2-3 specific, actionable tips to save money or improve financial health.)

### ⚠️ Potential Concerns
(Any spending patterns that might need attention. If none, say "Looking good! No major concerns this period.")

Make the content easy to read, use emojis where appropriate to make it lively, and keep it practical. Use bullet points for lists.`
  } else {
    // Dashboard widget - concise JSON format
    prompt = `You are a financial analyst. Analyze the provided expense data for the period: ${timeHeader}.
  
${expensesSummary}

Return ONLY a valid JSON object (no markdown formatting, no code blocks) with the following structure:
{
  "status": "Healthy" | "Caution" | "Alert",
  "color": "green" | "yellow" | "red",
  "title": "A short, punchy 3-5 word headline about their spending",
  "summary": "One concise sentence summary of the situation (max 15 words)",
  "highlights": [
    { "icon": "💰", "text": "Key fact about total spending (max 8 words)" },
    { "icon": "📈", "text": "Top category insight with percentage (max 8 words)" },
    { "icon": "🏪", "text": "Top merchant or payee insight (max 8 words)" },
    { "icon": "📊", "text": "Savings rate or deficit info (max 8 words)" },
    { "icon": "💡", "text": "One quick actionable tip (max 8 words)" }
  ]
}

IMPORTANT: Base your analysis on the PRE-CALCULATED METRICS section above. If spending exceeds income, this is a deficit situation requiring "Alert" status.`
  }

  // Try Gemini First
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('Missing Gemini API key')

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
      console.warn('Gemini 2.5 Flash overloaded, falling back to 1.5 Flash')
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
      console.error('Gemini returned no text. Full response:', JSON.stringify(result, null, 2))
      throw new Error('No response from Gemini')
    }
    
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

  } catch (geminiError) {
    console.warn('Gemini failed, falling back to Perplexity:', geminiError)
    
    // Fallback to Perplexity
    try {
      const perplexityText = await callPerplexityForInsights(prompt, useJsonFormat)
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
    } catch (perplexityError) {
      console.error('Perplexity also failed:', perplexityError)
      throw geminiError // Throw original error if both fail
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

  const { expenses, income, incomeRecords, month, year, currency, question, periodLabel, format } = req.body as AnalyticsRequest

  if (!Array.isArray(expenses)) {
    return res.status(400).json({ error: 'Missing or invalid expenses array' })
  }

  if (!month || !year || !currency) {
    return res.status(400).json({ error: 'Missing month, year, or currency' })
  }

  try {
    const { text, metrics } = await generateInsights({ expenses, income, incomeRecords, month, year, currency, question, periodLabel, format })
    
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
            console.log('Corrected AI status: User is in deficit, changed to Alert/red')
          }
        } else if (metrics.savingsRate < 10) {
          // Low savings rate - should be Caution/yellow at minimum
          if (parsed.status === 'Healthy' && parsed.color === 'green') {
            parsed.status = 'Caution'
            parsed.color = 'yellow'
            corrected = true
            console.log('Corrected AI status: Low savings rate, changed to Caution/yellow')
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
            console.log(`Corrected AI savings rate: AI said ${aiPercent}%, actual is ${metrics.savingsRate.toFixed(1)}%`)
          }
        }
        
        if (corrected) {
          return res.status(200).json({ insights: JSON.stringify(parsed), corrected: true })
        }
        
        return res.status(200).json({ insights: text })
      } catch (parseError) {
        // If parsing fails, return original text
        console.warn('Could not parse AI response for validation:', parseError)
        return res.status(200).json({ insights: text })
      }
    }
    
    return res.status(200).json({ insights: text })
  } catch (e: any) {
    console.error('AI analytics insights error:', e)
    return res.status(500).json({ error: e.message || 'Failed to generate insights' })
  }
}
