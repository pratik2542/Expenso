import { NextApiRequest, NextApiResponse } from 'next'
import { setCorsHeaders } from '@/lib/cors'
import { getCategoryIcon } from '@/lib/defaultCategories'

// Fallback function to try Perplexity API
async function tryPerplexity(categoryName: string, perplexityKey: string): Promise<string | null> {
  try {
    console.log('Trying Perplexity API as fallback...')
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are an emoji suggestion assistant. Reply with only one emoji character, nothing else.'
          },
          {
            role: 'user',
            content: `Suggest one emoji for the category: "${categoryName}"`
          }
        ],
        max_tokens: 10,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      console.error('Perplexity API error:', response.status)
      return null
    }

    const data = await response.json()
    console.log('Perplexity response:', JSON.stringify(data, null, 2))
    
    const generatedText = data.choices?.[0]?.message?.content || ''
    console.log('Perplexity generated text:', generatedText)
    
    if (generatedText) {
      // Extract emoji from response
      const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu
      const emojiMatches = generatedText.match(emojiRegex)
      const emoji = emojiMatches && emojiMatches.length > 0 ? emojiMatches[0] : null
      console.log('Extracted emoji from Perplexity:', emoji)
      return emoji
    }
    
    return null
  } catch (error: any) {
    console.error('Perplexity API error:', error.message)
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res)

  // Handle CORS preflight for native (cross-origin) calls.
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { categoryName } = req.body

    if (!categoryName) {
      return res.status(400).json({ error: 'Category name is required' })
    }

    const geminiKey = process.env.GEMINI_API_KEY
    const perplexityKey = process.env.PERPLEXITY_API_KEY

    // If AI keys aren't configured in the deployment, don't fail the UI.
    // Return a deterministic fallback emoji instead.
    if (!geminiKey && !perplexityKey) {
      const fallback = getCategoryIcon(categoryName) || '📦'
      return res.status(200).json({ emoji: fallback, source: 'fallback' })
    }

    let emoji: string | null = null

    // Try Gemini first if available
    if (geminiKey) {
      try {
        const prompt = `Suggest one emoji for the category: "${categoryName}"

Return only the emoji character. No text, no explanation.`

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 50,
                candidateCount: 1,
              },
            }),
          }
        )

        if (response.ok) {
          const data = await response.json()
          console.log('Gemini response:', JSON.stringify(data, null, 2))
          
          const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          console.log('Generated text:', generatedText)
          
          if (generatedText) {
            // Extract emoji from response
            const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu
            const emojiMatches = generatedText.match(emojiRegex)
            emoji = emojiMatches && emojiMatches.length > 0 ? emojiMatches[0] : null
            console.log('Extracted emoji from Gemini:', emoji)
          }
        } else {
          const errorText = await response.text()
          console.warn('Gemini API failed:', response.status, errorText)
          
          // Check if it's a rate limit or quota error
          if (response.status === 429 || response.status === 403) {
            console.log('Gemini rate limit/quota exceeded, trying Perplexity...')
          }
        }
      } catch (error: any) {
        console.error('Gemini API error:', error.message)
      }
    }

    // If Gemini failed or no emoji, try Perplexity
    if (!emoji && perplexityKey) {
      emoji = await tryPerplexity(categoryName, perplexityKey)
    }

    // Return emoji or deterministic default
    const finalEmoji = emoji || getCategoryIcon(categoryName) || '📦'
    console.log('Final emoji:', finalEmoji)
    return res.status(200).json({ emoji: finalEmoji })
  } catch (error: any) {
    console.error('Error generating emoji:', error)
    const categoryName = typeof req.body?.categoryName === 'string' ? req.body.categoryName : ''
    const fallback = getCategoryIcon(categoryName) || '📦'
    return res.status(200).json({ emoji: fallback, source: 'fallback' })
  }
}
