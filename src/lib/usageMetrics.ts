import type { NextApiRequest } from 'next'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebaseAdmin'

export type UsageEvent =
  | 'ai_analytics'
  | 'ai_duplicates'
  | 'ai_emoji'
  | 'ai_nickname'
  | 'import_csv'
  | 'import_pdf'

export function getRequestUserId(req: NextApiRequest): string | null {
  const headerVal = req.headers['x-user-id']
  const fromHeader = Array.isArray(headerVal) ? headerVal[0] : headerVal

  let fromBody: unknown = undefined
  if (req.body && typeof req.body === 'object') {
    fromBody = (req.body as any).userId
  }

  const candidate = (fromHeader || fromBody || '').toString().trim()
  if (!candidate || candidate === 'anonymous') return null
  return candidate
}

export async function trackUsageEvent(userId: string | null, event: UsageEvent): Promise<void> {
  if (!userId) return

  const today = new Date().toISOString().slice(0, 10)
  const ref = adminDb.collection('user_usage_metrics').doc(userId)

  const payload: Record<string, any> = {
    user_id: userId,
    updated_at: FieldValue.serverTimestamp(),
  }

  if (event.startsWith('ai_')) {
    payload.ai_requests_total = FieldValue.increment(1)
    payload.ai_active_days = FieldValue.arrayUnion(today)
    payload.last_ai_request_at = FieldValue.serverTimestamp()
  }

  switch (event) {
    case 'ai_analytics':
      payload.ai_analytics_requests_total = FieldValue.increment(1)
      break
    case 'ai_duplicates':
      payload.ai_duplicate_requests_total = FieldValue.increment(1)
      break
    case 'ai_emoji':
      payload.ai_emoji_requests_total = FieldValue.increment(1)
      break
    case 'ai_nickname':
      payload.ai_nickname_requests_total = FieldValue.increment(1)
      break
    case 'import_csv':
      payload.import_csv_requests_total = FieldValue.increment(1)
      payload.import_csv_days = FieldValue.arrayUnion(today)
      payload.last_import_csv_at = FieldValue.serverTimestamp()
      break
    case 'import_pdf':
      payload.import_pdf_requests_total = FieldValue.increment(1)
      payload.import_pdf_days = FieldValue.arrayUnion(today)
      payload.last_import_pdf_at = FieldValue.serverTimestamp()
      break
  }

  await ref.set(payload, { merge: true })
}

export async function trackUsageForRequest(req: NextApiRequest, event: UsageEvent): Promise<void> {
  try {
    const userId = getRequestUserId(req)
    await trackUsageEvent(userId, event)
  } catch (error) {
    console.error('[UsageMetrics] Tracking failed:', error)
  }
}
