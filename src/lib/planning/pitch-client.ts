type PitchProgress = { completedStages: string[] }
export class PitchRequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message) }
}

/** Every continuation sends exactly the same payload and key. A 202 is a
 * checkpoint acknowledgement, never a finished deck or another purchase. */
export async function requestPitchDeck<T>(payload: unknown, key: string, onProgress: (progress: PitchProgress) => void,
  send: typeof fetch = fetch): Promise<T> {
  const body = JSON.stringify(payload)
  let completed = 0
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await send('/api/pitch-deck', { method: 'POST', signal: AbortSignal.timeout(280_000),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body })
    const data = await response.json()
    if (response.status === 202) {
      const stages = Array.isArray(data.completedStages) ? data.completedStages.filter((stage: unknown): stage is string => typeof stage === 'string') : []
      if (stages.length <= completed) throw new PitchRequestError('Your completed sections are saved. Retry this same run to finish the remaining sections.')
      completed = stages.length
      onProgress({ completedStages: stages })
      continue
    }
    if (!response.ok) throw new PitchRequestError(data.error ?? 'Deck generation could not complete. Retry the same run to keep any saved sections.', data.code)
    return data as T
  }
  throw new PitchRequestError('Your completed sections are saved. Retry this same run to finish the remaining sections.')
}
