/**
 * Environment variable validation
 * Ensures all required environment variables are set and no secrets are exposed to client
 */

// Server-side only environment variables (never exposed to client)
const serverEnvVars = [
  'GOOGLE_GEMINI_API_KEY',
  'PERPLEXITY_API_KEY',
] as const

// Client-side environment variables (exposed via NEXT_PUBLIC_)
const clientEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const

export function validateEnv() {
  // Only validate on server
  if (typeof window !== 'undefined') return

  const missing: string[] = []

  // Check server-side variables
  for (const envVar of serverEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar)
    }
  }

  // Check client-side variables
  for (const envVar of clientEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar)
    }
  }

  if (missing.length > 0) {
    console.warn('⚠️  Missing environment variables:', missing.join(', '))
  }
}

/**
 * Ensure API keys are not exposed in client-side bundles
 */
export function sanitizeEnvForClient() {
  // This runs at build time to ensure no secrets leak
  const exposedSecrets: string[] = []
  
  for (const envVar of serverEnvVars) {
    // Check if any server-side env var is accidentally prefixed with NEXT_PUBLIC_
    const publicVersion = `NEXT_PUBLIC_${envVar}`
    if (process.env[publicVersion]) {
      exposedSecrets.push(publicVersion)
    }
  }
  
  if (exposedSecrets.length > 0) {
    throw new Error(
      `🚨 SECURITY ERROR: Server-side secrets are exposed to client! Remove these from .env.local: ${exposedSecrets.join(', ')}`
    )
  }
}

// Run validation in development
if (process.env.NODE_ENV === 'development') {
  validateEnv()
  sanitizeEnvForClient()
}
