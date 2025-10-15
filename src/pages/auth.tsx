import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import { CalcBrand } from '@/components/Logo'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '', fullName: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verificationNotice, setVerificationNotice] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const { signIn, signUp, signInWithGoogle, signInWithGitHub, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash.includes('type=recovery')) {
        setIsRecoveryMode(true)
        setIsLogin(false)
      }
      if (router.query.reset === '1') {
        setIsRecoveryMode(true)
        setIsLogin(false)
      }
    }
  }, [router.query.reset])

  useEffect(() => { if (user && !isRecoveryMode) router.replace('/') }, [user, isRecoveryMode, router])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(p => ({ ...p, [name]: value }))
  }

  const requestPasswordReset = async () => {
    if (!formData.email) { setError('Enter your email first'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(formData.email, { redirectTo: `${window.location.origin}/auth?reset=1` })
    setLoading(false)
    if (error) setError(error.message); else setResetRequested(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (isRecoveryMode) {
      if (!newPassword) { setError('Enter a new password'); return }
      setLoading(true)
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      setLoading(false)
      if (error) setError(error.message); else router.replace('/')
      return
    }
    if (!isLogin && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match'); return
    }
    setLoading(true)
    if (isLogin) {
      const { error } = await signIn(formData.email, formData.password)
      setLoading(false)
      if (error) setError(error); else router.replace('/')
    } else {
      const { error, needsVerification } = await signUp(formData.email, formData.password, formData.fullName)
      setLoading(false)
      if (error) setError(error)
      else if (needsVerification) setVerificationNotice(true)
      else router.replace('/')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Head>
        <title>{isRecoveryMode ? 'Reset Password' : (isLogin ? 'Sign In' : 'Sign Up')} - Expenso</title>
        <meta name="description" content="Access your Expenso account" />
      </Head>
      <div className="w-full max-w-md mx-auto">
        <div className="space-y-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <CalcBrand size={40} />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">{isRecoveryMode ? 'Set new password' : (isLogin ? 'Welcome back' : 'Create account')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {isRecoveryMode ? 'Enter and confirm your new password to continue' : (isLogin ? 'Sign in to your account to continue tracking expenses' : 'Start tracking your expenses with our beautiful app')}
            </p>
          </div>
          <div className="card">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && <div className="text-sm text-error-600 bg-error-50 border border-error-100 rounded p-2">{error}</div>}
              {verificationNotice && <div className="text-sm text-primary-700 bg-primary-50 border border-primary-100 rounded p-2">Check your email to verify your account before signing in.</div>}
              {resetRequested && <div className="text-sm text-success-600 bg-success-50 border border-success-100 rounded p-2">Password reset email sent. Check your inbox.</div>}
              {user && !user.email_confirmed_at && !isRecoveryMode && <div className="text-xs text-warning-700 bg-warning-50 border border-warning-100 rounded p-2">Email not verified yet. Please verify for full functionality.</div>}
              {!isRecoveryMode && !isLogin && (
                <div>
                  <label htmlFor="fullName" className="label">Full Name</label>
                  <input id="fullName" name="fullName" type="text" required value={formData.fullName} onChange={handleInputChange} className="input" placeholder="Enter your full name" />
                </div>
              )}
              {!isRecoveryMode && (
                <div>
                  <label htmlFor="email" className="label">Email address</label>
                  <input id="email" name="email" type="email" autoComplete="email" required value={formData.email} onChange={handleInputChange} className="input" placeholder="Enter your email" />
                </div>
              )}
              {!isRecoveryMode && (
                <div>
                  <label htmlFor="password" className="label">Password</label>
                  <div className="relative">
                    <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} required value={formData.password} onChange={handleInputChange} className="input pr-10" placeholder="Enter your password" />
                    <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOffIcon className="h-5 w-5 text-gray-400" /> : <EyeIcon className="h-5 w-5 text-gray-400" />}
                    </button>
                  </div>
                </div>
              )}
              {!isRecoveryMode && !isLogin && (
                <div>
                  <label htmlFor="confirmPassword" className="label">Confirm Password</label>
                  <input id="confirmPassword" name="confirmPassword" type="password" required value={formData.confirmPassword} onChange={handleInputChange} className="input" placeholder="Confirm your password" />
                </div>
              )}
              {isLogin && !isRecoveryMode && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input id="remember-me" name="remember-me" type="checkbox" className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">Remember me</label>
                  </div>
                  <button type="button" onClick={() => { setIsRecoveryMode(false); setIsLogin(true); requestPasswordReset() }} className="text-sm font-medium text-primary-600 hover:text-primary-500">Forgot your password?</button>
                </div>
              )}
              {isRecoveryMode && (
                <div>
                  <label htmlFor="newPassword" className="label">New Password</label>
                  <input id="newPassword" name="newPassword" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Enter new password" />
                </div>
              )}
              <div>
                <button type="submit" className="btn-primary w-full disabled:opacity-60" disabled={loading}>
                  {isRecoveryMode ? (loading ? 'Updating...' : 'Update Password') : (loading ? (isLogin ? 'Signing in...' : 'Creating...') : (isLogin ? 'Sign in' : 'Create account'))}
                </button>
              </div>
            </form>
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300" /></div>
                <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Or</span></div>
              </div>
              <div className="mt-6 space-y-3">
                <button 
                  type="button" 
                  onClick={async () => {
                    setLoading(true)
                    setError(null)
                    const { error } = await signInWithGoogle()
                    if (error) {
                      setError(error)
                      setLoading(false)
                    }
                    // If successful, the OAuth flow will redirect the user
                  }}
                  disabled={loading}
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className="ml-2">Continue with Google</span>
                </button>
                <button 
                  type="button" 
                  onClick={async () => {
                    setLoading(true)
                    setError(null)
                    const { error } = await signInWithGitHub()
                    if (error) {
                      setError(error)
                      setLoading(false)
                    }
                    // If successful, the OAuth flow will redirect the user
                  }}
                  disabled={loading}
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-60"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  <span className="ml-2">Continue with GitHub</span>
                </button>
              </div>
            </div>
            <div className="text-center">
              <span className="text-sm text-gray-600">{isLogin ? "Don't have an account?" : 'Already have an account?'}</span>
              <button type="button" onClick={() => setIsLogin(!isLogin)} className="ml-1 text-sm font-medium text-primary-600 hover:text-primary-500">{isLogin ? 'Sign up' : 'Sign in'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
