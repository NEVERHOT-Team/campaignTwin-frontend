import { useId, useState } from 'react'
import { ScenarioChoices } from '../ScenarioChoices'
import SellerLedger from './SellerLedger'
import { amount, assessmentFor, checkFor, costLabels, frozenPlans, gateLabels, gateThreshold, hasFrozenIdentity, human,
  isolatedFeeChange, medianProfit, orderFee, planName, relatedApprovals, statusLabels } from './seller-decision'
import type { Gate, Plan, Report, RunInput, Scenario, Snapshot } from './seller-decision'
import './seller-verdict.css'

type Props = { report: Report; input: RunInput; previous?: Snapshot | null; onEditFee?: () => void }
const gateStatus = { pass:'Pass', fail:'Fail', unavailable:'Unavailable' }
const eligibility = { eligible:'Qualifies', ineligible:'Does not qualify', unscorable:'Insufficient evidence' }

function decisionTitle(report: Report) {
  const recommendation = report.recommendation
  const winner = recommendation.selected_plan_id && frozenPlans(report).find(p => p.input.plan_id === recommendation.selected_plan_id)
  if (winner && recommendation.status === 'revise') return 'Revise to the ' + planName(winner)
  if (recommendation.status === 'keep') return 'Keep the original offer'
  if (recommendation.status === 'hold') return 'Hold the campaign'
  return statusLabels[recommendation.status]
}
function floorSummary(report: Report, plans: Plan[], scenario: Scenario | undefined) {
  const floors = plans.flatMap(p => {
    const g = checkFor(report, p, scenario, 'unit_contribution')
    return g && g.unit === 'THB_per_pack' && g.observed != null && g.threshold != null ? [{ p, g }] : []
  })
  const failed = floors.filter(({ g }) => g.status === 'fail')
  if (!failed.length || floors.length !== plans.length) return null
  const winner = floors.find(({ p }) => p.input.plan_id === report.recommendation.selected_plan_id)
  const floor = failed[0].g.threshold
  if (!floors.every(({ g }) => g.threshold === floor)) return null
  if (winner && failed[0].p.role === 'original' && winner.g.status === 'pass') return 'The original returns ' + amount(failed[0].g.observed, 'THB') + ' per redeemed pack. The selected offer returns ' +
    amount(winner.g.observed, 'THB') + ', clearing the approved ' + amount(floor, 'THB') + ' minimum before fixed media.'
  if (failed.length === plans.length) {
    const allPositive = plans.every(p => { const value = medianProfit(p, scenario); return value != null && value > 0 })
    return 'Every offer falls below the ' + amount(floor, 'THB') + ' minimum contribution per redeemed pack in ' + scenario +
      (allPositive ? ', even though each shows positive median incremental profit.' : '.')
  }
  return null
}
function outcomeExplanation(report: Report, plans: Plan[], scenario?: Scenario) {
  if (report.recommendation.status === 'insufficient_evidence') return report.recommendation.reason === 'incomplete_pairing'
    ? 'The evaluator could not match the scenario, population or seed ledgers across the plans.' : 'At least one required check could not be scored across the paired simulations.'
  const floor = floorSummary(report, plans, scenario)
  if (floor) return floor
  const chosen = plans.find(p => p.input.plan_id === report.recommendation.selected_plan_id)
  if (chosen) return 'This offer meets the approved checks in every evaluated scenario and ranks first under the saved decision policy.'
  const failed = [...new Set(report.recommendation.assessments.flatMap(a => a.checks.filter(g => g.status === 'fail').map(g => gateLabels[g.metric].toLowerCase())))]
  return failed.length ? 'No offer qualifies across all scenarios. Failed checks include ' + failed.join(', ') + '.' : report.decision.explanation
}

function ApprovalChange({ current, before, scenario }: { current: Snapshot; before: Snapshot; scenario?: Scenario }) {
  const nowFee = orderFee(current), oldFee = orderFee(before)
  const isolated = isolatedFeeChange(current, before)
  const changed = nowFee != null && oldFee != null && nowFee !== oldFee
  const sameDecision = before.report.recommendation.status === current.report.recommendation.status
  const oldPlans = frozenPlans(before.report)
  const plans = frozenPlans(current.report).filter(p => p.role !== 'baseline')
  let detail = 'The two revisions are shown with their own approved inputs and results.'
  if (isolated && nowFee != null && oldFee != null) {
    detail = 'The fee ' + (nowFee > oldFee ? 'increased' : 'decreased') + ' by ' + amount(Math.abs(nowFee-oldFee), 'THB') +
      ' per kept order. The offers, other costs, rules, scenarios and simulated seeds match across approvals.'
  } else if (changed) detail = 'The order fee changed. Other approved inputs or model evidence also differ, so the decision change cannot be attributed to the fee alone.'
  else if (oldFee == null || nowFee == null) detail = 'A confirmed fixed fee is unavailable for one approval. Each revision retains its own reported results.'
  return <section className="sv-card sv-change" aria-label="Approval comparison">
    <header><h2>What changed between approvals</h2><p>{detail}</p></header>
    <div className="sv-revision-pair">{[before, current].map((s, i) => <div key={s.report.run_id}>
      <span>{i === 0 ? 'Earlier' : 'Current'} · Revision {s.report.revision}</span>
      <strong>{statusLabels[s.report.recommendation.status]}</strong><span>Order fee {amount(orderFee(s), 'THB')} per kept order</span>
    </div>)}</div>
    {isolated && <div className="sv-change-notes">{plans.flatMap(p => {
      const old = oldPlans.find(prior => prior.role === p.role)
      const previous = old && checkFor(before.report, old, scenario, 'unit_contribution')
      const latest = checkFor(current.report, p, scenario, 'unit_contribution')
      if (!old || !previous || !latest || previous.unit !== 'THB_per_pack' || latest.unit !== previous.unit ||
          previous.observed == null || latest.observed == null || latest.threshold == null || latest.threshold !== previous.threshold) return []
      const wasProfit = medianProfit(old, scenario), isProfit = medianProfit(p, scenario)
      return [<div key={p.input.plan_id}><h3>{planName(p)}</h3><p>{amount(previous.observed,'THB') + ' → ' + amount(latest.observed,'THB') + ' per redeemed pack. '}
        {previous.status === 'pass' && latest.status === 'fail' ? 'Now below the ' : previous.status === 'fail' && latest.status === 'pass' ? 'Now meets the ' :
          latest.status === 'pass' ? 'Meets the ' : latest.status === 'fail' ? 'Below the ' : 'Compared with the '}{amount(latest.threshold,'THB')} floor.</p>
        <p>Median incremental profit in {scenario} · {amount(wasProfit,'THB',true)} → {amount(isProfit,'THB',true)}</p></div>]
    })}</div>}
    {!isolated && sameDecision && <p>The overall recommendation stayed {statusLabels[current.report.recommendation.status].toLowerCase()}.</p>}
  </section>
}
function OfferComparison({ report, scenario }: { report: Report; scenario?: Scenario }) {
  const plans = frozenPlans(report).filter(p => p.role !== 'baseline')
  if (!plans.length) return <p>No evaluated offers could be matched to this approval.</p>
  return <section className="sv-card" aria-label="Offer comparison">
    <header><h2>Offer comparison</h2><p>{scenario ? scenario + ' · ' : ''}Profit covers the measurement window and is measured against ordinary trading. Each offer must pass every approved scenario.</p></header>
    <div className="sv-offers">{plans.map(plan => {
      const assessment = assessmentFor(report, plan)
      const selected = report.recommendation.selected_plan_id === plan.input.plan_id
      const floor = checkFor(report, plan, scenario, 'unit_contribution')
      const metric = medianProfit(plan, scenario)
      const delta = assessment?.versus_original.find(d => d.scenario === scenario && d.metric.metric === 'profit_vs_original' && d.metric.unit === 'THB')?.metric
      return <article key={plan.input.plan_id} className="sv-offer">
        <div className="sv-offer-role"><span>{plan.role === 'original' ? 'Original offer' : 'Alternative offer'}</span>{selected && <b>Selected</b>}</div>
        <h3>{planName(plan)}</h3><dl>
          <div><dt>Median incremental profit</dt><dd className="sv-number">{amount(metric, 'THB', true)}</dd></div>
          {floor && <div><dt>Contribution per redeemed pack</dt><dd>{amount(floor.observed,'THB')} <small>· {gateStatus[floor.status]}</small></dd></div>}
          {plan.role !== 'original' && delta && <div><dt>Median paired gain vs. original</dt><dd>{delta.status === 'available' && delta.value && typeof delta.value === 'object' ? amount(delta.value.p50,'THB',true) : 'Unavailable'}</dd></div>}
        </dl>
        <p className="sv-eligibility">{assessment ? eligibility[assessment.eligibility] : 'Assessment unavailable'}</p>
      </article>
    })}</div>
    <details className="sv-disclosure"><summary>Inspect decision checks</summary>
      {plans.map(plan => {
        const checks = assessmentFor(report, plan)?.checks.filter(g => g.scenario === scenario) ?? []
        return <section key={plan.input.plan_id}><h3>{planName(plan)} · {scenario ?? 'Scenario unavailable'}</h3>
          {checks.length ? <div className="sv-scroll" role="region" aria-label={planName(plan) + ' checks'} tabIndex={0}><table><thead><tr><th>Check</th><th>Observed</th><th>Requirement</th><th>Result</th></tr></thead>
            <tbody>{checks.map((g: Gate) => <tr key={g.metric}><th scope="row">{gateLabels[g.metric]}</th><td>{amount(g.observed,g.unit)}</td><td>{gateThreshold(g)}</td>
              <td>{gateStatus[g.status]}{g.unavailable_reason && <small>{human(g.unavailable_reason)}</small>}</td></tr>)}</tbody></table></div> :
            <p>Decision checks are unavailable for this offer and scenario.</p>}
        </section>
      })}
      <p>Original-plan decision · {human(report.decision.status)}. {report.decision.explanation}</p>
      {report.recommendation.alternative_shortfall && <p>{report.recommendation.alternative_shortfall}</p>}
    </details>
  </section>
}
function ApprovedEvidence({ now, before }: { now: Snapshot; before?: Snapshot }) {
  const id = useId()
  const [selectedId, setSelectedId] = useState(now.report.run_id)
  const [raw, setRaw] = useState(false)
  const record = before && selectedId === before.report.run_id ? before : now
  const { report, input } = record
  const { review } = input
  const fee = review.costs.payment_fee
  const feeRef = fee?.evidence_ref
  const feeOrigin = feeRef && review.fact_origins[feeRef]
  const quote = feeRef && review.confirmed_quotes?.[feeRef]
  return <section className="sv-card sv-evidence" aria-labelledby={id}>
    <header><h2 id={id}>Approved evidence</h2><p>Inspect the frozen inputs and settlement for a saved run.</p></header>
    {before && <label className="sv-picker">Approval to inspect<select value={report.run_id} onChange={e => setSelectedId(e.target.value)}>
      {[now, before].map((s,i) => <option key={s.report.run_id} value={s.report.run_id}>Revision {s.report.revision} · {i === 0 ? 'Current' : 'Earlier'} · {statusLabels[s.report.recommendation.status]}</option>)}
    </select></label>}
    <dl className="sv-proof">
      <div><dt>Approved order fee</dt><dd>{amount(fee?.value,fee?.unit ?? null)}</dd></div>
      <div><dt>Applied to</dt><dd>{fee?.basis || 'Basis unavailable'}</dd></div>
      <div><dt>Evidence reference</dt><dd><code>{feeRef || 'Unavailable'}</code>{feeOrigin && <small>{feeOrigin === 'planner' ? 'Seller supplied' : human(feeOrigin)}</small>}{quote && <q>{quote}</q>}</dd></div>
    </dl>
    <SellerLedger key={report.run_id} report={report}/>
    <details className="sv-disclosure"><summary>Cost sources and approval details</summary>
      <p>Revision {report.revision} · Report evaluated <time dateTime={report.evaluated_at}>{report.evaluated_at}</time></p>
      <dl className="sv-ids"><div><dt>Run</dt><dd><code>{report.run_id}</code></dd></div><div><dt>Approval</dt><dd><code>{input.approval_id}</code></dd></div>
        <div><dt>Review</dt><dd><code>{review.review_id}</code></dd></div></dl>
      <ul className="sv-costs">{Object.entries(review.costs).map(([key, cost]) => <li key={key}><strong>{costLabels[key] ?? human(key)}</strong>
        <span>{amount(cost.value,cost.unit)} · {human(cost.status)}</span><span>{cost.basis || 'Basis unavailable'}</span>
        <small>{cost.source ? 'Source · ' + human(cost.source) : 'Source unavailable'}{cost.evidence_ref && ' · ' + cost.evidence_ref}</small>
        {cost.reason && <small>{cost.reason}</small>}
      </li>)}</ul>
      {report.recommendation.confidence && <p>Confidence · {human(report.recommendation.confidence.label)}. {report.recommendation.confidence.reasons.join(' ')}</p>}
      <details className="sv-json" onToggle={e => setRaw(e.currentTarget.open)}><summary>Approved input JSON</summary>{raw && <pre tabIndex={0}>{JSON.stringify(input,null,2)}</pre>}</details>
    </details>
  </section>
}
export default function SellerVerdict({ report, input, previous, onEditFee }: Props) {
  const [choice, setChoice] = useState<Scenario | undefined>()
  const current = { report, input }
  if (!hasFrozenIdentity(current)) return <section className="seller-verdict"><h1>Seller verdict</h1><p>The report and approved input identify different runs. The paired evidence is unavailable.</p></section>
  const plans = frozenPlans(report).filter(p => p.role !== 'baseline')
  const scenarios = [...new Set(plans.flatMap(p => p.scenario_results.map(s => s.scenario)))]
  const scenario = choice && scenarios.includes(choice) ? choice : scenarios[0]
  const before = previous && relatedApprovals(current, previous) ? previous : undefined
  const product = input.review.resolved_product
  return <div className="seller-verdict">
    <header className="sv-page-title"><div><h1>Seller verdict</h1><p>{product && product.label + ' · ' + product.pack_label + ' · '}Approved revision {report.revision}</p></div>
      {onEditFee && <button className="sv-edit" onClick={onEditFee}>Edit order fee</button>}</header>
    <section className="sv-hero" aria-label="Overall recommendation"><div>
      <p className="sv-label">Recommendation across all evaluated offers</p><h2>{decisionTitle(report)}</h2>
      <p className="sv-why">{outcomeExplanation(report, plans, scenario)}</p>
    </div><div className="sv-context"><span>Measurement window</span><strong>{report.measurement_window.start_date} to {report.measurement_window.end_date}</strong>
      <small>End exclusive{product?.timezone && ' · ' + product.timezone}</small>
      {report.recommendation.confidence && <small>{human(report.recommendation.confidence.label)} model confidence</small>}</div></section>
    {before && <ApprovalChange current={current} before={before} scenario={scenario}/>}
    {scenario && scenarios.length > 1 && <ScenarioChoices label="Evaluated scenario" value={scenario} onChange={v => setChoice(scenarios.find(s => s === v))}
      options={scenarios.map(id => ({ id, label:id, description:report.evidence.scenario_basis.find(s => s.scenario === id)?.reason }))}/>}
    <OfferComparison report={report} scenario={scenario}/>
    <ApprovedEvidence now={current} before={before} key={report.run_id}/>
  </div>
}
