import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('A 32-byte ENCRYPTION_KEY is required')
  return Buffer.from(key, 'hex')
}

export function encryptApiKey(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['gcm', iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decryptApiKey(value: string): string {
  const parts = value.split(':')
  if (parts.length === 4 && parts[0] === 'gcm' && /^[a-f0-9]{24}$/i.test(parts[1]) && /^[a-f0-9]{32}$/i.test(parts[2]) && /^(?:[a-f0-9]{2})+$/i.test(parts[3])) {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[1], 'hex'))
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8')
  }
  // Read existing encrypted records during migration; new writes always use authenticated encryption.
  if (parts.length === 2 && /^[a-f0-9]{32}$/i.test(parts[0]) && /^(?:[a-f0-9]{2})+$/i.test(parts[1])) {
    const decipher = createDecipheriv('aes-256-cbc', encryptionKey(), Buffer.from(parts[0], 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'hex')), decipher.final()]).toString('utf8')
  }
  throw new Error('Stored API key is not encrypted. Save it again in settings.')
}
