import type { NextApiRequest, NextApiResponse } from 'next'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('Export-data API called without authentication header')
      return res.status(401).json({ error: 'Authentication required. Please log in first.' })
    }
    const token = authHeader.slice('Bearer '.length)
    
    const decodedToken = await adminAuth.verifyIdToken(token)
    const userId = decodedToken.uid
    
    // Fetch all user data
    const [expensesSnap, budgetsSnap, categoriesSnap, incomeSnap] = await Promise.all([
      adminDb.collection('expenses').doc(userId).collection('items').get(),
      adminDb.collection('budgets').doc(userId).collection('items').get(),
      adminDb.collection('categories').doc(userId).collection('items').get(),
      adminDb.collection('monthly_income').doc(userId).collection('items').get(),
    ])

    // Get user_settings by querying with user_id field (not document ID)
    const userSettingsQuery = adminDb.collection('user_settings').where('user_id', '==', userId)
    const userSettingsSnap = await userSettingsQuery.get()
    const userSettings = userSettingsSnap.empty ? null : userSettingsSnap.docs[0].data()
    
    return res.status(200).json({
      exported_at: new Date().toISOString(),
      expenses: expensesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
      budgets: budgetsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
      categories: categoriesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
      monthly_income: incomeSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
      user_settings: userSettings ? { id: userSettingsSnap.docs[0].id, ...userSettings } : null
    })
  } catch (e: unknown) {
    console.error('Export-data API error:', e)
    return res.status(500).json({ error: 'Failed to export data' })
  }
}