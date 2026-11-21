import { useEffect, useRef, type ReactNode } from 'react'
import { WorkflowWires, type Connection } from './workflow-wires'
import './workflow-map.css'

type StageId = 'brief' | 'review' | 'setup' | 'simulation' | 'evidence' | 'decision'
type EvidenceRow = { label: string; value: string }
export type WorkflowStageEvidence = {
  summary: string
  stamp?: string
  facts?: EvidenceRow[]
  outputs?: EvidenceRow[]
  events?: EvidenceRow[]
  notes?: string[]
  quote?: string
}
export type WorkflowEvidence = Partial<Record<StageId, WorkflowStageEvidence>>
type WorkflowProps = {
  plan?: string
  scenario?: string
  comparisons: string[]
  seedCount?: number
  selectablePlans?: string[]
  onChoosePlan?: (label: string) => void
  onVerdict: () => void
  evidence?: WorkflowEvidence
} & (
  | { mode: 'demo'; day?: number; phase?: string; nextCheckpoint?: { label: string; day: number; onGo: () => void } }
  | { mode: 'live'; revision?: number; decision?: string }
)

function Fields({ rows }: { rows: EvidenceRow[] }) {
  return <dl className="wf-fields">{rows.map((row,i) => <div key={i}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
}

type StageProps = {
  node: string; title: string; data?: WorkflowStageEvidence; fallback: string; sourceLabel: string
  preview?: number; children?: ReactNode; summary?: string; stamp?: string
}
function StageNode({ node, title, data, fallback, sourceLabel, preview = 2, children, summary, stamp }: StageProps) {
  const facts = data?.facts ?? []
  const extra = facts.slice(preview)
  const text = summary ?? data?.summary ?? fallback
  const caption = stamp ?? data?.stamp
  return <article className="wf-node wf-stage" data-flow-node={node} aria-label={title}>
    <header><h4>{title}</h4>{caption && <small>{caption}</small>}</header>
    {text && <p className="wf-stage-summary">{text}</p>}
    {preview > 0 && facts.length > 0 && <Fields rows={facts.slice(0,preview)}/>}
    {(extra.length > 0 || data?.quote || !!data?.notes?.length) && <details className="wf-source">
      <summary>{sourceLabel}</summary>
      {extra.length > 0 && <Fields rows={extra}/>}
      {data?.quote && <blockquote>{data.quote}</blockquote>}
      {data?.notes?.map((note,i) => <p key={i}>{note}</p>)}
    </details>}
    {children}
  </article>
}

function RecordNode({ id, row, variant }: { id: string; row: EvidenceRow; variant?: 'event' | 'metric' | 'check' }) {
  return <article className={'wf-node wf-record wf-' + (variant ?? 'metric')} data-flow-node={id} aria-label={row.label}>
    <h5>{row.label}</h5><p>{row.value}</p>
  </article>
}

export function WorkflowMap(props: WorkflowProps) {
  const board = useRef<HTMLDivElement>(null)
  const verdict = useRef<HTMLButtonElement>(null)
  const jumping = useRef(false)
  const live = props.mode === 'live'
  const checkpoint = props.mode === 'demo' ? props.nextCheckpoint : undefined
  const current = live ? 'Evaluation complete' : props.day == null ? 'Market replay' : `Day ${props.day} of the replay`
  const seeds = props.seedCount == null ? undefined
    : `${props.seedCount.toLocaleString()} ${live ? 'paired' : 'simulation'} ${props.seedCount === 1 ? 'seed' : 'seeds'}`
  const evidence = props.evidence ?? {}
  const events = evidence.simulation?.events ?? []
  const outputs = evidence.simulation?.outputs ?? []
  const checks = evidence.evidence?.events ?? []
  const plans = props.comparisons
  const planIds = plans.length ? plans.map((_,i) => 'plan-' + i) : ['no-plans']
  const edges: Connection[] = [{from:'brief',to:'review'}, {from:'review',to:'setup'}]
  planIds.forEach((id,i) => {
    const emphasis = plans[i] != null && plans[i] === props.plan
    edges.push({from:'setup',to:id,kind:'branch',emphasis}, {from:id,to:'run',kind:'merge',emphasis})
  })
  let observed = 'run'
  events.forEach((_,i) => { const next = 'event-' + i; edges.push({from:observed,to:next}); observed = next })
  if (checkpoint) edges.push({from:observed,to:'next',kind:'next'})
  outputs.forEach((_,i) => edges.push({from:observed,to:'outcome-' + i,kind:'branch'}))
  edges.push({from:'run',to:'measurement',kind:'branch'}, {from:'measurement',to:'verdict',kind:'merge'})
  checks.forEach((_,i) => edges.push({from:'measurement',to:'check-' + i,kind:'side'}, {from:'check-' + i,to:'verdict',kind:'merge'}))

  useEffect(() => {
    if (jumping.current && !checkpoint) verdict.current?.focus()
    jumping.current = false
  }, [checkpoint?.day])

  return <section className="wf-map" aria-label="Campaign workflow">
    <h3 className="sr-only">Campaign workflow diagram</h3>
    <div className="wf-diagram" ref={board}>
      <WorkflowWires board={board} edges={edges}/>
      <section className="wf-rank" data-rank="input" aria-label="Campaign preparation">
        <StageNode node="brief" title="Campaign brief" data={evidence.brief} fallback="Original brief unavailable." sourceLabel="Brief details"/>
        <StageNode node="review" title="Human review" data={evidence.review}
          fallback={live && props.revision != null ? 'Revision ' + props.revision + ' approved.' : 'Approval details unavailable.'} sourceLabel="Review record"/>
        <StageNode node="setup" title="Run setup" data={evidence.setup} fallback="Detailed inputs unavailable." sourceLabel="Frozen inputs"/>
      </section>

      <section className="wf-rank wf-plans" data-rank="plans" aria-label="Plans evaluated for this scenario">
        {plans.map((label,i) => {
          const selected = label === props.plan
          const value = evidence.setup?.events?.find(row => row.label === label)?.value
          const selectable = props.onChoosePlan && props.selectablePlans?.includes(label)
          const body = <><small>{selected ? 'Selected plan' : selectable ? 'Select plan' : 'Comparison'}</small>
            <strong>{label}</strong>{value && <span>{value}</span>}</>
          return selectable
            ? <button type="button" className="wf-node wf-plan" key={i} data-flow-node={planIds[i]} aria-pressed={selected}
                onClick={() => props.onChoosePlan?.(label)}>{body}</button>
            : <article className="wf-node wf-plan" key={i} data-flow-node={planIds[i]} aria-label={label}>{body}</article>
        })}
        {!plans.length && <article className="wf-node wf-plan" data-flow-node="no-plans">Plan breakdown unavailable</article>}
      </section>

      <section className="wf-rank" data-rank="run" aria-label="Simulation and recorded observations">
        <StageNode node="run" title={live ? 'Paired simulation' : 'Market replay'} data={evidence.simulation}
          fallback="Detailed simulation observations unavailable." stamp={current} sourceLabel="Run details">
          <p className="wf-scope">{[props.scenario,props.mode === 'demo' ? props.phase : undefined,seeds].filter(Boolean).join(' · ')}</p>
        </StageNode>
        {events.map((row,i) => <RecordNode key={i} id={'event-' + i} row={row} variant="event"/>)}
        {checkpoint && <article className="wf-node wf-checkpoint" data-flow-node="next">
          <small>Next checkpoint</small><h5>{checkpoint.label}</h5>
          <button type="button" className="wf-action" onClick={() => {jumping.current=true; checkpoint.onGo()}}>Jump to day {checkpoint.day}</button>
        </article>}
      </section>

      <section className="wf-rank" data-rank="results" aria-label="Run outcomes and decision evidence">
        {outputs.map((row,i) => <RecordNode key={i} id={'outcome-' + i} row={row} variant="metric"/>)}
        <StageNode node="measurement" title="Measurement" data={evidence.evidence} fallback="Measurement evidence unavailable."
          sourceLabel="Measurement details"/>
        {checks.map((row,i) => <RecordNode key={i} id={'check-' + i} row={row} variant="check"/>)}
      </section>

      <section className="wf-rank" data-rank="decision" aria-label="Campaign decision">
        <StageNode node="verdict" title="Verdict" data={evidence.decision} fallback={live && props.decision ? 'Original plan · ' + props.decision : 'Decision details unavailable.'}
          sourceLabel="Decision evidence">
          <button type="button" ref={verdict} className="wf-action wf-open" onClick={props.onVerdict}>Open verdict</button>
        </StageNode>
      </section>
    </div>
  </section>
}
