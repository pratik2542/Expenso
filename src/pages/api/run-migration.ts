import { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Run the migration to add convert_existing_data column
    const { data, error } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE user_settings 
        ADD COLUMN IF NOT EXISTS convert_existing_data BOOLEAN DEFAULT true;
      `
    })

    if (error) {
      console.error('Migration error:', error)
      // Try an alternative approach using raw SQL
      const { error: error2 } = await supabase
        .from('user_settings')
        .select('convert_existing_data')
        .limit(1)
      
      if (error2 && error2.message.includes('convert_existing_data')) {
        // Column doesn't exist, we need to add it manually
        return res.status(400).json({ 
          error: 'Migration needed - column does not exist',
          message: 'Please run the migration SQL manually in Supabase dashboard',
          sql: 'ALTER TABLE user_settings ADD COLUMN convert_existing_data BOOLEAN DEFAULT true;'
        })
      }
    }

    return res.status(200).json({ 
      message: 'Migration completed successfully',
      data
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}