import type { NextApiRequest, NextApiResponse } from 'next'
import path from 'path'
import { readFile } from 'fs/promises'
import { setCorsHeaders } from '@/lib/cors'

export const config = {
  maxDuration: 60,
}

type ScreenKey =
  | 'settings'
  | 'analytics'
  | 'dashboard'
  | 'expenses'
  | 'budget'
  | 'categories'
  | 'ai-insights'

const SCREENSHOT_MAP: Record<ScreenKey, string> = {
  settings: 'settings.png',
  analytics: 'analytics-detailed.png',
  dashboard: 'dashboard-desktop.png',
  expenses: 'expenses-list.png',
  budget: 'budget-overview.png',
  categories: 'categories-management.png',
  'ai-insights': 'ai-insights.png',
}

type GroqImageCopy = {
  headline: string
  subheadline: string
  accent: string
}

type GeneratedImageResult = {
  mimeType: 'image/svg+xml'
  base64: string
  model: string
  copy: GroqImageCopy
}

function resolveScreenFromPrompt(prompt: string): ScreenKey {
  const text = prompt.toLowerCase()
  if (text.includes('setting') || text.includes('theme') || text.includes('black') || text.includes('dark')) return 'settings'
  if (text.includes('analytic')) return 'analytics'
  if (text.includes('budget')) return 'budget'
  if (text.includes('categor')) return 'categories'
  if (text.includes('expense')) return 'expenses'
  if (text.includes('insight') || text.includes('ai')) return 'ai-insights'
  return 'dashboard'
}

function clampText(value: string, maxLength: number): string {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.slice(0, maxLength)
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseGroqJson(content: string): GroqImageCopy {
  const fallback: GroqImageCopy = {
    headline: 'Expenso Update',
    subheadline: 'New app improvements are now live.',
    accent: '#3b82f6',
  }

  try {
    const clean = content.replace(/```json/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(clean)
    const accent = String(parsed?.accent || '#3b82f6').trim()
    const safeAccent = /^#([0-9a-fA-F]{6})$/.test(accent) ? accent : '#3b82f6'
    return {
      headline: clampText(parsed?.headline || fallback.headline, 72) || fallback.headline,
      subheadline: clampText(parsed?.subheadline || fallback.subheadline, 140) || fallback.subheadline,
      accent: safeAccent,
    }
  } catch {
    return fallback
  }
}

function wrapByWords(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > maxCharsPerLine && current) {
      lines.push(current)
      current = word
      if (lines.length >= maxLines) break
    } else {
      current = test
    }
  }

  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

function buildSvgImage(copy: GroqImageCopy, screenshotBase64: string): string {
  const headlineLines = wrapByWords(copy.headline, 16, 3)
  const subLines = wrapByWords(copy.subheadline, 28, 4)

  const headlineTspans = headlineLines
    .map((line, idx) => `<tspan x="88" dy="${idx === 0 ? 0 : 66}">${escapeXml(line)}</tspan>`)
    .join('')

  const subTspans = subLines
    .map((line, idx) => `<tspan x="88" dy="${idx === 0 ? 0 : 40}">${escapeXml(line)}</tspan>`)
    .join('')

  const screenshotDataUrl = `data:image/png;base64,${screenshotBase64}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Expenso update banner">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#030712" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <radialGradient id="glow" cx="22%" cy="14%" r="40%">
      <stop offset="0%" stop-color="${copy.accent}" stop-opacity="0.7" />
      <stop offset="100%" stop-color="${copy.accent}" stop-opacity="0" />
    </radialGradient>
    <clipPath id="shotClip">
      <rect x="520" y="76" width="620" height="478" rx="20" ry="20" />
    </clipPath>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="700" height="380" fill="url(#glow)" />

  <rect x="58" y="58" width="420" height="514" rx="18" ry="18" fill="rgba(255,255,255,0.12)" />

  <image href="${screenshotDataUrl}" x="520" y="76" width="620" height="478" preserveAspectRatio="xMidYMid slice" clip-path="url(#shotClip)" />
  <rect x="520" y="76" width="620" height="478" rx="20" ry="20" fill="rgba(2,6,23,0.18)" />

  <text x="88" y="178" fill="#e5edff" font-size="54" font-weight="700" font-family="Arial, Helvetica, sans-serif">${headlineTspans}</text>
  <text x="88" y="${178 + 66 * headlineLines.length + 12}" fill="#b6c4de" font-size="28" font-weight="400" font-family="Arial, Helvetica, sans-serif">${subTspans}</text>

  <rect x="88" y="474" width="300" height="5" fill="${copy.accent}" />
  <text x="88" y="523" fill="#dbeafe" font-size="23" font-weight="600" font-family="Arial, Helvetica, sans-serif">Available now in Expenso</text>
</svg>`
}

async function callGroqAndRenderImage(
  apiKey: string,
  userPrompt: string,
  screenshotBuffer: Buffer,
  selectedScreen: ScreenKey,
  modelOverride?: string
): Promise<GeneratedImageResult> {
  const model = String(modelOverride || process.env.GROQ_IMAGE_TEXT_MODEL || 'llama-3.3-70b-versatile').trim()
  if (!model) {
    throw new Error('GROQ_IMAGE_TEXT_MODEL is not configured')
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content:
            'You create short marketing copy for product update banners. Return valid JSON only with keys: headline, subheadline, accent. headline max 9 words. subheadline max 18 words. accent must be a hex color like #3b82f6.',
        },
        {
          role: 'user',
          content: `App: Expenso\nScreen: ${selectedScreen}\nFeature update: ${userPrompt}\nOutput JSON only.`,
        },
      ],
      response_format: {
        type: 'json_object',
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`groq ${model} failed: ${response.status} ${err.slice(0, 400)}`)
  }

  const groqResult = await response.json()
  const content = String(groqResult?.choices?.[0]?.message?.content || '')
  const copy = parseGroqJson(content)

  const screenshotBase64 = screenshotBuffer.toString('base64')
  const svg = buildSvgImage(copy, screenshotBase64)
  const base64 = Buffer.from(svg, 'utf8').toString('base64')

  return {
    mimeType: 'image/svg+xml',
    base64,
    model,
    copy,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) {
    return res.status(500).json({ error: 'Set GROQ_API_KEY' })
  }

  const context = String(req.body?.context || '').trim()
  const requestedModel = String(req.body?.model || '').trim()
  const requestedScreen = String(req.body?.screen || '').trim().toLowerCase() as ScreenKey

  if (!context) {
    return res.status(400).json({ error: 'context is required' })
  }

  const selectedScreen: ScreenKey = SCREENSHOT_MAP[requestedScreen]
    ? requestedScreen
    : resolveScreenFromPrompt(context)

  const screenshotFile = SCREENSHOT_MAP[selectedScreen]
  const screenshotPath = path.join(process.cwd(), 'public', 'screenshots', screenshotFile)

  try {
    const screenshotBuffer = await readFile(screenshotPath)
    const generated = await callGroqAndRenderImage(
      groqApiKey,
      context,
      screenshotBuffer,
      selectedScreen,
      requestedModel || undefined
    )

    const imageDataUrl = `data:${generated.mimeType};base64,${generated.base64}`

    return res.status(200).json({
      imageDataUrl,
      provider: 'groq',
      model: generated.model,
      screenUsed: selectedScreen,
      sourceScreenshot: `/screenshots/${screenshotFile}`,
      generatedCopy: generated.copy,
    })
  } catch (error: any) {
    console.error('[generate-marketing-image] error:', error)
    return res.status(500).json({
      error: 'Failed to generate image with Groq',
      details: error?.message || String(error),
    })
  }
}
