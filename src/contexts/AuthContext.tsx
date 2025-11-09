import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

import type { User } from '@supabase/supabase-js'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error?: string; needsVerification?: boolean }>
  signInWithGoogle: () => Promise<{ error?: string }>
  signInWithGitHub: () => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    console.log('AuthContext loadUser: Starting')
    setLoading(true)
    try {
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Auth session load timeout')), 10000) // 10 seconds
      })
      const sessionPromise = supabase.auth.getSession()
      const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]) as any
      console.log('AuthContext loadUser:', { session: session?.user?.id, error })
      if (error) console.error(error)
      setUser(session?.user ?? null)
    } catch (err) {
      console.error('AuthContext loadUser error:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      
      // When user signs in with OAuth (Google/GitHub), save their name to user_settings
      if (event === 'SIGNED_IN' && session?.user) {
        const user = session.user
        // Check if user signed in via OAuth provider
        const provider = user.app_metadata?.provider
        if (provider === 'google' || provider === 'github') {
          // Extract name from user metadata
          const fullName = user.user_metadata?.full_name || user.user_metadata?.name || ''
          
          if (fullName) {
            // Update or insert user_settings with the name
            const { error } = await supabase
              .from('user_settings')
              .upsert({
                user_id: user.id,
                full_name: fullName,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'user_id'
              })
            
            if (error) {
              console.error('Failed to save OAuth user name:', error)
            }
          }
        }
      }
    })
    return () => { sub.subscription.unsubscribe() }
  }, [loadUser])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    await loadUser()
    return {}
  }

  async function signUp(email: string, password: string, fullName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined,
      },
    })
    if (error) return { error: error.message }
    const needsVerification = !!data?.user && !data.user.email_confirmed_at
    return { needsVerification }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
      },
    })
    if (error) return { error: error.message }
    return {}
  }

  async function signInWithGitHub() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
      },
    })
    if (error) return { error: error.message }
    return {}
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  const value: AuthContextValue = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithGitHub,
    signOut,
    refresh: loadUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
