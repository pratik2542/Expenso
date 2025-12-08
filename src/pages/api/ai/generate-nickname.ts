import { NextApiRequest, NextApiResponse } from 'next'

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 1000, // Gemini 2.5 uses ~100 tokens for thinking, need extra for output
          }
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details')
      console.error('❌ Gemini API Error:', response.status, errorText)
      throw new Error(`Gemini API failed: ${response.status} ${errorText}`)
    }

    const result = await response.json()
    
    // Log full response for debugging
    console.log('🔍 Full Gemini Response:', JSON.stringify(result, null, 2))
    
    let text = ''
    const candidate = result?.candidates?.[0]
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          text = part.text.trim()
          break
        }
      }
    }

    console.log('🤖 AI Raw Response:', text || '(EMPTY - AI returned nothing!)')
    
    // If AI returned empty, throw error to trigger fallback
    if (!text || text.length === 0) {
      throw new Error('AI returned empty response')
    }

    // Clean up - extract only letters
    text = text.toUpperCase().replace(/[^A-Z]/g, '')
    
    console.log('📝 After cleanup (letters only):', text)
    
    // Try to get first 4 letters
    if (text.length >= 4) {
      const final = text.slice(0, 4)
      console.log('✅ Generated 4-letter code:', final, `(for: ${fullName})`)
      return final
    }
    
    // If AI response is too short, pad with letters from name
    const nameLetters = fullName.toUpperCase().replace(/[^A-Z]/g, '')
    text = (text + nameLetters).slice(0, 4)
    
    console.log('⚠️ AI response too short, padded with name letters:', text)
    
    if (text.length === 4) {
      console.log('✅ Generated 4-letter code:', text, `(for: ${fullName})`)
      return text
    }

    // Last resort fallback
    throw new Error('Could not generate 4-letter code')

  } catch (geminiError) {
    console.warn('❌ Gemini failed, trying Perplexity fallback:', geminiError)
    
    // Try Perplexity as fallback
    try {
      const perplexityKey = process.env.PERPLEXITY_API_KEY
      if (!perplexityKey) throw new Error('No Perplexity API key')
      
      // Add randomness to prompt to get different results each time
      const randomSeed = Math.random().toString(36).substring(7)
      const randomExamples = ['CASH', 'GOLD', 'MINT', 'SAGE', 'APEX', 'FLUX', 'COIN', 'BANK', 'RICH', 'SAVE', 'EARN', 'GAIN']
        .sort(() => Math.random() - 0.5)
        .slice(0, 5)
        .join(', ')
      
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
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
          max_tokens: 20
        })
      })
      
      if (!response.ok) throw new Error('Perplexity API failed')
      
      const result = await response.json()
      let text = result.choices[0]?.message?.content || ''
      text = text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
      
      if (text.length === 4) {
        console.log('✅ Perplexity generated code:', text, `(for: ${fullName})`)
        return text
      }
      
      throw new Error('Perplexity response invalid')
      
    } catch (perplexityError) {
      console.error('❌ Perplexity also failed:', perplexityError)
      
      // Final fallback: use finance-related 4-letter codes
      const financeWords = ['CASH', 'GOLD', 'MINT', 'SAGE', 'APEX', 'FLUX', 'COIN', 'BANK', 'RICH', 'SAVE', 'EARN', 'GAIN', 'FUND', 'DEBT', 'PAYS', 'DEAL', 'EDGE', 'RISK', 'BULL', 'BEAR']
      
      // Use hash of name to consistently pick same code for same name
      let hash = 0
      for (let i = 0; i < fullName.length; i++) {
        hash = ((hash << 5) - hash) + fullName.charCodeAt(i)
        hash = hash & hash
      }
      
      const index = Math.abs(hash) % financeWords.length
      const code = financeWords[index]
      
      console.log('💡 Using smart fallback code:', code, `(for: ${fullName})`)
      return code
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { fullName } = req.body

  if (!fullName || typeof fullName !== 'string') {
    return res.status(400).json({ error: 'Full name is required' })
  }

  try {
    const nickname = await generateNickname(fullName)
    return res.status(200).json({ nickname })
  } catch (e: any) {
    console.error('Nickname generation error:', e)
    return res.status(500).json({ error: e.message || 'Failed to generate nickname' })
  }
}
