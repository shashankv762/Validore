import { describe, expect, it, vi } from 'vitest'
import { requestPitchDeck } from '@/lib/planning/pitch-client'

describe('durable pitch continuation client', () => {
  it('keeps the exact key and body across 202 continuations and accepts only a complete response', async () => {
    const send = vi.fn().mockResolvedValueOnce(Response.json({ completedStages: ['slides','strategy'] }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ completedStages: ['slides','strategy','preparation'] }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ deckId: 'saved-deck' }))
    const progress = vi.fn()
    expect(await requestPitchDeck({ founderName: 'Exact name' }, 'same-key', progress, send)).toEqual({ deckId: 'saved-deck' })
    expect(progress).toHaveBeenCalledTimes(2)
    for (const [, options] of send.mock.calls) {
      expect(options.headers['Idempotency-Key']).toBe('same-key')
      expect(options.body).toBe('{"founderName":"Exact name"}')
    }
  })
  it('stops a repeated checkpoint acknowledgement and preserves the retry action', async () => {
    const send = vi.fn().mockImplementation(async () => Response.json({ completedStages: ['slides'] }, { status: 202 }))
    await expect(requestPitchDeck({}, 'key', vi.fn(), send)).rejects.toThrow('Retry this same run')
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('retains the changed-input error code for the UI to rotate its key', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ error: 'Changed idea', code: 'planning_inputs_changed' }, { status: 409 }))
    await expect(requestPitchDeck({}, 'key', vi.fn(), send)).rejects.toMatchObject({ code: 'planning_inputs_changed' })
  })
})
