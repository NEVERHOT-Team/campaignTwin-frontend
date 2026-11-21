import type { components } from './schema'
import { baht, count, percent } from '../verdict-values'

export type Report = components['schemas']['RunReport']
export type RunInput = components['schemas']['RunInput']
export type Snapshot = { report: Report; input: RunInput }
export type Plan = Report['plan_results'][number]
export type Gate = components['schemas']['BusinessGate']
export type Scenario = components['schemas']['ScenarioId']
export type Assessment = Report['recommendation']['assessments'][number]
export const statusLabels = { revise:'Revise', keep:'Keep', hold:'Hold', insufficient_evidence:'Insufficient evidence' }
export const gateLabels = {
  incremental_profit:'Median incremental profit', probability_loss:'Probability of loss', subsidy_leakage:'Measured subsidy leakage',
  unit_contribution:'Contribution per redeemed pack', campaign_spend:'Maximum campaign spend',
}
export const costLabels: Record<string, string> = {
  regular_price:'Shelf price', cogs:'Cost of goods', payment_fee:'Fixed order fee', channel_commission:'Channel commission',
  seller_fulfillment:'Fulfillment', voucher_service_fee:'Voucher service fee', paid_media:'Committed media',
  reimbursement:'Reimbursement', tax:'Tax', returns:'Returns',
}
export function human(value: string) {
  return value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
}
export function amount(value: number | null | undefined, unit: string | null, signed = false) {
  if (value == null || !Number.isFinite(value) || !unit) return 'Unavailable'
  const sign = signed && value > 0 ? '+' : ''
  if (unit === 'THB') return sign + baht.format(value)
  if (unit === 'fraction') return percent.format(value)
  if (unit === 'pct') return count.format(value) + '%'
  if (unit.startsWith('THB_per_')) return sign + baht.format(value) + ' / ' + unit.slice(8).replaceAll('_', ' ')
  return sign + count.format(value) + ' ' + unit.replaceAll('_', ' ')
}
export function planName(plan?: Plan) {
  if (!plan) return 'Offer unavailable'
  if (plan.role === 'baseline') return 'No campaign'
  const discount = plan.input.offer?.discount
  if (discount?.value == null || !discount.unit) return plan.role === 'original' ? 'Original offer' : 'Alternative offer'
  return amount(discount.value, discount.unit) + (discount.kind === 'voucher' ? ' voucher' : ' off')
}
export function hasFrozenIdentity({ report, input }: Snapshot) {
  return report.run_id === input.run_id && report.approval_id === input.approval_id &&
    report.review_id === input.review.review_id && report.revision === input.review.revision
}
export function relatedApprovals(current: Snapshot, previous: Snapshot) {
  return hasFrozenIdentity(current) && hasFrozenIdentity(previous) &&
    current.report.review_id === previous.report.review_id && current.report.revision > previous.report.revision &&
    current.report.approval_id !== previous.report.approval_id && current.report.run_id !== previous.report.run_id
}
export function frozenPlans(report: Report) {
  return report.plan_results.filter(plan => plan.input.approval_id === report.approval_id && plan.input.review_id === report.review_id &&
    plan.input.revision === report.revision && plan.role === plan.input.role)
}
export function assessmentFor(report: Report, plan: Plan) {
  return report.recommendation.assessments.find(a => a.plan_id === plan.input.plan_id && a.role === plan.role)
}
export function checkFor(report: Report, plan: Plan, scenario: Scenario | undefined, metric: Gate['metric']) {
  return assessmentFor(report, plan)?.checks.find(g => g.scenario === scenario && g.metric === metric)
}
export function medianProfit(plan: Plan, scenario: Scenario | undefined) {
  const metric = plan.scenario_results.find(s => s.scenario === scenario)?.metrics.find(m => m.metric === 'incremental_profit' && m.unit === 'THB')
  return metric?.status === 'available' && metric.value && typeof metric.value === 'object' ? metric.value.p50 : undefined
}
export function gateThreshold(gate: Gate) {
  if (gate.condition === 'available') return 'Measurement required'
  return (gate.condition === 'at_least' ? 'At least ' : 'At most ') + amount(gate.threshold, gate.unit)
}
export function orderFee(s: Snapshot) {
  const fee = s.input.review.costs.payment_fee
  if (fee?.status !== 'confirmed' || fee.unit !== 'THB_per_order' || fee.value == null || !Number.isFinite(fee.value)) return undefined
  return fee.value
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, sorted(v)]))
  return value
}
function substantiveInputs(snapshot: Snapshot) {
  const { report, input } = snapshot
  const { catalog, segments, evaluation_policy } = report.data_versions
  const plans = frozenPlans(report)
  const baseline = plans.find(p => p.role === 'baseline')
  const original = plans.find(p => p.role === 'original')
  const expectedFee = orderFee(snapshot)
  if (!baseline || !original || plans.length !== report.plan_results.length || report.recommendation.reason === 'incomplete_pairing') return undefined
  const uniqueRoles = new Set(plans.map(p => p.role)).size === plans.length
  const valid = plans.every(p => {
    const { seeds, paired_baseline_id, parent_plan_id, costs } = p.input
    const fee = costs.payment_fee
    return paired_baseline_id === baseline.input.plan_id && (p.role !== 'conservative' || parent_plan_id === original.input.plan_id) &&
      fee?.status === 'confirmed' && fee.unit === 'THB_per_order' && fee.value === expectedFee &&
      seeds.length > 0 && new Set(seeds).size === seeds.length && p.scenario_results.length > 0 &&
      p.scenario_results.every(scene => {
        const ids = scene.seed_ledgers.map(l => l.seed)
        return ids.length === scene.paired_seed_count && ids.length === seeds.length && new Set(ids).size === seeds.length &&
          seeds.every(seed => ids.includes(seed))
      })
  })
  if (!valid || !uniqueRoles) return undefined
  const groups = [...plans].sort((a, b) => a.role.localeCompare(b.role)).map(plan => {
    const { costs, product, offer, evaluation, seeds, segments, target_segment_ids, campaign_window, contingency_rules, total_budget_thb, subsidy_budget } = plan.input
    const { payment_fee: fee, ...otherCosts } = costs
    // The backend fingerprints all costs into data_versions.market. Compare each actual term here.
    const scopedSeeds = plan.scenario_results.map(s => ({ scenario:s.scenario, count:s.paired_seed_count, seeds:s.seed_ledgers.map(l => l.seed).sort((a,b) => a-b) }))
      .sort((a,b) => a.scenario.localeCompare(b.scenario))
    return { role:plan.role, product, offer, evaluation, segments, target_segment_ids, campaign_window, contingency_rules,
      total_budget_thb, subsidy_budget, otherCosts, feeUnit:fee?.unit, feeBasis:fee?.basis, seeds, scopedSeeds }
  })
  return JSON.stringify(sorted({ catalog, segments, evaluation_policy, comparator:report.comparator,
    measurement:report.measurement_window, approvedOffer:input.review.resolved_offer, groups }))
}
export function isolatedFeeChange(current: Snapshot, previous: Snapshot) {
  if (!relatedApprovals(current, previous)) return false
  const now = orderFee(current), before = orderFee(previous)
  if (now == null || before == null || now === before) return false
  const material = substantiveInputs(current)
  return material !== undefined && material === substantiveInputs(previous)
}
