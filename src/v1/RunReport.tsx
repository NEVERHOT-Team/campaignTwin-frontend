import { useState } from 'react'
import type { Report } from './client'
import { humanize } from './planner'

const labels = { original: 'Your plan', conservative: 'Smaller discount', baseline: 'No campaign' }
const numbers = new Intl.NumberFormat('en', {maximumFractionDigits: 2})
const currency = new Intl.NumberFormat('en-TH', {style: 'currency', currency: 'THB', maximumFractionDigits: 2})
const percent = new Intl.NumberFormat('en', {style: 'percent', maximumFractionDigits: 2})
function display(value: number, unit: string) {
  if (unit === 'THB') return currency.format(value)
  if (unit === 'fraction') return percent.format(value)
  return numbers.format(value) + (unit === 'ratio' ? '×' : ' buyers')
}

export function RunReport({ report }: { report: Report }) {
  const [selected, setSelected] = useState('original')
  const plan = report.plan_results?.find(p => p.role === selected)
  const plans = report.plan_results ?? []
  const results = plan?.scenario_results ?? report.scenario_results
  return <section className="v1-report">
    <header className="v1-report-title"><h1>Campaign verdict</h1><p>Review {report.revision} · Paired no-campaign comparison</p></header>
    <section className="v1-decision"><h2>{humanize(report.decision.status)}</h2><p>{report.decision.explanation}</p></section>
    {plans.length > 0 && <section className="v1-results">
      <h2>Compare plans</h2>
      <div className="v1-comparisons">{plans.map(p => {
        const scenario = p.scenario_results[0]
        const profit = scenario?.metrics.find(m => m.metric === 'incremental_profit')
        return <button key={p.input.plan_id} type="button" aria-pressed={selected === p.role} onClick={() => setSelected(p.role)}>
          <strong>{labels[p.role]}</strong><span>{numbers.format(p.discount_pct)}% discount</span>
          <b>{profit?.value && typeof profit.value === 'object' ? display(profit.value.p50,profit.unit) : 'Unavailable'}</b>
          <small>{scenario?.scenario} median incremental profit</small></button>
      })}</div>
    </section>}
    {results.map(s => <section className="v1-results" key={s.scenario}><h2>{plan ? labels[plan.role] + ' · ' : ''}Scenario {s.scenario}</h2>
      {plan?.input.changes.map(c => <p key={c.field}>{c.reason}</p>)}
      <div className="table-scroll"><table><thead><tr><th>Metric</th><th>P10</th><th>P50</th><th>P90</th></tr></thead>
        <tbody>{s.metrics.map(m => <tr key={m.metric}><th scope="row">{humanize(m.metric)}</th>
          {m.value === null ? <td colSpan={3}>Unavailable · {humanize(m.unavailable_reason ?? 'unknown')}</td>
            : typeof m.value === 'number' ? <td colSpan={3}>{display(m.value,m.unit)} across paired seeds</td>
              : <><td>{display(m.value.p10,m.unit)}</td><td>{display(m.value.p50,m.unit)}</td><td>{display(m.value.p90,m.unit)}</td></>}
        </tr>)}</tbody></table></div></section>)}
    <details className="v1-evidence"><summary>Evaluation details</summary><p>{report.measurement_window.start_date} to {report.measurement_window.end_date} (exclusive) · Evaluated {report.evaluated_at}</p>
      {plan && <p>{plan.input.seeds.length} paired seeds · {plan.input.product.label} · {plan.input.product.pack_label} · {display(plan.input.subsidy_budget,'THB')} subsidy budget</p>}
      {plan?.input.evaluation.assumptions && <ul>{plan.input.evaluation.assumptions.map(a => <li key={a}>{a}</li>)}</ul>}
      {report.commentary && <p>{report.commentary}</p>}
      <dl>{Object.entries(report.data_versions).map(([key,v]) => <div key={key}><dt>{humanize(key)}</dt><dd>{v}</dd></div>)}</dl>
    </details>
  </section>
}
