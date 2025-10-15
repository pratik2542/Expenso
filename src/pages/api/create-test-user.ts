import { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: 'test@example.com',
      password: 'testpassword123',
      options: {
        data: { full_name: 'Test User' },
      },
    })

    if (error) {
      console.error('Signup error:', error)
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({ 
      message: 'Test user created successfully',
      user: data.user?.id,
      needsVerification: !!data?.user && !data.user.email_confirmed_at
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}