import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/router'
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
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 })
  const { signIn, signUp, signInWithGoogle, signInWithGitHub, user, resetPassword, updateUserPassword } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const character = document.querySelector('#auth-character')
      if (!character) return

      const rect = character.getBoundingClientRect()
      const characterX = rect.left + rect.width / 2
      const characterY = rect.top + rect.height / 2

      // Calculate angle and distance from character to mouse
      const deltaX = e.clientX - characterX
      const deltaY = e.clientY - characterY

      // Limit eye movement range
      const maxDistance = 8
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      const limitedDistance = Math.min(distance / 30, maxDistance)

      const angle = Math.atan2(deltaY, deltaX)
      const x = Math.cos(angle) * limitedDistance
      const y = Math.sin(angle) * limitedDistance

      setEyePosition({ x, y })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

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

  useEffect(() => {
    if (user && !isRecoveryMode) {
      const redirect = router.query.redirect as string
      router.replace(redirect && redirect !== '/auth' ? redirect : '/')
    }
  }, [user, isRecoveryMode, router])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(p => ({ ...p, [name]: value }))
  }

  const requestPasswordReset = async () => {
    if (!formData.email) { setError('Enter your email first'); return }
    setLoading(true)
    setError(null)
    const { error } = await resetPassword(formData.email)
    setLoading(false)
    if (error) setError(error); else setResetRequested(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (isRecoveryMode) {
      if (!newPassword) { setError('Enter a new password'); return }
      setLoading(true)
      const { error } = await updateUserPassword(newPassword)
      setLoading(false)
      if (error) setError(error); else {
        const redirect = router.query.redirect as string
        router.replace(redirect && redirect !== '/auth' ? redirect : '/')
      }
      return
    }
    if (!isLogin && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match'); return
    }
    setLoading(true)
    if (isLogin) {
      const { error } = await signIn(formData.email, formData.password)
      setLoading(false)
      if (error) setError(error); else {
        const redirect = router.query.redirect as string
        router.replace(redirect && redirect !== '/auth' ? redirect : '/')
      }
    } else {
      const { error, needsVerification } = await signUp(formData.email, formData.password, formData.fullName)
      setLoading(false)
      if (error) setError(error)
      else if (needsVerification) setVerificationNotice(true)
      else {
        const redirect = router.query.redirect as string
        router.replace(redirect && redirect !== '/auth' ? redirect : '/')
      }
    }
  }

  return (
    <div className="min-h-screen flex bg-white overflow-hidden">
      <Head>
        <title>{`${isRecoveryMode ? 'Reset Password' : (isLogin ? 'Sign In' : 'Sign Up')} - Expenso`}</title>
        <meta name="description" content="Access your Expenso account" />
        <style>{`
          @keyframes hiphop-bounce {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-15px) scale(1.05); }
          }
          @keyframes hiphop-head {
            0%, 100% { transform: rotate(-5deg); }
            50% { transform: rotate(5deg); }
          }
          @keyframes hiphop-arm-l {
             0%, 100% { transform: rotate(20deg); }
             50% { transform: rotate(-10deg); }
          }
          @keyframes hiphop-arm-r {
             0%, 100% { transform: rotate(-20deg); }
             50% { transform: rotate(10deg); }
          }
          @keyframes beat-pulse {
            0%, 100% { transform: scale(1); opacity: 0.3; }
            50% { transform: scale(1.2); opacity: 0.1; }
          }
          .animate-hiphop-body { animation: hiphop-bounce 1.5s infinite ease-in-out; }
          .animate-hiphop-head { animation: hiphop-head 1.5s infinite ease-in-out; transform-origin: center bottom; }
          .animate-beat { animation: beat-pulse 2s infinite; }
        `}</style>
      </Head>

      {/* Left Side - Hip Hop Mouse Party (Desktop Only) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-indigo-900 items-center justify-center overflow-hidden">
        {/* Dynamic Background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-900 via-purple-900 to-black opacity-90"></div>
          {/* Disco/Beat lights */}
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-beat" style={{ animationDelay: '0s' }}></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-beat" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          {/* The Dancing Mouse Character */}
          <div id="auth-character" className="relative w-64 h-64 mb-8 group animate-hiphop-body cursor-pointer">
            <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
              {/* Shadow */}
              <ellipse cx="100" cy="180" rx="60" ry="10" fill="black" opacity="0.3" className="animate-pulse" />

              {/* Body */}
              <g transform="translate(100, 140)">
                <rect x="-25" y="-40" width="50" height="70" rx="20" fill="#4B5563" /> {/* Hoodie body */}
                <path d="M-15 -30 L-15 30" stroke="#374151" strokeWidth="2" /> {/* Zipper */}
              </g>

              {/* Left Arm */}
              <g transform="translate(70, 110)">
                <path d="M0 0 Q-20 20 -30 10" stroke="#4B5563" strokeWidth="12" strokeLinecap="round" fill="none">
                  <animateTransform attributeName="transform" type="rotate" values="10; -20; 10" dur="1.5s" repeatCount="indefinite" />
                </path>
                <circle cx="-30" cy="10" r="8" fill="#FEF3C7" /> {/* Hand */}
              </g>

              {/* Right Arm */}
              <g transform="translate(130, 110)">
                <path d="M0 0 Q20 20 30 10" stroke="#4B5563" strokeWidth="12" strokeLinecap="round" fill="none">
                  <animateTransform attributeName="transform" type="rotate" values="-10; 20; -10" dur="1.5s" repeatCount="indefinite" />
                </path>
                <circle cx="30" cy="10" r="8" fill="#FEF3C7" /> {/* Hand */}
              </g>

              {/* Head Group */}
              <g transform="translate(100, 80)">
                <animateTransform attributeName="transform" type="rotate" values="-5; 5; -5" dur="1.5s" repeatCount="indefinite" additive="sum" />

                {/* Ears */}
                <circle cx="-35" cy="-25" r="25" fill="#374151" />
                <circle cx="-35" cy="-25" r="15" fill="#F9A8D4" opacity="0.6" />
                <circle cx="35" cy="-25" r="25" fill="#374151" />
                <circle cx="35" cy="-25" r="15" fill="#F9A8D4" opacity="0.6" />

                {/* Face base */}
                <circle cx="0" cy="0" r="40" fill="#FEF3C7" />

                {/* Cap (Sideways/Backwards) */}
                <path d="M-42 -10 Q0 -50 42 -10 L45 -5 Q0 -40 -45 -5 Z" fill="#6366F1" transform="rotate(-15) translate(0, -5)" />
                <path d="M-45 -5 Q0 -40 45 -5 L45 0 Q0 -35 -45 0 Z" fill="#4338CA" transform="rotate(-15) translate(0, -5)" />

                {/* Sunglasses */}
                <g transform="translate(0, 5)">
                  <rect x="-28" y="-8" width="24" height="14" rx="4" fill="#111827" />
                  <rect x="4" y="-8" width="24" height="14" rx="4" fill="#111827" />
                  <line x1="-4" y1="-4" x2="4" y2="-4" stroke="#111827" strokeWidth="2" />
                  {/* Reflections */}
                  <path d="M-22 -4 L-14 4" stroke="white" strokeWidth="1" opacity="0.3" />
                  <path d="M10 -4 L18 4" stroke="white" strokeWidth="1" opacity="0.3" />
                </g>

                {/* Eyes (Tracking - visible behind/through sunglasses if we wanted, but let's make them peek or just be the interaction point. Actually, let's keep the original eyes but maybe slightly modified or below sunglasses) */}
                {/* Let's disable tracking eyes for the "Cool Sunglasses" version OR put the eyes on the lens as a reflection? */}
                {/* To keep the cool mouse-tracking feature, let's put the eyes *on the glasses* effectively, or remove sunglasses and rely on the cap. 
                      Let's stick to the requested "Hip Hop Mouse". Sunglasses are key. Maybe tracking eyes *are* the pupils?
                      Let's revert to cute eyes + Cap, no sunglasses for better interaction. */}

              </g>

              {/* Head (Redrawn for Logic Consistency with Eye Tracking) */}
              <g transform="translate(100, 80)">
                <animateTransform attributeName="transform" type="rotate" values="-5; 5; -5" dur="1.5s" repeatCount="indefinite" additive="sum" />

                {/* Ears */}
                <circle cx="-35" cy="-35" r="28" fill="#1F2937" /> {/* Dark Grey Ears */}
                <circle cx="-35" cy="-35" r="18" fill="#FCA5A5" opacity="0.8" /> {/* Pink inner */}
                <circle cx="35" cy="-35" r="28" fill="#1F2937" />
                <circle cx="35" cy="-35" r="18" fill="#FCA5A5" opacity="0.8" />

                {/* Face */}
                <circle cx="0" cy="0" r="45" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />

                {/* Cap */}
                <path d="M-45 -10 C-45 -40, 45 -40, 45 -10" fill="#4F46E5" /> {/* Cap Dome */}
                <rect x="-50" y="-10" width="100" height="8" rx="2" fill="#4338CA" /> {/* Cap Brim Base */}
                <path d="M-50 -6 L-60 10 L40 -6 Z" fill="#4338CA" transform="rotate(-10)" /> {/* Cap Visor */}

                {/* Eyes Container */}
                <g transform="translate(0, 10)">
                  {/* Left Eye */}
                  <ellipse cx="-15" cy="0" rx="10" ry="12" fill="white" stroke="#374151" strokeWidth="1.5" />
                  <circle cx={-15 + eyePosition.x} cy={eyePosition.y} r="4" fill="#1F2937" />
                  <circle cx={-15 + eyePosition.x + 1.5} cy={eyePosition.y - 1.5} r="1.5" fill="white" />

                  {/* Right Eye */}
                  <ellipse cx="15" cy="0" rx="10" ry="12" fill="white" stroke="#374151" strokeWidth="1.5" />
                  <circle cx={15 + eyePosition.x} cy={eyePosition.y} r="4" fill="#1F2937" />
                  <circle cx={15 + eyePosition.x + 1.5} cy={eyePosition.y - 1.5} r="1.5" fill="white" />
                </g>

                {/* Nose & Mouth */}
                <circle cx="0" cy="22" r="3" fill="#FCA5A5" />
                <path d="M-10 32 Q0 40 10 32" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" />

                {/* Whiskers */}
                <line x1="-20" y1="25" x2="-40" y2="20" stroke="#9CA3AF" strokeWidth="1" />
                <line x1="-20" y1="28" x2="-40" y2="30" stroke="#9CA3AF" strokeWidth="1" />
                <line x1="20" y1="25" x2="40" y2="20" stroke="#9CA3AF" strokeWidth="1" />
                <line x1="20" y1="28" x2="40" y2="30" stroke="#9CA3AF" strokeWidth="1" />
              </g>

              {/* Music Notes */}
              <g className="animate-bounce" style={{ animationDuration: '2s' }}>
                <path d="M160 60 Q170 50 180 60 L180 90" stroke="white" strokeWidth="2" fill="none" opacity="0.5" />
                <circle cx="180" cy="90" r="3" fill="white" opacity="0.5" />
              </g>
              <g className="animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}>
                <path d="M40 60 Q30 50 20 60 L20 90" stroke="white" strokeWidth="2" fill="none" opacity="0.5" />
                <circle cx="20" cy="90" r="3" fill="white" opacity="0.5" />
              </g>

            </svg>
          </div>

          <div className="text-center transform translate-y-4">
            <h2 className="text-3xl font-extrabold text-white mb-2">Join the Rhythm</h2>
            <p className="text-indigo-200">Expenso helps you stay in tune with your finances.</p>
          </div>
        </div>
      </div>

      {/* Right Side - Form Container */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:px-6 lg:px-8 bg-gray-50/50">
        <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl shadow-xl lg:shadow-none lg:bg-transparent lg:p-0">
          <div className="text-center">
            {/* Mobile-only branding/character for continuity */}
            <div className="lg:hidden flex justify-center mb-6">
              <CalcBrand size={48} />
            </div>
            {/* Desktop branding top-left of right panel? No, let's just header it */}
            <div className="hidden lg:flex justify-center mb-8">
              <CalcBrand size={48} />
            </div>

            <h2 className="text-3xl font-bold text-gray-900">{isRecoveryMode ? 'Set new password' : (isLogin ? 'Welcome back' : 'Create account')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {isRecoveryMode ? 'Enter and confirm your new password to continue' : (isLogin ? 'Sign in to your account to continue tracking expenses' : 'Start tracking your expenses with our beautiful app')}
            </p>
          </div>
          <div className="card">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && <div className="text-sm text-error-600 bg-error-50 border border-error-100 rounded p-2">{error}</div>}
              {verificationNotice && <div className="text-sm text-primary-700 bg-primary-50 border border-primary-100 rounded p-2">Account created successfully! You can now sign in.</div>}
              {resetRequested && <div className="text-sm text-success-600 bg-success-50 border border-success-100 rounded p-2">Password reset email sent. Check your inbox.</div>}
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
                    } else {
                      const redirect = router.query.redirect as string
                      router.replace(redirect && redirect !== '/auth' ? redirect : '/')
                    }
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
                    } else {
                      const redirect = router.query.redirect as string
                      router.replace(redirect && redirect !== '/auth' ? redirect : '/')
                    }
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
