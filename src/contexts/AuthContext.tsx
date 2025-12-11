import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { auth, db } from '@/lib/firebaseClient'
import { analytics } from '@/lib/firebaseClient'
import { Capacitor } from '@capacitor/core'
// import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth' // Removed static import
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  GithubAuthProvider,
  sendPasswordResetEmail,
  updatePassword,
  User as FirebaseUser,
} from 'firebase/auth'
import { doc, setDoc, collection, query, where, getDocs, getDoc, serverTimestamp } from 'firebase/firestore'
import { logEvent } from 'firebase/analytics'

type User = FirebaseUser

interface AuthContextValue {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error?: string; needsVerification?: boolean }>
  signInWithGoogle: () => Promise<{ error?: string }>
  signInWithGitHub: () => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error?: string }>
  updateUserPassword: (newPassword: string) => Promise<{ error?: string }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    console.log('AuthContext loadUser: Starting')
    setLoading(true)
    try {
      // Firebase handles auth state automatically, this is just for initial load
      const currentUser = auth.currentUser
      console.log('AuthContext loadUser:', { userId: currentUser?.uid })
      setUser(currentUser)
    } catch (err) {
      console.error('AuthContext loadUser error:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
    
    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Firebase auth state changed:', firebaseUser?.uid)
      setUser(firebaseUser)
      setLoading(false)
      
      // When user signs in, save their display name and email to user_settings
      if (firebaseUser) {
        const displayName = firebaseUser.displayName
        const email = firebaseUser.email
        
        // Track login event
        if (analytics && typeof window !== 'undefined') {
          logEvent(analytics as any, 'login', {
            method: firebaseUser.providerData[0]?.providerId || 'email'
          })
        }
        
        try {
          // Update or create user_settings with the name and email
          const userSettingsRef = doc(db, 'user_settings', firebaseUser.uid)
          
          // First check if user_settings exists
          const existingDoc = await getDoc(userSettingsRef)
          
          if (!existingDoc.exists()) {
            // Only create/update if document doesn't exist
            await setDoc(userSettingsRef, {
              user_id: firebaseUser.uid,
              full_name: displayName || '',
              email: email || '',
              updated_at: serverTimestamp()
            })
          }
        } catch (error) {
          console.error('Failed to save user info:', error)
        }
      }
    })
    
    return () => unsubscribe()
  }, [loadUser])

  async function signIn(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(auth, email, password)
      return {}
    } catch (error: any) {
      return { error: error.message }
    }
  }

  async function signUp(email: string, password: string, fullName?: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      
      // Track signup event
      if (analytics && typeof window !== 'undefined') {
        logEvent(analytics as any, 'sign_up', {
          method: 'email'
        })
      }
      
      // Save full name and email to user_settings if provided
      if (fullName && userCredential.user) {
        const userSettingsRef = doc(db, 'user_settings', userCredential.user.uid)
        await setDoc(userSettingsRef, {
          user_id: userCredential.user.uid,
          full_name: fullName,
          email: email,
          preferred_currency: 'CAD',
          convert_existing_data: true,
          updated_at: serverTimestamp()
        }, { merge: true })
      }
      
      // Firebase automatically verifies users, no email verification needed
      return { needsVerification: false }
    } catch (error: any) {
      return { error: error.message }
    }
  }

  async function signInWithGoogle() {
    try {
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        const googleUser = await GoogleAuth.signIn()
        const idToken = googleUser.authentication.idToken
        const credential = GoogleAuthProvider.credential(idToken)
        await signInWithCredential(auth, credential)
      } else {
        const provider = new GoogleAuthProvider()
        await signInWithPopup(auth, provider)
      }
      return {}
    } catch (error: any) {
      return { error: error.message }
    }
  }

  async function signInWithGitHub() {
    try {
      const provider = new GithubAuthProvider()
      await signInWithPopup(auth, provider)
      return {}
    } catch (error: any) {
      return { error: error.message }
    }
  }

  async function signOut() {
    await firebaseSignOut(auth)
    setUser(null)
  }

  async function resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(auth, email)
      return {}
    } catch (error: any) {
      return { error: error.message }
    }
  }

  async function updateUserPassword(newPassword: string) {
    try {
      if (!auth.currentUser) {
        return { error: 'No user logged in' }
      }
      await updatePassword(auth.currentUser, newPassword)
      return {}
    } catch (error: any) {
      return { error: error.message }
    }
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
    resetPassword,
    updateUserPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
