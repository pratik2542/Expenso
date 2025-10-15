import { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get all user_settings to see what's in the database
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      return res.status(500).json({ 
        error: 'Database error: ' + error.message,
        details: error
      })
    }

    res.status(200).json({ 
      success: true, 
      user_settings: data,
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Debug error:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}