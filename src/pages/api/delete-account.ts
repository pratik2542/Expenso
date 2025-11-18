import type { NextApiRequest, NextApiResponse } from 'next'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

async function deleteCollection(userId: string, collectionName: string, log: { collection: string; error?: string }[]) {
  try {
    const collectionRef = adminDb.collection(collectionName).doc(userId).collection('items')
    const snapshot = await collectionRef.get()
    const batch = adminDb.batch()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    log.push({ collection: collectionName })
  } catch (error: any) {
    log.push({ collection: collectionName, error: error.message })
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = authHeader.slice('Bearer '.length)
    
    const decodedToken = await adminAuth.verifyIdToken(token)
    const userId = decodedToken.uid

    const { soft = false, export: doExport = false } = (req.body && typeof req.body === 'object') ? req.body : {}

    interface ExportPayload {
      expenses: unknown[]
      budgets: unknown[]
      user_settings: unknown
      categories: unknown[]
      monthly_income: unknown[]
    }
    let exportPayload: ExportPayload | null = null
    if (doExport) {
      const [expensesSnap, budgetsSnap, userSettingsDoc, categoriesSnap, incomeSnap] = await Promise.all([
        adminDb.collection('expenses').doc(userId).collection('items').get(),
        adminDb.collection('budgets').doc(userId).collection('items').get(),
        adminDb.collection('user_settings').doc(userId).get(),
        adminDb.collection('categories').doc(userId).collection('items').get(),
        adminDb.collection('monthly_income').doc(userId).collection('items').get(),
      ])
      exportPayload = {
        expenses: expensesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
        budgets: budgetsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
        categories: categoriesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
        monthly_income: incomeSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
        user_settings: userSettingsDoc.exists ? { id: userSettingsDoc.id, ...userSettingsDoc.data() } : null
      }
    }

    if (soft) {
      // Soft delete - mark as deleted but keep data
      const snapshot = JSON.stringify(exportPayload || {})
      await adminDb.collection('deleted_accounts').doc(userId).set({
        snapshot,
        deleted_at: new Date().toISOString()
      })
      await adminAuth.updateUser(userId, {
        disabled: true,
        displayName: 'Deleted User'
      })
      return res.status(200).json({ success: true, soft: true, exported: !!exportPayload, data: exportPayload })
    }

    // Hard delete - remove all data
    const collectionDeletes: { collection: string; error?: string }[] = []
    await deleteCollection(userId, 'expenses', collectionDeletes)
    await deleteCollection(userId, 'budgets', collectionDeletes)
    await deleteCollection(userId, 'categories', collectionDeletes)
    await deleteCollection(userId, 'monthly_income', collectionDeletes)
    
    // Delete user settings
    try {
      await adminDb.collection('user_settings').doc(userId).delete()
      collectionDeletes.push({ collection: 'user_settings' })
    } catch (error: any) {
      collectionDeletes.push({ collection: 'user_settings', error: error.message })
    }

    // Delete user from Auth
    await adminAuth.deleteUser(userId)
    
    return res.status(200).json({ success: true, soft: false, exported: !!exportPayload, data: exportPayload, details: collectionDeletes })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return res.status(500).json({ error: msg })
  }
}
