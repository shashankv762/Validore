import { describe, expect, it } from 'vitest'
import { savedExportIdea } from '@/lib/exports/idea-context'

const current = { name: 'Restaurant hardware', coreProblem: 'Stock waste', location: 'India', userId: 'private-owner' }

describe('immutable idea context in saved exports', () => {
  it('uses the saved planning snapshot instead of the current idea', () => {
    expect(savedExportIdea({ reportData: { ideaSnapshot: { name: 'Clinic software', coreProblem: 'Missed appointments', location: 'UK', briefFingerprint: 'internal' } } }, current))
      .toEqual({ name: 'Clinic software', coreProblem: 'Missed appointments', location: 'UK' })
  })
  it('reads Canvas analysis snapshots and does not fill missing old fields from today', () => {
    expect(savedExportIdea({ analysisData: { ideaSnapshot: { name: 'Original canvas' } } }, current)).toEqual({ name: 'Original canvas' })
  })
  it('retains the old validation report idea before the current idea', () => {
    expect(savedExportIdea({ reportData: { idea: { name: 'Original validation', industry: 'Health' } } }, current)).toEqual({ name: 'Original validation', industry: 'Health' })
  })
  it('falls back for legacy missing or malformed snapshots without treating metadata as a brief', () => {
    for (const value of [null, [], 'bad', {}, { briefFingerprint: 'metadata' }, { name: 123 }]) {
      expect(savedExportIdea({ reportData: { ideaSnapshot: value } }, current)).toBe(current)
    }
    expect(savedExportIdea({}, null)).toBeNull()
  })
  it('does not copy extra metadata or private fields from a snapshot', () => {
    expect(savedExportIdea({ reportData: { ideaSnapshot: { name: 'Original', id: 'private-id', userId: 'owner', apiKey: 'private-key', reportData: {} } } }, current)).toEqual({ name: 'Original' })
  })
})
