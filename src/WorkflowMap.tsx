import { useId, useRef, useState, type KeyboardEvent } from 'react'
import './workflow-map.css'

type StageId = 'brief' | 'review' | 'setup' | 'simulation' | 'evidence' | 'decision'
type EvidenceRow = { label: string; value: string }
export type WorkflowStageEvidence = {
  summary: string
  stamp?: string
  facts?: EvidenceRow[]
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

function PlanBranches({ comparisons, plan, selectablePlans, onChoosePlan }: WorkflowProps) {
  if (!comparisons.length) return <p className="wf-unavailable">Plan breakdown unavailable</p>
  return <ul aria-label="Plans evaluated for this scenario" className="wf-lanes">
    {comparisons.map((label, i) => {
      const selected = label === plan
      const interactive = onChoosePlan && selectablePlans?.includes(label)
      return <li className="wf-lane" key={i}>
        {interactive
          ? <button type="button" className="wf-plan" aria-pressed={selected} data-selected={selected} onClick={() => onChoosePlan(label)}>
              <strong>{label}</strong><small>{selected ? 'Selected plan' : 'View plan'}</small>
            </button>
          : <div className="wf-plan" data-selected={selected}><strong>{label}</strong>{selected && <small>Selected plan</small>}</div>}
      </li>
    })}
  </ul>
}

function Facts({ rows }: { rows: EvidenceRow[] }) {
  return <dl className="wf-facts">{rows.map(({ label, value }, i) =>
    <div key={i}><dt>{label}</dt><dd>{value}</dd></div>
  )}</dl>
}

function StageDetails({ evidence, stage }: { evidence: WorkflowStageEvidence; stage: StageId }) {
  const { summary, facts = [], notes = [], events = [], quote } = evidence
  const eventTitle = stage === 'simulation' ? 'Recorded events' : stage === 'setup' ? 'Compared plans' : stage === 'evidence' ? 'Evaluation checks' : 'Supporting records'
  return <>
    <p className="wf-summary">{summary}</p>
    {quote && <blockquote className="wf-quote">{quote}</blockquote>}
    {facts.length > 0 && <Facts rows={facts.slice(0, 4)}/>}
    {facts.length > 4 && <details className="wf-more-facts">
      <summary>{facts.length - 4} more {facts.length === 5 ? 'field' : 'fields'}</summary><Facts rows={facts.slice(4)}/>
    </details>}
    {events.length > 0 && <div className="wf-records">
      <h5>{eventTitle}</h5>
      {stage === 'simulation' ? <ol className="wf-history" aria-label={eventTitle}>
        {events.map(({ label, value }, i) => <li key={i}><strong>{label}</strong><span>{value}</span></li>)}
      </ol> : <Facts rows={events}/>}
    </div>}
    {notes.length > 0 && <ul className="wf-notes" aria-label="Source notes">{notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}
  </>
}

export function WorkflowMap(props: WorkflowProps) {
  const id = useId()
  const [inspected, setInspected] = useState<StageId>('simulation')
  const stagesRef = useRef<(HTMLButtonElement | null)[]>([])
  const live = props.mode === 'live'
  const checkpoint = props.mode === 'demo' ? props.nextCheckpoint : undefined
  const current = live ? 'Evaluation complete' : props.day != null ? `Day ${props.day} of the replay` : 'Market replay'
  const seeds = props.seedCount == null ? undefined
    : `${props.seedCount.toLocaleString()} ${live ? 'paired' : 'simulation'} ${props.seedCount === 1 ? 'seed' : 'seeds'}`
  const context = [props.scenario, props.mode === 'demo' ? props.phase : undefined, seeds].filter(Boolean).join(' · ')
  const stages: { id: StageId; label: string; fallback: string }[] = [
    { id:'brief', label:'Campaign brief', fallback:'The original brief is unavailable in this report.' },
    { id:'review', label:'Human review', fallback:props.mode === 'live' && props.revision != null ? `Revision ${props.revision} approved.` : 'Approval details are unavailable in this report.' },
    { id:'setup', label:'Run setup', fallback:props.plan && props.scenario ? `${props.plan} is selected for ${props.scenario}.` : 'Detailed plan inputs are unavailable.' },
    { id:'simulation', label:live ? 'Paired simulation' : 'Market replay', fallback:live ? 'The evaluated run is available for inspection.' : 'The timeline shows the recorded simulation days.' },
    { id:'evidence', label:'Measurement', fallback:'Detailed measurement evidence is unavailable in this workflow.' },
    { id:'decision', label:'Verdict', fallback:props.mode === 'live' && props.decision ? `Original plan · ${props.decision}` : 'Open the verdict to review the available decision evidence.' },
  ]

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowDown': case 'ArrowRight': next = (index + 1) % stages.length; break
      case 'ArrowUp': case 'ArrowLeft': next = (index - 1 + stages.length) % stages.length; break
      case 'Home': next = 0; break
      case 'End': next = stages.length - 1; break
      default: return
    }
    event.preventDefault()
    setInspected(stages[next].id)
    stagesRef.current[next]?.focus()
  }

  return <section className="wf-map" aria-label="Campaign workflow">
    <header className="wf-overview">
      <div><span className="wf-kicker">{live ? 'Run status' : 'Replay position'}</span><h3>{current}</h3></div>
      {context && <p>{context}</p>}
    </header>

    <div className="wf-explorer">
      <div className="wf-stage-nav" role="tablist" aria-label="Workflow stages" aria-orientation="vertical">
        {stages.map((stage, index) => <button key={stage.id} type="button" role="tab" id={id+'-stage-'+stage.id}
          ref={node => { stagesRef.current[index] = node }} aria-controls={id+'-details-'+stage.id}
          aria-selected={inspected === stage.id} tabIndex={inspected === stage.id ? 0 : -1}
          onClick={() => setInspected(stage.id)} onKeyDown={e => navigate(e, index)}>
          <span className="wf-marker" aria-hidden="true">{index + 1}</span>
          <span className="wf-stage-label"><strong>{stage.label}</strong>{props.evidence?.[stage.id]?.stamp && <small>{props.evidence[stage.id]?.stamp}</small>}</span>
        </button>)}
      </div>

      <div className="wf-inspector">
        {stages.map((stage, index) => <section key={stage.id} className="wf-stage-detail" role="tabpanel"
          id={id+'-details-'+stage.id} aria-labelledby={id+'-stage-'+stage.id} hidden={inspected !== stage.id}
          tabIndex={inspected === stage.id ? 0 : -1}>
          {inspected === stage.id && <>
            <span className="wf-kicker">Stage {index + 1} of {stages.length}</span>
            <h4>{stage.label}</h4>
            <StageDetails stage={stage.id} evidence={props.evidence?.[stage.id] ?? {summary:stage.fallback}}/>
          </>}
        </section>)}
      </div>
    </div>

    <section className="wf-comparison" aria-label="Comparison plans">
      <h4>Plans in this scenario</h4>
      <PlanBranches {...props}/>
    </section>

    <div className="wf-next">
      <div className="wf-next-copy"><small>{checkpoint ? 'Next checkpoint' : 'Next step'}</small>
        <strong>{checkpoint ? checkpoint.label : 'Review the verdict'}</strong>
        {props.mode === 'live' && props.decision && <span>Original plan · {props.decision}</span>}
      </div>
      <button type="button" className="wf-action" onClick={checkpoint?.onGo ?? props.onVerdict}>
        {checkpoint ? `Jump to day ${checkpoint.day}` : 'Open verdict'}
      </button>
    </div>
  </section>
}
