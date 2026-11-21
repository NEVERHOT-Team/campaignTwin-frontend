import { baht, count, formatResult, percent, percentagePoints, pointsComparison, profitComparison } from '../verdict-values'
import { ScenarioChoices } from '../ScenarioChoices'
import { ProfitRangeChart, type ProfitRow } from '../ProfitRangeChart'
import { humanize } from './planner'
import { ReportEvidence } from './ReportEvidence'
import type { Report } from './client'
import { resolveRunSelection, type RunSelection } from './run-selection'
import '../verdict.css'

type Scenario = Report['scenario_results'][number]
type Metric = Scenario['metrics'][number]
type Name = Metric['metric']
type Plan = NonNullable<Report['plan_results']>[number]
const planLabels = { original:'Your plan', conservative:'Smaller discount', baseline:'No campaign' }
const quantiles = ['p10','p50','p90'] as const
const evaluationTime = new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'UTC' })
const rangeMetrics: { id:Name; label:string }[] = [
  { id:'incremental_profit', label:'Incremental profit' },
  { id:'incremental_roas', label:'Incremental ROAS' },
  { id:'subsidy_leakage', label:'Subsidy leakage' },
  { id:'incremental_new_buyers', label:'Incremental new buyers' },
]
const unavailableReasons = {
  insufficient_sample:'Too few valid samples',
  missing_evidence:'Missing evaluation evidence',
  measurement_unsupported:'The evaluator does not measure this outcome',
  undefined_denominator:'No valid denominator for this metric',
}

const findMetric = (scope:Scenario|undefined, id:Name) => scope?.metrics.find(metric => metric.metric === id)
function metricRange(metric:Metric|undefined) {
  return metric?.status === 'available' && metric.value !== null && typeof metric.value === 'object' ? metric.value : null
}
function median(metric:Metric|undefined) {
  return metricRange(metric)?.p50 ?? null
}
function probability(metric:Metric|undefined) {
  return metric?.status === 'available' && typeof metric.value === 'number' ? metric.value : null
}
function unavailable(metric:Metric|undefined) {
  if (!metric) return 'No value returned for this scenario'
  return metric.unavailable_reason ? unavailableReasons[metric.unavailable_reason] : 'No estimate available'
}
function offerText(plan:Plan) {
  const discount = plan.input.offer?.discount
  if (!discount) return plan.role === 'baseline' ? 'No offer' : 'Offer unavailable'
  if (discount.unit === 'THB' && discount.value != null) {
    return formatResult(discount.value,'THB') + ' ' + (discount.kind === 'voucher' ? 'voucher' : 'off') + ' · ' + formatResult(plan.discount_pct,'pct') + ' of pack price'
  }
  return formatResult(plan.discount_pct,'pct') + ' discount'
}
function Probability({ metric, title, reference }: { metric?:Metric; title:string; reference?:Metric }) {
  const value = probability(metric)
  const source = probability(reference)
  return <div><dt>{title}</dt><dd>{value == null ? 'Unavailable' : percent.format(value)}</dd>
    {value == null ? <dd className="verdict-reason">{unavailable(metric)}</dd> : source != null &&
      <dd className="verdict-reason">{pointsComparison(value,source)}</dd>}
  </div>
}
function Gates({ plan, scope }: { plan?:Plan; scope?:Scenario }) {
  const policy = plan?.input.evaluation
  if (!policy) return null
  const loss = probability(findMetric(scope,'probability_loss'))
  const goal = policy.goal_target
  return <div className="verdict-live-gates">
    <p className="verdict-label">Original loss risk · {scope?.scenario ?? 'Unavailable'}</p>
    <h3>{loss == null ? 'Unavailable' : <>{percent.format(loss)} <small>of paired seeds</small></>}</h3>
    {loss != null ? <p>
      {loss === policy.max_loss_probability ? 'At the approved limit' : `${percentagePoints(loss - policy.max_loss_probability)} ${loss > policy.max_loss_probability ? 'above' : 'below'} the limit`} of {percent.format(policy.max_loss_probability)}.
    </p> : <p>Approved limit {percent.format(policy.max_loss_probability)}.</p>}
    {goal && <p>{humanize(goal.metric)} target ≥ {formatResult(goal.minimum,goal.unit)}.</p>}
  </div>
}

export function RunReport({ report, selection }: { report:Report; selection:RunSelection }) {
  const { plans, originalPlan, plan, results, scene: activeScope, choosePlan } = resolveRunSelection(report, selection)
  const scenario = activeScope?.scenario
  const getScope = (item: Plan) => item.scenario_results.find(s => s.scenario === scenario)
  const originalScope = report.scenario_results.find(s=>s.scenario === scenario) ?? (originalPlan && getScope(originalPlan))
  const originalMedian = median(findMetric(originalScope,'incremental_profit'))
  const comparison = plan?.role === 'conservative' ? originalScope : undefined
  const scopeLabel = scenario ? 'Scenario ' + scenario : 'Scenario unavailable'
  const profitRow = (id:string, label:string, scope?:Scenario): ProfitRow => {
    const metric = findMetric(scope,'incremental_profit')
    return { id, label, profit:metricRange(metric), reason:scope ? unavailable(metric) : 'Plan was not evaluated for this scenario' }
  }
  const chartRows = plans.length ? plans.map(item=>profitRow(item.input.plan_id,planLabels[item.role],getScope(item))) :
    [profitRow('original','Your plan',originalScope)]
  const input = plan?.input
  const policy = report.data_versions.evaluation_policy
  const evaluatedAt = new Date(report.evaluated_at)
  const evaluationStamp = Number.isNaN(evaluatedAt.valueOf()) ? report.evaluated_at : evaluationTime.format(evaluatedAt) + ' UTC'
  return <div className="campaign-verdict verdict-live">
    <header className="verdict-header"><div><h1>Campaign verdict</h1>
      <p>{policy?.startsWith('synthetic-') && 'Synthetic evaluation · '}Approved revision {report.revision} · Paired no-campaign comparison</p>
    </div></header>
    {scenario && <ScenarioChoices label="Evaluated scenario"
      options={results.map(({scenario:id})=>({id, label:policy === 'synthetic-tissue-v1' && id === 'S1' ? 'S1 · No rival action' : id}))}
      value={scenario} onChange={selection.setScenarioId}
      description={results.length === 1 ? 'One scenario was evaluated for ' + (plan ? 'this plan.' : 'this run.') : undefined}
    />}
    <div className="verdict-overview">
      <section className="verdict-decision" aria-labelledby="live-verdict-decision">
        <div><p className="verdict-label">Decision on your original plan</p>
          <h2 id="live-verdict-decision">{humanize(report.decision.status)}</h2>
          <p>{report.decision.explanation}</p></div>
        <Gates plan={originalPlan} scope={originalScope}/>
      </section>
      <ProfitRangeChart rows={chartRows} focusId={report.decision.status === 'insufficient_evidence' ? undefined : plan?.input.plan_id ?? 'original'}/>
    </div>

    <section aria-labelledby="live-compare-plans">
      <header className="verdict-comparison-heading"><h2 id="live-compare-plans">{plans.length ? 'Compare plans' : 'Scenario results'}</h2></header>
      {plans.length > 0 && <div className="verdict-plan-options" role="group" aria-label="Select a plan to inspect">{plans.map(p=>{
        const scope = getScope(p)
        const profit = median(findMetric(scope,'incremental_profit'))
        const active = p.input.plan_id === plan?.input.plan_id
        return <button key={p.input.plan_id} type="button" aria-pressed={active} onClick={()=>choosePlan(p.input.plan_id)}>
          <span className="verdict-option-heading"><strong>{planLabels[p.role]}</strong>{active && <small>Selected</small>}</span>
          <span>{offerText(p)}</span><b>{profit == null ? 'Unavailable' : baht.format(profit)}</b>
          <small>{scope ? 'Median incremental profit' : p.scenario_results[0] ? 'View results for ' + p.scenario_results[0].scenario : 'No evaluated scenarios'}</small>
          {p.role === 'conservative' && profit != null && originalMedian != null &&
            <span className="verdict-option-delta">{profitComparison(profit,originalMedian)}</span>}
        </button>
      })}</div>}
    </section>

    <section className="verdict-live-outcomes" aria-labelledby="live-verdict-scope">
      <h2 id="live-verdict-scope">{plan ? planLabels[plan.role] + ' · ' : ''}{scopeLabel}</h2>
      {input?.changes.map(c=><p key={c.field}>{c.reason}</p>)}
      <dl className="verdict-probabilities" aria-label="Probabilities across paired seeds">
        <Probability title="Chance of meeting target" metric={findMetric(activeScope,'probability_hit_target')} reference={findMetric(comparison,'probability_hit_target')}/>
        <Probability title="Probability of loss" metric={findMetric(activeScope,'probability_loss')} reference={findMetric(comparison,'probability_loss')}/>
      </dl>
      <div className="verdict-table-scroll" tabIndex={0} role="region" aria-label="Outcome percentiles">
        <table><caption>Modeled range across paired seeds</caption>
          <thead><tr><th scope="col">Outcome</th><th scope="col">P10</th><th scope="col">Median · P50</th><th scope="col">P90</th></tr></thead>
          <tbody>{rangeMetrics.map(({id,label})=>{
            const metric = findMetric(activeScope,id)
            const range = metricRange(metric)
            const ref = median(findMetric(comparison,id))
            return <tr key={id}><th scope="row">{label}{id === 'subsidy_leakage' && range && ref != null && <small className="verdict-table-detail">{pointsComparison(range.p50,ref)} at P50</small>}</th>
              {range && metric ? quantiles.map(q=><td key={q}>{formatResult(range[q],metric.unit)}</td>) :
                <td colSpan={3} className="verdict-table-unavailable">Unavailable<span>{unavailable(metric)}</span></td>}
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>
    <ReportEvidence report={report}/>
    <details className="verdict-disclosure verdict-run-evidence">
      <summary>Evaluation details<span aria-hidden="true" className="disclosure-action"><span>Show</span><span>Hide</span></span></summary>
      <div><p>Measurement window {report.measurement_window.start_date} to {report.measurement_window.end_date} (exclusive).
        {' '}Evaluated <time dateTime={report.evaluated_at}>{evaluationStamp}</time>.</p>
        {input && plan && <><h3>Evaluated inputs for {planLabels[plan.role].toLowerCase()}</h3>
          <p>{input.product.label} · {input.product.pack_label} · {humanize(input.product.channel)} · {input.seeds.length} paired seeds</p>
          <p>{offerText(plan)} · {baht.format(input.subsidy_budget)} subsidy budget</p>
          <p>Campaign window {input.campaign_window.start_date} to {input.campaign_window.end_date} (exclusive, {input.product.timezone}).</p>
          <dl className="verdict-version-list">{Object.entries(input.costs).map(([k,c])=><div key={k}>
            <dt>{k === 'cogs' ? 'Cost of goods sold' : humanize(k)}</dt><dd>{c.value == null ? 'Unknown' : count.format(c.value) + ' ' + (c.unit ?? '').replaceAll('_',' ')} · {humanize(c.status)}{c.source ? ' · '+humanize(c.source) : ''}{c.reason ? '. '+c.reason : ''}</dd>
          </div>)}</dl>
          {!!input.evaluation.assumptions?.length && <><h3>Evaluation assumptions</h3><ul>{input.evaluation.assumptions.map(a=><li key={a}>{a}</li>)}</ul></>}
        </>}
        {report.commentary && <p>{report.commentary}</p>}
        <h3>Data versions</h3><dl className="verdict-version-list">{Object.entries(report.data_versions).map(([key,v])=><div key={key}><dt>{humanize(key)}</dt><dd>{v ?? 'Unresolved'}</dd></div>)}</dl>
      </div>
    </details>
  </div>
}
