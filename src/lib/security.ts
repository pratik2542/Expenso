/**
 * Security utilities for sanitization and validation
 */

// Rate limiting store (in-memory, resets on server restart)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Check rate limit for AI queries
 * @param userId User identifier
 * @param maxRequests Maximum requests per window
 * @param windowMs Time window in milliseconds
 * @returns true if rate limit exceeded
 */
export function checkRateLimit(
  userId: string,
  maxRequests: number = 30,
  windowMs: number = 60000 // 1 minute
): boolean {
  const now = Date.now()
  const userLimit = rateLimitStore.get(userId)

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(userId, {
      count: 1,
      resetTime: now + windowMs
    })
    return false
  }

  if (userLimit.count >= maxRequests) {
    return true // Rate limit exceeded
  }

  userLimit.count++
  return false
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 * @param input User input string
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return ''
  
  return input
    .trim()
    .slice(0, 1000) // Limit length
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
}

/**
 * Validate expense data structure
 * @param expense Expense object to validate
 * @returns true if valid
 */
export function validateExpense(expense: any): boolean {
  if (!expense || typeof expense !== 'object') return false
  
  const requiredFields = ['id', 'amount', 'currency', 'occurred_on', 'category']
  for (const field of requiredFields) {
    if (!(field in expense)) return false
  }
  
  // Validate amount is a number
  if (typeof expense.amount !== 'number' || isNaN(expense.amount)) return false
  
  // Validate currency is a string
  if (typeof expense.currency !== 'string' || expense.currency.length !== 3) return false
  
  return true
}

/**
 * Sanitize error messages to prevent information leakage
 * @param error Error object or message
 * @returns Safe error message for client
 */
export function sanitizeError(error: any): string {
  // Never expose internal error details to client
  if (process.env.NODE_ENV === 'production') {
    return 'An error occurred while processing your request'
  }
  
  // In development, provide more details but still sanitized
  if (error instanceof Error) {
    return error.message.replace(/\/[\w\/]+\//g, '[path]/') // Remove file paths
  }
  
  return 'An error occurred'
}

/**
 * Validate Firebase UID format
 * @param uid User ID to validate
 * @returns true if valid
 */
export function validateUserId(uid: string): boolean {
  if (!uid || typeof uid !== 'string') return false
  
  // Firebase UIDs are typically 28 characters, alphanumeric
  return /^[a-zA-Z0-9]{20,35}$/.test(uid)
}

/**
 * Remove sensitive data from objects before logging
 * @param obj Object to clean
 * @returns Cleaned object safe for logging
 */
export function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj
  
  const sensitiveKeys = ['apiKey', 'password', 'token', 'secret', 'authorization']
  const cleaned = { ...obj }
  
  for (const key in cleaned) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      cleaned[key] = '[REDACTED]'
    }
  }
  
  return cleaned
}
