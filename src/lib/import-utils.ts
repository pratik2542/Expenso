import crypto from 'crypto'

export type ParsedExpense = {
    amount: number
    currency: string
    merchant?: string
    payment_method?: string
    note?: string
    occurred_on: string
    category?: string
    line_index?: number
}

function debugEnabled() {
    return process.env.DEBUG_AI_PARSE === '1'
}

function hashOf(text: string): string {
    try {
        return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
    } catch {
        let h = 0
        for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
        return Math.abs(h).toString(16)
    }
}

export async function callPerplexity(prompt: string, contextType: 'spreadsheet' | 'pdf' = 'spreadsheet'): Promise<ParsedExpense[]> {
    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY')

    const system = `You are a finance assistant. Extract all expense transactions from the provided ${contextType === 'pdf' ? 'bank statement text' : 'spreadsheet rows'}. Return structured JSON only. Do not include any PII.`

    let userInstruction = ''
    if (contextType === 'spreadsheet') {
        userInstruction = `The input below is a list of NUMBERED LINES from a bank/credit card statement (from an Excel/CSV export). Extract transactions strictly from these lines.\n\n${prompt}\n\nRules:\n- Output an "expenses" array that follows the order of the numbered lines.\n- Use ISO date YYYY-MM-DD. If two dates appear, use the LATER/POSTED date.\n- Currency codes must be ISO 4217.\n- If merchant is missing, omit.\n- If payment method is missing, omit.\n- Category is optional.\n- Note: Short human-friendly purpose. No dates in note.\n- Signs: Purchases positive, refunds/credits negative.\n- Include "line_index" for each transaction (1-based number from input).`
    } else {
        userInstruction = `The input below is raw text from a PDF bank statement. Extract distinct transactions.\n\n${prompt}\n\nRules:\n- Output an "expenses" array.\n- Use ISO date YYYY-MM-DD.\n- Currency codes must be ISO 4217.\n- Signs: Purchases positive, refunds/credits negative (look for 'CR' or negative signs).\n- Note: Short description.\n- Do not halluciante transactions not in the text.`
    }

    const url = 'https://api.perplexity.ai/chat/completions'
    const model = process.env.PERPLEXITY_MODEL || 'sonar'

    if (debugEnabled()) console.log(`[AI Parse ${contextType} Debug] calling Perplexity`, { promptHash: hashOf(prompt), chars: prompt.length })

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: userInstruction },
                ],
                temperature: 0,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'expenses_schema',
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                expenses: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            amount: { type: 'number' },
                                            currency: { type: 'string' },
                                            direction: { type: 'string', enum: ['debit', 'credit'] },
                                            merchant: { type: 'string' },
                                            payment_method: { type: 'string' },
                                            note: { type: 'string' },
                                            occurred_on: { type: 'string' },
                                            category: { type: 'string' },
                                            line_index: { type: 'integer' }
                                        },
                                        required: ['amount', 'currency', 'occurred_on']
                                    }
                                }
                            },
                            required: ['expenses']
                        }
                    },
                },
            }),
        })

        if (!resp.ok) {
            const text = await resp.text().catch(() => '')
            throw new Error(`Perplexity API error: ${resp.status} ${text}`)
        }

        const json = await resp.json()
        const content = json?.choices?.[0]?.message?.content || '{}'
        let parsed: any
        try {
            parsed = typeof content === 'string' ? JSON.parse(content) : content
        } catch {
            throw new Error('Model returned non-JSON output')
        }

        return Array.isArray(parsed?.expenses) ? parsed.expenses : []
    } catch (e) {
        console.error('AI Call failed', e)
        throw e
    }
}
