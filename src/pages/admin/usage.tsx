import { ReactNode, useMemo, useState } from 'react'
import Head from 'next/head'
import Layout from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import { DatabaseIcon, ActivityIcon, SmartphoneIcon, GlobeIcon, RefreshCcwIcon } from 'lucide-react'

type Row = {
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
  estimatedStorageMB: number
  dataDocCount: number
}

type UsagePayload = {
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
  users: Row[]
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleString()
}

export default function AdminUsagePage() {
  const { user, loading } = useAuth()
  const allowedEmail = 'pratikmak2542@gmail.com'

  const [secret, setSecret] = useState('')
  const [data, setData] = useState<UsagePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const topHeavyUsers = useMemo(() => {
    if (!data?.users) return []
    return [...data.users].sort((a, b) => b.estimatedStorageMB - a.estimatedStorageMB).slice(0, 5)
  }, [data])

  if (!loading && (!user || user.email !== allowedEmail)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 p-8 rounded shadow text-center">
          <div className="text-2xl font-bold mb-2">Access Denied</div>
          <div className="text-gray-600 dark:text-gray-300">You do not have permission to view this page.</div>
        </div>
      </div>
    )
  }

  const loadUsage = async () => {
    if (!secret) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/usage-overview?limit=200', {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      })

      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load usage data')
      }
      setData(payload)
    } catch (e: any) {
      setError(e?.message || 'Failed to load usage data')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <RequireAuth>
      <Head>
        <title>Admin Usage - Expenso</title>
      </Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Usage & Storage Dashboard</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Track user storage usage, activity frequency, and APK vs Web adoption.</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Admin Secret</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Enter ADMIN_SECRET"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
              <button
                onClick={loadUsage}
                disabled={!secret || isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-60"
              >
                <RefreshCcwIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Loading' : 'Load'}
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>

          {data && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                <MetricCard
                  icon={<DatabaseIcon className="h-4 w-4" />}
                  title="Total Estimated Storage"
                  value={`${data.summary.totalEstimatedStorageMB.toFixed(2)} MB`}
                  sub={`${data.summary.totalUsers} users`}
                />
                <MetricCard
                  icon={<ActivityIcon className="h-4 w-4" />}
                  title="Active Users"
                  value={`${data.summary.activeUsers30d} / ${data.summary.totalUsers}`}
                  sub={`7d active: ${data.summary.activeUsers7d}`}
                />
                <MetricCard
                  icon={<SmartphoneIcon className="h-4 w-4" />}
                  title="APK Session Share"
                  value={`${data.summary.apkSessionSharePct}%`}
                  sub={`${data.summary.apkUsers30d} users on APK`}
                />
                <MetricCard
                  icon={<GlobeIcon className="h-4 w-4" />}
                  title="Web Session Share"
                  value={`${data.summary.webSessionSharePct}%`}
                  sub={`${data.summary.webUsers30d} users on Web`}
                />
                <MetricCard
                  icon={<ActivityIcon className="h-4 w-4" />}
                  title="AI Requests"
                  value={`${data.summary.totalAiRequests}`}
                  sub="Total AI calls"
                />
                <MetricCard
                  icon={<DatabaseIcon className="h-4 w-4" />}
                  title="Imports"
                  value={`CSV ${data.summary.totalCsvImports} / PDF ${data.summary.totalPdfImports}`}
                  sub="Total import usage"
                />
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Top Storage Users</h2>
                <div className="space-y-2">
                  {topHeavyUsers.map((u) => (
                    <div key={u.userId} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{u.fullName || u.email || u.userId}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{u.userId}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{u.estimatedStorageMB.toFixed(2)} MB</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Per User Breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr className="text-left text-gray-600 dark:text-gray-300">
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Storage (MB)</th>
                        <th className="px-4 py-3">Docs</th>
                        <th className="px-4 py-3">Active Days (30d)</th>
                        <th className="px-4 py-3">AI Requests</th>
                        <th className="px-4 py-3">Imports (CSV/PDF)</th>
                        <th className="px-4 py-3">Sessions</th>
                        <th className="px-4 py-3">Platform</th>
                        <th className="px-4 py-3">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.map((u) => (
                        <tr key={u.userId} className="border-t border-gray-200 dark:border-gray-700">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{u.fullName || 'Unknown User'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{u.email || u.userId}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{u.estimatedStorageMB.toFixed(3)}</td>
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{u.dataDocCount}</td>
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{u.activeDays30}</td>
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                            {u.aiRequestsTotal} <span className="text-xs text-gray-500 dark:text-gray-400">(30d: {u.aiRequests30d})</span>
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                            CSV {u.csvImportsTotal} / PDF {u.pdfImportsTotal}
                            <div className="text-xs text-gray-500 dark:text-gray-400">30d: {u.csvImports30d}/{u.pdfImports30d}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">APK {u.apkSessions} / Web {u.webSessions}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                              {u.lastPlatform}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDate(u.lastSeenAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </Layout>
    </RequireAuth>
  )
}

function MetricCard({ icon, title, value, sub }: { icon: ReactNode; title: string; value: string; sub: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 mb-2">
        {icon}
        <span className="text-xs font-medium">{title}</span>
      </div>
      <p className="text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
