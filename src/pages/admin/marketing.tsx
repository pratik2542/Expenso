import React, { useMemo, useState } from 'react'
import Head from 'next/head'
import Layout from '@/components/Layout'
import { RequireAuth } from '@/components/RequireAuth'
import { useAuth } from '@/contexts/AuthContext'
import { Send, Lock, CheckCircle, AlertCircle, Sparkles, ImagePlus, Eye, Smartphone, Monitor, Moon, Sun } from 'lucide-react'
import { buildMarketingEmail } from '@/lib/marketingEmail'

type PreviewDevice = 'desktop' | 'mobile'
type PreviewTheme = 'light' | 'dark'

type AppScreen = 'settings' | 'analytics' | 'dashboard' | 'expenses' | 'budget' | 'categories' | 'ai-insights'

export default function AdminMarketing() {
  const { user, loading } = useAuth()
  const allowedEmail = 'pratikmak2542@gmail.com'

  const [secret, setSecret] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [ctaText, setCtaText] = useState('Open Expenso')
  const [ctaUrl, setCtaUrl] = useState('/')
  const [imageInput, setImageInput] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [imageContext, setImageContext] = useState('')
  const [imageScreen, setImageScreen] = useState<AppScreen>('settings')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)

  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [aiContext, setAiContext] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('light')

  const previewBase = typeof window !== 'undefined' ? window.location.origin : 'https://expense-ai-manager.vercel.app'

  const previewHtml = useMemo(() => {
    return buildMarketingEmail({
      subject: subject || 'Expenso Product Update',
      message: message || 'We shipped improvements to performance, dark mode readability, and update flow.',
      imageUrls,
      ctaText: ctaText || 'Open Expenso',
      ctaUrl: ctaUrl || '/',
      baseUrl: previewBase,
      forceTheme: previewTheme,
      useInlineLogo: false,
    }).html
  }, [subject, message, imageUrls, ctaText, ctaUrl, previewBase, previewTheme])

  const previewConfig = useMemo(() => {
    if (previewDevice === 'mobile') {
      const frameWidth = 390
      const contentHeight = 760
      return {
        frameWidth,
        contentHeight,
        frameHeight: contentHeight,
      }
    }

    const frameWidth = 560
    const contentHeight = 760
    return {
      frameWidth,
      contentHeight,
      frameHeight: contentHeight,
    }
  }, [previewDevice])

  if (!loading && (!user || user.email !== allowedEmail)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 text-center">
          <div className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Access Denied</div>
          <div className="text-gray-600 dark:text-gray-300">You do not have permission to view this page.</div>
        </div>
      </div>
    )
  }

  const addImageUrl = () => {
    const trimmed = imageInput.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed) && !/^data:image\//i.test(trimmed)) {
      alert('Please enter a valid image URL or a data:image value.')
      return
    }
    setImageUrls((prev) => Array.from(new Set([...prev, trimmed])).slice(0, 6))
    setImageInput('')
  }

  const handleGenerateAppImage = async () => {
    const context = imageContext.trim() || aiContext.trim() || subject.trim() || message.trim()
    if (!context) {
      alert('Add image context first, e.g. "Dark theme added in settings".')
      return
    }

    setIsGeneratingImage(true)
    try {
      const res = await fetch('/api/ai/generate-marketing-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          screen: imageScreen,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.details || data?.error || 'Failed to generate app image')

      if (!data.imageDataUrl) {
        throw new Error('Gemini did not return an image')
      }

      setImageUrls((prev) => Array.from(new Set([data.imageDataUrl, ...prev])).slice(0, 6))
    } catch (error: any) {
      console.error('App image generation error:', error)
      alert(error?.message || 'Failed to generate app image')
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const handleGenerateAI = async () => {
    if (!aiContext.trim()) return

    setIsGenerating(true)
    try {
      const res = await fetch('/api/ai/generate-marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: aiContext }),
      })

      if (!res.ok) throw new Error('Failed to generate content')
      const data = await res.json()

      if (data.subject) setSubject(data.subject)
      if (data.message) setMessage(data.message)
    } catch (error) {
      console.error('AI generation error:', error)
      alert('Failed to generate content. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!secret || !subject.trim() || !message.trim()) return

    setStatus('sending')
    setErrorMsg('')
    setResult(null)

    try {
      const res = await fetch('/api/admin/send-marketing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({
          subject,
          message,
          imageUrls,
          ctaText,
          ctaUrl,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send emails')

      setResult(data)
      setStatus('success')
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Failed to send emails')
      setStatus('error')
    }
  }

  return (
    <RequireAuth>
      <Layout>
        <Head>
          <title>Admin Marketing - Expenso</title>
        </Head>

        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Send className="h-6 w-6 text-primary-600" />
              Marketing Campaign Builder
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Compose a release email, include images, and preview exactly how it looks on desktop/mobile in light and dark modes.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <form onSubmit={handleSend} className="space-y-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Admin Secret</label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Enter ADMIN_SECRET"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
              </div>

              <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-4">
                <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-200 text-sm font-semibold mb-2">
                  <Sparkles className="h-4 w-4" />
                  AI Draft Assistant
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiContext}
                    onChange={(e) => setAiContext(e.target.value)}
                    placeholder="Describe what changed in this release"
                    className="flex-1 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateAI}
                    disabled={!aiContext.trim() || isGenerating}
                    className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., New Black Theme + Better Update Experience"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Message</label>
                <textarea
                  rows={8}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={'Use plain text or bullets.\n- New black theme contrast\n- Better APK update flow'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">CTA Text</label>
                  <input
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                    placeholder="Open Expenso"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">CTA URL</label>
                  <input
                    type="text"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                    placeholder="/settings"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-blue-600" />
                    Campaign Images
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={imageContext}
                    onChange={(e) => setImageContext(e.target.value)}
                    placeholder="e.g. Dark theme added in settings"
                    className="md:col-span-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  />
                  <select
                    value={imageScreen}
                    onChange={(e) => setImageScreen(e.target.value as AppScreen)}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  >
                    <option value="settings">Settings</option>
                    <option value="analytics">Analytics</option>
                    <option value="dashboard">Dashboard</option>
                    <option value="expenses">Expenses</option>
                    <option value="budget">Budget</option>
                    <option value="categories">Categories</option>
                    <option value="ai-insights">AI Insights</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAppImage}
                  disabled={isGeneratingImage}
                  className="w-full text-xs px-3 py-2 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-60"
                >
                  {isGeneratingImage ? 'Generating App Image...' : 'Generate App Image (Gemini from your app screenshot)'}
                </button>

                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Tip: Use a precise prompt like "Show Settings page with black theme enabled".
                </p>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={imageInput}
                    onChange={(e) => setImageInput(e.target.value)}
                    placeholder="https://.../image.png"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={addImageUrl}
                    className="px-3 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-900"
                  >
                    Add
                  </button>
                </div>

                {imageUrls.length > 0 && (
                  <div className="space-y-2">
                    {imageUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="flex items-center gap-2">
                        <input
                          value={url}
                          onChange={(e) => {
                            const next = [...imageUrls]
                            next[idx] = e.target.value
                            setImageUrls(next)
                          }}
                          className="flex-1 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100"
                        />
                        <button
                          type="button"
                          onClick={() => setImageUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-xs px-2 py-1.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {status === 'error' && (
                <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {errorMsg}
                </div>
              )}

              {status === 'success' && result && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Campaign sent. Processed {result.processed} users.
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {status === 'sending' ? 'Sending...' : 'Send Broadcast'}
              </button>
            </form>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary-600" />
                  Email Preview
                </h2>

                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1 ${previewDevice === 'desktop' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'}`}
                    >
                      <Monitor className="h-3.5 w-3.5" /> Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1 ${previewDevice === 'mobile' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'}`}
                    >
                      <Smartphone className="h-3.5 w-3.5" /> Mobile
                    </button>
                  </div>

                  <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPreviewTheme('light')}
                      className={`px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1 ${previewTheme === 'light' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'}`}
                    >
                      <Sun className="h-3.5 w-3.5" /> Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTheme('dark')}
                      className={`px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1 ${previewTheme === 'dark' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'}`}
                    >
                      <Moon className="h-3.5 w-3.5" /> Dark
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                This preview simulates desktop/mobile and light/dark email appearance before sending.
              </p>

              <div className="rounded-xl bg-gray-100 dark:bg-gray-900 p-3 overflow-auto">
                <div
                  className={`mx-auto ${previewDevice === 'mobile' ? 'rounded-[28px] border-[10px] border-gray-800 shadow-2xl' : 'rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg'} bg-black`}
                  style={{ width: `${previewConfig.frameWidth}px`, maxWidth: '100%' }}
                >
                  <div
                    className="overflow-hidden"
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      height: `${previewConfig.frameHeight}px`,
                      borderRadius: previewDevice === 'mobile' ? '18px' : '10px',
                    }}
                  >
                    <iframe
                      title="Marketing Email Preview"
                      srcDoc={previewHtml}
                      className="border-0 bg-white w-full"
                      style={{
                        width: '100%',
                        height: `${previewConfig.contentHeight}px`,
                      }}
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </RequireAuth>
  )
}
