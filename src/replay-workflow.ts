import type { WorkflowEvidence } from './WorkflowMap'
import { brandLabels, money, type Day, type Move, type Report, type Result } from './model'
import { attainmentRate, count, percent } from './verdict-values'

type ReplayScope = {
  report: Report
  result?: Result
  baselineDay?: Day
  frame?: Day
  previous?: Day
  plan?: Report['plans'][number]
  scenario?: Report['scenarios'][number]
  selected: string | null
  day: number
  phase: string
  lastMove?: Move
}

function facts(entries: [string, string | undefined][]) {
  return entries.flatMap(([label, value]) => value ? [{ label, value }] : [])
}

function share(value: number | null | undefined) {
  return value == null ? undefined : count.format(value) + '%'
}

export function replayWorkflowEvidence({ report, result, baselineDay, frame, previous, plan, scenario, selected, day, phase, lastMove }: ReplayScope): WorkflowEvidence {
  const inputs = report.inputs
  const campaign = inputs?.campaign
  const original = inputs?.original_plan
  const chosen = plan?.label ?? 'Selected plan'
  const terms = original && plan?.plan_id === original.plan_id ? original
    : report.candidate?.plan.plan_id === plan?.plan_id ? report.candidate?.plan : undefined
  const baselineShare = frame?.baseline_share_pct ?? baselineDay?.brand_share_pct
  const prior = new Map(previous?.agents?.map(shopper => [shopper.shopper_id, shopper.brand]))
  const comparable = frame?.agents?.filter(shopper => prior.has(shopper.shopper_id))
  const changed = comparable?.filter(shopper => prior.get(shopper.shopper_id) !== shopper.brand)
  const shopper = frame?.agents?.find(person => person.shopper_id === selected)
  const comparisonRows = report.plans.flatMap(option => {
    const row = report.results.find(value => value.plan_id === option.plan_id && value.scenario_id === scenario?.scenario_id)
    if (!row) return []
    const median = row.metrics.incremental_profit_thb?.p50
    const parts = [
      option.role === 'baseline' ? 'No promotion' : option.discount_pct == null ? undefined : option.discount_pct + '% voucher',
      count.format(row.seeds) + ' simulation seeds',
      median == null ? undefined : money(median) + ' median profit lift',
    ]
    return [{ label: option.label, value: parts.filter(Boolean).join(' · ') }]
  })
  const profit = result?.metrics.incremental_profit_thb
  const goal = result?.goal_attainment
  const rate = attainmentRate(goal)
  const recommended = report.plans.find(option => option.plan_id === report.recommendation?.plan_id)
  const observations = []
  if (day >= report.window.start_day) {
    const voucher = plan?.discount_pct == null ? '' : ' with a ' + plan.discount_pct + '% voucher'
    observations.push({ day: report.window.start_day, label: 'Campaign launch', value: chosen + ' entered its promotion window' + voucher + '.' })
  }
  if (lastMove) observations.push({ day: lastMove.day, label: lastMove.brand, value: lastMove.action + '. ' + lastMove.reason })
  if (frame?.agents) {
    const response = comparable?.length && changed && previous
      ? changed.length + ' of ' + comparable.length + ' tracked shoppers changed preference since day ' + previous.day + '.'
      : frame.agents.length + ' shopper preferences recorded.'
    observations.push({ day, label: 'Shopper response', value: response })
  }

  return {
    brief: {
      stamp: inputs?.source === 'example' ? 'Saved example' : inputs?.source === 'submission' ? 'Submitted brief' : undefined,
      summary: campaign?.name || original?.brand || 'Campaign objective',
      facts: facts([
        ['Brand', original?.brand], ['Product', campaign?.['brand.category']],
        ['Intended audience', campaign?.['audience.description']], ['Market', campaign?.['audience.geo']],
        ['Channels', campaign?.channels], ['Run profit target', money(report.goal_thb)],
        ['Offer headline', campaign?.['offer.message.headline']], ['Key message', campaign?.['offer.message.key_message']],
      ]),
      quote: inputs?.brief || undefined,
    },
    review: {
      stamp: original ? 'Revision ' + original.revision : undefined,
      summary: inputs?.source === 'submission' ? 'The run uses the terms saved at approval.' : inputs?.source === 'example' ? 'The replay uses the terms saved with this example.' : 'Promotion and follow-up dates from the report.',
      facts: facts([
        ['Original voucher', original && original.discount_pct + '%'], ['Campaign budget', original && money(original.total_budget_thb)],
        ['Maximum discount', original && original.constraints.max_discount_pct + '%'],
        ['Promotion window', 'Days ' + report.window.start_day + '–' + report.window.end_day],
        ['Follow-up through', 'Day ' + report.window.follow_up_end_day],
        ['Requested voucher eligibility', campaign?.['offer.mechanics.0.eligibility']],
        ['Requested dates', campaign?.['timing.start_date'] && campaign?.['timing.end_date'] ? campaign['timing.start_date'] + ' to ' + campaign['timing.end_date'] : undefined],
      ]),
      notes: report.assumptions.filter(Boolean),
    },
    setup: {
      stamp: comparisonRows.length ? comparisonRows.length + ' plans' : undefined,
      summary: scenario?.description ?? 'Plans with results for the selected scenario.',
      facts: facts([
        ['Scenario', scenario?.label], ['Selected plan', plan?.label],
        ['Selected audience', terms?.target_segments.join(', ')], ['Selected voucher', plan?.discount_pct == null ? undefined : plan.discount_pct + '%'],
      ]),
      events: comparisonRows,
    },
    simulation: {
      stamp: 'Day ' + day,
      summary: `${phase} on day ${day}. ${frame?.agents ? count.format(frame.agents.length) + ' shoppers have recorded preferences.' : 'No individual preferences were returned for this day.'}`,
      facts: facts([
        ['Your brand', share(frame?.brand_share_pct)], ['No-campaign preference', share(baselineShare)],
        ['Prefer your brand', frame?.agents && count.format(frame.agents.filter(person => person.brand === 'ours').length) + ' shoppers'],
        ['Selected shopper', shopper && shopper.shopper_id + ' · ' + brandLabels[shopper.brand]],
      ]),
      events: observations.sort((a, b) => a.day - b.day).map(event => ({ label: 'Day ' + event.day + ' · ' + event.label, value: event.value })),
      notes: !lastMove && result ? ['No rival move recorded through day ' + day + '.'] : undefined,
    },
    evidence: {
      stamp: 'Full run',
      summary: profit ? chosen + ' has a median profit lift of ' + money(profit.p50) + ' for the full run.' : 'Evaluation for the selected plan and scenario.',
      facts: facts([
        ['Profit lift · P10–P90', profit ? money(profit.p10) + ' to ' + money(profit.p90) : undefined],
        ['Buyer lift · median', result?.metrics.new_buyers ? count.format(result.metrics.new_buyers.p50) : undefined],
        ['Profit target reached', goal && rate != null ? goal.met_samples + ' of ' + goal.valid_paired_samples + ' valid paired samples (' + percent.format(rate) + ')' : undefined],
      ]),
      events: result?.guardrails.map(rule => ({ label: rule.name, value: rule.pass ? 'Passed' : 'Failed' })),
    },
    decision: {
      stamp: report.confidence.label,
      summary: report.recommendation?.summary || 'Review the run evidence before selecting a plan.',
      facts: facts([
        ['Report recommendation', recommended?.label], ['Confidence', report.confidence.label],
        ['Integrity checks', report.integrity.status === 'passed' ? 'Passed' : 'Failed'],
      ]),
      notes: [report.confidence.reason, report.integrity.reason].filter((value): value is string => !!value),
    },
  }
}
