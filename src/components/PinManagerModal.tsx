import React, { useState, useEffect } from 'react'
import { X, ArrowLeft, Loader2 } from 'lucide-react'
import { useAppLock } from '@/contexts/AppLockContext'

type Mode = 'setup' | 'change' | 'remove'

interface PinManagerModalProps {
  isOpen: boolean
  onClose: () => void
  mode: Mode
  onSuccess?: () => void
}

export default function PinManagerModal({ isOpen, onClose, mode, onSuccess }: PinManagerModalProps) {
  const { verifyPin, setupPin, changePin, removePin } = useAppLock()
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>(mode === 'setup' ? 'new' : 'current')
  const [pin, setPin] = useState('')
  const [newPinTemp, setNewPinTemp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(mode === 'setup' ? 'new' : 'current')
      setPin('')
      setNewPinTemp('')
      setError('')
      setLoading(false)
    }
  }, [isOpen, mode])

  if (!isOpen) return null

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num
      setPin(nextPin)
      setError('')

      // Auto-submit when 4 digits entered
      if (nextPin.length === 4) {
        setTimeout(() => handleSubmit(nextPin), 300)
      }
    }
  }

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1))
    setError('')
  }

  const handleSubmit = (currentInput: string) => {
    if (step === 'current') {
      if (verifyPin(currentInput)) {
        if (mode === 'remove') {
          handleRemovePin()
        } else {
          setStep('new')
          setPin('')
        }
      } else {
        setError('Incorrect PIN')
        setPin('')
      }
    } else if (step === 'new') {
      setNewPinTemp(currentInput)
      setStep('confirm')
      setPin('')
    } else if (step === 'confirm') {
      if (currentInput === newPinTemp) {
        if (mode === 'setup') {
          setupPin(currentInput)
        } else {
          // Change pin requires old pin, but we already verified it.
          // Wait, changePin in context requires oldPin.
          // I stored verifyPin result but not the pin itself?
          // Actually changePin needs (oldPin, newPin).
          // But I already verified oldPin in step 1.
          // However, to call changePin I need the old PIN again.
          // Or I can just call setupPin(newPin) since I verified authorization?
          // The context changePin implementation checks oldPin again.
          // So I need to store the oldPin if I use changePin.
          // BUT, setupPin just overwrites localStorage. So I can use setupPin for change too?
          // Let's check AppLockContext implementation.
          // setupPin just does setItem. So it works for change too if I am authorized.
          setupPin(currentInput)
        }
        onSuccess?.()
        onClose()
      } else {
        setError('PINs do not match')
        setPin('')
        setStep('new') // Go back to enter new pin
      }
    }
  }

  const handleRemovePin = () => {
    removePin()
    onSuccess?.()
    onClose()
  }
  
  const getTitle = () => {
      if (mode === 'remove') return 'Remove App Lock'
      if (step === 'current') return 'Enter Current PIN'
      if (step === 'new') return 'Enter New PIN'
      if (step === 'confirm') return 'Confirm New PIN'
      return 'App Lock'
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{getTitle()}</h3>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col items-center">
          <div className="flex gap-4 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border transition-colors duration-200 ${
                  pin.length > i 
                    ? error ? 'bg-red-500 border-red-500' : 'bg-blue-500 border-blue-500' 
                    : 'border-slate-300 dark:border-slate-600 bg-transparent'
                }`}
              />
            ))}
          </div>

          {error && <p className="text-red-500 text-sm mb-4 animate-pulse">{error}</p>}

          <div className="grid grid-cols-3 gap-4 w-full max-w-[240px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num.toString())}
                className="w-14 h-14 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white text-xl font-semibold active:bg-gray-200 dark:active:bg-slate-700 transition-colors flex items-center justify-center outline-none focus:outline-none"
              >
                {num}
              </button>
            ))}
            <div className="w-14 h-14"></div>
            <button
              onClick={() => handleNumberClick('0')}
              className="w-14 h-14 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white text-xl font-semibold active:bg-gray-200 dark:active:bg-slate-700 transition-colors flex items-center justify-center outline-none focus:outline-none"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="w-14 h-14 rounded-full text-slate-400 active:text-slate-600 dark:active:text-slate-200 transition-colors flex items-center justify-center outline-none focus:outline-none"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
