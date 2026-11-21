import type { ReactNode } from 'react'
import { money, type Backtest, type Report, type Result } from './model'
import { ScenarioChoices } from './ScenarioChoices'
import { attainmentRate, formatResult, percent, pointsComparison, profitComparison } from './verdict-values'
import './verdict.css'

type VerdictProps = {
  report: Report
  scenario: string
  changeScenario: (id: string) => void
  history: Backtest | null
  historyStatus: string
  onArena: () => void
  onInput: () => void
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return <details className="verdict-disclosure">
    <summary>
      {title}
      <span aria-hidden="true" className="disclosure-action"><span>Show</span><span>Hide</span></span>
    </summary>
    <div>{children}</div>
  </details>
}

function PlanComparison({ plan, result, goalThb, recommended, reference }: {
  plan: Report['plans'][number]
  result?: Result
  goalThb: number
  recommended: boolean
  reference?: Result
}) {
  const profit = result?.metrics.incremental_profit_thb
  const roas = result?.metrics.roas
  const attitude = result?.metrics.brand_attitude_change_post
  const attitudeUnit = result?.metric_units?.brand_attitude_change_post
  const attainment = result?.goal_attainment
  const rate = attainmentRate(attainment)
  const refRate = attainmentRate(reference?.goal_attainment)
  const referenceProfit = reference?.metrics.incremental_profit_thb?.p50
  const repeat = result?.metrics.repeat_rate
  const reasons = result?.metric_unavailable_reasons
  const checks = result?.guardrails ?? []
  const failed = checks.filter(check => !check.pass).length
  return <article className="verdict-plan" data-recommended={recommended || undefined}>
    <header>
      <div><h3>{plan.label}</h3>{recommended && <small className="verdict-plan-choice">Recommended plan</small>}</div>
      {plan.discount_pct != null && <p>{plan.discount_pct}% voucher</p>}
    </header>
    <dl className="verdict-profit">
      <div className="median">
        <dt>Median incremental profit · P50</dt>
        <dd>{profit ? money(profit.p50) : 'Unavailable'}</dd>
        {!profit && reasons?.incremental_profit_thb && <dd className="verdict-missing">{reasons.incremental_profit_thb}</dd>}
      </div>
      {profit && referenceProfit != null && <div className="verdict-profit-delta"><dt className="verdict-sr-only">Change in median profit</dt>
        <dd>{profitComparison(profit.p50, referenceProfit)}</dd>
      </div>}
      <div><dt>Downside · P10</dt><dd>{profit ? money(profit.p10) : 'Unavailable'}</dd></div>
      <div><dt>Upside · P90</dt><dd>{profit ? money(profit.p90) : 'Unavailable'}</dd></div>
    </dl>
    <dl className="verdict-metrics">
      <div>
        <dt>Ad ROAS</dt>
        <dd>{roas ? roas.p50.toFixed(2) + '×' : 'Unavailable'}</dd>
        {!roas && result?.metric_unavailable_reasons?.roas && <dd className="verdict-reason">{result.metric_unavailable_reasons.roas}</dd>}
      </div>
      <div><dt>New buyers · P50</dt><dd>{result?.metrics.new_buyers?.p50 ?? 'Unavailable'}</dd>
        {!result?.metrics.new_buyers && reasons?.new_buyers && <dd className="verdict-reason">{reasons.new_buyers}</dd>}
      </div>
      <div><dt>Repeat purchase rate · P50</dt><dd>{repeat ? formatResult(repeat.p50, result?.metric_units?.repeat_rate ?? '· unit unspecified') : 'Unavailable'}</dd>
        {!repeat && reasons?.repeat_rate && <dd className="verdict-reason">{reasons.repeat_rate}</dd>}
      </div>
      <div><dt>Brand attitude change · P50</dt><dd>{attitude ? [attitude.p50.toFixed(1), attitudeUnit].filter(Boolean).join(' ') : 'Unavailable'}</dd>
        {!attitude && reasons?.brand_attitude_change_post && <dd className="verdict-reason">{reasons.brand_attitude_change_post}</dd>}
      </div>
      <div><dt>Samples meeting the {money(goalThb)} goal</dt><dd>
        {attainment && rate != null ? <>{percent.format(rate)} <small>({attainment.met_samples} / {attainment.valid_paired_samples})</small></> : 'Unavailable'}
      </dd>{rate != null && refRate != null && <dd className="verdict-reason">{pointsComparison(rate,refRate)}</dd>}
        {result && attainment && attainment.valid_paired_samples !== result.seeds && <dd className="verdict-reason">{attainment.valid_paired_samples} valid pairs reported across {result.seeds} simulated seeds.</dd>}
      </div>
    </dl>
    <Disclosure title="Guardrails">
      {checks.length > 0 && <p className="verdict-check-summary">{failed ? `${failed} of ${checks.length} failed` : `All ${checks.length} passed`}</p>}
      {result?.guardrails.length
        ? <dl className="verdict-metrics">{result.guardrails.map(guard => <div key={guard.name}><dt>{guard.name}</dt><dd>{guard.pass ? 'Pass' : 'Fail'}</dd></div>)}</dl>
        : <p>Guardrail results unavailable.</p>}
    </Disclosure>
  </article>
}

function HistoricalCheck({ history, historyStatus }: Pick<VerdictProps, 'history' | 'historyStatus'>) {
  if (historyStatus) return <p role="status">{historyStatus}</p>
  if (!history) return <p>Historical evidence unavailable.</p>
  const statusLabel = {
    complete: history.benchmark_outcome ?? 'Evaluation complete',
    insufficient: 'Insufficient evidence',
    failed: 'Evaluation failed',
    pending: 'Evaluation pending',
  }[history.status]
  return <>
    <h3>{statusLabel}</h3>
    <p>{[history.dataset, history.comparability].filter(Boolean).join(' · ')}</p>
    {history.gaps.map(gap => <p key={gap}>{gap}</p>)}
    {history.metrics.map(metric => <dl className="verdict-metrics" key={metric.label}>
      <div><dt>{metric.label} ({metric.unit})</dt><dd>Observed {metric.observed}</dd></div>
      <div><dt>Simulated</dt><dd>{metric.simulated}</dd></div>
      <div><dt>Naive benchmark</dt><dd>{metric.naive}</dd></div>
    </dl>)}
  </>
}

export function Verdict({ report, scenario, changeScenario, history, historyStatus, onArena, onInput }: VerdictProps) {
  const recommendation = report.integrity.status === 'passed' ? report.recommendation : null
  const plans = report.plans.filter(plan => plan.role !== 'baseline')
  const baseline = report.plans.find(plan => plan.role === 'baseline')
  const originalId = plans.find(plan => plan.role === 'original')?.plan_id
  const originalResult = report.results.find(r => r.plan_id === originalId && r.scenario_id === scenario)
  const recommended = plans.find(plan => plan.plan_id === recommendation?.plan_id)
  const decision = recommended?.label ?? (recommendation?.plan_id === null ? 'Hold the campaign' : 'No recommendation available')
  const resultFor = (planId: string, scenarioId: string) =>
    report.results.find(result => result.plan_id === planId && result.scenario_id === scenarioId)

  return <div className="campaign-verdict">
    <header className="verdict-header">
      <h1>Campaign verdict</h1>
      <div className="verdict-actions">
        <button type="button" onClick={onArena}>Back to arena</button>
        <button type="button" onClick={onInput}>Edit campaign</button>
      </div>
    </header>

    <section aria-labelledby="verdict-decision" className="verdict-decision">
      <div><p className="verdict-label">Recommendation</p>
        <h2 id="verdict-decision" data-emphasis={recommended ? 'positive' : undefined}>{decision}</h2>
        <p>{recommendation?.summary ?? report.integrity.reason ?? 'This run has insufficient evidence to recommend a plan.'}</p>
      </div>
      <div className="verdict-confidence"><p className="verdict-label">Confidence</p>
        <h3>{report.confidence.label}</h3>
        <p>{report.confidence.reason}</p>
      </div>
    </section>

    <section aria-labelledby="verdict-comparison">
      <header className="verdict-comparison-heading">
        <div><h2 id="verdict-comparison">Compare plans</h2><p>Incremental profit after costs, compared with no campaign.</p></div>
      </header>
      {report.scenarios.length > 0 && <ScenarioChoices
        options={report.scenarios.map(item => ({ id:item.scenario_id, label:item.label }))}
        value={scenario} onChange={changeScenario}
        description={report.scenarios.find(item => item.scenario_id === scenario)?.description}
      />}
      {plans.length > 0 ? <div className="verdict-plans">{plans.map(plan =>
        <PlanComparison key={plan.plan_id} plan={plan} result={resultFor(plan.plan_id, scenario)} goalThb={report.goal_thb} reference={plan.role === 'alternative' ? originalResult : undefined} recommended={recommended?.plan_id === plan.plan_id}/>
      )}</div> : <p>Campaign plans unavailable for this run.</p>}
    </section>

    <div className="verdict-evidence">
      <section aria-labelledby="verdict-downside">
        <h2 id="verdict-downside">Downside across scenarios</h2>
        <p>P10 incremental profit after costs</p>
        {report.scenarios.length > 0 && plans.length > 0
          ? <div className="verdict-table-scroll" tabIndex={0} role="region" aria-label="Scenario comparison">
            <table aria-labelledby="verdict-downside">
              <thead><tr><th scope="col">Plan</th>{report.scenarios.map(item => <th scope="col" key={item.scenario_id}>{item.label}</th>)}</tr></thead>
              <tbody>
                {plans.map(plan => <tr key={plan.plan_id}>
                  <th scope="row">{plan.label}</th>
                  {report.scenarios.map(item => {
                    const p10 = resultFor(plan.plan_id, item.scenario_id)?.metrics.incremental_profit_thb?.p10
                    return <td key={item.scenario_id}>{p10 != null ? money(p10) : 'Unavailable'}</td>
                  })}
                </tr>)}
                {baseline && <tr className="verdict-baseline"><th scope="row">{baseline.label}</th>
                  {report.scenarios.map(item => <td key={item.scenario_id}>{resultFor(baseline.plan_id, item.scenario_id) ? 'Baseline' : 'Unavailable'}</td>)}
                </tr>}
              </tbody>
            </table>
          </div>
          : <p>Scenario comparison unavailable.</p>}
        {report.candidate && report.candidate.changes.length > 0 && <Disclosure title="Why the Strategist changed the plan">
          <dl className="verdict-change-list">{report.candidate.changes.map(change => <div key={change.lever}>
            <dt>{change.lever}</dt><dd>{change.from} to {change.to}. {change.why}</dd>
          </div>)}</dl>
        </Disclosure>}
      </section>
      <section aria-labelledby="verdict-history">
        <h2 id="verdict-history">Historical check</h2>
        <HistoricalCheck history={history} historyStatus={historyStatus}/>
        <Disclosure title="Assumptions and integrity">
          <p>Simulation integrity {report.integrity.status}. {report.integrity.reason}</p>
          <p>Campaign days {report.window.start_day}–{report.window.end_day}. Follow-up through day {report.window.follow_up_end_day}.</p>
          {report.assumptions.length > 0 && <ul>{report.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul>}
        </Disclosure>
      </section>
    </div>
  </div>
}
