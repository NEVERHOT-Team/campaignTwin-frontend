import { useEffect, useRef, useState } from 'react'
import { marketBackdrop, marketHeight, marketWidth } from '../pixel-market-art'
import { humanize } from './planner'
import type { Report, Review } from './client'
import '../arena-page.css'
import './live-arena.css'

type Metric = Report['scenario_results'][number]['metrics'][number]
type PlanResult = NonNullable<Report['plan_results']>[number]
type Props = { report: Report; review?: Review | null; onVerdict: () => void; onOpenDemo?: () => void }

const planLabels = { original: 'Your plan', conservative: 'Smaller discount', baseline: 'No campaign' }
const numbers = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const baht = new Intl.NumberFormat('en-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const percentage = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 2 })
const calendar = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function valueInUnit(value: number, unit: string) {
  if (unit === 'THB') return baht.format(value)
  if (unit === 'fraction') return percentage.format(value)
  if (unit === 'ratio') return numbers.format(value) + '×'
  return numbers.format(value) + ' ' + unit.replaceAll('_', ' ')
}
function metricValue(metric: Metric | undefined, quantile: 'p10' | 'p50' | 'p90' = 'p50') {
  if (!metric || metric.status !== 'available' || metric.value === null) return 'Unavailable'
  return valueInUnit(typeof metric.value === 'number' ? metric.value : metric.value[quantile], metric.unit)
}
function interval(window: Report['measurement_window']) {
  const start = Date.parse(window.start_date), end = Date.parse(window.end_date)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Unavailable'
  return calendar.formatRange(start, end - 86400000)
}
function ResultMetric({ title, metric }: { title: string; metric?: Metric }) {
  let detail = metric?.unavailable_reason ? humanize(metric.unavailable_reason) : 'No estimate returned'
  if (metric && metric.status === 'available' && metric.value !== null) {
    detail = typeof metric.value === 'number'
      ? 'Across paired seeds'
      : 'P10–P90 · ' + metricValue(metric, 'p10') + ' to ' + metricValue(metric, 'p90')
  }
  return <div><dt>{title}</dt><dd>{metricValue(metric)}</dd><dd className="ra-metric-note">{detail}</dd></div>
}
function IllustratedMarket() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (context) context.drawImage(marketBackdrop(), 0, 0)
  }, [])
  return <figure className="ra-stage live-market-illustration">
    <canvas ref={canvas} width={marketWidth} height={marketHeight} role="img" aria-label="Illustration of a four-stall market square"/>
    <figcaption>Illustrative map · Individual shopper observations unavailable</figcaption>
  </figure>
}
function Subsidy({ offer }: { offer:PlanResult['input']['offer'] | undefined }) {
  if (offer === null) return <>No offer</>
  if (!offer?.discount.value || !offer.discount.unit) return <>Unresolved</>
  return <>{offer.discount.unit === 'pct' ? numbers.format(offer.discount.value) + '%' : baht.format(offer.discount.value)} {offer.discount.kind === 'voucher' ? 'voucher' : 'off'}</>
}

export default function LiveArena({ report, review, onVerdict, onOpenDemo }: Props) {
  const [requestedPlan, setRequestedPlan] = useState('')
  const [requestedScenario, setRequestedScenario] = useState('')
  const plans = report.plan_results ?? []
  const plan = plans.find(p => p.input.plan_id === requestedPlan) ?? plans.find(p => p.role === 'original') ?? plans[0]
  const results = plan ? plan.scenario_results : report.scenario_results
  const scene = results.find(s => s.scenario === requestedScenario) ?? results[0]
  const metric = (id: Metric['metric']) => scene?.metrics.find(m => m.metric === id)
  const buyers = metric('incremental_new_buyers')
  // Older reports contain only scenario aggregates. The review can supply context for the exact approved revision.
  const matchedReview = review?.review_id === report.review_id && review.revision === report.revision ? review : undefined
  const input = plan?.input
  const product = input?.product ?? matchedReview?.resolved_product
  const offer = input ? input.offer : matchedReview?.resolved_offer
  const budget = input?.subsidy_budget ?? matchedReview?.facts.budget_thb
  const evaluation = input?.evaluation ?? matchedReview?.evaluation
  const window = input?.campaign_window ?? (matchedReview?.facts.start_date && matchedReview.facts.end_date
    ? { start_date: matchedReview.facts.start_date, end_date: matchedReview.facts.end_date }
    : undefined)
  const costs = input?.costs ?? matchedReview?.costs ?? {}
  const segments = (input?.segments ?? matchedReview?.segments ?? []).filter(s => s.households >= 50)
  const selectedSegmentIds = input?.target_segment_ids ?? matchedReview?.target_segment_ids
  const eligibleSegments = selectedSegmentIds?.length ? segments.filter(s => selectedSegmentIds.includes(s.segment_id)) : segments
  const versions = input?.data_versions ?? report.data_versions
  const policy = versions.evaluation_policy
  const sourceLabel = policy?.startsWith('synthetic-') ? 'Synthetic evaluation' : 'Evaluated run'

  return <div className="rehearsal-arena live-market-arena">
    <header className="ra-heading"><h1>Market arena</h1>
      <div className="ra-head-controls">
        {scene && <div className="ra-scenario"><label htmlFor="live-arena-scenario">Scenario</label>
          <select id="live-arena-scenario" value={scene.scenario} onChange={event => setRequestedScenario(event.target.value)}>
            {results.map(s => <option key={s.scenario} value={s.scenario}>{s.scenario}</option>)}
          </select></div>}
        <button className="ra-btn ra-primary" onClick={onVerdict}>View verdict</button>
      </div>
    </header>

    <dl className="ra-metrics" aria-label="Evaluated scenario highlights">
      <ResultMetric title="Median incremental profit" metric={metric('incremental_profit')}/>
      <ResultMetric title="Median incremental ROAS" metric={metric('incremental_roas')}/>
      <ResultMetric title="Median subsidy leakage" metric={metric('subsidy_leakage')}/>
      <ResultMetric title="Probability of loss" metric={metric('probability_loss')}/>
    </dl>

    <div className="ra-layout">
      <aside aria-label="Plan inputs and audience" className="ra-rail ra-left">
        <section className="ra-rail-section"><h2>Campaign plan</h2>
          {plan && <><label className="sr-only" htmlFor="live-arena-plan">Evaluated plan</label>
            <select value={plan.input.plan_id} id="live-arena-plan" className="ra-plan" onChange={event => setRequestedPlan(event.target.value)}>
              {plans.map(p => <option key={p.input.plan_id} value={p.input.plan_id}>{planLabels[p.role]}</option>)}
            </select></>}
          {product && <p className="live-market-product">{product.label} · {product.pack_label}</p>}
          <dl className="ra-facts">
            {product && <div><dt>Channel</dt><dd>{humanize(product.channel)}</dd></div>}
            {offer !== undefined && <div><dt>Mechanic</dt><dd>{!input && offer === null ? 'Unresolved' : <Subsidy offer={offer}/>}</dd></div>}
            {budget != null && <div><dt>Subsidy budget</dt><dd>{baht.format(budget)}</dd></div>}
            {window && <div><dt>Active dates</dt><dd>{interval(window)}</dd></div>}
          </dl>
          {!product && !window && budget == null && <p>Detailed plan inputs unavailable for this run.</p>}
          {input?.changes.map(change => <p key={change.field} className="live-market-change">{change.reason}</p>)}
        </section>
        <section className="ra-rail-section"><h2>Audience</h2>
          {selectedSegmentIds == null ? <p>Audience unavailable.</p> : <>
            <p>{selectedSegmentIds.length ? 'Targeted segments' : 'All eligible segments'}</p>
            {eligibleSegments.length > 0 && <dl className="ra-facts">{eligibleSegments.map(s =>
              <div key={s.segment_id}><dt>{humanize(s.name)}</dt><dd>{numbers.format(s.households)} households</dd></div>
            )}</dl>}
          </>}
        </section>
      </aside>

      <section className="ra-market" aria-labelledby="live-market-square">
        <div className="ra-stage-header"><div><h2 id="live-market-square">Market square</h2>
          <p>{sourceLabel}{scene && ' · Scenario ' + scene.scenario}{plan && ' · ' + planLabels[plan.role]}</p></div></div>
        <IllustratedMarket/>
        <div className="live-market-basis">
          <p>Measured {interval(report.measurement_window)}</p>
          {input && <p>{input.seeds.length} paired seeds</p>}
        </div>
        {onOpenDemo && <button className="ra-text-btn" onClick={onOpenDemo}>Explore the shopper demo</button>}
      </section>

      <aside aria-label="Decision and evaluation policy" className="ra-rail ra-right">
        <section className="ra-rail-section"><h2>Original plan decision</h2><h3>{humanize(report.decision.status)}</h3>
          <p>{report.decision.explanation}</p>
        </section>
        <section className="ra-rail-section"><h2>Selected plan outcomes</h2>
          <dl className="ra-facts">
            <div><dt>Chance of meeting target</dt><dd>{metricValue(metric('probability_hit_target'))}</dd></div>
            <div><dt>Median incremental buyers</dt><dd>{metricValue(buyers)}</dd></div>
          </dl>
          {buyers?.unavailable_reason && <p className="live-market-note">{humanize(buyers.unavailable_reason)} for incremental buyers.</p>}
          {evaluation && <dl className="ra-facts live-market-thresholds">
            <div><dt>Approved loss limit</dt><dd>{percentage.format(evaluation.max_loss_probability)}</dd></div>
            {evaluation.goal_target && <div><dt>{humanize(evaluation.goal_target.metric)} target</dt><dd>≥ {valueInUnit(evaluation.goal_target.minimum,evaluation.goal_target.unit)}</dd></div>}
          </dl>}
        </section>
      </aside>

      {plans.length > 0 && scene && <section className="ra-trend live-market-comparison"><h2>Plan comparison · {scene.scenario}</h2>
        <div className="live-market-table"><table><thead><tr><th scope="col">Plan</th><th scope="col">P10 profit</th><th scope="col">P50 profit</th><th scope="col">Loss risk</th></tr></thead>
          <tbody>{plans.map(p => {
            const metrics = p.scenario_results.find(s => s.scenario === scene.scenario)?.metrics
            const profit = metrics?.find(m => m.metric === 'incremental_profit')
            return <tr key={p.input.plan_id}><th scope="row">{planLabels[p.role]}</th>
              <td>{metricValue(profit,'p10')}</td><td>{metricValue(profit)}</td><td>{metricValue(metrics?.find(m => m.metric === 'probability_loss'))}</td>
            </tr>
          })}</tbody>
        </table></div>
      </section>}
    </div>

    <details className="ra-more"><summary>Arena insights</summary><div className="ra-insights-content live-market-insights">
      <section><h2>Cost evidence</h2>{Object.keys(costs).length > 0 ? <dl>{Object.entries(costs).map(([key,cost]) =>
        <div key={key}><dt>{humanize(key)}</dt><dd>{cost.value == null ? 'Unknown' : numbers.format(cost.value) + ' ' + (cost.unit ?? '').replaceAll('_',' ')} · {humanize(cost.status)}</dd>
          {cost.basis && <dd>{cost.basis}</dd>}{cost.source && <dd>Source · {humanize(cost.source)}</dd>}</div>
      )}</dl> : <p>Cost evidence unavailable.</p>}</section>
      <section><h2>Evaluation assumptions</h2>{evaluation?.assumptions?.length ? <ul>{evaluation.assumptions.map(a => <li key={a}>{a}</li>)}</ul> : <p>Assumptions unavailable.</p>}</section>
      <section><h2>Data versions</h2><dl>{Object.entries(versions).map(([key,value]) =>
        <div key={key}><dt>{humanize(key)}</dt><dd>{value ?? 'Unresolved'}</dd></div>)}</dl></section>
    </div></details>
  </div>
}
