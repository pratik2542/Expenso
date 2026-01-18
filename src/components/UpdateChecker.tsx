import React, { useEffect, useState, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { DownloadIcon, X } from 'lucide-react'

export default function UpdateChecker() {
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  useEffect(() => {
    checkForUpdates()
  }, [])

  const checkForUpdates = async () => {
    // Only check on native Android app
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return
    }

    try {
      // 1. Get current app version
      const appInfo = await App.getInfo()
      const currentVersion = appInfo.version

      // 2. Fetch latest version from website
      // We use the public URL where the app is hosted. 
      // Since the app is built from the same source, we can assume the API/public files are at the same domain 
      // configured in capacitor.config.ts or just use a relative path if the app is serving from the same origin (which it isn't in native).
      // We need the absolute URL of the deployed website.
      // For now, I'll assume the user has a deployed URL. If not, this might fail in dev if not configured.
      // But wait, the user said "download from web".
      
      // Let's try to fetch from the domain defined in capacitor.config.ts server url if available, 
      // or we can use a hardcoded URL if the user provides one. 
      // Since I don't have the deployed URL, I will try to fetch from the 'server' url if it's set, 
      // otherwise I'll assume the app is communicating with the backend.
      
      // Actually, for the "Get Android App" button to work, the user must have a website.
      // I'll use a relative path '/version.json' if the app is loading remote content, 
      // but Capacitor apps usually load local content.
      // So we need the absolute URL.
      // I'll use a placeholder URL or try to infer it. 
      // For now, I'll use a generic fetch and catch error.
      
      // CRITICAL: We need the website URL. 
      // I'll check capacitor.config.ts again to see if there is a server url.
      
      const response = await fetch('https://expense-ai-manager.vercel.app/version.json')
      if (!response.ok) return

      const data = await response.json()
      const remoteVersion = data.version

      // Only show update if remote version is actually newer
      const comparison = compareVersions(remoteVersion, currentVersion)
      if (comparison > 0) {
        setLatestVersion(remoteVersion)
        setShowUpdateModal(true)
      }
    } catch (error) {
      // Silent fail - don't show errors for update checks
    }
  }

  // Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
  const compareVersions = (v1: string, v2: string) => {
    const p1 = v1.split('.').map(Number)
    const p2 = v2.split('.').map(Number)
    const len = Math.max(p1.length, p2.length)

    for (let i = 0; i < len; i++) {
      const n1 = p1[i] || 0
      const n2 = p2[i] || 0
      if (n1 > n2) return 1
      if (n1 < n2) return -1
    }
    return 0
  }

  const handleDownload = () => {
    // Open the website in the system browser to download the APK
    window.open('https://expense-ai-manager.vercel.app/Expenso.apk', '_system')
    setShowUpdateModal(false)
  }

  if (!showUpdateModal) return null

  return (
    <Transition appear show={showUpdateModal} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => setShowUpdateModal(false)}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex items-center gap-2"
                >
                  <DownloadIcon className="h-6 w-6 text-primary-600" />
                  New Version Available
                </Dialog.Title>
                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-4">
                    A new version of Expenso ({latestVersion}) is available. Please update to get the latest features and fixes.
                  </p>

                  <button
                    type="button"
                    onClick={handleDownload}
                    className="w-full flex justify-center items-center gap-2 rounded-md border border-transparent bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    <DownloadIcon className="h-5 w-5" />
                    Download Update
                  </button>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                    onClick={() => setShowUpdateModal(false)}
                  >
                    Later
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
