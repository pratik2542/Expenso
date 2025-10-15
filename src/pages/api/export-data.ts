import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = authHeader.slice('Bearer '.length)
    const { data: userData, error: getUserErr } = await supabaseAdmin.auth.getUser(token)
    if (getUserErr || !userData.user) return res.status(401).json({ error: 'Invalid token' })
    const userId = userData.user.id
    const [expenses, budgets, userSettings, profile] = await Promise.all([
      supabaseAdmin.from('expenses').select('*').eq('user_id', userId),
      supabaseAdmin.from('budgets').select('*').eq('user_id', userId),
      supabaseAdmin.from('user_settings').select('*').eq('user_id', userId),
      supabaseAdmin.from('profiles').select('*').eq('id', userId),
    ])
    return res.status(200).json({
      exported_at: new Date().toISOString(),
      expenses: expenses.data || [],
      budgets: budgets.data || [],
      user_settings: userSettings.data || [],
      profile: profile.data || []
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return res.status(500).json({ error: msg })
  }
}