export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GroqChatOptions = {
  messages: GroqChatMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
}

export async function groqChatCompletion(options: GroqChatOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('Missing GROQ_API_KEY')

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 2048,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Groq API error: ${response.status} ${errorText}`)
  }

  const json = await response.json()
  return json?.choices?.[0]?.message?.content || ''
}
