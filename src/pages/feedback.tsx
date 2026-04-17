import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { CalcBrand } from '@/components/Logo'

type FeedbackType = 'bug' | 'feature' | 'general'

export default function FeedbackPage() {
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState<FeedbackType>('general')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email, type }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to send feedback' }))
        throw new Error(data.error || 'Failed to send feedback')
      }

      setSent(true)
      setMessage('')
      setEmail('')
      setType('general')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send feedback')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050b14] px-4 py-10">
      <Head>
        <title>Contact Support - Expenso</title>
        <meta name="description" content="Send support requests and feedback to Expenso." />
      </Head>

      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex justify-center">
          <CalcBrand size={36} />
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/80 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Contact Support</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Send your feedback directly to info.expenso@gmail.com.
          </p>

          {sent && (
            <div className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              Feedback sent successfully. Thank you.
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label htmlFor="feedback-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Feedback Type
              </label>
              <select
                id="feedback-type"
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="general">General</option>
                <option value="bug">Bug Report</option>
                <option value="feature">Feature Request</option>
              </select>
            </div>

            <div>
              <label htmlFor="feedback-email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Your Email (optional)
              </label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label htmlFor="feedback-message" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Message
              </label>
              <textarea
                id="feedback-message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what happened or what you'd like us to improve..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                required
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send Feedback'}
              </button>
              <Link href="/" className="text-sm font-medium text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">
                Back to Home
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
