import type { NextApiRequest, NextApiResponse } from 'next'
import { adminDb } from '@/lib/firebaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { token, newPassword } = req.body

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Reset token is required' })
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password is required' })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    // Find the token in Firestore
    const tokensRef = adminDb.collection('password_reset_tokens')
    const snapshot = await tokensRef.where('token', '==', token).limit(1).get()

    if (snapshot.empty) {
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }

    const tokenDoc = snapshot.docs[0]
    const tokenData = tokenDoc.data()

    // Check if token is expired
    if (tokenData.expiresAt < Date.now()) {
      // Clean up expired token
      await tokenDoc.ref.delete()
      return res.status(400).json({ error: 'Reset token has expired' })
    }

    // Check if token was already used
    if (tokenData.used) {
      return res.status(400).json({ error: 'Reset token has already been used' })
    }

    // Update the password in Firebase Auth
    const auth = (await import('firebase-admin/auth')).getAuth()
    const userId = tokenDoc.id

    await auth.updateUser(userId, {
      password: newPassword
    })

    // Mark token as used
    await tokenDoc.ref.update({
      used: true,
      usedAt: Date.now()
    })

    // Optionally, you could delete the token instead
    // await tokenDoc.ref.delete()

    return res.status(200).json({ 
      success: true, 
      message: 'Password has been reset successfully' 
    })

  } catch (error: any) {
    console.error('Password reset error:', error)
    return res.status(500).json({ error: 'Failed to reset password' })
  }
}
