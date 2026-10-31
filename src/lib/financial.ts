export function calculateBreakEvenUnits(fixedCosts: number, sellingPrice: number, variableCostPerUnit: number): number {
    if (sellingPrice <= variableCostPerUnit) return Infinity;
    return fixedCosts / (sellingPrice - variableCostPerUnit);
}

export function calculateBreakEvenRevenue(breakEvenUnits: number, sellingPrice: number): number {
    return breakEvenUnits * sellingPrice;
}

export function calculateCAC(marketingAndSalesCost: number, newCustomersAcquired: number): number {
    if (newCustomersAcquired <= 0) return Infinity;
    return marketingAndSalesCost / newCustomersAcquired;
}

export function calculateARPU(totalRevenue: number, totalUsers: number): number {
    if (totalUsers <= 0) return 0;
    return totalRevenue / totalUsers;
}

export function calculateLTV(averageContributionMarginPerCustomer: number, expectedCustomerLifetime: number): number {
    return averageContributionMarginPerCustomer * expectedCustomerLifetime;
}

export function calculateLTVCACRatio(ltv: number, cac: number): number {
    if (cac <= 0) return Infinity;
    return ltv / cac;
}

export function calculateCACPaybackPeriod(cac: number, averageMonthlyContributionMargin: number): number {
    if (averageMonthlyContributionMargin <= 0) return Infinity;
    return cac / averageMonthlyContributionMargin;
}

export function calculateContributionMargin(sellingPrice: number, variableCostPerUnit: number): number {
    return sellingPrice - variableCostPerUnit;
}

export function calculateContributionMarginPercent(contributionMargin: number, sellingPrice: number): number {
    if (sellingPrice <= 0) return 0;
    return (contributionMargin / sellingPrice) * 100;
}

export function calculateGrossMarginPercent(revenue: number, cogs: number): number {
    if (revenue <= 0) return 0;
    return ((revenue - cogs) / revenue) * 100;
}

export function calculateMarkupPercent(price: number, cost: number): number {
    if (cost <= 0) return 0;
    return ((price - cost) / cost) * 100;
}

export function calculateFundingPercent(amountRaised: number, fundingGoal: number): number {
    if (fundingGoal <= 0) return 0;
    return (amountRaised / fundingGoal) * 100;
}

export function calculateRequiredBackers(fundingGoal: number, expectedAverageContribution: number): number {
    if (expectedAverageContribution <= 0) return Infinity;
    return fundingGoal / expectedAverageContribution; // not rounding up, keeping exact mathematically
}

export function calculateRequiredVisitors(requiredBackers: number, expectedConversionRate: number): number {
    if (expectedConversionRate <= 0) return Infinity;
    return requiredBackers / (expectedConversionRate / 100);
}

export function calculateConversionRate(backers: number, campaignVisitors: number): number {
    if (campaignVisitors <= 0) return 0;
    return (backers / campaignVisitors) * 100;
}

export function calculateCostPerBacker(marketingSpend: number, backersAcquired: number): number {
    if (backersAcquired <= 0) return Infinity;
    return marketingSpend / backersAcquired;
}

export function calculatePriceElasticity(percentChangeInQuantity: number, percentChangeInPrice: number): number {
    if (percentChangeInPrice === 0) return 0;
    return percentChangeInQuantity / percentChangeInPrice;
}

export function calculateDiscountBreakEvenVolume(originalTotalContribution: number, newContributionMargin: number): number {
    if (newContributionMargin <= 0) return Infinity;
    return originalTotalContribution / newContributionMargin;
}

type UnitAssumptions = {
    estimatedSellingPrice: number; estimatedVariableCost: number; estimatedFixedCostMonthly: number;
    estimatedCACMonthly: number; estimatedMonthlyCustomers: number; estimatedChurnRate: number;
}

export function computeUnitEconomics(ua: UnitAssumptions): Record<string, number | string | null> {
    const margin = calculateContributionMargin(ua.estimatedSellingPrice, ua.estimatedVariableCost)
    const lifetime = ua.estimatedChurnRate > 0 ? 1 / ua.estimatedChurnRate : 24
    const ltv = calculateLTV(margin, lifetime)
    const breakEven = calculateBreakEvenUnits(ua.estimatedFixedCostMonthly, ua.estimatedSellingPrice, ua.estimatedVariableCost)
    const finite = (value: number) => Number.isFinite(value) ? value : null
    return {
        contributionMargin: margin,
        contributionMarginPercent: calculateContributionMarginPercent(margin, ua.estimatedSellingPrice),
        breakEvenCustomers: finite(Math.ceil(breakEven)),
        breakEvenRevenue: finite(Math.round(breakEven * ua.estimatedSellingPrice)),
        cac: ua.estimatedCACMonthly, ltv,
        ltvCacRatio: finite(calculateLTVCACRatio(ltv, ua.estimatedCACMonthly)),
        cacPaybackMonths: finite(calculateCACPaybackPeriod(ua.estimatedCACMonthly, margin)),
        grossMarginPercent: calculateGrossMarginPercent(ua.estimatedSellingPrice, ua.estimatedVariableCost),
        label: 'ASSUMPTION',
        notes: [margin <= 0 ? 'Break-even and payback are not meaningful without positive contribution margin.' : '',
            ua.estimatedCACMonthly <= 0 ? 'LTV/CAC is not meaningful when acquisition cost is zero.' : '',
            ua.estimatedChurnRate <= 0 ? 'A 24-month customer lifetime is assumed because churn is zero.' : ''].filter(Boolean).join(' '),
    }
}

export function buildFinancialProjection(ua: UnitAssumptions) {
    return Array.from({ length: 12 }, (_, i) => {
        const customers = Math.round(ua.estimatedMonthlyCustomers * Math.pow(1.1, i))
        const revenue = customers * ua.estimatedSellingPrice
        const costs = ua.estimatedFixedCostMonthly + customers * ua.estimatedVariableCost + ua.estimatedCACMonthly * customers * 0.1
        return { month: i + 1, customers, revenue: Math.round(revenue), costs: Math.round(costs), profitLoss: Math.round(revenue - costs), label: 'PROJECTION' }
    })
}
