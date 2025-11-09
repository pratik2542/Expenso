import { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

/**
 * Keep-alive endpoint to prevent Supabase database auto-deactivation.
 * Call this periodically (e.g., every 6 days) to maintain database activity.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Perform a simple query to keep the database active
    const { data, error } = await supabase
      .from('expenses')
      .select('count(*)', { count: 'exact' })
      .limit(1)

    if (error) {
      console.error('Keep-alive error:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({
      success: true,
      message: 'Database keep-alive ping successful',
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('Keep-alive exception:', err)
    return res.status(500).json({ error: err.message })
  }
}
