import { useEffect, useRef, useState } from 'react'
import { marketBackdrop, marketHeight, marketWidth } from '../pixel-market-art'
import { ArenaViews, IsometricMarket } from '../ArenaViews'
import { WorkflowMap, type WorkflowEvidence } from '../WorkflowMap'
import { ScenarioChoices } from '../ScenarioChoices'
import { ProfitValue } from '../ProfitValue'
import { ArenaVerdictPrompt } from '../ArenaVerdictPrompt'
import { ProductGoods, catalogPhoto } from '../ProductGoods'
import { humanize } from './planner'
import { frozenOffer, labelsForReport } from './strategy-comparison'
import type { Report, Review } from './client'
import { resolveRunSelection, type RunSelection } from './run-selection'
import '../arena-page.css'
import './live-arena.css'

type Metric = Report['scenario_results'][number]['metrics'][number]
type Scene = Report['scenario_results'][number]
type PlanResult = NonNullable<Report['plan_results']>[number]
type Props = { report: Report; review?: Review | null; selection: RunSelection; onVerdict: () => void; onOpenDemo?: () => void }

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
function ResultMetric({ title, metric, profit = false, note }: { title: string; metric?: Metric; profit?: boolean; note?: string }) {
  let detail = metric?.unavailable_reason ? humanize(metric.unavailable_reason) : 'No estimate returned'
  if (metric && metric.status === 'available' && metric.value !== null) {
    detail = typeof metric.value === 'number'
      ? 'Across paired seeds'
      : 'P10–P90 · ' + metricValue(metric, 'p10') + ' to ' + metricValue(metric, 'p90')
  }
  const reported = metric?.status === 'available' ? metric.value : null
  const amount = typeof reported === 'number' ? reported : reported?.p50
  return <div><dt>{title}</dt><dd>{profit ? <ProfitValue amount={amount} formatted={metricValue(metric)}/> : metricValue(metric)}</dd>
    <dd className="ra-metric-note">{note ?? detail}</dd></div>
}
function IllustratedMarket() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (context) context.drawImage(marketBackdrop(), 0, 0)
  }, [])
  return <div className="ra-stage live-market-illustration">
    <canvas ref={canvas} width={marketWidth} height={marketHeight} role="img" aria-label="Illustrated market square with gardens and a fountain"/>
  </div>
}
function offerText(offer: PlanResult['input']['offer'] | undefined) {
  return offer === null ? 'No offer' : frozenOffer(offer) ?? 'Unresolved'
}

function stageFacts(rows: [string, string | undefined][]) {
  return rows.flatMap(([label,value]) => value === undefined ? [] : [{ label,value }])
}

function liveWorkflow(report: Report, review: Review | undefined, plan: PlanResult | undefined, scene: Scene | undefined, comparisons: PlanResult[], households: number | undefined): WorkflowEvidence {
  const planLabels = labelsForReport(report)
  const input = plan?.input
  const selected = plan ? planLabels[plan.role] : 'Reported campaign'
  const original = report.plan_results?.find(p => p.role === 'original')
  const originalScope = report.scenario_results.find(s => s.scenario === scene?.scenario) ?? original?.scenario_results.find(s => s.scenario === scene?.scenario)
  const originalPolicy = original?.input.evaluation ?? review?.evaluation
  const target = originalPolicy?.goal_target
  const origins = { planner:'Planner entry', planner_confirmed_extraction:'Confirmed by planner', data:'Backend data', derived:'Derived by backend', default:'Policy default' }
  function reviewed(field: string, value: string | undefined) {
    if (!value) return undefined
    const source = review?.fact_origins['/facts/' + field]
    return source ? value + ' · ' + origins[source] : value
  }
  function outcome(scope: Scene | undefined, id: Metric['metric'], quantile: 'p10'|'p50'|'p90' = 'p50') {
    const item = scope?.metrics.find(m => m.metric === id)
    return item?.unavailable_reason ? 'Unavailable · ' + humanize(item.unavailable_reason) : metricValue(item,quantile)
  }
  const product = original?.input.product ?? review?.resolved_product
  const productLabel = product && product.label + ' · ' + product.pack_label
  return {
    brief: {
      summary: review ? 'Planner intent saved in the approved review.' : 'The original brief is unavailable in this report.',
      stamp: review?.facts.objective && humanize(review.facts.objective),
      facts: stageFacts([
        ['Product requested',reviewed('product_hint',review?.facts.product_hint)],
        ['Pack requested',reviewed('pack_hint',review?.facts.pack_hint)],
        ['Audience',reviewed('audience_hint',review?.facts.audience_hint)],
        ['Objective',reviewed('objective',review?.facts.objective && humanize(review.facts.objective))],
        ['Requested budget',reviewed('budget_thb',review?.facts.budget_thb != null ? baht.format(review.facts.budget_thb) : undefined)],
      ]),
    },
    review: {
      summary: 'This run used approved revision ' + report.revision + '.',
      stamp: 'Revision ' + report.revision,
      facts: stageFacts([
        ['Verified listing',productLabel || undefined],
        ['Channel',reviewed('channel',product?.channel && humanize(product.channel))],
        ['Approved offer',original ? offerText(original.input.offer) : review?.resolved_offer ? offerText(review.resolved_offer) : undefined],
        ['Eligibility',reviewed('offer/eligibility',review?.facts.offer?.eligibility && humanize(review.facts.offer.eligibility))],
        ['Campaign window',original?.input.campaign_window ? interval(original.input.campaign_window) : undefined],
        ['Policy version',report.data_versions.evaluation_policy],
      ]),
    },
    setup: {
      summary: plan?.role === 'baseline' ? 'The paired no-campaign baseline supplies the comparison for each promotion.'
        : input ? selected + ' was evaluated against the paired no-campaign baseline.' : 'The report identifies a paired no-campaign comparison. Per-plan inputs are unavailable.',
      stamp: plan && selected,
      facts: stageFacts([
        ['Selected offer',input && offerText(input.offer)],
        ['Subsidy cap',input && baht.format(input.subsidy_budget)],
        [plan?.role === 'baseline' ? 'Comparison dates' : 'Active dates',input && interval(input.campaign_window)],
        ['Eligible orders',input?.offer?.eligible_order_scope],
        ['Funding',input?.offer && humanize(input.offer.funder) || undefined],
        ['Compared in ' + (scene?.scenario ?? 'this scenario'),comparisons.length ? comparisons.map(p => planLabels[p.role]).join(' · ') : undefined],
      ]),
      notes: input?.changes.map(change => change.reason),
    },
    simulation: {
      summary: scene ? selected + ' · ' + scene.scenario + ' · Results across paired simulations.' : 'This plan has no scenario results in the report.',
      stamp: input?.seeds.length ? input.seeds.length + ' paired seeds' : scene?.scenario,
      facts: stageFacts([
        ['Evaluation window',interval(report.measurement_window)],
        ['Households in reported audience segments',households == null ? undefined : numbers.format(households)],
        ['Paired seed IDs',input?.seeds.length ? input.seeds.join(', ') : undefined],
      ]),
      outputs: stageFacts([
        ['Median incremental profit',scene && outcome(scene,'incremental_profit')],
        ['P10 to P90 profit',scene?.metrics.some(m => m.metric === 'incremental_profit' && m.status === 'available')
          ? outcome(scene,'incremental_profit','p10') + ' to ' + outcome(scene,'incremental_profit','p90') : undefined],
        ['Loss probability',scene && outcome(scene,'probability_loss')],
        ['Median subsidy leakage',scene && outcome(scene,'subsidy_leakage')],
        ['Median incremental ROAS',scene && outcome(scene,'incremental_roas')],
      ]),
    },
    evidence: {
      summary: originalScope ? 'Outcomes for your original plan under ' + originalScope.scenario + ', alongside its approved limits.' : 'Original-plan outcomes are unavailable for this selected scenario.',
      stamp: originalScope?.scenario,
      facts: stageFacts([
        ['Original median profit',originalScope && outcome(originalScope,'incremental_profit')],
        ['Original loss probability',!originalPolicy && originalScope ? outcome(originalScope,'probability_loss') : undefined],
        ['Original median subsidy leakage',originalScope && outcome(originalScope,'subsidy_leakage')],
        ['Incremental buyers',originalScope && outcome(originalScope,'incremental_new_buyers')],
      ]),
      events: stageFacts([
        ['Original plan target',target ? humanize(target.metric) + ' ≥ ' + valueInUnit(target.minimum,target.unit)
          + (originalScope ? ' · chance of meeting target ' + outcome(originalScope,'probability_hit_target') : '') : undefined],
        ['Original loss limit',originalPolicy ? percentage.format(originalPolicy.max_loss_probability) + ' maximum'
          + (originalScope ? ' · reported risk ' + outcome(originalScope,'probability_loss') : '') : undefined],
      ]),
      notes: ['Open Verdict for the recorded decision checks and historical comparison.'],
    },
    decision: {
      summary: report.decision.explanation,
      stamp: humanize(report.decision.status),
      facts: [
        {label:'Applies to', value:'Your original plan'},
        {label:'Decision', value:humanize(report.decision.status)},
        {label:'Recorded reason', value:humanize(report.decision.reason_code)},
      ],
    },
  }
}

export default function LiveArena({ report, review, selection, onVerdict, onOpenDemo }: Props) {
  const planLabels = labelsForReport(report)
  const [view,setView] = useState<'isometric' | '2d' | 'flow'>('isometric')
  const { plans, plan, results, scene, choosePlan } = resolveRunSelection(report,selection)
  const metric = (id: Metric['metric']) => scene?.metrics.find(m => m.metric === id)
  const buyers = metric('incremental_new_buyers')
  // Older reports contain only scenario aggregates. The review can supply context for the exact approved revision.
  const matchedReview = review?.review_id === report.review_id && review.revision === report.revision ? review : undefined
  const input = plan?.input
  const product = input?.product ?? matchedReview?.resolved_product
  const photo = catalogPhoto(product)
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
  const labels = results.map(({ scenario }) => ({
    id: scenario,
    label: policy === 'synthetic-tissue-v1' && scenario === 'S1' ? 'S1 · No rival action' : scenario,
  }))
  const loss = metric('probability_loss')?.value
  const aboveLimit = evaluation && typeof loss === 'number' && loss > evaluation.max_loss_probability
  const eligibleHouseholds = eligibleSegments.reduce((sum,s) => sum+s.households,0)
  const comparedPlans = plans.filter(p => p.scenario_results.some(s => s.scenario === scene?.scenario))
  const comparedLabels = comparedPlans.map(p => planLabels[p.role])
  const engineId = plan?.role === 'original' || plan?.role === 'baseline'
    ? report.plans?.find(row => row.role === (plan.role === 'original' ? 'user' : 'baseline'))?.plan_id
    : report.evaluation_engine === 'arena' ? plan?.input.offer?.offer_id.replace(/^arena-/, '') : undefined
  const weekly = plan && scene
    ? report.weekly?.[plan.input.plan_id]?.[scene.scenario]
      ?? (engineId ? report.weekly?.[engineId]?.[scene.scenario] : undefined)
    : undefined


  return <div className="rehearsal-arena live-market-arena">
    <header className="ra-heading"><h1>Market arena</h1>
      <div className="live-arena-actions">
        {onOpenDemo && <button type="button" className="button secondary" onClick={onOpenDemo}>Open shopper replay</button>}
        <ArenaVerdictPrompt onVerdict={onVerdict}/>
      </div>
    </header>

    {scene && <ScenarioChoices options={labels} value={scene.scenario} onChange={selection.setScenarioId} label={results.length === 1 ? 'Evaluated scenario' : 'Rival scenario'}/>}
    <dl className="ra-metrics" aria-label="Evaluated scenario highlights">
      <ResultMetric title="Median incremental profit" metric={metric('incremental_profit')} profit/>
      <ResultMetric title="Median incremental ROAS" metric={metric('incremental_roas')}/>
      <ResultMetric title="Median subsidy leakage" metric={metric('subsidy_leakage')}/>
      <ResultMetric title="Probability of loss" metric={metric('probability_loss')} note={aboveLimit ? 'Above the ' + percentage.format(evaluation.max_loss_probability) + ' loss limit' : undefined}/>
    </dl>

    <div className="ra-layout">
      <aside aria-label="Plan inputs and audience" className="ra-rail ra-left">
        <section className="ra-rail-section live-rail-plan"><h2>Campaign plan</h2>
          {plan && <><label className="sr-only" htmlFor="live-arena-plan">Evaluated plan</label>
            <select value={plan.input.plan_id} id="live-arena-plan" className="ra-plan" onChange={event => choosePlan(event.target.value)}>
              {plans.map(p => <option key={p.input.plan_id} value={p.input.plan_id}>{planLabels[p.role]}</option>)}
            </select></>}
          {photo ? <ProductGoods photo={photo}/> : product && <p className="live-market-product">{product.label} · {product.pack_label}</p>}
          <dl className="ra-facts">
            {product && <div><dt>Channel</dt><dd>{humanize(product.channel)}</dd></div>}
            {offer !== undefined && <div><dt>Offer</dt><dd>{!input && offer === null ? 'Unresolved' : offerText(offer)}</dd></div>}
            {budget != null && <div><dt>Subsidy budget</dt><dd>{baht.format(budget)}</dd></div>}
            {window && <div><dt>Active dates</dt><dd>{interval(window)}</dd></div>}
          </dl>
          {!product && !window && budget == null && <p>Detailed plan inputs unavailable for this run.</p>}
          {input?.changes.map(change => <p key={change.field} className="live-market-change">{change.reason}</p>)}
        </section>
        <section className="ra-rail-section"><h2>Audience</h2>
          {selectedSegmentIds == null ? <p>Audience unavailable.</p> : <>
            <p>{selectedSegmentIds.length ? 'Targeted segments' : 'All eligible segments'}</p>
            {eligibleSegments.length > 0 ? <>
              <p className="live-market-reach">{numbers.format(eligibleHouseholds)} households in reported segments</p>
              <details className="live-rail-detail"><summary>{eligibleSegments.length} audience {eligibleSegments.length === 1 ? 'segment' : 'segments'}</summary>
                <ul className="live-audience-segments">{eligibleSegments.map(s => <li key={s.segment_id}>
                  <strong>{s.name === s.name.toLowerCase() ? humanize(s.name) : s.name}</strong>
                  <span>{numbers.format(s.households)} households · {percentage.format(s.weekly_purchase_probability)} weekly purchase probability</span>
                </li>)}</ul>
                <p className="live-market-note">These probabilities describe the source audience. Weekly nonbuyers include shoppers waiting for another promotion. The weekly outcomes below the map show the reported waiting counts when available.</p>
              </details></> : <p className="live-market-note">Segment counts unavailable.</p>}
          </>}
        </section>
      </aside>

      <section className="ra-market" aria-labelledby="live-market-square">
        <div className="ra-stage-header"><div><h2 id="live-market-square">{view === 'flow' ? 'Simulation workflow' : 'Market square'}</h2>
          <p>{sourceLabel}{plan && ' · ' + planLabels[plan.role]}</p></div></div>
        {view !== 'flow' && <div className="live-market-replay-note">
          <p>This campaign report includes weekly shopper counts. The separate sample replay shows animated shoppers.</p>
        </div>}
        <ArenaViews onViewChange={setView} twoD={<figure><IllustratedMarket/></figure>}
          isometric={<figure><IsometricMarket/></figure>}
          flow={<WorkflowMap mode="live" plan={plan && planLabels[plan.role]} scenario={scene?.scenario}
            evidence={liveWorkflow(report,matchedReview,plan,scene,comparedPlans,eligibleSegments.length ? eligibleHouseholds : undefined)}
            revision={report.revision} comparisons={comparedLabels} decision={humanize(report.decision.status)}
            seedCount={input?.seeds.length} selectablePlans={comparedLabels} onChoosePlan={label => {
              const choice = comparedPlans.find(p => planLabels[p.role] === label)
              if (choice) choosePlan(choice.input.plan_id)
            }} onVerdict={onVerdict}/>}/>
        {!!weekly?.length && <details className="live-rail-detail">
          <summary>Weekly shopper outcomes · {scene?.scenario}</summary>
          <div className="live-market-table" role="region" aria-label="Weekly shopper outcomes" tabIndex={0}>
            <table><thead><tr><th scope="col">Week</th><th scope="col">Buyers</th><th scope="col">From rival</th><th scope="col">Waiting</th></tr></thead>
              <tbody>{weekly.map(row=><tr key={row.week}><th scope="row">{row.week}</th><td>{numbers.format(row.buyers)}</td>
                <td>{numbers.format(row.from_rival)}</td><td>{numbers.format(row.waiting)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>}
        <div className="live-market-basis">
          <p>Evaluation window · {interval(report.measurement_window)}</p>
          {input && <p>{input.seeds.length} paired seeds</p>}
        </div>
      </section>

      <aside aria-label="Decision and evaluation policy" className="ra-rail ra-right">
        <section className="ra-rail-section live-decision"><h2>Original plan decision</h2><h3>{humanize(report.decision.status)}</h3>
          <p>{report.decision.explanation}</p>
        </section>
        <section className="ra-rail-section"><h2>Selected plan outcomes</h2>
          <dl className="ra-facts"><div><dt>Chance of meeting target</dt><dd>{metricValue(metric('probability_hit_target'))}</dd></div>
            {evaluation && <div><dt>Loss risk limit</dt><dd>{percentage.format(evaluation.max_loss_probability)}</dd></div>}
          </dl>
          <details className="live-rail-detail"><summary>Measurement details</summary>
            <dl className="ra-facts"><div><dt>Median incremental buyers</dt><dd>{metricValue(buyers)}</dd></div>
              {evaluation?.goal_target && <div><dt>{humanize(evaluation.goal_target.metric)} target</dt><dd>≥ {valueInUnit(evaluation.goal_target.minimum,evaluation.goal_target.unit)}</dd></div>}
            </dl>
            {buyers?.unavailable_reason && <p className="live-market-note">{humanize(buyers.unavailable_reason)} for incremental buyers.</p>}
          </details>
        </section>
      </aside>

      {comparedPlans.length > 0 && scene && <section className="ra-trend live-market-comparison"><h2>Plan comparison · {scene.scenario}</h2>
        <div className="live-market-table"><table><thead><tr><th scope="col">Plan</th><th scope="col">P10 profit</th><th scope="col">P50 profit</th><th scope="col">Loss risk</th></tr></thead>
          <tbody>{comparedPlans.map(p => {
            const metrics = p.scenario_results.find(s => s.scenario === scene.scenario)?.metrics
            const profit = metrics?.find(m => m.metric === 'incremental_profit')
            return <tr key={p.input.plan_id} data-selected={p.input.plan_id === plan?.input.plan_id}><th scope="row"><button type="button" aria-pressed={p.input.plan_id === plan?.input.plan_id} onClick={() => choosePlan(p.input.plan_id)}>{planLabels[p.role]}</button></th>
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
