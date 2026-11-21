'use client'
import { useState } from 'react'
import { calculateCampaign, campaignEconomicsSnapshot, planningCalculationIssues, type CrowdfundingInputs } from '@/lib/planning/economics'

export function CampaignEconomics({ inputs, saved }: { inputs: CrowdfundingInputs; saved?: unknown }) {
  const [draft, setDraft] = useState(inputs)
  const changed = ['expectedVisitors','conversionRatePercent','averageReward','rewardCostPerBacker','shippingCostPerBacker'].some(key => draft[key as keyof CrowdfundingInputs] !== inputs[key as keyof CrowdfundingInputs])
  const snapshot = campaignEconomicsSnapshot(saved)
  const calculation = !changed && snapshot ? snapshot : calculateCampaign(draft)
  const calculationError = planningCalculationIssues(calculation)[0]?.message
  const money = (amount: number | null) => amount === null ? 'Unavailable' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: draft.currency, maximumFractionDigits: 0 }).format(amount)
  const fields = [
    ['expectedVisitors', 'Campaign visitors', 1, 10_000_000], ['conversionRatePercent', 'Visitor conversion (%)', 0.1, 100],
    ['averageReward', `Average pledge (${draft.currency})`, 1, 1_000_000_000],
    ['rewardCostPerBacker', `Reward cost per backer (${draft.currency})`, 1, 1_000_000_000],
    ['shippingCostPerBacker', `Shipping per backer (${draft.currency})`, 1, 1_000_000_000],
  ] as const
  return <section className="card-angular bg-white p-5 sm:p-6">
    <h2 className="text-sm font-semibold text-[#141923]">Campaign economics and scenarios</h2>
    <p className="mt-2 text-xs leading-relaxed text-[#657081]">Explore the saved assumptions below. These local changes do not alter your saved report or downloads. Visitors × conversion × pledge determines gross pledges; delivery costs determine the money left.</p>
    <p className="mt-2 text-sm leading-relaxed text-[#657081]">{changed ? 'Local what if, recalculated using the current formula.' : snapshot ? 'Showing the calculations saved with this report.' : 'No complete saved calculation snapshot is available. Showing the current formula applied to these inputs.'}</p>
    {changed && <button type="button" onClick={() => setDraft(inputs)} className="mt-3 rounded border border-[#E5E7EB] px-3 py-2 text-sm text-[#141923]">Reset to saved assumptions</button>}
    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {fields.map(([key, label, step, max]) => <div key={key}>
        <label htmlFor={'campaign-what-if-' + key} className="mb-2 block text-xs font-medium text-[#89620B]">{label}</label>
        <input id={'campaign-what-if-' + key} type="number" min={key === 'averageReward' ? 0.01 : 0} max={max} step={step} value={draft[key]} onChange={event => {
          const value = Number(event.target.value)
          if (Number.isFinite(value) && value >= (key === 'averageReward' ? 0.01 : 0) && value <= max) setDraft(previous => ({ ...previous, [key]: key === 'expectedVisitors' ? Math.floor(value) : value }))
        }} className="w-full rounded border border-[#E5E7EB] bg-white px-3 py-2 text-sm" />
      </div>)}
    </div>
    {calculationError ? <p role="alert" className="mt-5 text-sm text-[#991B1B]">{calculationError}</p> : <>
    <div className="mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Campaign net proceeds scenarios">
      <table className="w-full min-w-[650px] text-left text-xs tabular-nums">
        <thead><tr className="border-b border-[#E5E7EB]">{['Scenario', 'Conversion', 'Backers', 'Gross pledges', 'Collected', 'Net after delivery'].map(label => <th key={label} scope="col" className="p-3 font-medium text-[#657081]">{label}</th>)}</tr></thead>
        <tbody>{Object.entries(calculation.scenarios).map(([label, scenario]) => <tr key={label} className={'border-b border-[#E5E7EB] ' + (label === 'base' ? 'bg-[#E0A526]/5' : '')}>
          <th scope="row" className="p-3 font-medium capitalize">{label}</th><td className="p-3">{scenario.conversionRatePercent}%</td><td className="p-3">{scenario.backers.toLocaleString()}</td>
          <td className="p-3">{money(scenario.amountRaised)}</td><td className="p-3">{money(scenario.collected)}</td>
          <td className={'p-3 font-medium ' + (scenario.netProceeds < 0 ? 'text-[#991B1B]' : 'text-[#166534]')}>{money(scenario.netProceeds)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-[#657081]">{draft.allOrNothing ? 'All-or-nothing: below-goal scenarios collect no pledges; marketing and its reserve remain costs.' : 'Keep-what-you-raise: delivery remains an obligation even when the goal is missed.'} Fees: {draft.platformFeePercent + draft.processingFeePercent}% plus {money(draft.processingFeePerBacker)} per collected backer. Contingency: {draft.contingencyPercent}% of delivery and marketing costs. Tax is excluded.</p>
    <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[#E5E7EB] pt-4 text-sm">
      {[['Contribution per backer', calculation.computedMetrics.contributionPerBacker], ['Money left at minimum whole-backer goal', calculation.computedMetrics.goalNetSurplus], ['Minimum goal to cover costs', calculation.computedMetrics.minimumViableGoal]].map(([label, amount]) => <div key={label as string}><dt className="text-xs text-[#657081]">{label}</dt><dd className="mt-1 font-medium tabular-nums text-[#141923]">{money(amount as number | null)}</dd></div>)}
    </dl>
    <p className="mt-3 text-xs leading-relaxed text-[#657081]">{calculation.calculationAssumptions.goalBasis} Gross pledges at that point: {money(calculation.computedMetrics.grossPledgesAtGoal)}.</p>
    {!!calculation.warnings.length && <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[#657081]">{calculation.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
    </>}
  </section>
}
