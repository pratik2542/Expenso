import React, { useState, useEffect } from 'react'
import { useAppLock } from '@/contexts/AppLockContext'
import { Lock, Unlock } from 'lucide-react'

export default function AppLockScreen() {
  const { isLocked, unlock } = useAppLock()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (!isLocked) {
      setPin('')
      setError(false)
    }
  }, [isLocked])

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num
      setPin(newPin)
      if (newPin.length === 4) {
        // Try to unlock
        setTimeout(() => {
            const success = unlock(newPin)
            if (!success) {
              setError(true)
              setAnimating(true)
              setTimeout(() => {
                setPin('')
                setError(false)
                setAnimating(false)
              }, 500)
            }
        }, 100)
      }
    }
  }

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1))
    setError(false)
  }

  if (!isLocked) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className={`flex flex-col items-center max-w-sm w-full transition-transform ${animating ? 'animate-shake' : ''}`}>
        <div className="mb-8 p-4 bg-slate-800 rounded-full">
          <Lock className="w-8 h-8 text-blue-500" />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-8">Enter Passcode</h2>
        
        <div className="flex gap-4 mb-12">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-colors duration-200 ${
                pin.length > i 
                  ? error ? 'bg-red-500 border-red-500' : 'bg-blue-500 border-blue-500' 
                  : 'border-slate-600 bg-transparent'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              className="w-16 h-16 rounded-full bg-slate-800 text-white text-2xl font-semibold active:bg-slate-700 transition-colors flex items-center justify-center outline-none focus:outline-none"
            >
              {num}
            </button>
          ))}
          <div className="w-16 h-16"></div>
          <button
            onClick={() => handleNumberClick('0')}
            className="w-16 h-16 rounded-full bg-slate-800 text-white text-2xl font-semibold active:bg-slate-700 transition-colors flex items-center justify-center outline-none focus:outline-none"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-16 h-16 rounded-full text-slate-400 active:text-white transition-colors flex items-center justify-center outline-none focus:outline-none"
          >
            Delete
          </button>
        </div>
        
        {error && (
            <p className="text-red-500 mt-6 animate-pulse">Incorrect passcode</p>
        )}
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 2;
        }
      `}</style>
    </div>
  )
}
