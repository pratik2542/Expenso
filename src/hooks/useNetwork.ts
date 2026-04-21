import { useState, useEffect } from 'react'
import { Network } from '@capacitor/network'
import { Capacitor } from '@capacitor/core'

export function useNetwork() {
  const [isOnline, setIsOnline] = useState<boolean>(true)

  useEffect(() => {
    // Initial state check
    const checkNetwork = async () => {
      if (Capacitor.isNativePlatform()) {
        const status = await Network.getStatus()
        setIsOnline(status.connected)
      } else {
        setIsOnline(navigator.onLine)
      }
    }
    checkNetwork()

    if (Capacitor.isNativePlatform()) {
      const listener = Network.addListener('networkStatusChange', status => {
        setIsOnline(status.connected)
      })
      return () => { listener.then(l => l.remove()) }
    } else {
      const handleOnline = () => setIsOnline(true)
      const handleOffline = () => setIsOnline(false)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  return isOnline
}
