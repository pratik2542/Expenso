/**
 * Security headers configuration for Next.js
 * These headers protect against common web vulnerabilities
 */

const securityHeaders = [
  // Prevent browsers from MIME-sniffing
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  // Enable XSS protection in browsers
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  // Prevent clickjacking attacks (but allow Firebase auth popups)
  // Note: We use CSP frame-src instead for more granular control
  // {
  //   key: 'X-Frame-Options',
  //   value: 'DENY'
  // },
  // Control referrer information
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  // Content Security Policy - prevents XSS, injection attacks
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://www.googletagmanager.com", // Required for Next.js and Google scripts
      "style-src 'self' 'unsafe-inline'", // Required for styled components
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://generativelanguage.googleapis.com https://api.perplexity.ai https://*.vercel.app https://www.google-analytics.com https://*.firebaseapp.com https://*.firebase.com",
      "frame-src https://expenso-pdfexcel.vercel.app https://*.firebaseapp.com https://accounts.google.com", // Allow PDF converter iframe and Firebase auth popups
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  },
  // Permissions Policy - disable unnecessary browser features
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  },
  // Strict Transport Security - enforce HTTPS
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains'
  }
]

module.exports = { securityHeaders }
