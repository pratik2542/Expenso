import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { doc, setDoc, serverTimestamp, increment, arrayUnion } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebaseClient'

export default function UserActivityTracker() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.uid || typeof window === 'undefined') return

    const platform = Capacitor.isNativePlatform() ? 'apk' : 'web'
    const today = new Date().toISOString().slice(0, 10)

    const dayKey = `expenso_activity_day_${user.uid}_${platform}_${today}`
    const sessionKey = `expenso_activity_session_${user.uid}_${platform}`

    const shouldMarkDay = !localStorage.getItem(dayKey)
    const shouldMarkSession = !sessionStorage.getItem(sessionKey)

    if (!shouldMarkDay && !shouldMarkSession) return

    const ref = doc(db, 'user_activity', user.uid)

    const payload: Record<string, any> = {
      user_id: user.uid,
      last_seen_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      last_platform: platform,
      [`last_seen_${platform}_at`]: serverTimestamp(),
    }

    if (shouldMarkDay) {
      payload.active_days = arrayUnion(today)
      payload[`${platform}_active_days`] = increment(1)
      localStorage.setItem(dayKey, '1')
    }

    if (shouldMarkSession) {
      payload[`${platform}_sessions`] = increment(1)
      payload.total_sessions = increment(1)
      sessionStorage.setItem(sessionKey, '1')
    }

    setDoc(ref, payload, { merge: true }).catch((error) => {
      console.error('Failed to track user activity:', error)
    })
  }, [user?.uid])

  return null
}
