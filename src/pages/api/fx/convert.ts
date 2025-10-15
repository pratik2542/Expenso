import type { NextApiRequest, NextApiResponse } from 'next'

// Simple passthrough FX conversion using exchangerate-api.com (free tier)
// Example: /api/fx/convert?from=USD&to=INR
// Response: { success: boolean, rate: number, from: string, to: string, fetchedAt: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { from, to } = req.query
  if (typeof from !== 'string' || typeof to !== 'string') {
    return res.status(400).json({ success: false, error: 'from & to required' })
  }
  if (from === to) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ success: true, rate: 1, from, to, fetchedAt: new Date().toISOString() })
  }
  try {
    // Using exchangerate-api.com which offers free tier without API key
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`Upstream error ${r.status}`)
    const data = await r.json()
    const rate = data?.rates?.[to]
    if (!rate || isNaN(Number(rate))) throw new Error('Invalid rate data')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ success: true, rate: Number(rate), from, to, fetchedAt: new Date().toISOString() })
  } catch (e:any) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(500).json({ success: false, error: e.message || 'Failed to fetch rate', from, to })
  }
}
