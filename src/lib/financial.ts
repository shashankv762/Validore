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
