import { describe, it, expect } from 'vitest'
import {
  STARTUP_WEIGHTS, BM_WEIGHTS, CAMPAIGN_WEIGHTS, PITCH_WEIGHTS, PRICING_WEIGHTS,
  validateWeightTable, clampScore, getCampaignClassificationBand
} from './scoring'

describe('Weight tables sum to 100', () => {
  it('STARTUP_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(STARTUP_WEIGHTS)).toBe(true)
  })
  it('BM_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(BM_WEIGHTS)).toBe(true)
  })
  it('CAMPAIGN_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(CAMPAIGN_WEIGHTS)).toBe(true)
  })
  it('PITCH_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(PITCH_WEIGHTS)).toBe(true)
  })
  it('PRICING_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(PRICING_WEIGHTS)).toBe(true)
  })
})

describe('clampScore', () => {
  it('clamps to max weight', () => expect(clampScore(25, 20)).toBe(20))
  it('clamps to 0 minimum', () => expect(clampScore(-5, 20)).toBe(0))
  it('passes through valid score', () => expect(clampScore(15, 20)).toBe(15))
})

describe('getCampaignClassificationBand', () => {
  it('80+ is Strong Readiness', () => {
    expect(getCampaignClassificationBand(85).label).toBe('Strong Readiness')
  })
  it('65-79 is Promising', () => {
    expect(getCampaignClassificationBand(70).label).toBe('Promising but Improvements Required')
  })
  it('50-64 is Significant Risk', () => {
    expect(getCampaignClassificationBand(55).label).toBe('Significant Risk')
  })
  it('<50 is Major Rework', () => {
    expect(getCampaignClassificationBand(40).label).toBe('Major Rework Required')
  })
  it('includes disclaimer', () => {
    expect(getCampaignClassificationBand(80).disclaimer).toContain('educational decision-support')
  })
})
