import type { NextApiRequest, NextApiResponse } from 'next'
import { adminDb } from '@/lib/firebaseAdmin'

/**
 * Cron job to clean up expired password reset tokens
 * Should be run daily
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify cron secret for security
  const authHeader = req.headers.authorization
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const now = Date.now()
    
    // Find all expired tokens
    const tokensRef = adminDb.collection('password_reset_tokens')
    const expiredTokensSnapshot = await tokensRef
      .where('expiresAt', '<', now)
      .get()

    if (expiredTokensSnapshot.empty) {
      return res.status(200).json({ 
        success: true, 
        message: 'No expired tokens to clean up',
        deleted: 0 
      })
    }

    // Delete expired tokens in batches
    const batch = adminDb.batch()
    let count = 0

    expiredTokensSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref)
      count++
    })

    await batch.commit()

    return res.status(200).json({ 
      success: true, 
      message: `Cleaned up ${count} expired password reset tokens`,
      deleted: count 
    })

  } catch (error: any) {
    console.error('Token cleanup error:', error)
    return res.status(500).json({ error: 'Failed to clean up expired tokens' })
  }
}
