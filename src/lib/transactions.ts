export const REFUND_LIKE_REGEX = /(refund|refunded|cashback|chargeback|reversal|return|rebate|reimbursement|adjustment\s+credit|credit\b)/i

export type TxLike = {
  amount?: unknown
  type?: string
  note?: string
  merchant?: string
}

export function isRefundLike(tx: TxLike): boolean {
  if (tx.type === 'refund') return true
  if (tx.type !== 'income') return false

  const haystack = `${tx.note ?? ''} ${tx.merchant ?? ''}`
  return REFUND_LIKE_REGEX.test(haystack)
}

export function isIncomeLike(tx: TxLike): boolean {
  return tx.type === 'income' && !isRefundLike(tx)
}

// Returns a spending delta in positive currency units.
// +X = spending increased (expense)
// -X = spending decreased (refund)
export function spendingDelta(tx: TxLike): number {
  const amountNum = Number(tx.amount) || 0

  if (tx.type === 'transfer') return 0
  if (isRefundLike(tx)) return -Math.abs(amountNum)
  if (tx.type === 'income') return 0

  // Expenses are stored as negative amounts in manual entry, and `type` may be absent for legacy rows.
  if (tx.type === 'expense') return Math.abs(amountNum)
  if (!tx.type) return amountNum < 0 ? Math.abs(amountNum) : 0
  if (amountNum < 0) return Math.abs(amountNum)

  return 0
}
