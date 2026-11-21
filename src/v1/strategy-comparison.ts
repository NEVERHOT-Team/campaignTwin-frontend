import type { StrategyDifferenceProps } from '../StrategyDifference'
import { baht, count, formatResult, percentagePoints } from '../verdict-values'
import type { Report } from './client'
import { humanize } from './planner'

type Plan = NonNullable<Report['plan_results']>[number]
type Input = Plan['input']
type Scope = Plan['scenario_results'][number]
type Metric = Scope['metrics'][number]
type Labels = Record<Plan['role'], string>

export function labelsForReport(report: Report): Labels {
  const policy = report.data_versions.evaluation_policy
  const original = report.plan_results?.find(p => p.role === 'original')
  const alternative = report.plan_results?.find(p => p.role === 'conservative')
  const smaller = original && alternative && Number.isFinite(original.discount_pct) && Number.isFinite(alternative.discount_pct) &&
    alternative.discount_pct < original.discount_pct
  return {
    original: 'Your plan',
    conservative: policy === 'arena-tissue-v1' ? 'Strategist plan' : policy === 'synthetic-tissue-v1' && smaller ? 'Smaller discount' : 'Alternative plan',
    baseline: 'No campaign',
  }
}

export function frozenOffer(offer: Input['offer'] | undefined) {
  const discount = offer?.discount
  if (!discount?.kind || !discount.unit || discount.value == null || !Number.isFinite(discount.value)) return undefined
  return formatResult(discount.value, discount.unit) + (discount.kind === 'voucher' ? ' voucher' : ' off')
}

function segmentName(id: string, input: Input) {
  return humanize(input.segments?.find(s => s.segment_id === id)?.name || id)
}

function targets(input: Input) {
  if (!input.target_segment_ids) return undefined
  const names = input.target_segment_ids.map(id => segmentName(id, input)).sort((a, b) => a.localeCompare(b))
  return names.length ? names.join(', ') : 'All segments'
}

function weeklyRules(input: Input) {
  if (!input.contingency_rules) return undefined
  const rules = input.contingency_rules.map(rule => {
    const shift = /^if rival_undercuts then shift_budget:([a-z0-9_]+)$/.exec(rule)
    if (shift) return 'If the rival offered a deeper discount last week, focus the offer and media on ' + segmentName(shift[1], input) + '.'
    const cap = /^if share_drop>(\d+(?:\.\d+)?) then cap_per_user:(\d+)$/.exec(rule)
    if (cap) return 'If buyer share falls more than ' + cap[1] + ' percentage points from week 1, cap redemptions at ' + cap[2] + ' per shopper.'
    const stop = /^if week>=(\d+) and loss then end_early$/.exec(rule)
    if (stop) return 'From week ' + stop[1] + ', end the offer if cumulative incremental gross profit after media costs is negative.'
    return rule
  })
  return rules.length ? rules.join(' ') : 'No weekly rules'
}

const eligibility = { all: 'All shoppers', new_only: 'New shoppers only', members: 'Members only', segment_hint: 'Selected segment' }

function frozenTerms(input: Input) {
  const { offer, campaign_window: window } = input
  const discount = offer?.discount
  return [
    { label: 'Offer', value: frozenOffer(offer), fields: ['/offer/discount/value', '/offer/discount/kind', '/offer/discount/unit'] },
    { label: 'Target audience', value: targets(input), fields: ['/target_segment_ids'] },
    { label: 'Redemptions per shopper', value: discount && (discount.cap_per_user == null ? 'No cap specified' : count.format(discount.cap_per_user)), fields: ['/offer/discount/cap_per_user'] },
    { label: 'Weekly response rules', value: weeklyRules(input), fields: ['/contingency_rules'] },
    { label: 'Subsidy budget', value: Number.isFinite(input.subsidy_budget) ? baht.format(input.subsidy_budget) : undefined, fields: ['/subsidy_budget'] },
    { label: 'Campaign dates', value: window && window.start_date + ' to ' + window.end_date + ' (end exclusive)', fields: ['/campaign_window'] },
    { label: 'Offer eligibility', value: discount?.eligibility && eligibility[discount.eligibility], fields: ['/offer/discount/eligibility'] },
    { label: 'Minimum spend', value: discount && (discount.min_spend_thb != null ? baht.format(discount.min_spend_thb) + (offer?.min_spend_basis ? ' · ' + offer.min_spend_basis : '') :
      offer?.min_spend_basis === null ? 'No minimum' : undefined), fields: ['/offer/discount/min_spend_thb', '/offer/min_spend_basis'] },
    { label: 'Redemptions per order', value: offer?.max_redemptions_per_order != null ? count.format(offer.max_redemptions_per_order) : undefined, fields: ['/offer/max_redemptions_per_order'] },
    { label: 'Eligible orders', value: offer?.eligible_order_scope, fields: ['/offer/eligible_order_scope'] },
    { label: 'Offer funding', value: offer?.funder && humanize(offer.funder), fields: ['/offer/funder'] },
    { label: 'Offer stacking', value: offer && (offer.stackable ? 'Can combine with other offers' : 'Cannot combine with other offers'), fields: ['/offer/stackable'] },
  ]
}

const outcomes: { id: Metric['metric']; label: string; unit: Metric['unit']; rate?: boolean }[] = [
  { id: 'incremental_profit', label: 'Median incremental profit', unit: 'THB' },
  { id: 'incremental_new_buyers', label: 'Median incremental new buyers', unit: 'buyers' },
  { id: 'subsidy_leakage', label: 'Median subsidy leakage', unit: 'fraction' },
  { id: 'probability_loss', label: 'Probability of loss', unit: 'fraction', rate: true },
  { id: 'probability_hit_target', label: 'Chance of meeting target', unit: 'fraction', rate: true },
  { id: 'incremental_roas', label: 'Median incremental ROAS', unit: 'ratio' },
]

export function pairedInputs(original: Plan, alternative: Plan) {
  const a = original.input, b = alternative.input
  return original.role === 'original' && alternative.role === 'conservative' && b.parent_plan_id === a.plan_id &&
    !!a.paired_baseline_id && a.paired_baseline_id === b.paired_baseline_id && a.approval_id === b.approval_id &&
    a.review_id === b.review_id && a.revision === b.revision
}

function outcomeValue(scope: Scope | undefined, outcome: typeof outcomes[number]) {
  const item = scope?.metrics.find(metric => metric.metric === outcome.id)
  if (!item || item.unit !== outcome.unit || item.status !== 'available' || item.value == null) return undefined
  const value = outcome.rate ? item.value : typeof item.value === 'object' ? item.value.p50 : undefined
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function signedChange(previous: number, next: number, unit: string) {
  const value = next - previous
  if (value === 0) return 'No change'
  if (unit === 'THB') {
    const amount = baht.format(Math.abs(value))
    if (previous < 0 && next < 0) return amount + (value > 0 ? ' smaller median loss' : ' larger median loss')
    if (previous < 0 && next > 0) return 'Loss to profit (+' + amount + ')'
    if (previous > 0 && next < 0) return 'Profit to loss (−' + amount + ')'
    if (next === 0) return 'Break-even (' + (value > 0 ? '+' : '−') + amount + ')'
  }
  return (value > 0 ? '+' : '−') + (unit === 'fraction' ? percentagePoints(value) : formatResult(Math.abs(value), unit))
}

export function liveStrategyDifference(original: Plan, alternative: Plan, scenario: string | undefined, labels: Labels): StrategyDifferenceProps | undefined {
  if (!pairedInputs(original, alternative)) return undefined
  const source = frozenTerms(original.input), proposed = frozenTerms(alternative.input)
  const changes: StrategyDifferenceProps['changes'] = []
  const terms: NonNullable<StrategyDifferenceProps['terms']> = []
  const recorded = alternative.input.changes ?? []
  const displayedReasons = new Set<string>()
  for (const [i, { label, value: from, fields }] of source.entries()) {
    const to = proposed[i].value
    if (from == null && to == null) continue
    if (from != null && from === to) {
      terms.push({ label, value: from })
      continue
    }
    const reasons = [...new Set(recorded.filter(c => fields.includes(c.field)).map(c => c.reason))]
      .filter(reason => reason && !displayedReasons.has(reason))
    reasons.forEach(reason => displayedReasons.add(reason))
    changes.push({ label, from: from ?? undefined, to: to ?? undefined, reason: reasons.join(' ') || undefined })
  }
  for (const change of recorded) {
    if (!source.some(term => term.fields.includes(change.field))) {
      changes.push({ label: humanize(change.field.slice(1).replaceAll('/', ' · ')), from: count.format(change.before),
        to: count.format(change.after), reason: change.reason })
    }
  }
  const before = original.scenario_results.find(s => s.scenario === scenario)
  const after = alternative.scenario_results.find(s => s.scenario === scenario)
  return {
    original: labels.original, alternative: labels.conservative, scenario, changes, terms,
    outcomes: outcomes.map(outcome => {
      const a = outcomeValue(before, outcome), b = outcomeValue(after, outcome)
      return { label: outcome.label, original: a == null ? undefined : formatResult(a, outcome.unit),
        alternative: b == null ? undefined : formatResult(b, outcome.unit),
        difference: a == null || b == null ? undefined : signedChange(a, b, outcome.unit) }
    }),
  }
}
