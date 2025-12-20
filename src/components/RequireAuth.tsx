import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      // Store the current path to redirect back after authentication
      const returnUrl = router.asPath
      router.replace(`/auth?redirect=${encodeURIComponent(returnUrl)}`)
    }
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }
  if (!user) return null
  return <>{children}</>
}
