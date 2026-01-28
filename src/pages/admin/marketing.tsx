import React, { useState } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/contexts/AuthContext';
import { Send, Lock, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';


export default function AdminMarketing() {
  const { user, loading } = useAuth();
  // Only allow this email
  const allowedEmail = 'pratikmak2542@gmail.com';
  if (!loading && (!user || user.email !== allowedEmail)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 p-8 rounded shadow text-center">
          <div className="text-2xl font-bold mb-2">Access Denied</div>
          <div className="text-gray-600 dark:text-gray-300">You do not have permission to view this page.</div>
        </div>
      </div>
    );
  }
  const [secret, setSecret] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [whatsNewMode, setWhatsNewMode] = useState(true);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  // AI Generation State
  const [aiContext, setAiContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateAI = async () => {
    if (!aiContext) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: aiContext, format: whatsNewMode ? 'whats-new' : 'paragraph' })
      });
      
      if (!res.ok) throw new Error('Failed to generate content');
      
      const data = await res.json();
      if (data.subject) setSubject(data.subject);
      if (data.message) setMessage(data.message);
    } catch (error) {
      console.error('AI Error:', error);
      alert('Failed to generate content. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret || !subject || !message) return;

    setStatus('sending');
    setResult(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/admin/send-marketing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`
        },
        body: JSON.stringify({ subject, message })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send emails');
      }

      setResult(data);
      setStatus('success');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  return (
    <Layout>
      <Head>
        <title>Admin Marketing - Expenso</title>
      </Head>
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Send className="h-6 w-6 text-primary-600" />
              Send Marketing Emails
            </h1>
            <p className="text-gray-500 mt-1">
              Send a broadcast email to all users who have opted in to marketing notifications.
            </p>
          </div>

          <div className="p-6">
            <form onSubmit={handleSend} className="space-y-6">
              
              {/* Admin Secret */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Secret Key
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    placeholder="Enter ADMIN_SECRET"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Required to authorize this action.
                </p>
              </div>

              <div className="border-t border-gray-200 pt-6"></div>

              {/* AI Generation Section */}
              <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-indigo-600 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-indigo-900">Generate with AI</h3>
                    <p className="text-xs text-indigo-700 mt-1 mb-3">
                      Describe the update (e.g., "Added dark mode and new charts") and let AI write the email for you.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={aiContext}
                        onChange={(e) => setAiContext(e.target.value)}
                        className="block w-full px-3 py-2 border border-indigo-200 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="What's new in this update?"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateAI}
                        disabled={!aiContext || isGenerating}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isGenerating ? 'Generating...' : 'Generate'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Email Content */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    placeholder="e.g., New Feature: AI Insights"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    Message Body
                    <span className="ml-2 text-xs text-indigo-600 cursor-pointer select-none" onClick={() => setWhatsNewMode(v => !v)}>
                      {whatsNewMode ? '📝 Whats New Style' : '📄 Paragraph'}
                    </span>
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={whatsNewMode ? 10 : 8}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm font-mono bg-indigo-50 dark:bg-indigo-900/10"
                    placeholder={whatsNewMode ? '• New dark mode UI\n• Analytics now show compact numbers\n• AI answers account-specific questions\n...' : 'Write your message here...'}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {whatsNewMode ? 'Use bullet points or short highlights for a more attractive announcement.' : 'Plain text message.'}
                  </p>
                  {whatsNewMode && message.trim() && (
                    <WhatsNewPreview message={message} />
                  )}
                </div>
              </div>

              {/* Status Messages */}
              {status === 'error' && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Error sending emails</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{errorMsg}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {status === 'success' && result && (
                <div className="rounded-md bg-green-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <CheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">Emails Sent Successfully</h3>
                      <div className="mt-2 text-sm text-green-700">
                        <p>Processed: {result.processed} users</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 ${
                    status === 'sending' ? 'opacity-75 cursor-not-allowed' : ''
                  }`}
                >
                  {status === 'sending' ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="-ml-1 mr-2 h-5 w-5" />
                      Send Broadcast
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// --- Feature-rich WhatsNewPreview ---
function WhatsNewPreview({ message }: { message: string }) {
  // Emojis for common features
  const featureEmojis: Record<string, string> = {
    "AI Insights": "🤖",
    "Expense Analytics": "📊",
    "Payment Methods": "💳",
    "Dark Mode": "🌙",
    "Mobile App": "📱",
    "Security": "🔒",
    "Budgeting": "💰",
    "Notifications": "🔔",
    "Import/Export": "📥",
    "Multi-Account": "🏦",
    "Personalization": "✨",
    "Quick Add": "⚡",
    "Reports": "📝",
    "Reminders": "⏰",
    "Cloud Sync": "☁️",
  };
  // Example snippets for features
  const featureExamples: Record<string, string> = {
    "AI Insights": "Get smart suggestions to save more.",
    "Expense Analytics": "See where your money goes with interactive charts.",
    "Payment Methods": "Add, edit, or delete your cards and wallets easily.",
    "Dark Mode": "Switch themes for day or night comfort.",
    "Mobile App": "Track expenses on the go!",
    "Security": "Your data is encrypted and safe.",
    "Budgeting": "Set monthly limits and get alerts.",
    "Notifications": "Never miss a bill or budget update.",
    "Import/Export": "Move your data in/out with one click.",
    "Multi-Account": "Manage business and personal finances separately.",
    "Personalization": "Customize categories and dashboard.",
    "Quick Add": "Add expenses in seconds.",
    "Reports": "Download PDF summaries for tax time.",
    "Reminders": "Get notified for upcoming payments.",
    "Cloud Sync": "Access your data anywhere, anytime.",
  };
  // Image placeholder for preview
  const previewImageUrl = "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=600&q=80";
  // Parse features from message
  const features = message.split('\n').filter(line => line.trim()).map(line => line.replace(/^•\s*/, ''));
  return (
    <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-indigo-100 dark:border-indigo-700 p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-2">Preview</h4>
      <div className="mb-4 flex justify-center">
        <img
          src={previewImageUrl}
          alt="Expense Tracker Preview"
          className="rounded-lg shadow-md w-2/3 max-w-md"
        />
      </div>
      <ul className="list-none pl-0">
        {features.map((feature, idx) => {
          const main = feature.split(/[:\-]/)[0].trim();
          const emoji = featureEmojis[main] || "✨";
          const example = featureExamples[main];
          return (
            <li key={idx} className="mb-4 flex items-start">
              <span className="text-2xl mr-3">{emoji}</span>
              <div>
                <span className="font-semibold text-base">{feature}</span>
                {example && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{example}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 text-xs text-center text-gray-400 dark:text-gray-500">
        (You can replace the image above with your own product screenshot!)
      </div>
    </div>
  );
}
