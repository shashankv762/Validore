import { describe, it, expect } from 'vitest';
import * as f from './financial';

describe('Financial Formulas', () => {
    const assumptions = { estimatedSellingPrice: 50, estimatedVariableCost: 25, estimatedFixedCostMonthly: 1000,
        estimatedCACMonthly: 100, estimatedMonthlyCustomers: 100, estimatedChurnRate: 0.05 };

    it('keeps derived report economics consistent with the input assumptions', () => {
        expect(f.computeUnitEconomics(assumptions)).toMatchObject({ contributionMargin: 25,
            breakEvenCustomers: 40, breakEvenRevenue: 2000, cac: 100, ltv: 500, ltvCacRatio: 5, cacPaybackMonths: 4 });
        const projection = f.buildFinancialProjection(assumptions);
        expect(projection).toHaveLength(12);
        expect(projection[0]).toMatchObject({ customers: 100, newCustomers: 100, acquisitionCost: 10000,
            revenue: 5000, costs: 13500, profitLoss: -8500, currency: 'USD', label: 'PROJECTION' });
        expect(projection[1]).toMatchObject({ customers: 95, newCustomers: 0, churnedCustomers: 5,
            revenue: 4750, costs: 3375, profitLoss: 1375 });
    });

    it('serializes undefined economics as explicit nulls with an explanation', () => {
        const metrics = f.computeUnitEconomics({ ...assumptions, estimatedSellingPrice: 20, estimatedCACMonthly: 0 });
        expect(metrics).toMatchObject({ breakEvenCustomers: null, breakEvenRevenue: null, cacPaybackMonths: null, ltvCacRatio: null });
        expect(metrics.notes).toContain('positive contribution margin');
        expect(metrics.notes).toContain('acquisition cost is zero');
        expect(JSON.parse(JSON.stringify(metrics))).toEqual(metrics);
    });

    it('uses only explicit gross acquisition growth and applies churn to the opening cohort', () => {
        const projection = f.buildFinancialProjection({ ...assumptions, estimatedMonthlyGrowthRate: 0.1, currency: 'INR' });
        expect(projection[1]).toMatchObject({ openingCustomers: 100, newCustomers: 10, churnedCustomers: 5,
            customers: 105, acquisitionCost: 1000, revenue: 5250, costs: 4625, profitLoss: 625, currency: 'INR' });
        expect(projection[2]).toMatchObject({ openingCustomers: 105, newCustomers: 11, churnedCustomers: 5, customers: 111 });
        for (const row of projection) {
            expect(row.customers).toBe(row.openingCustomers - row.churnedCustomers + row.newCustomers);
            expect(row.acquisitionCost).toBe(row.newCustomers * assumptions.estimatedCACMonthly);
            expect(row.costs).toBe(row.fixedCosts + row.variableCosts + row.acquisitionCost);
            expect(row.profitLoss).toBe(row.revenue - row.costs);
        }
    });

    it('does not invent a customer lifetime when churn is zero', () => {
        const metrics = f.computeUnitEconomics({ ...assumptions, estimatedChurnRate: 0 });
        expect(metrics).toMatchObject({ ltv: null, ltvCacRatio: null, expectedCustomerLifetimeMonths: null });
        expect(metrics.notes).toContain('does not establish a finite customer lifetime');
        expect(metrics.notes).not.toContain('24-month');
        const projection = f.buildFinancialProjection({ ...assumptions, estimatedChurnRate: 0 });
        expect(projection.every(row => row.customers === 100)).toBe(true);
        expect(projection.slice(1).every(row => row.newCustomers === 0 && row.acquisitionCost === 0)).toBe(true);
    });

    it('retains fixed costs after full churn and cannot grow a zero starting cohort from a percentage alone', () => {
        const projection = f.buildFinancialProjection({ ...assumptions, estimatedChurnRate: 1 });
        expect(projection[1]).toMatchObject({ customers: 0, churnedCustomers: 100, revenue: 0, costs: 1000, profitLoss: -1000 });
        expect(projection.slice(1).every(row => row.customers === 0)).toBe(true);
        expect(f.buildFinancialProjection({ ...assumptions, estimatedMonthlyCustomers: 0, estimatedMonthlyGrowthRate: 0.5 })
            .every(row => row.customers === 0 && row.acquisitionCost === 0)).toBe(true);
    });

    it('carries fractional churn and acquisition so small-cohort rates are not silently ignored', () => {
        const shrinking = f.buildFinancialProjection({ ...assumptions, estimatedMonthlyCustomers: 3, estimatedChurnRate: 0.05 });
        expect(shrinking[11].customers).toBeLessThan(3);
        const acquiring = f.buildFinancialProjection({ ...assumptions, estimatedMonthlyCustomers: 3, estimatedMonthlyGrowthRate: 0.05, estimatedChurnRate: 0 });
        expect(acquiring[11].customers).toBeGreaterThan(3);
        expect(acquiring.slice(1).reduce((total, row) => total + row.newCustomers, 0)).toBe(acquiring[11].customers - 3);
    });

    it('keeps declared currency and cents consistent across revenue, component costs and profit', () => {
        const projection = f.buildFinancialProjection({ ...assumptions, currency: 'INR', estimatedSellingPrice: 9.99,
            estimatedVariableCost: 3.33, estimatedFixedCostMonthly: 0.15, estimatedCACMonthly: 4.57,
            estimatedMonthlyCustomers: 3, estimatedChurnRate: 0 });
        expect(projection[0]).toMatchObject({ currency: 'INR', revenue: 29.97, variableCosts: 9.99,
            acquisitionCost: 13.71, fixedCosts: 0.15, costs: 23.85, profitLoss: 6.12 });
        expect(projection[1]).toMatchObject({ revenue: 29.97, acquisitionCost: 0, costs: 10.14, profitLoss: 19.83 });
    });

    it('uses the same whole-customer threshold for break-even revenue and reports undefined zero-price percentages', () => {
        expect(f.computeUnitEconomics({ ...assumptions, estimatedFixedCostMonthly: 1001 }))
            .toMatchObject({ breakEvenCustomers: 41, breakEvenRevenue: 2050 });
        expect(f.computeUnitEconomics({ ...assumptions, estimatedSellingPrice: 0 }))
            .toMatchObject({ contributionMarginPercent: null, grossMarginPercent: null, breakEvenCustomers: null });
    });

    it('calculates cash runway after setup and distinguishes exhausted cash from a non-burning scenario', () => {
        expect(f.calculateCashRunway({ cash: 100000, oneTimeCosts: 10000, monthlyRevenue: 5000, monthlyCosts: 20000, currency: 'INR' }))
            .toMatchObject({ cashAfterSetup: 90000, monthlyBurn: 15000, runwayMonths: 6, currency: 'INR' });
        expect(f.calculateCashRunway({ cash: 0, oneTimeCosts: 0, monthlyRevenue: 100, monthlyCosts: 50 }))
            .toMatchObject({ cashAfterSetup: 0, monthlyBurn: -50, runwayMonths: null });
        expect(f.calculateCashRunway({ cash: 50, oneTimeCosts: 100, monthlyRevenue: 100, monthlyCosts: 50 }))
            .toMatchObject({ cashAfterSetup: -50, runwayMonths: 0 });
        expect(f.calculateCashRunway({ cash: 0, oneTimeCosts: 0, monthlyRevenue: 0, monthlyCosts: 1 }).runwayMonths).toBe(0);
    });

    it('rejects nonfinite, negative and impossible rate inputs instead of fabricating financial rows', () => {
        expect(() => f.buildFinancialProjection({ ...assumptions, estimatedCACMonthly: Infinity })).toThrow('finite');
        expect(() => f.buildFinancialProjection({ ...assumptions, estimatedChurnRate: 1.1 })).toThrow('churn');
        expect(() => f.buildFinancialProjection({ ...assumptions, estimatedMonthlyGrowthRate: -0.1 })).toThrow('nonnegative');
        expect(() => f.computeUnitEconomics({ ...assumptions, currency: 'rupees' })).toThrow('currency');
        expect(() => f.calculateCashRunway({ cash: -1, oneTimeCosts: 0, monthlyRevenue: 0, monthlyCosts: 10 })).toThrow('nonnegative');
    });

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
