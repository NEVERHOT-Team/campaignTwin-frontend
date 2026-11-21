import { exampleCampaign, fieldIssues } from './campaign'
import { preferredBrand } from './shopper-groups'
import { type Agent, type Backtest, type BrandGroup, type CampaignApi, type Candidate, type Draft, type Field, type FieldKey, type Plan, type Range, type Report, type ReviewContext, type Run, type Scenario, type Trace, defaultBrandGroups, emptyValues, fieldKeys, sampleBrief } from './model'

const scenarioList: Scenario[] = [
  { scenario_id: 'S1', label: 'Quiet market', description: 'Rivals keep their usual pricing.' },
  { scenario_id: 'S2', label: 'Price match', description: 'The rival matches the launch voucher.' },
  { scenario_id: 'S3', label: 'Discount war', description: 'A stronger rival voucher pulls price-sensitive shoppers away.' },
]
const pendingHistory: Backtest = {
  status: 'insufficient', dataset: 'Complete Journey', case_id: null, comparability: 'Potential grocery proxy',
  benchmark_outcome: null, metrics: [], gaps: ['An eligible held-out campaign has not been verified for this fixture.'],
}
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const range = (p50: number, spread: number): Range => ({ p10: p50 - spread, p50, p90: p50 + spread })
export const demoEconomics = { unit_price_thb: '120', unit_cost_thb: '65', fee_pct: '10', fixed_campaign_spend_thb: '0' }
const mockDraft: Draft = { brief: sampleBrief, values: { ...emptyValues, brand: 'Crunchy Co.', discount_pct: '15', total_budget_thb: '20000', ...demoEconomics }, fields: [], confirmed: [], campaign: exampleCampaign, goals: [], mechanics: [], answers: {} }
const contexts = new Map<string, { review: ReviewContext; draft: Draft }>()
const candidates = new Map<string, Candidate>()
const runs = new Map<string, { report: Report; start: number }>()
const submissions = new Map<string, { run_id: string; approval: string }>()
const key = ({ id, revision }: { id: string; revision: number }) => id + ':' + revision

function reviewOf(draft: Draft, id: string, revision: number): ReviewContext {
  const v = draft.values
  const net = Number(v.unit_price_thb) * (1 - Number(v.discount_pct) / 100) * (1 - Number(v.fee_pct) / 100) - Number(v.unit_cost_thb)
  return {
    context: { id, revision },
    original_plan: {
      plan_id: 'original-' + id, revision, brand: v.brand, label: 'Your plan', discount_pct: Number(v.discount_pct),
      total_budget_thb: Number(v.total_budget_thb), start_day: 1, end_day: 14, target_segments: ['all'],
      budget_split: { shopee: 1 }, message_id: 'seller-voucher', constraints: { max_discount_pct: 25, must_include: ['shopee'] },
    },
    baseline: { id: 'no-campaign', revision: 1 }, scenario_config: { id: 'rival-scenarios', revision: 1 },
    fields: draft.fields, open_questions: fieldIssues(draft), assumptions: ['Shopee Thailand · potato-chip multipacks', 'Seller-funded voucher, with fees applied to item revenue after discount', 'Fourteen campaign days and fourteen follow-up days'],
    blocking_gaps: net < 15 ? ['Unit contribution falls below ฿15 with these inputs. Adjust the discount, fee or costs.'] : [],
  }
}

function candidateOf(review: ReviewContext, draft: Draft, discount = Math.max(1, review.original_plan.discount_pct - 5), revision = 1): Candidate {
  const v = draft.values
  const contribution = Number(v.unit_price_thb) * (1 - discount / 100) * (1 - Number(v.fee_pct) / 100) - Number(v.unit_cost_thb)
  return {
    plan: { ...review.original_plan, plan_id: 'alternative-' + review.context.id, revision, label: 'Strategist plan', discount_pct: discount, target_segments: ['price-sensitive'] },
    summary: 'Target value seekers with a shallower voucher and protect contribution when rivals respond.',
    changes: [
      { lever: 'Voucher discount', from: review.original_plan.discount_pct + '%', to: discount + '%', why: 'Reduce exposure to a discount war.' },
      { lever: 'Audience', from: 'All eligible shoppers', to: 'Price-sensitive segment', why: 'Focus the incentive on shoppers more likely to change their decision.' },
    ],
    issues: [
      ...(!Number.isFinite(discount) || discount <= 0 || discount > 25 ? ['Discount must be greater than 0% and at most 25%.'] : []),
      ...(contribution < 15 ? ['Estimated unit contribution falls below ฿15.'] : []),
    ],
  }
}

const shopperIds = Array.from({ length: 120 }, (_, i) => 'shopper-' + String(i + 1).padStart(3, '0'))

function dailyShoppers(groups: BrandGroup[], day: number, scenario: string, alternative: boolean, baseline: boolean, window: Report['window']): Agent[] {
  if (!groups.length) return []
  const campaignDay = baseline ? 0 : Math.max(0, day - window.start_day + 1)
  const daysSinceOffer = day - window.end_day
  const uptake = Math.min(1, campaignDay / 7) * Math.max(.25, 1 - Math.max(0, daysSinceOffer) / 18)
  const response = campaignDay < 5 ? 0 : scenario === 'S3' ? .19 : scenario === 'S2' ? .10 : 0
  const focal = .22 + (alternative ? .22 : .26) * uptake - response * (alternative ? .36 : 1) * uptake
  const rival = .20 + response * uptake
  const roleShare = { focal, competitor: rival, market: 1 - focal - rival }
  const countByRole = { focal: 0, competitor: 0, market: 0 }
  for (const group of groups) countByRole[group.role]++
  let totalWeight = 0
  const distribution = groups.map(group => {
    totalWeight += roleShare[group.role] / countByRole[group.role]
    return { group, upper: totalWeight }
  })
  const promotion = !baseline && day >= window.start_day && day <= window.end_day
  const campaignLength = window.end_day - window.start_day + 1

  return shopperIds.map((shopper_id, index) => {
    // Separate draws keep preference changes distinct from purchase decisions.
    // The same day and shopper get the same purchase draw in each paired plan.
    const preferenceDraw = ((index * 73 + 19) % 127) / 127 * totalWeight
    const preferred = distribution.find(entry => preferenceDraw < entry.upper)!.group
    const purchaseDraw = ((index * 61 + day * 37 + 11) % 127) / 127
    // The sample strategist targets value seekers (the same segment recorded in the trace).
    const inAudience = !alternative || (index + 1) % 3 === 1
    const exposureDay = !baseline && inAudience ? window.start_day + (index * 5) % campaignLength : undefined
    const promotion_exposed = day === exposureDay
    const dealProne = (index * 17 + 7) % 19 < 5
    const waitingForOffer = dealProne && exposureDay !== undefined && day > exposureDay
      && daysSinceOffer > 0 && daysSinceOffer <= 4 + index % 11
    const regularThreshold = .32 + (promotion && inAudience && preferred.role === 'focal' ? .12 : 0)
      + (promotion && preferred.role === 'competitor' ? response / 2 : 0)
    const threshold = waitingForOffer ? regularThreshold * .35 : regularThreshold
    if (purchaseDraw < threshold) return { shopper_id, brand: preferred.id, purchase: 'bought', promotion_exposed }
    return { shopper_id, brand: preferred.id, purchase: 'no_purchase', waiting: waitingForOffer, promotion_exposed }
  })
}

function brandShare(agents: Agent[], focalIds: Set<string>) {
  return agents.length && focalIds.size ? Math.round(1000 * agents.filter(agent => focalIds.has(agent.brand)).length / agents.length) / 10 : null
}

// Reuse the same 20 synthetic seed shocks for paired plans. Both the profit
// range and the chance of hitting the target must describe these same samples.
const profitShockPercent = [-145,-109,-99,-82,-68,-53,-38,-28,-12,-4,4,14,25,39,55,68,76,99,109,134]
function fixtureProfit(median: number, spread: number, factor: number, goal: number) {
  const samples = profitShockPercent.map(shock => Math.round(factor * (median + spread * shock / 100)))
  function quantile(q: number) {
    const rank = q * (samples.length - 1)
    const lower = Math.floor(rank)
    return Math.round(samples[lower] + (samples[Math.ceil(rank)] - samples[lower]) * (rank - lower))
  }
  return {
    profit: { p10: quantile(.1), p50: quantile(.5), p90: quantile(.9) },
    attainment: { met_samples: samples.filter(value => value >= goal).length, valid_paired_samples: samples.length },
  }
}

function reportOf(review: ReviewContext, draft: Draft, source: 'example' | 'submission', candidate?: Candidate): Report {
  const original = review.original_plan
  const plans: Report['plans'] = [
    { plan_id: original.plan_id, label: original.label, role: 'original', discount_pct: original.discount_pct },
    ...(candidate ? [{ plan_id: candidate.plan.plan_id, label: candidate.plan.label, role: 'alternative' as const, discount_pct: candidate.plan.discount_pct }] : []),
    { plan_id: review.baseline.id, label: 'No campaign', role: 'baseline' },
  ]
  const factor = Math.max(.3, Math.min(3, original.total_budget_thb / 20000))
  const goal = 5000
  const brandGroups = structuredClone(defaultBrandGroups)
  const focalIds = new Set(brandGroups.filter(group => group.role === 'focal').map(group => group.id))
  const window = { start_day: original.start_day, end_day: original.end_day, follow_up_end_day: original.end_day + 14 }
  const baselineDays = Array.from({ length: window.follow_up_end_day + 1 }, (_, day) => {
    const agents = dailyShoppers(brandGroups, day, 'S1', false, true, window)
    return { day, agents, share: brandShare(agents, focalIds) }
  })
  return {
    plans, scenarios: scenarioList, brand_groups: brandGroups,
    inputs: structuredClone({ source, brief: draft.brief?.trim(), campaign: draft.campaign, original_plan: original }),
    results: scenarioList.flatMap((s, j) => plans.map(plan => {
      const alternate = plan.role === 'alternative'
      const baseline = plan.role === 'baseline'
      const simulation = fixtureProfit(alternate ? [7940, 6950, 6120][j] : [9200, 5400, 2100][j],
        alternate ? 2780 : 3740, factor, goal)
      return {
        plan_id: plan.plan_id, scenario_id: s.scenario_id, seeds: profitShockPercent.length,
        metrics: {
          incremental_profit_thb: baseline ? null : simulation.profit,
          roas: null, new_buyers: baseline ? null : range((alternate ? 206 : 250) - j * 42, 41),
          repeat_rate: range(23 + (alternate ? 3 : 0), 3),
          brand_attitude_change_post: baseline ? null : range((alternate ? 2.5 : 1.8) - j * .55, .7),
        },
        metric_units: { brand_attitude_change_post: 'index points', repeat_rate: 'pct' },
        metric_unavailable_reasons: { roas: 'Voucher-only scenario. No attributed media spend.' },
        guardrails: baseline ? [] : [{ name: 'Discount cap', pass: (plan.discount_pct ?? 0) <= 25 }, { name: 'Budget cap', pass: true }, { name: 'Unit contribution floor', pass: true }],
        goal_attainment: baseline ? null : simulation.attainment,
        daily: baselineDays.map(frame => {
          const agents = baseline ? frame.agents : dailyShoppers(brandGroups, frame.day, s.scenario_id, alternate, false, window)
          return { day: frame.day, agents, brand_share_pct: baseline ? frame.share : brandShare(agents, focalIds), baseline_share_pct: frame.share }
        }),
        competitor_actions: j && !baseline ? [{ day: 5, brand: 'Demo rival', action: j === 2 ? 'Undercuts the voucher' : 'Matches the voucher', value: j === 2 ? Math.min(100, (plan.discount_pct ?? original.discount_pct) + 5) : plan.discount_pct ?? original.discount_pct, reason: 'The rival responds after detecting the campaign offer.' }] : [],
      }
    })),
    window, goal_thb: goal,
    assumptions: [...review.assumptions,
      'In this fixture, some shoppers who saw the promotion wait for another offer after it ends. Their daily purchase chance falls during this follow-up period.',
      'The demo uses preset plan and rival responses. Profit samples scale with the budget between ฿6,000 and ฿60,000. Budgets outside that range use the nearest example.'], candidate,
    recommendation: { plan_id: candidate?.plan.plan_id ?? original.plan_id, summary: candidate ? 'The targeted voucher holds up better under rival pressure.' : 'Review the downside across scenarios before choosing the original plan.' },
    confidence: { label: 'Illustrative', reason: 'Synthetic outcomes and no verified held-out result.' },
    integrity: { status: 'passed' },
  }
}

function matchFields(text: string): Field[] {
  const patterns: [FieldKey, RegExp][] = [
    ['brand', /for\s+([^\r\n]+?)\s+on\s+Shopee/i],
    ['discount_pct', /(\d+(?:\.\d+)?)\s*%\s*(?:seller\s+)?(?:voucher|discount|off)/i],
    ['total_budget_thb', /budget\s*(?:of\s*)?(?:฿|THB\s*)?(\d[\d,]*(?:\.\d+)?)/i],
    ['unit_price_thb', /sells for\s*(?:฿|THB\s*)?(\d[\d,]*(?:\.\d+)?)/i],
    ['unit_cost_thb', /(?:and costs|unit cost)\s*(?:฿|THB\s*)?(\d[\d,]*(?:\.\d+)?)/i],
    ['fee_pct', /(?:marketplace\s+)?fee\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/i],
    ['fixed_campaign_spend_thb', /fixed (?:campaign )?(?:cost|spend)\s*(?:฿|THB\s*)?(\d[\d,]*(?:\.\d+)?)/i],
  ]
  return patterns.flatMap(([field_id, pattern]) => {
    const m = pattern.exec(text)
    if (m) return [{ field_id, value: field_id === 'brand' ? m[1].trim() : Number(m[1].replaceAll(',', '')), origin: 'extracted', source_quote: m[0], confirmation: 'pending' }]
    return []
  })
}

const sampleReview = reviewOf(mockDraft, 'sample', 1)
let sampleReport: Report | undefined
const replayReport = () => (sampleReport ??= reportOf(sampleReview, mockDraft, 'example', candidateOf(sampleReview, mockDraft)))
function traceFrom(report: Report, id: string, day: number, scenario: string, planId: string): Trace {
  const row = report.results.find(r => r.scenario_id === scenario && r.plan_id === planId)
  const agent = row?.daily.find(d => d.day === day)?.agents?.find(a => a.shopper_id === id)
  if (!row || !agent) throw new Error('A trace is unavailable for this shopper and day.')
  const n = Number(id.split('-').at(-1))
  const groups = report.brand_groups ?? defaultBrandGroups
  const labels = new Map(groups.map(group => [group.id, group.label]))
  const labelFor = (id: string) => labels.get(id) ?? id
  const selectedBrand = preferredBrand(agent, groups)
  const events: Trace['events'] = []
  let previous: string | undefined
  for (const frame of row.daily) {
    if (frame.day > day) break
    const current = frame.agents?.find(person => person.shopper_id === id)
    if (!current) continue
    const preference = preferredBrand(current, groups)
    const brand = preference && labelFor(preference)
    const switched = previous !== undefined && preference !== undefined && previous !== preference
    const change = switched ? labelFor(previous!) + ' → ' + brand + '. ' : ''
    const type = switched ? 'switched' : current.purchase === 'bought' ? 'purchased' : current.purchase === 'no_purchase' ? 'no_purchase' : 'observed'
    let detail = brand ? 'Preferred ' + brand + '. Purchase not recorded.' : 'No brand preference or purchase recorded.'
    if (current.purchase === 'bought') detail = brand ? 'Bought from ' + brand + '.' : 'Made a purchase.'
    else if (current.purchase === 'no_purchase') {
      detail = 'No purchase today.' + (brand ? ' Preferred ' + brand + '.' : '') + (current.waiting ? ' Waiting for another offer after the promotion ended.' : '')
    }
    if (current.promotion_exposed) detail += ' Saw the campaign offer today.'
    events.push({ day: frame.day, type, brand: brand ?? 'Unrecorded', channel: 'Shopee',
      purchase: current.purchase, waiting: current.waiting, promotion_exposed: current.promotion_exposed, detail: change + detail })
    previous = preference
  }
  return {
    shopper_id: id, segment_id: n % 3 === 0 ? 'Brand loyal' : n % 3 === 1 ? 'Value seeker' : 'Category explorer',
    traits: { price_sensitivity: 40 + n % 52, loyalty: 25 + n * 3 % 65 },
    memory_by_day: { [day]: selectedBrand ? { [labelFor(selectedBrand)]: { awareness: Math.min(100, 30 + day * 3 + n % 19), attitude: 35 + n % 53 } } : {} },
    events,
    explanation: 'The fixture records one purchase decision per shopper each day. A preference can persist on days without a purchase.',
  }
}

export const fixtureApi: CampaignApi = {
  mode: 'fixture',
  async extract(text, known) {
    await wait(270)
    const fields = matchFields(text).filter(f => !known[f.field_id].trim())
    return { fields, questions: fieldKeys.filter(k => !known[k].trim() && !fields.some(f => f.field_id === k)).map(field_id => ({ field_id, prompt: 'Enter this value before reviewing the plan.' })) }
  },
  async context(draft, previous) {
    await wait(200)
    const review = reviewOf(draft, previous?.id ?? crypto.randomUUID(), (previous?.revision ?? 0) + 1)
    contexts.set(key(review.context), structuredClone({ review, draft }))
    return review
  },
  async optimize(review) {
    await wait(300)
    const entry = contexts.get(key(review.context))
    if (!entry) throw new Error('Review context is unavailable.')
    const candidate = candidateOf(review, entry.draft)
    candidates.set(candidate.plan.plan_id + ':' + candidate.plan.revision, candidate)
    return { candidates: [candidate] }
  },
  async revalidate(review, candidate, discount) {
    const entry = contexts.get(key(review.context))
    if (!entry) throw new Error('Review context is unavailable.')
    const updated = candidateOf(review, entry.draft, discount, candidate.plan.revision + 1)
    candidates.set(updated.plan.plan_id + ':' + updated.plan.revision, updated)
    return { candidates: [updated] }
  },
  async simulate(approval, submissionId) {
    const serialized = JSON.stringify(approval)
    const previous = submissions.get(submissionId)
    if (previous) {
      if (serialized !== previous.approval) throw new Error('This submission ID already belongs to a different approval.')
      return { run_id: previous.run_id, status: 'queued' }
    }
    const context = contexts.get(key(approval.context))
    if (!context) throw new Error('Review context is unavailable.')
    const ref = approval.included_alternatives[0]
    const candidate = ref && candidates.get(ref.plan_id + ':' + ref.revision)
    if (ref && (!candidate || candidate.issues.length)) throw new Error('Review the Strategist plan before running.')
    const run_id = crypto.randomUUID()
    runs.set(run_id, { report: reportOf(context.review, context.draft, 'submission', candidate), start: Date.now() })
    submissions.set(submissionId, { run_id, approval: serialized })
    return { run_id, status: 'queued' }
  },
  async run(run_id) {
    const item = runs.get(run_id)
    if (!item) throw new Error('The run could not be found.')
    const elapsed = Date.now() - item.start
    const status = elapsed < 350 ? 'queued' : elapsed < 1250 ? 'simulating' : elapsed < 1650 ? 'evaluating' : 'complete'
    const progress = status === 'simulating' ? { completed: 2, total: 6, unit: 'fixture blocks' } : null
    return { run_id, status, progress, report: status === 'complete' ? item.report : null } satisfies Run
  },
  async backtest() { await wait(200); return pendingHistory },
  async shopper(runId, id, day, scenario, planId) {
    await wait(110)
    const report = runId === 'fixture-market' ? replayReport() : runs.get(runId)?.report
    if (!report) throw new Error('No shopper data is available for this run.')
    return traceFrom(report, id, day, scenario, planId)
  },
  async replay() {
    await wait(140)
    return { replay_id: 'market-snapshot', source_class: 'synthetic_fixture', fixture_version: '2', run: { run_id: 'fixture-market', status: 'complete', progress: null, report: replayReport() }, historical_check: pendingHistory }
  },
}
