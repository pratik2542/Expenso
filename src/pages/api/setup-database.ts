import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get service role key from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ 
        error: 'Missing SUPABASE_SERVICE_ROLE_KEY in environment variables' 
      })
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Test if profiles table exists
    const { data: profileTest, error: profileTestError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .limit(1)

    // Test if user_settings table exists  
    const { data: settingsTest, error: settingsTestError } = await supabaseAdmin
      .from('user_settings')
      .select('id')
      .limit(1)

    const missingTables = []
    if (profileTestError?.message?.includes('relation') && profileTestError.message.includes('does not exist')) {
      missingTables.push('profiles')
    }
    if (settingsTestError?.message?.includes('relation') && settingsTestError.message.includes('does not exist')) {
      missingTables.push('user_settings')
    }

    if (missingTables.length > 0) {
      return res.status(400).json({ 
        error: `Missing tables: ${missingTables.join(', ')}`,
        missingTables,
        needsManualSetup: true
      })
    }

    res.status(200).json({ 
      success: true, 
      message: 'All required database tables exist',
      tablesFound: ['profiles', 'user_settings']
    })

  } catch (error) {
    console.error('Setup error:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
}
