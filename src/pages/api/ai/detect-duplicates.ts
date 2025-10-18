import { NextApiRequest, NextApiResponse } from 'next'

// Replace with your Gemini API key and endpoint
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

async function callPerplexityForDuplicates(expenses: Expense[]): Promise<string[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('Missing Perplexity API key');
  const prompt = `You are an AI assistant. Given the following list of expenses, identify which ones are likely duplicates. Return ONLY the list of IDs that are duplicates (not the originals).\n\nExpenses:\n${expenses.map(e => `ID: ${e.id}, Amount: ${e.amount}, Currency: ${e.currency}, Merchant: ${e.merchant}, Date: ${e.occurred_on}, Category: ${e.category}`).join('\n')}`;

  const body = {
    model: "sonar",
    messages: [
      { role: "system", content: "You are an expert expense management assistant." },
      { role: "user", content: prompt }
    ],
    max_tokens: 512,
    temperature: 0.2
  };

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(`Perplexity API error: ${response.status} ${errorText}`)
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  let ids: string[] = [];
  try {
    ids = JSON.parse(text);
    if (!Array.isArray(ids)) throw new Error("Not an array");
    ids = ids.map(String);
  } catch {
    ids = text.split(/\s|,|\n/).map((s: string) => s.trim()).filter(Boolean);
  }
  const validIds = new Set(expenses.map(e => e.id));
  return ids.filter(id => validIds.has(id));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { expenses } = req.body;
  if (!Array.isArray(expenses)) {
    return res.status(400).json({ error: 'Missing or invalid expenses array' });
  }
  try {
    const duplicateIds = await callPerplexityForDuplicates(expenses);
    return res.status(200).json({ duplicateIds });
  } catch (e: any) {
    console.error('Perplexity duplicate detection error:', e);
    return res.status(500).json({ error: e.message || 'Failed to detect duplicates' });
  }
}
