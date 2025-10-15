import { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Insert test user settings (without convert_existing_data for now)
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: 'test-user-id',
        currency: 'INR',
      })
      .select()

    if (error) {
      console.error('Insert error:', error)
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({ 
      message: 'Test user settings created successfully',
      data
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}