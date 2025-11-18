import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import {
  Auth,
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  GithubAuthProvider,
  updateProfile,
} from 'firebase/auth'
import { auth, db } from '@/lib/firebaseClient'
import { doc, setDoc, getDoc } from 'firebase/firestore'

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
    try {
      setLoading(true)
      // Firebase handles session automatically, just wait for auth state
      await new Promise<void>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          console.log('AuthContext loadUser: Auth state changed', { uid: user?.uid })
          setUser(user)
          setLoading(false)
          unsubscribe()
          resolve()
        })
      })
    } catch (err) {
      console.error('AuthContext loadUser error:', err)
      setUser(null)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  async function signIn(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(auth, email, password)
      return {}
    } catch (error: any) {
      console.error('Sign in error:', error)
      return { error: error.message }
    }
  }

  async function signUp(email: string, password: string, fullName?: string) {
    try {
      const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password)
      
      // Update profile with full name
      if (fullName) {
        await updateProfile(newUser, { displayName: fullName })
      }

      // Create user_settings document in Firestore
      if (fullName) {
        await setDoc(doc(db, 'user_settings', newUser.uid), {
          user_id: newUser.uid,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        })
      }

      return { needsVerification: false }
    } catch (error: any) {
      console.error('Sign up error:', error)
      return { error: error.message }
    }
  }

  async function signInWithGoogle() {
    try {
      const provider = new GoogleAuthProvider()
      const { user: signedInUser } = await signInWithPopup(auth, provider)

      // Save user info to Firestore
      const fullName = signedInUser.displayName || ''
      if (fullName) {
        await setDoc(
          doc(db, 'user_settings', signedInUser.uid),
          {
            user_id: signedInUser.uid,
            full_name: fullName,
            updated_at: new Date().toISOString(),
          },
          { merge: true }
        )
      }

      return {}
    } catch (error: any) {
      console.error('Google sign in error:', error)
      return { error: error.message }
    }
  }

  async function signInWithGitHub() {
    try {
      const provider = new GithubAuthProvider()
      const { user: signedInUser } = await signInWithPopup(auth, provider)

      // Save user info to Firestore
      const fullName = signedInUser.displayName || ''
      if (fullName) {
        await setDoc(
          doc(db, 'user_settings', signedInUser.uid),
          {
            user_id: signedInUser.uid,
            full_name: fullName,
            updated_at: new Date().toISOString(),
          },
          { merge: true }
        )
      }

      return {}
    } catch (error: any) {
      console.error('GitHub sign in error:', error)
      return { error: error.message }
    }
  }

  async function signOutUser() {
    try {
      await signOut(auth)
      setUser(null)
    } catch (error: any) {
      console.error('Sign out error:', error)
    }
  }

  const value: AuthContextValue = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithGitHub,
    signOut: signOutUser,
    refresh: loadUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
