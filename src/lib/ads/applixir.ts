import { createHash, timingSafeEqual } from 'node:crypto'
import type { RewardedAdConfig } from './config'

/** AppLixir v6, dashboard mode "MD5 and TID". customData is NOT signed.
 * Bind the opaque session to the signed userId instead of trusting customData.
 * https://support.applixir.com/applixir-integration/integration-for-html5-sites-apps/step-4-setting-up-local-callback-360053188774
 */
export function verifyApplixirCallback(params: URLSearchParams, config: RewardedAdConfig) {
  for (const field of ['gameApiKey', 'gameId', 'userId', 'tid', 'signature']) {
    if (params.getAll(field).length !== 1) return null
  }
  const apiKey = params.get('gameApiKey')!
  const gameId = params.get('gameId')!
  const sessionId = params.get('userId')!
  const transactionId = params.get('tid')!
  const signature = params.get('signature')!
  if (apiKey !== config.apiKey || gameId !== config.gameId ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(sessionId) ||
      !/^[a-zA-Z0-9._:-]{1,200}$/.test(transactionId) || !/^[a-f0-9]{32}$/.test(signature)) return null
  // This is the provider's required signature algorithm, not a password hash.
  const expected = createHash('md5').update(apiKey + gameId + sessionId + transactionId + config.secret).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null
  return { provider: config.provider, sessionId, transactionId }
}
