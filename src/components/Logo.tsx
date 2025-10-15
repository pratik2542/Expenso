import React from 'react'
import Image from 'next/image'

// Simple minimal logo: circular gradient coin with E letter
export function Logo({ size = 32 }: { size?: number }) {
  const s = size
  return (
    <div className="inline-flex items-center select-none" aria-label="Expenso logo">
      <svg
        width={s}
        height={s}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-sm"
      >
        <defs>
          <linearGradient id="expenso-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill="url(#expenso-grad)" />
        <path
          d="M42 20H26a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h16" 
          stroke="white" 
          strokeWidth="5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />
        <path
          d="M30 32h10" 
          stroke="white" 
          strokeWidth="5" 
          strokeLinecap="round" 
        />
      </svg>
    </div>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight bg-gradient-to-r from-primary-600 to-violet-500 bg-clip-text text-transparent ${className}`}>Expenso</span>
  )
}

export function Brand({ size = 28, hideWord = false }: { size?: number; hideWord?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Logo size={size} />
      {!hideWord && <Wordmark />}
    </div>
  )
}

export default Brand

// Calculator image based logo (PNG) for user preference
export function CalcLogo({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/calculatorImg.png"
      alt="Expenso logo"
      width={size}
      height={size}
      className="rounded-md object-contain"
      priority={false}
    />
  )
}

export function CalcBrand({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <CalcLogo size={size} />
      <Wordmark />
    </div>
  )
}
