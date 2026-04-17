import { NextApiRequest, NextApiResponse } from 'next'
import { groqChatCompletion } from '@/lib/groq'
import { trackUsageForRequest } from '@/lib/usageMetrics'

export const config = {
  maxDuration: 30,
};

async function generateNickname(fullName: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    // Fallback to random 4-letter code if no API key
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let code = ''
    for (let i = 0; i < 4; i++) {
      code += letters[Math.floor(Math.random() * letters.length)]
    }
    return code
  }

  const prompt = `Create a unique 4-letter nickname code for the name: ${fullName}

Requirements:
- Output ONLY the 4-letter code, nothing else
- Must be exactly 4 uppercase letters
- Make it cool, memorable, and finance-related
- Examples: CASH, GOLD, SAGE, APEX, FLUX, MINT, COIN, BANK, RICH, SAVE, EARN, GAIN

Generate one 4-letter code now:`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    )

    const result = await response.json()
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toUpperCase()?.replace(/[^A-Z]/g, '') || ''
    
    if (text.length >= 4) {
      return text.slice(0, 4)
    }
    throw new Error('Gemini response invalid')

  } catch (geminiError) {
    console.warn('❌ Gemini failed, trying Groq fallback:', geminiError)

    // Try Groq as fallback
    try {
      const randomSeed = Math.random().toString(36).substring(7)
      const randomExamples = ['CASH', 'GOLD', 'MINT', 'SAGE', 'APEX', 'FLUX', 'COIN', 'BANK', 'RICH', 'SAVE', 'EARN', 'GAIN']
        .sort(() => Math.random() - 0.5)
        .slice(0, 5)
        .join(', ')

      let text = await groqChatCompletion({
        messages: [
          {
            role: 'system',
            content: 'You are a creative assistant. Output ONLY the 4-letter code, nothing else. Be creative and unique!'
          },
          {
            role: 'user',
            content: `Generate a unique, creative 4-letter finance-related nickname code for: ${fullName}\n\nSome examples (but create something NEW and different): ${randomExamples}\n\nSeed: ${randomSeed}\n\nOutput only the 4-letter code:`
          }
        ],
        temperature: 1.0,
        max_tokens: 20,
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      })

      text = text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
      
      if (text.length === 4) {
        return text
      }
      
      throw new Error('Groq response invalid')
      
    } catch (groqError) {
      console.error('❌ Groq also failed:', groqError)
      
      // Final fallback: use finance-related 4-letter codes
      const financeWords = ['CASH', 'GOLD', 'MINT', 'SAGE', 'APEX', 'FLUX', 'COIN', 'BANK', 'RICH', 'SAVE', 'EARN', 'GAIN', 'FUND', 'DEBT', 'PAYS', 'DEAL', 'EDGE', 'RISK', 'BULL', 'BEAR']
      
      // Use hash of name to consistently pick same code for same name
      let hash = 0
      for (let i = 0; i < fullName.length; i++) {
        hash = ((hash << 5) - hash) + fullName.charCodeAt(i)
        hash = hash & hash
      }
      
      const index = Math.abs(hash) % financeWords.length
      return financeWords[index]
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

  const { fullName } = req.body

  if (!fullName || typeof fullName !== 'string') {
    return res.status(400).json({ error: 'Full name is required' })
  }

  await trackUsageForRequest(req, 'ai_nickname')

  try {
    const nickname = await generateNickname(fullName)
    return res.status(200).json({ nickname })
  } catch (e: any) {
    console.error('Nickname generation error:', e)
    return res.status(500).json({ error: e.message || 'Failed to generate nickname' })
  }
}
