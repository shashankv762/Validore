import { describe, it, expect } from 'vitest';
import * as f from './financial';

describe('Financial Formulas', () => {
    it('calculates Break-Even Units', () => {
        expect(f.calculateBreakEvenUnits(1000, 50, 25)).toBe(40);
        expect(f.calculateBreakEvenUnits(1000, 20, 25)).toBe(Infinity);
    });

    it('calculates Break-Even Revenue', () => {
        expect(f.calculateBreakEvenRevenue(40, 50)).toBe(2000);
    });

    it('calculates CAC', () => {
        expect(f.calculateCAC(5000, 100)).toBe(50);
        expect(f.calculateCAC(5000, 0)).toBe(Infinity);
    });

    it('calculates ARPU', () => {
        expect(f.calculateARPU(10000, 200)).toBe(50);
        expect(f.calculateARPU(10000, 0)).toBe(0);
    });

    it('calculates LTV', () => {
        expect(f.calculateLTV(30, 24)).toBe(720);
    });

    it('calculates LTV:CAC Ratio', () => {
        expect(f.calculateLTVCACRatio(720, 50)).toBe(14.4);
        expect(f.calculateLTVCACRatio(720, 0)).toBe(Infinity);
    });

    it('calculates CAC Payback Period', () => {
        expect(f.calculateCACPaybackPeriod(50, 10)).toBe(5);
        expect(f.calculateCACPaybackPeriod(50, 0)).toBe(Infinity);
    });

    it('calculates Contribution Margin', () => {
        expect(f.calculateContributionMargin(100, 60)).toBe(40);
    });

    it('calculates Contribution Margin %', () => {
        expect(f.calculateContributionMarginPercent(40, 100)).toBe(40);
        expect(f.calculateContributionMarginPercent(40, 0)).toBe(0);
    });

    it('calculates Gross Margin %', () => {
        expect(f.calculateGrossMarginPercent(1000, 600)).toBe(40);
        expect(f.calculateGrossMarginPercent(0, 600)).toBe(0);
    });

    it('calculates Markup %', () => {
        expect(f.calculateMarkupPercent(150, 100)).toBe(50);
        expect(f.calculateMarkupPercent(150, 0)).toBe(0);
    });

    it('calculates Funding %', () => {
        expect(f.calculateFundingPercent(5000, 10000)).toBe(50);
        expect(f.calculateFundingPercent(5000, 0)).toBe(0);
    });

    it('calculates Required Backers', () => {
        expect(f.calculateRequiredBackers(10000, 50)).toBe(200);
        expect(f.calculateRequiredBackers(10000, 0)).toBe(Infinity);
    });

    it('calculates Required Visitors', () => {
        expect(f.calculateRequiredVisitors(200, 5)).toBe(4000);
        expect(f.calculateRequiredVisitors(200, 0)).toBe(Infinity);
    });

    it('calculates Conversion Rate', () => {
        expect(f.calculateConversionRate(200, 4000)).toBe(5);
        expect(f.calculateConversionRate(200, 0)).toBe(0);
    });

    it('calculates Cost Per Backer', () => {
        expect(f.calculateCostPerBacker(1000, 200)).toBe(5);
        expect(f.calculateCostPerBacker(1000, 0)).toBe(Infinity);
    });

    it('calculates Price Elasticity', () => {
        expect(f.calculatePriceElasticity(-10, 20)).toBe(-0.5);
        expect(f.calculatePriceElasticity(-10, 0)).toBe(0);
    });

    it('calculates Discount Break-Even Volume', () => {
        expect(f.calculateDiscountBreakEvenVolume(1000, 20)).toBe(50);
        expect(f.calculateDiscountBreakEvenVolume(1000, 0)).toBe(Infinity);
    });
});
