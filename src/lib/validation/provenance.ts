import { createHash } from 'node:crypto'
import { effectiveAiPreference, freeModelsOnly, ROLE_MODELS, workspaceModelPolicy } from '@/lib/ai/model-policy'
import type { SearchResult } from '@/lib/ai/search'

// Bump when coordinator prompts, validators or dependency contracts change.
// Explicit versions survive minification and server bundling; Function#toString does not.
export const VALIDATION_METHOD_VERSION = 'validation-2026-11-20.1'
export function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalValue(item)]))
  return value
}
export const inputHash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex')

/** Record routing configuration, never credentials or arbitrary environment values. */
export function validationModelPolicy(preference?: string | null) {
  const settings = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^AI_AGENT_[A-Z]+_(?:MODELS|(?:OPENAI|GOOGLE|ANTHROPIC)_MODEL)$/.test(key) ||
    /^(?:AI_GATEWAY_(?:ENABLED|ORDER|ROTATE)|AI_DIRECT_FIRST|(?:OPENAI|GOOGLE|ANTHROPIC)_AI_MODEL|(?:PIXROUTER|OPENROUTER|OPENCODE|UTIM)_(?:MODELS|FREE_MODELS|REASONING_EFFORT))$/.test(key)))
  return { preference: effectiveAiPreference(preference), freeOnly: freeModelsOnly(), workspace: workspaceModelPolicy(), roles: ROLE_MODELS, settings }
}

export function validationManifest(input: unknown, privateContext: string | undefined, sources: readonly SearchResult[],
  steps: readonly string[], preference?: string | null) {
  const models = validationModelPolicy(preference)
  return { version: 1, methodVersion: VALIDATION_METHOD_VERSION, inputHash: inputHash(input),
    privateContextHash: inputHash(privateContext ?? ''), modelPolicy: models, modelPolicyHash: inputHash(models),
    sources: sources.map(source => ({ url: source.url, fetchedAt: source.fetchedAt,
      contentHash: inputHash(source) })).sort((a, b) => a.url.localeCompare(b.url) || a.contentHash.localeCompare(b.contentHash)),
    steps: [...steps] }
}
