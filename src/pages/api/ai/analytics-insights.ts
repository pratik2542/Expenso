import { NextApiRequest, NextApiResponse } from 'next'

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

interface AnalyticsRequest {
  expenses: Expense[]
  income?: IncomeData
  month: number
  year: number
  currency: string
  question?: string // Optional user question
}

async function callGeminiForInsights(data: AnalyticsRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Missing Gemini API key')

  const { expenses, income, month, year, currency, question } = data
  
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

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })
  
  const expensesSummary = `
Month: ${monthName} ${year}
Currency: ${currency}
Total Spending: ${totalSpend.toFixed(2)} ${currency}
Monthly Income: ${income?.amount?.toFixed(2) || 'Not set'} ${currency}
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
  if (question) {
    // User is asking a specific question
    prompt = `You are a personal finance assistant analyzing expense data. Here is the user's financial data:

${expensesSummary}

The user asks: "${question}"

Please provide a helpful, concise answer based on the data above. Be specific with numbers and percentages. If the question can't be answered with the available data, say so politely.`
  } else {
    // Generate automatic insights
    prompt = `You are a friendly and knowledgeable personal finance assistant. Analyze this expense data and provide engaging, actionable insights.

${expensesSummary}

Please structure your response as follows:

### 📊 Key Insights
(2-3 important observations about spending patterns. Be specific and use bold text for emphasis.)

### 💸 Top Spending Areas
(Where the most money is going. Use percentages.)

### 💡 Smart Recommendations
(2-3 specific, actionable tips to save money or improve financial health.)

### ⚠️ Potential Concerns
(Any spending patterns that might need attention, if any.)

Make the content easy to read, use emojis where appropriate to make it lively, and keep it practical.`
  }

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Gemini API error: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  console.log('Gemini response:', JSON.stringify(result, null, 2))
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  
  if (!text) {
    throw new Error('No response from Gemini')
  }

  return text
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { expenses, income, month, year, currency, question } = req.body as AnalyticsRequest

  if (!Array.isArray(expenses)) {
    return res.status(400).json({ error: 'Missing or invalid expenses array' })
  }

  if (!month || !year || !currency) {
    return res.status(400).json({ error: 'Missing month, year, or currency' })
  }

  try {
    const insights = await callGeminiForInsights({ expenses, income, month, year, currency, question })
    return res.status(200).json({ insights })
  } catch (e: any) {
    console.error('Gemini analytics insights error:', e)
    return res.status(500).json({ error: e.message || 'Failed to generate insights' })
  }
}
