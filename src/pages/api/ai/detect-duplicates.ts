import { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
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

import { setCorsHeaders } from '@/lib/cors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { expenses } = req.body;
  if (!Array.isArray(expenses)) {
    return res.status(400).json({ error: 'Missing or invalid expenses array' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey && !perplexityKey) {
    return res.status(500).json({ error: 'Missing AI API keys' });
  }

  try {
    // Prepare data for AI
    const expensesList = expenses.map(e => 
      `ID: ${e.id} | Date: ${e.occurred_on} | Amount: ${e.amount} ${e.currency} | Merchant: ${e.merchant || 'N/A'} | Cat: ${e.category} | Note: ${e.note || ''}`
    ).join('\n');

    const prompt = `You are a financial auditor. Identify duplicate expenses from this list.

A duplicate is:
- Exact match: same date, amount, merchant
- Double entry: same amount/merchant within 1-2 days
- Fuzzy match: same amount, similar merchant (e.g. "Starbucks" vs "Starbucks Coffee"), close dates

Return ONLY valid JSON (no markdown) with this structure:
{
  "groups": [
    {
      "reason": "explanation",
      "duplicate_ids": ["id1", "id2"],
      "original_id": "id1",
      "confidence": "high"
    }
  ]
}

If no duplicates found, return: {"groups": []}

Expenses:
${expensesList}`;

    let result: any;
    let attemptedGemini = false;

    // Try Gemini first if available
    if (apiKey) {
      try {
        attemptedGemini = true;
        const body = {
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
          }
        }

        let response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }
        )

        if (!response.ok && response.status === 503) {
          console.warn('Gemini 2.0 Flash overloaded, trying 1.5 Flash')
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            }
          )
        }

        if (response.ok) {
          result = await response.json();
        } else {
          throw new Error(`Gemini API error: ${response.status}`);
        }
      } catch (geminiError: any) {
        console.error('Gemini failed:', geminiError.message);
        if (!perplexityKey) throw geminiError;
        // Fall through to Perplexity
      }
    }

    // Try Perplexity if Gemini failed or wasn't available
    if (!result && perplexityKey) {
      console.log(attemptedGemini ? 'Falling back to Perplexity' : 'Using Perplexity');
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{
            role: 'user',
            content: prompt
          }],
          temperature: 0.1,
          max_tokens: 4000,
        })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const perplexityResult = await response.json();
      const content = perplexityResult?.choices?.[0]?.message?.content || '{}';
      
      // Parse Perplexity response
      let text = content.replace(/```json\n?|\n?```/g, '').trim();
      const json = JSON.parse(text);
      return res.status(200).json(json);
    }

    // Parse Gemini response
    if (result) {
      let text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      // Clean up markdown code blocks
      text = text.replace(/```json\n?|\n?```/g, '').trim();
      
      // Additional cleanup for common JSON issues
      text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
      
      try {
        const json = JSON.parse(text);
        return res.status(200).json(json);
      } catch (parseError) {
        console.error('JSON parse error. Raw text:', text);
        // Return empty groups on parse failure
        return res.status(200).json({ groups: [] });
      }
    }

    // Fallback if both failed
    return res.status(200).json({ groups: [] });

  } catch (e: any) {
    console.error('Duplicate detection error:', e);
    // Return empty groups instead of error to prevent UI breaking
    return res.status(200).json({ groups: [] });
  }
}
