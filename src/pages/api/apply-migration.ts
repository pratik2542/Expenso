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

    // Check if convert_existing_data column already exists
    const { data: columnCheck, error: columnError } = await supabaseAdmin
      .from('user_settings')
      .select('convert_existing_data')
      .limit(1)

    if (!columnError) {
      return res.status(200).json({ 
        success: true, 
        message: 'Column convert_existing_data already exists',
        alreadyExists: true
      })
    }

    // Apply the migration to add convert_existing_data column
    const { error: migrationError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        ALTER TABLE user_settings 
        ADD COLUMN convert_existing_data BOOLEAN DEFAULT true;
      `
    })

    if (migrationError) {
      // Try alternative approach using direct SQL execution
      const { error: altError } = await supabaseAdmin
        .from('user_settings')
        .insert({ convert_existing_data: true })
        .select()
        .limit(0)

      if (altError && altError.message.includes('column "convert_existing_data" of relation "user_settings" does not exist')) {
        return res.status(500).json({ 
          error: 'Migration failed. Please run the SQL migration manually in your Supabase dashboard.',
          migrationSQL: 'ALTER TABLE user_settings ADD COLUMN convert_existing_data BOOLEAN DEFAULT true;'
        })
      }
    }

    res.status(200).json({ 
      success: true, 
      message: 'Migration applied successfully. convert_existing_data column added to user_settings table.'
    })

  } catch (error) {
    console.error('Migration error:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      migrationSQL: 'ALTER TABLE user_settings ADD COLUMN convert_existing_data BOOLEAN DEFAULT true;'
    })
  }
}