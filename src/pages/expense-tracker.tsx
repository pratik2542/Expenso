import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default function ExpenseTrackerPage() {
  return (
    <>
      <Head>
        <title>Expense Tracker & AI Expense Manager | Expenso</title>
        <meta name="description" content="Expenso is an AI expense tracker and expense manager app. Track expenses, manage budgets, and get smart insights in minutes." />
        <meta name="keywords" content="expense tracker, expense manager, ai expense tracker, expense ai manager, budget tracker, personal finance app" />
        <link rel="canonical" href="https://expense-ai-manager.vercel.app/expense-tracker" />
      </Head>

      <main className="min-h-screen bg-white">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
          <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 border border-primary-100 px-3 py-1 rounded-full text-xs font-semibold mb-6">
            Expense Tracker
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 mb-4">
            Expense tracker with AI insights
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mb-8">
            Expenso is a modern expense manager app designed for daily use. Track expenses quickly, set budgets, and get clear AI insights on your spending.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/auth?mode=signup"
              className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold text-sm shadow-md shadow-primary-200 transition-all"
            >
              Start tracking free
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-6 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-semibold text-sm transition-colors"
            >
              Back to home
            </Link>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Track expenses</h2>
              <p className="text-sm text-gray-600">Add expenses fast and keep your records organized by category.</p>
            </div>
            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Manage budgets</h2>
              <p className="text-sm text-gray-600">Set category budgets and see progress at a glance.</p>
            </div>
            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">AI insights</h2>
              <p className="text-sm text-gray-600">Get clear summaries of where your money goes each month.</p>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
