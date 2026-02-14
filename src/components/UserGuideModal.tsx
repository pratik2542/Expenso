import React, { useState, useEffect, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X, ChevronRight, ChevronLeft, LayoutDashboard, PlusCircle, Globe, ShieldCheck, CheckCircle2 } from 'lucide-react'

interface UserGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
  const [step, setStep] = useState(0)

  const steps = [
    {
      title: "Welcome to Expenso!",
      description: "Your comprehensive expense tracker. Let's take a quick tour to help you get started.",
      icon: <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-3xl">👋</div>,
      color: "bg-blue-600"
    },
    {
      title: "Dashboard Overview",
      description: "Get a bird's-eye view of your finances. Validated AI insights and charts help you understand your spending habits.",
      icon: <LayoutDashboard className="w-16 h-16 text-purple-600 dark:text-purple-400" />,
      color: "bg-purple-600"
    },
    {
      title: "Adding Transactions",
      description: "Tap the floating '+' button at the bottom (mobile) or sidebar (desktop) to quickly add income or expenses.",
      icon: <PlusCircle className="w-16 h-16 text-green-600 dark:text-green-400" />,
      color: "bg-green-600"
    },
    {
      title: "Multiple Workspaces",
      description: "Keep your Personal, Business, and Travel expenses separate using Environments. Switch between them easily.",
      icon: <Globe className="w-16 h-16 text-orange-600 dark:text-orange-400" />,
      color: "bg-orange-600"
    },
    {
      title: "Secure Your Data",
      description: "Enable App Lock with PIN or Biometrics in Settings > Security to keep your financial data private.",
      icon: <ShieldCheck className="w-16 h-16 text-red-600 dark:text-red-400" />,
      color: "bg-red-600"
    }
  ]

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      onClose()
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const currentStep = steps[step]

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[150]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-3xl bg-white dark:bg-slate-900 p-8 text-left align-middle shadow-2xl transition-all border border-gray-100 dark:border-slate-800">
                
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="relative">
                    {currentStep.icon}
                    <div className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${currentStep.color} border-2 border-white dark:border-slate-900`}>
                      {step + 1}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Dialog.Title as="h3" className="text-2xl font-bold text-gray-900 dark:text-white">
                      {currentStep.title}
                    </Dialog.Title>
                    <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                      {currentStep.description}
                    </p>
                  </div>

                  <div className="flex gap-2 justify-center w-full pt-4">
                    {steps.map((_, idx) => (
                      <div 
                        key={idx} 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          idx === step 
                            ? `w-8 ${currentStep.color}` 
                            : 'w-2 bg-gray-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex gap-3 w-full pt-4">
                     {step > 0 ? (
                        <button
                          onClick={handleBack}
                          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                          <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                     ) : (
                        <button
                          onClick={onClose}
                          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold transition-colors"
                        >
                          Skip
                        </button>
                     )}
                     
                     <button
                        onClick={handleNext}
                        className={`flex-1 px-4 py-3 rounded-xl text-white font-semibold transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 ${currentStep.color} hover:brightness-110`}
                     >
                        {step === steps.length - 1 ? (
                          <>Get Started <CheckCircle2 className="w-4 h-4" /></>
                        ) : (
                          <>Next <ChevronRight className="w-4 h-4" /></>
                         )}
                     </button>
                  </div>
                </div>

              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
