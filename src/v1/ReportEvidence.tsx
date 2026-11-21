import { useEffect, useState, type ReactNode } from 'react'
import { formatResult } from '../verdict-values'
import { createV1Client, type BusinessEvaluation, type HistoricalComparison, type Report, type RunInput } from './client'
import { controls, humanize, toForm } from './planner'

type Evidence = BusinessEvaluation | HistoricalComparison | RunInput
type Props<T extends Evidence> = {
  title: string
  report: Report
  load: (id: string, signal: AbortSignal) => Promise<T>
  children: (data: T) => ReactNode
}

function EvidenceDisclosure<T extends Evidence>({ title, report, load, children }: Props<T>) {
  const [requested, setRequested] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!requested) return
    const controller = new AbortController()
    setError('')
    load(report.run_id, controller.signal).then(item => {
      if (controller.signal.aborted) return
      const revision = 'review' in item ? item.review.revision : item.revision
      const reviewId = 'review' in item ? item.review.review_id : 'review_id' in item ? item.review_id : undefined
      if (item.run_id !== report.run_id || item.approval_id !== report.approval_id || revision !== report.revision ||
          (reviewId !== undefined && reviewId !== report.review_id)) throw new Error('The evidence does not match this approved run.')
      setData(item)
    }).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'The evidence could not be loaded.')
    })
    return () => controller.abort()
  }, [report, load, requested, attempt])
  return <details className="verdict-disclosure verdict-run-evidence" onToggle={e => {
    if (e.currentTarget.open) setRequested(true)
  }}>
    <summary>{title}<span aria-hidden="true" className="disclosure-action"><span>Show</span><span>Hide</span></span></summary>
    <div>{error ? <><p role="status">{error}</p>
      <button type="button" className="button secondary" onClick={() => setAttempt(n => n + 1)}>Retry</button></>
      : data ? children(data) : <p role="status">Loading evidence…</p>}</div>
  </details>
}

function HistoricalCase({ data }: { data: HistoricalComparison }) {
  const ref = data.reference
  const reasons = {
    source_unavailable: 'The historical dataset was unavailable for this run.',
    snapshot_missing: 'This run predates stored historical evidence.',
    no_comparable_case: 'The evaluator found no comparable historical campaign.',
    prediction_missing: 'A comparable held-out prediction is unavailable.',
    incompatible_prediction: 'The prediction used a different case or measurement protocol.',
  }
  if (!ref) return <p>{data.reason ? reasons[data.reason] : 'Historical evidence unavailable.'}</p>
  const status = { reference_only: 'Historical observation', inside_range: 'Prediction inside the observed range',
    outside_range: 'Prediction outside the observed range', unavailable: 'Historical evidence unavailable' }
  return <><h3>{status[data.status]}</h3>
    <p>Complete Journey · campaign {ref.campaign_id} · {humanize(ref.category)}</p>
    <dl className="verdict-version-list">
      <div><dt>Control-adjusted category sales lift</dt><dd>{ref.observed_range.low} to {ref.observed_range.high} percentage points</dd></div>
      {data.prediction && <div><dt>Held-out prediction</dt><dd>{data.prediction.value} percentage points</dd></div>}
      <div><dt>Baseline weeks</dt><dd>{ref.baseline_weeks.first}–{ref.baseline_weeks.last}</dd></div>
      <div><dt>Campaign weeks</dt><dd>{ref.campaign_weeks.first}–{ref.campaign_weeks.last}</dd></div>
      <div><dt>Model fit cutoff</dt><dd>Week {ref.fit_through_week}</dd></div>
    </dl>
    {data.reason && <p>{reasons[data.reason]}</p>}
    <p>The range spans the mean and median control adjustments. It describes this historical category.</p>
    {ref.limitations.length > 0 && <details><summary>Case comparability</summary><ul>{ref.limitations.map(note => <li key={note}>{note}</li>)}</ul></details>}
  </>
}

function ApprovedInputs({ data }: { data: RunInput }) {
  const review = data.review
  const values = toForm(review.facts)
  return <><p>Approved revision {review.revision}{review.resolved_product && ' · ' + review.resolved_product.label}</p>
    <dl className="verdict-version-list">{controls.filter(field => values[field.key] != null && values[field.key] !== '').map(field => {
      let path = '/facts/' + field.key.replaceAll('.', '/')
      while (path.includes('/') && !(path in review.fact_origins)) path = path.slice(0, path.lastIndexOf('/'))
      const origin = review.fact_origins[path]
      return <div key={field.key}><dt>{field.label}</dt>
        <dd>{values[field.key]}{origin && ' · ' + humanize(origin)}</dd></div>
    })}</dl>
  </>
}

export function ReportEvidence({ report }: { report: Report }) {
  const [api] = useState(() => createV1Client(import.meta.env.VITE_API_BASE_URL))
  return <section key={report.run_id} aria-label="Run evidence">
    <EvidenceDisclosure title="Decision checks for your original plan" report={report} load={api.businessEvaluation}>
      {data => <>{data.checks_unavailable_reason && <p>{humanize(data.checks_unavailable_reason)}</p>}
        <dl className="verdict-version-list">{data.checks.map(check =>
          <div key={[check.scenario, check.metric, check.statistic].join('-')}>
            <dt>{humanize(check.metric)} · {check.scenario}{check.statistic === 'p50' ? ' · median' : ''}</dt>
            <dd>{check.condition === 'available' ? 'Estimate availability · ' : ''}{humanize(check.status)} · {check.observed === null ? 'Unavailable' : formatResult(check.observed, check.unit)}
              {check.threshold != null && ' · ' + humanize(check.condition) + ' ' + formatResult(check.threshold, check.unit)}
              {check.unavailable_reason && ' · ' + humanize(check.unavailable_reason)}</dd>
          </div>)}</dl>
        <p>Evaluation policy · {data.evaluation_policy}</p></>}
    </EvidenceDisclosure>
    <EvidenceDisclosure title="Historical comparison" report={report} load={api.historicalComparison}>
      {data => <HistoricalCase data={data}/>}
    </EvidenceDisclosure>
    <EvidenceDisclosure title="Approved inputs and sources" report={report} load={api.runInput}>
      {data => <ApprovedInputs data={data}/>}
    </EvidenceDisclosure>
  </section>
}
