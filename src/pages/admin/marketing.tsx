import React, { useState } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import { RequireAuth } from '@/components/RequireAuth';
import { Send, Lock, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

export default function AdminMarketing() {
  const [secret, setSecret] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
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
        body: JSON.stringify({ context: aiContext })
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message Body
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={8}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm font-mono"
                    placeholder="Write your message here..."
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Plain text message.
                  </p>
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
