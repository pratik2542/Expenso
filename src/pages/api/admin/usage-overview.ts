import type { NextApiRequest, NextApiResponse } from 'next'
import { adminDb } from '@/lib/firebaseAdmin'

type UserUsageRow = {
  userId: string
  email: string
  fullName: string
  lastSeenAt: string | null
  lastPlatform: 'apk' | 'web' | 'unknown'
  apkSessions: number
  webSessions: number
  totalSessions: number
  activeDays30: number
  aiRequestsTotal: number
  aiRequests30d: number
  csvImportsTotal: number
  csvImports30d: number
  pdfImportsTotal: number
  pdfImports30d: number
  estimatedStorageBytes: number
  estimatedStorageMB: number
  dataDocCount: number
}

type UsageResponse = {
  summary: {
    totalUsers: number
    activeUsers30d: number
    activeUsers7d: number
    apkUsers30d: number
    webUsers30d: number
    apkSessionSharePct: number
    webSessionSharePct: number
    totalEstimatedStorageMB: number
    totalAiRequests: number
    totalCsvImports: number
    totalPdfImports: number
  }
  users: UserUsageRow[]
}

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

function estimateBytes(data: Record<string, any>): number {
  try {
    return Buffer.byteLength(JSON.stringify(data), 'utf8')
  } catch {
    return 0
  }
}

function parseDateSafe(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function countRecentDays(activeDays: string[], lookbackDays: number): number {
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - lookbackDays)
  return activeDays.filter((d) => {
    const parsed = parseDateSafe(d)
    return parsed ? parsed >= threshold : false
  }).length
}

async function getUserStorageEstimate(userId: string): Promise<{ bytes: number; docs: number }> {
  const legacyCollections = ['expenses', 'accounts', 'categories', 'budgets', 'monthly_income', 'insights']
  const envCollections = ['expenses', 'accounts', 'categories', 'budgets', 'monthly_income', 'insights']

  let totalBytes = 0
  let totalDocs = 0

  // user_settings contributes small but useful metadata footprint.
  const userSettingsSnap = await adminDb.collection('user_settings').doc(userId).get()
  if (userSettingsSnap.exists) {
    totalDocs += 1
    totalBytes += estimateBytes(userSettingsSnap.data() || {})
  }

  for (const coll of legacyCollections) {
    const snap = await adminDb.collection(coll).doc(userId).collection('items').get()
    totalDocs += snap.size
    for (const d of snap.docs) {
      totalBytes += estimateBytes(d.data())
    }
  }

  const envSnap = await adminDb.collection('users').doc(userId).collection('environments').get()
  totalDocs += envSnap.size
  for (const envDoc of envSnap.docs) {
    totalBytes += estimateBytes(envDoc.data())

    for (const coll of envCollections) {
      const snap = await adminDb
        .collection('users')
        .doc(userId)
        .collection('environments')
        .doc(envDoc.id)
        .collection(coll)
        .get()
      totalDocs += snap.size
      for (const d of snap.docs) {
        totalBytes += estimateBytes(d.data())
      }
    }
  }

  return { bytes: totalBytes, docs: totalDocs }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UsageResponse | { error: string }>) {
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
    const limit = Math.min(Math.max(Number(limitRaw || 100), 1), 500)

    const usersSnap = await adminDb.collection('user_settings').limit(limit).get()

    const rows: UserUsageRow[] = await Promise.all(
      usersSnap.docs.map(async (uDoc) => {
        const userId = uDoc.id
        const settings = uDoc.data() || {}

        const activitySnap = await adminDb.collection('user_activity').doc(userId).get()
        const activity = (activitySnap.data() || {}) as Record<string, any>
        const usageMetricsSnap = await adminDb.collection('user_usage_metrics').doc(userId).get()
        const usageMetrics = (usageMetricsSnap.data() || {}) as Record<string, any>

        const activeDays = Array.isArray(activity.active_days) ? (activity.active_days as string[]) : []
        const activeDays30 = countRecentDays(activeDays, 30)
        const aiDays = Array.isArray(usageMetrics.ai_active_days) ? (usageMetrics.ai_active_days as string[]) : []
        const csvDays = Array.isArray(usageMetrics.import_csv_days) ? (usageMetrics.import_csv_days as string[]) : []
        const pdfDays = Array.isArray(usageMetrics.import_pdf_days) ? (usageMetrics.import_pdf_days as string[]) : []

        const apkSessions = Number(activity.apk_sessions || 0)
        const webSessions = Number(activity.web_sessions || 0)
        const totalSessions = Number(activity.total_sessions || apkSessions + webSessions)

        const storage = await getUserStorageEstimate(userId)

        return {
          userId,
          email: String(settings.email || ''),
          fullName: String(settings.full_name || ''),
          lastSeenAt: toIso(activity.last_seen_at),
          lastPlatform: (activity.last_platform === 'apk' || activity.last_platform === 'web') ? activity.last_platform : 'unknown',
          apkSessions,
          webSessions,
          totalSessions,
          activeDays30,
          aiRequestsTotal: Number(usageMetrics.ai_requests_total || 0),
          aiRequests30d: countRecentDays(aiDays, 30),
          csvImportsTotal: Number(usageMetrics.import_csv_requests_total || 0),
          csvImports30d: countRecentDays(csvDays, 30),
          pdfImportsTotal: Number(usageMetrics.import_pdf_requests_total || 0),
          pdfImports30d: countRecentDays(pdfDays, 30),
          estimatedStorageBytes: storage.bytes,
          estimatedStorageMB: Number((storage.bytes / (1024 * 1024)).toFixed(3)),
          dataDocCount: storage.docs,
        }
      })
    )

    const now = new Date()
    const d7 = new Date(now)
    d7.setDate(now.getDate() - 7)

    const activeUsers30d = rows.filter((r) => r.activeDays30 > 0).length
    const activeUsers7d = rows.filter((r) => {
      const last = r.lastSeenAt ? new Date(r.lastSeenAt) : null
      return last ? last >= d7 : false
    }).length

    const apkUsers30d = rows.filter((r) => r.apkSessions > 0).length
    const webUsers30d = rows.filter((r) => r.webSessions > 0).length

    const totalApkSessions = rows.reduce((sum, r) => sum + r.apkSessions, 0)
    const totalWebSessions = rows.reduce((sum, r) => sum + r.webSessions, 0)
    const totalSessions = totalApkSessions + totalWebSessions
    const totalAiRequests = rows.reduce((sum, r) => sum + r.aiRequestsTotal, 0)
    const totalCsvImports = rows.reduce((sum, r) => sum + r.csvImportsTotal, 0)
    const totalPdfImports = rows.reduce((sum, r) => sum + r.pdfImportsTotal, 0)

    const response: UsageResponse = {
      summary: {
        totalUsers: rows.length,
        activeUsers30d,
        activeUsers7d,
        apkUsers30d,
        webUsers30d,
        apkSessionSharePct: totalSessions ? Number(((totalApkSessions / totalSessions) * 100).toFixed(1)) : 0,
        webSessionSharePct: totalSessions ? Number(((totalWebSessions / totalSessions) * 100).toFixed(1)) : 0,
        totalEstimatedStorageMB: Number((rows.reduce((sum, r) => sum + r.estimatedStorageMB, 0)).toFixed(3)),
        totalAiRequests,
        totalCsvImports,
        totalPdfImports,
      },
      users: rows.sort((a, b) => b.estimatedStorageBytes - a.estimatedStorageBytes),
    }

    return res.status(200).json(response)
  } catch (error: any) {
    console.error('[Admin Usage] Error:', error)
    return res.status(500).json({ error: error?.message || 'Internal server error' })
  }
}
