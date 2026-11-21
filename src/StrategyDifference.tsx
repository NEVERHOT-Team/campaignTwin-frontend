import './strategy-difference.css'

export type StrategyDifferenceProps = {
  original: string
  alternative: string
  scenario?: string
  changes: { label: string; from?: string; to?: string; reason?: string }[]
  terms?: { label: string; value: string }[]
  outcomes: { label: string; original?: string; alternative?: string; difference?: string }[]
}

function BeforeAfter({ from, to }: { from?: string; to?: string }) {
  return <span className="sd-pair">
    <span>{from || 'Unavailable'}</span>
    <span aria-hidden="true" className="sd-arrow">→</span><span className="verdict-sr-only">to</span>
    <b>{to || 'Unavailable'}</b>
  </span>
}

export function StrategyDifference({ original, alternative, scenario, changes, terms = [], outcomes }: StrategyDifferenceProps) {
  const different = changes.filter(c => c.from && c.to && c.from !== c.to)
  const partial = changes.filter(c => !c.from || !c.to)
  const same = [...terms, ...changes.flatMap(c => c.from && c.from === c.to ? [{ label:c.label, value:c.from }] : [])]
  const measured = outcomes.filter(o => o.difference && o.original && o.alternative)
  const comparisonLabel = scenario ? 'Outcome change · '+scenario : 'Outcome change'
  return <details className="strategy-difference">
    <summary>
      <span className="sd-title"><strong>How the plans differ</strong>
        <span>{original} <span aria-hidden="true">→</span><span className="verdict-sr-only">compared with</span> {alternative}</span>
      </span>
      <span className="sd-toggle"><span>View details</span><span>Hide details</span></span>
      <span className="sd-preview">
        <span className="sd-block">
          <span className="sd-label">Strategy</span>
          {different.length ? different.slice(0,2).map((c,i) => <span key={i} className="sd-preview-row">
            <span>{c.label}</span><BeforeAfter from={c.from} to={c.to}/>
          </span>) : <span className="sd-placeholder">{partial.length || !same.length ? 'Change details unavailable.' : 'Compared terms are unchanged.'}</span>}
          {different.length > 2 && <span className="sd-more">+{different.length-2} more {different.length===3 ? 'change' : 'changes'}</span>}
        </span>
        <span className="sd-block">
          <span className="sd-label">{comparisonLabel}</span>
          {measured.length ? measured.slice(0,2).map((o,i) => <span key={i} className="sd-preview-row">
            <span>{o.label}</span><b>{o.difference}</b>
          </span>) : <span className="sd-placeholder">Paired outcomes unavailable.</span>}
        </span>
      </span>
    </summary>
    <div className="sd-detail">
      {(different.length > 0 || partial.length > 0) && <div className="sd-reasons">
        <h3>Changes and reasons</h3>
        <dl>{[...different, ...partial].map((c,i) => <div key={i}>
          <dt>{c.label}</dt><dd><BeforeAfter from={c.from} to={c.to}/></dd>
          {c.reason && <dd className="sd-reason">{c.reason}</dd>}
        </div>)}</dl>
      </div>}
      {outcomes.length > 0 && <div className="sd-comparisons"><h3>{scenario ? 'Outcomes in '+scenario : 'Reported outcomes'}</h3>
        <table><caption className="verdict-sr-only">Reported outcomes for the two plans</caption>
          <thead><tr><th scope="col">Outcome</th><th scope="col">{original}</th><th scope="col">{alternative}</th></tr></thead>
          <tbody>{outcomes.map((o,i) => <tr key={i}><th scope="row">{o.label}</th>
              <td>{o.original || 'Unavailable'}</td><td>{o.alternative || 'Unavailable'}</td></tr>)}</tbody>
        </table>
      </div>}
      {same.length > 0 && <div className="sd-unchanged"><h3>Unchanged terms</h3>
        <dl>{same.map((t,i) => <div key={i}><dt>{t.label}</dt><dd>{t.value}</dd></div>)}</dl>
      </div>}
      {!changes.length && !same.length && !outcomes.length && <p>No plan-level comparison was returned.</p>}
    </div>
  </details>
}
