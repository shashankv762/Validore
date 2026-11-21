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

export type UnitAssumptions = {
    estimatedSellingPrice: number; estimatedVariableCost: number; estimatedFixedCostMonthly: number;
    estimatedCACMonthly: number; estimatedMonthlyCustomers: number; estimatedChurnRate: number;
    /** Gross new acquisitions as a fraction of the prior active cohort, before churn. */
    estimatedMonthlyGrowthRate?: number;
    /** All monetary inputs share this currency. Legacy saved assumptions use USD. */
    currency?: string;
}

function assertNonnegative(value: number, field: string) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite nonnegative number`)
}

function monetaryContext(currency?: string) {
    const code = currency === undefined ? 'USD' : currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) throw new Error('Financial inputs must declare one three-letter currency code')
    const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
    const factor = 10 ** digits
    const money = (value: number) => {
        if (!Number.isFinite(value)) throw new Error('Financial amounts exceed the supported numeric range')
        const absolute = Math.abs(value)
        const rounded = Math.sign(value) * Math.round((absolute + Number.EPSILON * Math.max(1, absolute)) * factor) / factor
        if (!Number.isFinite(rounded)) throw new Error('Financial amounts exceed the supported numeric range')
        return rounded === 0 ? 0 : rounded
    }
    return { currency: code, money }
}

function scenarioInputs(ua: UnitAssumptions) {
    for (const field of ['estimatedSellingPrice', 'estimatedVariableCost', 'estimatedFixedCostMonthly',
        'estimatedCACMonthly', 'estimatedMonthlyCustomers', 'estimatedChurnRate'] as const) assertNonnegative(ua[field], field)
    if (ua.estimatedChurnRate > 1) throw new Error('Monthly churn must be a decimal between zero and one')
    const growth = ua.estimatedMonthlyGrowthRate ?? 0
    assertNonnegative(growth, 'Monthly acquisition growth')
    if (growth > 1) throw new Error('Monthly acquisition growth must be a decimal between zero and one')
    return { ...monetaryContext(ua.currency), growth }
}

export function computeUnitEconomics(ua: UnitAssumptions): Record<string, number | string | null> {
    const { currency, money, growth } = scenarioInputs(ua)
    const margin = calculateContributionMargin(ua.estimatedSellingPrice, ua.estimatedVariableCost)
    const lifetime = ua.estimatedChurnRate > 0 ? 1 / ua.estimatedChurnRate : null
    const ltv = lifetime === null ? null : calculateLTV(margin, lifetime)
    const breakEven = calculateBreakEvenUnits(ua.estimatedFixedCostMonthly, ua.estimatedSellingPrice, ua.estimatedVariableCost)
    const finite = (value: number) => Number.isFinite(value) ? value : null
    const breakEvenCustomers = finite(Math.ceil(breakEven))
    const payback = finite(calculateCACPaybackPeriod(ua.estimatedCACMonthly, margin))
    return {
        currency, contributionMargin: money(margin),
        contributionMarginPercent: ua.estimatedSellingPrice > 0 ? calculateContributionMarginPercent(margin, ua.estimatedSellingPrice) : null,
        breakEvenCustomers,
        // Revenue must use the same whole-customer threshold shown in the report.
        breakEvenRevenue: breakEvenCustomers === null ? null : money(breakEvenCustomers * ua.estimatedSellingPrice),
        cac: money(ua.estimatedCACMonthly), ltv: ltv === null ? null : money(ltv), expectedCustomerLifetimeMonths: lifetime,
        ltvCacRatio: ltv === null ? null : finite(calculateLTVCACRatio(ltv, ua.estimatedCACMonthly)),
        cacPaybackMonths: payback,
        grossMarginPercent: ua.estimatedSellingPrice > 0 ? calculateGrossMarginPercent(ua.estimatedSellingPrice, ua.estimatedVariableCost) : null,
        monthlyAcquisitionGrowthRate: growth, monthlyChurnRate: ua.estimatedChurnRate,
        label: 'ASSUMPTION',
        notes: [margin <= 0 ? 'Break-even and payback are not meaningful without positive contribution margin.' : '',
            ua.estimatedCACMonthly <= 0 ? 'LTV/CAC is not meaningful when acquisition cost is zero.' : '',
            lifetime === null ? 'Zero churn does not establish a finite customer lifetime; LTV and LTV/CAC are not computed.' : 'Lifetime uses constant monthly churn, not an observed retention curve.',
            lifetime !== null && payback !== null && payback > lifetime ? 'Acquisition payback exceeds the assumed customer lifetime.' : '',
            ua.estimatedSellingPrice === 0 ? 'Percentage margins are undefined when selling price is zero.' : '',
            ua.currency === undefined ? 'USD is the legacy input currency; no exchange conversion is performed.' : 'All monetary inputs use the declared currency; no exchange conversion is performed.',
        ].filter(Boolean).join(' '),
    }
}

export function buildFinancialProjection(ua: UnitAssumptions) {
    const { currency, money, growth } = scenarioInputs(ua)
    let previousCustomers = 0
    let acquisitionRemainder = 0
    let churnRemainder = 0
    return Array.from({ length: 12 }, (_, i) => {
        const openingCustomers = previousCustomers
        const expectedAcquisitions = openingCustomers * growth + acquisitionRemainder
        const expectedChurn = openingCustomers * ua.estimatedChurnRate + churnRemainder
        const newCustomers = i === 0 ? Math.round(ua.estimatedMonthlyCustomers) : Math.max(0, Math.round(expectedAcquisitions))
        const churnedCustomers = i === 0 ? 0 : Math.min(openingCustomers, Math.max(0, Math.round(expectedChurn)))
        if (i > 0) {
            // Carry fractional rounding across months so churn/growth on a
            // small cohort does not disappear merely because each month is <1.
            acquisitionRemainder = expectedAcquisitions - newCustomers
            churnRemainder = expectedChurn - churnedCustomers
        }
        const customers = openingCustomers - churnedCustomers + newCustomers
        if (!Number.isSafeInteger(customers) || customers < 0) throw new Error('Projected customer counts exceed the supported range')
        const revenue = money(customers * ua.estimatedSellingPrice)
        const variableCosts = money(customers * ua.estimatedVariableCost)
        const fixedCosts = money(ua.estimatedFixedCostMonthly)
        const acquisitionCost = money(newCustomers * ua.estimatedCACMonthly)
        const costs = money(fixedCosts + variableCosts + acquisitionCost)
        previousCustomers = customers
        return { month: i + 1, customers, openingCustomers, newCustomers, churnedCustomers, revenue,
            variableCosts, fixedCosts, acquisitionCost, costs, profitLoss: money(revenue - costs), currency, label: 'PROJECTION' as const,
            notes: `Scenario only. Month one acquires the initial cohort; later acquisition is ${growth * 100}% of opening customers and churn is ${ua.estimatedChurnRate * 100}%. Whole-customer rounding carries fractional balances between months. CAC applies only to new acquisitions. No taxes, financing, payment delays or exchange conversion are included.` }
    })
}

export type CashRunwayInputs = { cash: number; oneTimeCosts: number; monthlyRevenue: number; monthlyCosts: number; currency?: string }
export function calculateCashRunway(input: CashRunwayInputs) {
    for (const field of ['cash', 'oneTimeCosts', 'monthlyRevenue', 'monthlyCosts'] as const) assertNonnegative(input[field], field)
    const { currency, money } = monetaryContext(input.currency)
    const cashAfterSetup = money(money(input.cash) - money(input.oneTimeCosts))
    const monthlyBurn = money(money(input.monthlyCosts) - money(input.monthlyRevenue))
    return { cashAfterSetup, monthlyBurn,
        runwayMonths: cashAfterSetup < 0 ? 0 : monthlyBurn > 0 ? cashAfterSetup / monthlyBurn : null,
        currency, label: 'ASSUMPTION' as const,
        note: cashAfterSetup < 0 ? 'Starting cash does not cover setup costs.'
            : monthlyBurn <= 0 ? 'No positive monthly burn under these assumptions; runway is not a finite number.'
            : 'Runway assumes constant monthly revenue and costs, available cash after setup, and no financing or payment delays.' }
}
