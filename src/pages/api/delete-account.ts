import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client with service role (DO NOT expose this key to the client)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string

if (!supabaseUrl || !serviceKey) {
  // eslint-disable-next-line no-console
  console.warn('[delete-account] Missing SUPABASE env vars; endpoint will fail.')
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

async function safeDelete(table: string, column: string, userId: string, log: { table: string; error?: string }[]) {
  const { error } = await supabaseAdmin.from(table).delete().eq(column, userId)
  if (error) log.push({ table, error: error.message })
  else log.push({ table })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = authHeader.slice('Bearer '.length)
    const { data: userData, error: getUserErr } = await supabaseAdmin.auth.getUser(token)
    if (getUserErr || !userData.user) return res.status(401).json({ error: 'Invalid token' })
    const userId = userData.user.id

    const { soft = false, export: doExport = false } = (req.body && typeof req.body === 'object') ? req.body : {}

    interface ExportPayload {
      expenses: unknown[]
      budgets: unknown[]
      user_settings: unknown[]
      profile: unknown[]
    }
    let exportPayload: ExportPayload | null = null
    if (doExport) {
      const [expenses, budgets, userSettings, profile] = await Promise.all([
        supabaseAdmin.from('expenses').select('*').eq('user_id', userId),
        supabaseAdmin.from('budgets').select('*').eq('user_id', userId),
        supabaseAdmin.from('user_settings').select('*').eq('user_id', userId),
        supabaseAdmin.from('profiles').select('*').eq('id', userId),
      ])
      exportPayload = {
        expenses: expenses.data || [],
        budgets: budgets.data || [],
        user_settings: userSettings.data || [],
        profile: profile.data || []
      }
    }

    if (soft) {
      const snapshot = JSON.stringify(exportPayload || {})
      const { error: delAccErr } = await supabaseAdmin.from('deleted_accounts').insert({ user_id: userId, snapshot, deleted_at: new Date().toISOString() })
      if (delAccErr && delAccErr.code !== '42P01') {
        return res.status(500).json({ error: `Failed to record deletion snapshot: ${delAccErr.message}` })
      }
      const { error: profErr } = await supabaseAdmin.from('profiles').upsert({ id: userId, full_name: 'Deleted User', updated_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
      if (profErr && profErr.code !== '42P01') {
        return res.status(500).json({ error: `Failed to flag profile: ${profErr.message}` })
      }
      await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { deleted_at: new Date().toISOString(), deleted: true } })
      return res.status(200).json({ success: true, soft: true, exported: !!exportPayload, data: exportPayload })
    }

    const tableDeletes: { table: string; error?: string }[] = []
    await safeDelete('expenses', 'user_id', userId, tableDeletes)
    await safeDelete('user_settings', 'user_id', userId, tableDeletes)
    await safeDelete('profiles', 'id', userId, tableDeletes)
    await safeDelete('budgets', 'user_id', userId, tableDeletes)

    const { error: delUserErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (delUserErr) return res.status(500).json({ error: delUserErr.message, details: tableDeletes })
    return res.status(200).json({ success: true, soft: false, exported: !!exportPayload, data: exportPayload, details: tableDeletes })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return res.status(500).json({ error: msg })
  }
}
