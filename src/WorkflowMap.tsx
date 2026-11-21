import { useId } from 'react'
import './workflow-map.css'

type WorkflowProps = {
  plan?: string
  scenario?: string
  comparisons: string[]
  seedCount?: number
  selectablePlans?: string[]
  onChoosePlan?: (label: string) => void
  onVerdict: () => void
} & (
  | { mode: 'demo'; day?: number; phase?: string; nextCheckpoint?: { label: string; day: number; onGo: () => void } }
  | { mode: 'live'; revision?: number; decision?: string }
)

export function WorkflowMap(props: WorkflowProps) {
  const id = useId()
  const live = props.mode === 'live'
  const checkpoint = props.mode === 'demo' ? props.nextCheckpoint : undefined
  const comparisonCount = props.comparisons.length
  const current = live ? 'Evaluation complete' : props.day != null ? `Day ${props.day} of the replay` : 'Market replay'
  const seeds = props.seedCount == null ? undefined
    : `${props.seedCount.toLocaleString()} ${live ? 'paired' : 'simulation'} ${props.seedCount === 1 ? 'seed' : 'seeds'}`
  const context = [props.scenario, props.mode === 'demo' ? props.phase : undefined, seeds].filter(Boolean).join(' · ')

  return <section className="wf-map" aria-labelledby={id}>
    <h3 id={id}>Campaign workflow</h3>
    <ol className="wf-route">
      <li className="wf-source">
        <div className="wf-origin">
          <strong>Campaign brief</strong>
          <div className="wf-source-link" aria-hidden="true"/>
          <div className="wf-review">
            <strong>Plan review</strong>
            <span>{live ? (props.revision != null ? `Revision ${props.revision} approved` : 'Approved inputs') : 'Simulation inputs'}</span>
          </div>
        </div>
      </li>
      <li className="wf-comparisons">
        {comparisonCount > 0
          ? <ul aria-label="Plans evaluated for this scenario" className="wf-lanes">
              {props.comparisons.map((label, index) => {
                const selected = label === props.plan
                const interactive = props.onChoosePlan && props.selectablePlans?.includes(label)
                return <li className="wf-lane" key={index}>
                  {interactive
                    ? <button type="button" className="wf-plan" aria-pressed={selected} data-selected={selected} onClick={() => props.onChoosePlan?.(label)}>
                        <strong>{label}</strong><small>{selected ? 'Selected plan' : 'View plan'}</small>
                      </button>
                    : <div className="wf-plan" data-selected={selected}><strong>{label}</strong>{selected && <small>Selected plan</small>}</div>}
                </li>
              })}
            </ul>
          : <div className="wf-no-plans">Plan breakdown unavailable</div>}
      </li>
      <li className="wf-evaluation">
        <div className="wf-current">
          <span className="wf-signal" aria-hidden="true"/>
          <div>
            <small>{live ? 'Run status' : 'Replay position'}</small>
            <strong>{current}</strong>
            {context && <span>{context}</span>}
          </div>
        </div>
      </li>
      <li className="wf-next">
        <div className="wf-next-copy">
          <small>{checkpoint ? 'Next checkpoint' : 'Next step'}</small>
          <strong>{checkpoint ? checkpoint.label : 'Review the verdict'}</strong>
          {props.mode === 'live' && props.decision && <span>Original plan · {props.decision}</span>}
        </div>
        <button type="button" className="wf-action" onClick={checkpoint?.onGo ?? props.onVerdict}>
          {checkpoint ? `Jump to day ${checkpoint.day}` : 'Open verdict'}
        </button>
      </li>
    </ol>
  </section>
}
