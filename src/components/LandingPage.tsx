import React, { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Brand, CalcBrand } from '@/components/Logo'
import { 
  SparklesIcon, 
  BarChart3Icon, 
  ShieldCheckIcon, 
  WalletIcon, 
  ZapIcon, 
  SmartphoneIcon,
  PieChartIcon,
  GlobeIcon
} from 'lucide-react'

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const screenshots = [
    { id: 'dashboard', label: 'Dashboard', src: '/screenshots/dashboard-desktop.png', alt: 'Expense Manager Dashboard' },
    { id: 'analytics', label: 'Analytics', src: '/screenshots/analytics-detailed.png', alt: 'Detailed Financial Analytics' },
    { id: 'expenses', label: 'Expenses', src: '/screenshots/expenses-list.png', alt: 'Expense Tracking List' },
    { id: 'budget', label: 'Budgeting', src: '/screenshots/budget-overview.png', alt: 'Smart Budgeting' },
    { id: 'categories', label: 'Categories', src: '/screenshots/categories-management.png', alt: 'Custom Categories' },
    { id: 'predefined-categories', label: 'Pre-set Categories', src: '/screenshots/predefined-categories.png', alt: 'Available Expense Categories' },
    { id: 'ai', label: 'AI Insights', src: '/screenshots/ai-insights.png', alt: 'AI Spending Insights' },
    { id: 'settings', label: 'Settings', src: '/screenshots/settings.png', alt: 'App Settings' },
    { id: 'mobile', label: 'Mobile App', src: '/screenshots/mobile-download.png', alt: 'Mobile Expense App' },
  ]

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Expenso",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Web, Android",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "CAD"
    },
    "description": "Expenso is an intelligent AI expense tracker and money manager. Track spending, scan receipts, and manage budgets with ease.",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "ratingCount": "2150"
    }
  }

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Expenso AI Expense Tracker",
    "alternateName": ["Expenso", "Expense Manager", "AI Expense Tracker", "Money Manager"],
    "url": "https://expense-ai-manager.vercel.app/"
  }

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>Expenso - AI Expense Tracker</title>
        <meta name="description" content="Expenso is the smart AI expense tracker that helps you master your money. Track daily spending, get AI insights, and manage budgets effortlessly." />
        <meta name="keywords" content="Expenso, AI expense tracker, expense manager, expense ai manager, ai expense manager, money manager, budget app, finance tracker" />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />
        
        {/* Site Name for Search Engines to replace 'Vercel' */}
        <meta property="og:site_name" content="Expenso AI Expense Tracker" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://expense-ai-manager.vercel.app/" />
        <meta property="og:title" content="Expenso - AI Expense Tracker" />
        <meta property="og:description" content="Master your money with Expenso. The AI-powered expense tracker for smart financial insights." />
        <meta property="og:image" content="https://expense-ai-manager.vercel.app/icon-512.png" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="Expenso - AI Expense Tracker" />
        <meta property="twitter:description" content="Master your money with Expenso. The AI-powered expense tracker." />
        <meta property="twitter:image" content="https://expense-ai-manager.vercel.app/icon-512.png" />

        <link rel="canonical" href="https://expense-ai-manager.vercel.app/" />
        <link rel="icon" href="/calculatorImg.png" type="image/png" />
        <link rel="apple-touch-icon" href="/calculatorImg.png" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([structuredData, websiteSchema]) }}
        />
      </Head>

      {/* Header */}
      <header className="fixed w-full bg-white/90 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <CalcBrand size={28} />
          <nav className="flex items-center gap-3">
            <Link href="/auth" className="text-gray-600 hover:text-primary-600 text-sm transition-colors">
              Sign In
            </Link>
            <Link 
              href="/auth?mode=signup" 
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm shadow-primary-200"
            >
              Start Free
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20">
          <div className="absolute inset-x-0 -top-24 h-72 bg-gradient-to-b from-primary-50 via-white to-transparent -z-10" />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 border border-primary-100 px-3 py-1 rounded-full text-xs font-semibold mb-5">
              <SparklesIcon className="w-4 h-4" />
              <span>AI insights that feel personal</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-gray-900 mb-5 leading-tight">
              A calm, modern <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600">AI expense tracker</span>
              <span className="hidden sm:inline"> for everyday money decisions</span>
            </h1>
            <p className="max-w-2xl mx-auto text-base sm:text-lg text-gray-600 mb-8 leading-relaxed">
              Track expenses, stay on budget, and get clear AI insights without a cluttered UI. Built for focus, not noise.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link 
                href="/auth?mode=signup" 
                className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold text-sm shadow-md shadow-primary-200 transition-all"
              >
                Start tracking free
              </Link>
              <a
                href="/Expenso.apk"
                className="w-full sm:w-auto px-6 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-semibold text-sm transition-colors"
                download
              >
                Download APK
              </a>
              <Link 
                href="#features" 
                className="w-full sm:w-auto px-6 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-semibold text-sm transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                View features
              </Link>
            </div>
          </div>
        </section>

        {/* Dashboard Preview / Stats */}
        <section className="py-10 bg-gray-50/50 border-y border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <div className="text-2xl font-semibold text-gray-900 mb-1">100%</div>
                <div className="text-gray-500 text-sm">Free & Secure</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-gray-900 mb-1">AI</div>
                <div className="text-gray-500 text-sm">Smart insights</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-gray-900 mb-1">Multi</div>
                <div className="text-gray-500 text-sm">Currency support</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-gray-900 mb-1">Cloud</div>
                <div className="text-gray-500 text-sm">Real-time sync</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-3">Everything you need, nothing you don’t</h2>
              <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
                Expenso combines powerful features directly into a simple, beautiful interface.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <FeatureCard 
                icon={<SparklesIcon className="w-6 h-6 text-indigo-500" />}
                title="AI Expense Manager"
                desc="Get personalized insights. Ask our AI questions about your spending habits like 'How much did I spend on food?'."
              />
              <FeatureCard 
                icon={<PieChartIcon className="w-6 h-6 text-pink-500" />}
                title="Visual Analytics"
                desc="Understand your money at a glance with beautiful interactive charts and detailed breakdowns by category."
              />
              <FeatureCard 
                icon={<GlobeIcon className="w-6 h-6 text-blue-500" />}
                title="Multi-Currency"
                desc="Traveling? We support 160+ currencies with real-time conversion rates. Perfect for digital nomads."
              />
              <FeatureCard 
                icon={<WalletIcon className="w-6 h-6 text-green-500" />}
                title="Budget Tracking"
                desc="Set monthly budgets for different categories and get notified when you're close to hitting your limits."
              />
              <FeatureCard 
                icon={<ShieldCheckIcon className="w-6 h-6 text-emerald-500" />}
                title="Security"
                desc="Your financial data will not be used for advertising or sold to third parties."
              />
              <FeatureCard 
                icon={<SmartphoneIcon className="w-6 h-6 text-purple-500" />}
                title="Cross Platform"
                desc="Access your financial data from any device. Seamless sync between web, Android."
              />
            </div>
          </div>
        </section>


        {/* App Preview / Screenshots */}
        <section className="py-20 bg-gray-50 overflow-hidden border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-3">A clean interface that stays out of the way</h2>
              <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
                A clean, intuitive interface designed to help you manage your money without the complexity.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {screenshots.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-200 ring-1 ring-primary-100 ring-offset-2'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative max-w-5xl mx-auto">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white aspect-[16/10]">
                {screenshots.map((item) => (
                  <div
                    key={item.id}
                    className={`absolute inset-0 transition-opacity duration-500 ease-in-out flex items-center justify-center bg-gray-50 ${
                      activeTab === item.id ? 'opacity-100 z-10' : 'opacity-0 z-0'
                    }`}
                  >
                    <img 
                      src={item.src} 
                      alt={item.alt}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
              
              {/* Decorative blobs */}
              <div className="absolute -top-10 -right-10 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
              <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
            </div>
            
            <p className="text-center text-gray-400 text-xs mt-8">
              * Screenshots from the actual application. Some data blurred for privacy.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-primary-600">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-semibold mb-4">Ready to take control of your finances?</h2>
            <p className="text-primary-100 text-base sm:text-lg mb-8 max-w-2xl mx-auto">
              Join thousands of users who trust Expenso as their daily AI expense tracker.
            </p>
            <Link 
              href="/auth?mode=signup" 
              className="inline-block bg-white text-primary-600 px-6 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors shadow-lg"
            >
              Start Tracking for Free
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-gray-50 py-10 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500">
          <div className="flex justify-center mb-6">
            <CalcBrand size={22} />
          </div>
          <p className="mb-4">&copy; {new Date().getFullYear()} Expenso. All rights reserved.</p>
          <div className="flex justify-center gap-6 text-sm">
            <a href="mailto:pratikincanada@gmail.com" className="hover:text-primary-600 transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-6 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
    </div>
  )
}
