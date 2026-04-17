import React, { Fragment, useEffect, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SparklesIcon, SettingsIcon } from 'lucide-react'

export default function WhatsNewModal() {
  const [showModal, setShowModal] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    const maybeShow = async () => {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
        return
      }

      try {
        const appInfo = await App.getInfo()
        const version = appInfo.version || 'unknown'
        setAppVersion(version)

        const seenKey = `expenso_seen_whats_new_${version}`
        const hasSeen = localStorage.getItem(seenKey)
        if (!hasSeen) {
          setShowModal(true)
        }
      } catch (error) {
        console.error('Failed to show what\'s new modal:', error)
      }
    }

    maybeShow()
  }, [])

  const handleClose = () => {
    if (appVersion) {
      localStorage.setItem(`expenso_seen_whats_new_${appVersion}`, 'true')
    }
    setShowModal(false)
  }

  const openThemeSettings = () => {
    if (appVersion) {
      localStorage.setItem(`expenso_seen_whats_new_${appVersion}`, 'true')
    }
    setShowModal(false)
    window.location.href = '/settings'
  }

  if (!showModal) return null

  return (
    <Transition appear show={showModal} as={Fragment}>
      <Dialog as="div" className="relative z-[70]" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60" />
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-primary-600" />
                  What&apos;s New in Expenso
                </Dialog.Title>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Updated version: {appVersion || 'latest'}
                </p>

                <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700">
                    <p className="font-medium">We improved the new Black Theme:</p>
                    <ul className="mt-1 list-disc pl-5 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                      <li>Better borders and contrast</li>
                      <li>Clearer card/background separation</li>
                      <li>Improved logo visibility on mobile</li>
                    </ul>
                  </div>

                  <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3 border border-blue-200 dark:border-blue-800">
                    <p className="font-medium text-blue-800 dark:text-blue-300">How to enable in APK:</p>
                    <ol className="mt-1 list-decimal pl-5 space-y-1 text-xs text-blue-700 dark:text-blue-200">
                      <li>Open Settings</li>
                      <li>Go to Appearance</li>
                      <li>Select Theme Mode - Black</li>
                    </ol>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={openThemeSettings}
                    className="flex-1 inline-flex justify-center items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
                  >
                    <SettingsIcon className="h-4 w-4" />
                    Open Settings
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
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
