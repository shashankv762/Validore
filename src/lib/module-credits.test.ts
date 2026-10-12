import { describe, expect, it, vi } from 'vitest'
import { consumeModulePack } from './module-credits'
import type { CreditTransaction } from './credits'
function transaction(available: boolean) {
  const ledger = vi.fn()
  const tx = {
    update: () => ({ set: () => ({ where: () => ({ returning: async () => available ? [{ id: 'user' }] : [] }) }) }),
    insert: () => ({ values: ledger }),
  }
  return { tx: tx as unknown as CreditTransaction, ledger }
}
describe('Module run packs', () => {
  it('does not charge or ledger a run when the pack was already consumed', async () => {
    const test = transaction(false)
    expect(await consumeModulePack(test.tx, 'user', 'crowdfundingCredits', 'idea')).toBe(false)
    expect(test.ledger).not.toHaveBeenCalled()
  })
  it('records a pack debit in run units instead of charging universal credits twice', async () => {
    const test = transaction(true)
    expect(await consumeModulePack(test.tx, 'user', 'pitchDeckCredits', 'idea')).toBe(true)
    expect(test.ledger).toHaveBeenCalledWith(expect.objectContaining({ amount: -1, transactionType: 'PITCH_DECK_PACK', userId: 'user' }))
  })
})
