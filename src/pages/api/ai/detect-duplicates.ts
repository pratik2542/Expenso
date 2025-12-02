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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { expenses } = req.body;
  if (!Array.isArray(expenses)) {
    return res.status(400).json({ error: 'Missing or invalid expenses array' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing Gemini API key' });
  }

  try {
    // Prepare data for AI
    const expensesList = expenses.map(e => 
      `ID: ${e.id} | Date: ${e.occurred_on} | Amount: ${e.amount} ${e.currency} | Merchant: ${e.merchant || 'N/A'} | Cat: ${e.category} | Note: ${e.note || ''}`
    ).join('\n');

    const prompt = `
    You are an expert financial auditor. Your task is to identify duplicate expenses in the following list.
    
    A "duplicate" might be:
    1. Exact match: Same date, amount, merchant.
    2. Accidental double entry: Same amount and merchant on the same day or very close dates (within 1-2 days).
    3. Fuzzy match: Same amount, similar merchant name (e.g. "Uber" vs "Uber Technologies"), close dates.
    
    Return a JSON object with a "groups" array. Each group should contain:
    - "reason": A short explanation of why these are considered duplicates.
    - "duplicate_ids": An array of IDs that are likely duplicates (candidates to be deleted).
    - "original_id": The ID of the expense that seems to be the "original" (to be kept). If unsure, pick the first one.
    - "confidence": "high" or "medium" or "low".
    
    Only include groups where you are reasonably confident there is a duplicate.
    
    Expenses List:
    ${expensesList}
    `;

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      }
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
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    let text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Clean up markdown code blocks if present
    text = text.replace(/```json\n?|\n?```/g, '').trim();
    
    const json = JSON.parse(text);
    
    return res.status(200).json(json);

  } catch (e: any) {
    console.error('Duplicate detection error:', e);
    // If it's a JSON parse error, it might be helpful to see what the text was (in logs)
    if (e instanceof SyntaxError) {
       console.error('Failed to parse JSON from AI response');
    }
    return res.status(500).json({ error: e.message || 'Failed to detect duplicates' });
  }
}
