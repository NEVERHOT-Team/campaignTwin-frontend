import { useId, useState } from 'react'
import { baht, count } from '../verdict-values'
import type { components } from './schema'
import { amount, frozenPlans, planName, type Plan, type Report } from './seller-decision'
import './seller-ledger.css'

type Ledger = components['schemas']['SeedLedger']
type Line = {
  key: keyof Ledger
  label: string
  basis: string
  cost?: keyof Plan['input']['costs']
  subtotal?: boolean
  paired?: boolean
}

const lines: Line[] = [
  { key: 'gross_sales', label: 'Gross sales', basis: 'Kept packs at the regular price', cost: 'regular_price' },
  { key: 'seller_subsidy', label: 'Less seller-funded discounts', basis: 'Discount on redeemed orders' },
  { key: 'net_receipts', label: 'Net receipts', basis: 'Gross sales less seller discounts', subtotal: true },
  { key: 'cogs', label: 'Less cost of goods', basis: 'Cost of each kept pack', cost: 'cogs' },
  { key: 'channel_commission', label: 'Less channel commission', basis: 'Commission on net receipts', cost: 'channel_commission' },
  { key: 'order_fees', label: 'Less order fees', basis: 'Fixed fee for each kept order', cost: 'payment_fee' },
  { key: 'fulfillment', label: 'Less fulfillment', basis: 'Fulfillment on kept orders', cost: 'seller_fulfillment' },
  { key: 'voucher_fees', label: 'Less voucher service fees', basis: 'Service fee for each redemption', cost: 'voucher_service_fee' },
  { key: 'media_spend', label: 'Less media spend', basis: 'Committed media charged once', cost: 'paid_media' },
  { key: 'contribution_profit', label: 'Seller contribution', basis: 'Net receipts after all listed costs', subtotal: true },
  { key: 'baseline_contribution', label: 'Less no-campaign contribution', basis: 'Ordinary trading on the same simulated seed', paired: true },
  { key: 'incremental_profit', label: 'Incremental profit', basis: 'Seller contribution less no-campaign contribution', subtotal: true, paired: true },
]

const number = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? count.format(value) : 'Unavailable'

function rate(plan: Plan, key: Line['cost']) {
  const cost = key && plan.input.costs[key]
  if (!cost || cost.status !== 'confirmed' || cost.value == null || !cost.unit) return undefined
  return amount(cost.value, cost.unit)
}

function LedgerTable({ ledger, plan, paired }: { ledger: Ledger; plan: Plan; paired: boolean }) {
  return <table className="seller-ledger-table">
    <caption>Settlement for seed {ledger.seed}</caption>
    <thead><tr><th scope="col">Line item</th><th scope="col">Amount (THB)</th></tr></thead>
    <tbody>{lines.map(line => {
      const fieldRate = rate(plan, line.cost)
      const value = line.paired && !paired ? undefined : ledger[line.key]
      return <tr key={line.key} className={line.subtotal ? 'seller-ledger-subtotal' : undefined}>
        <th scope="row">{line.label}<small>{line.basis}{fieldRate && ' · ' + fieldRate}</small></th>
        <td>{line.key === 'incremental_profit' && typeof value === 'number' && value > 0 ? '+' : ''}{number(value)}</td>
      </tr>
    })}</tbody>
  </table>
}

export default function SellerLedger({ report }: { report: Report }) {
  const id = useId()
  const [planId, setPlanId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [seedId, setSeedId] = useState<number | undefined>()
  const plans = frozenPlans(report)
  const plan = plans.find(p => p.input.plan_id === planId) ?? plans.find(p => p.role === 'original') ?? plans[0]
  const scopes = plan?.scenario_results ?? []
  const scope = scopes.find(s => s.scenario === scenarioId) ?? scopes[0]
  const rows = scope?.seed_ledgers ?? []
  const seed = rows.some(r => r.seed === seedId) ? seedId : rows[0]?.seed
  const records = rows.filter(r => r.seed === seed)
  const ledger = records.length === 1 ? records[0] : undefined
  const baseline = plans.find(p => p.role === 'baseline' && p.input.plan_id === plan?.input.paired_baseline_id)
  const references = baseline?.scenario_results.find(s => s.scenario === scope?.scenario)?.seed_ledgers.filter(r => r.seed === seed)
  const paired = !!ledger && references?.length === 1 && Number.isFinite(ledger.baseline_contribution) &&
    Number.isFinite(ledger.baseline_units) && references[0].contribution_profit === ledger.baseline_contribution &&
    references[0].units === ledger.baseline_units
  const window = report.measurement_window

  return <details className="seller-ledger">
    <summary>Inspect seed ledger</summary>
    <div className="seller-ledger-body">
      <p>Follow one simulation from gross sales to incremental profit. The measurement window runs from {window.start_date} up to {window.end_date} (exclusive).</p>
      {plans.length > 0 && <div className="seller-ledger-controls">
        <label htmlFor={id + '-plan'}>Plan<select id={id + '-plan'} value={plan.input.plan_id} onChange={e => setPlanId(e.target.value)}>
          {plans.map(p => <option key={p.input.plan_id} value={p.input.plan_id}>{p.role !== 'baseline' && (p.role === 'original' ? 'Original · ' : 'Alternative · ')}{planName(p)}</option>)}
        </select></label>
        {scope && <label htmlFor={id + '-scenario'}>Scenario<select id={id + '-scenario'} value={scope.scenario} onChange={e => setScenarioId(e.target.value)}>
          {scopes.map(s => <option key={s.scenario} value={s.scenario}>{s.scenario}</option>)}
        </select></label>}
        {seed != null && <label htmlFor={id + '-seed'}>Simulation seed<select id={id + '-seed'} value={seed} onChange={e => setSeedId(Number(e.target.value))}>
          {Array.from(new Set(rows.map(r => r.seed))).map(s => <option key={s} value={s}>{s}</option>)}
        </select></label>}
      </div>}
      {plan && ledger ? <>
        <dl aria-label="Simulated volume" className="seller-ledger-volume">
          <div><dt>Kept orders</dt><dd>{number(ledger.orders)}</dd></div>
          <div><dt>Units sold</dt><dd>{number(ledger.units)}</dd></div>
          <div><dt>Redemptions</dt><dd>{number(ledger.redemptions)}</dd></div>
        </dl>
        {!paired && <p role="status">The matching no-campaign ledger could not be verified for this seed. Its comparison figures are unavailable.</p>}
        <LedgerTable ledger={ledger} plan={plan} paired={paired}/>
        <p className="seller-ledger-spend">Total campaign spend <strong>{Number.isFinite(ledger.campaign_spend) ? baht.format(ledger.campaign_spend) : 'Unavailable'}</strong>. This combines the seller discounts and media spend already listed above.</p>
      </> : <p role="status">{records.length > 1 ? 'Multiple records were returned for this seed. A unique settlement is unavailable.' :
        plan ? 'No seed ledger was returned for this selection.' : 'No plan ledger matches this approved revision.'}</p>}
    </div>
  </details>
}
