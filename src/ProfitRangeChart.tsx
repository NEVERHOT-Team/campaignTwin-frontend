import { useId, useState } from 'react'
import type { Range } from './model'
import { baht } from './verdict-values'

export type ProfitRow = {
  id: string
  label: string
  profit: Range | null | undefined
  reason?: string
}

function validRange(value: ProfitRow['profit']): value is Range {
  return !!value && [value.p10, value.p50, value.p90].every(Number.isFinite) &&
    value.p10 <= value.p50 && value.p50 <= value.p90
}

function profitAxis(values: Range[]) {
  const minimum = Math.min(0, ...values.map(v => v.p10))
  const maximum = Math.max(0, ...values.map(v => v.p90))
  if (minimum === maximum) return { ticks: [0], position: () => 50 }

  const interval = (maximum - minimum) / 4
  const magnitude = 10 ** Math.floor(Math.log10(interval))
  const step = ([1, 2, 2.5, 5, 10].find(n => n * magnitude >= interval) ?? 10) * magnitude
  const first = Math.floor(minimum / step)
  const last = Math.ceil(maximum / step)
  const ticks = Array.from({ length: last - first + 1 }, (_, i) => (i + first) * step)
  return {
    ticks,
    position: (value: number) => 100 * (value / step - first) / (last - first),
  }
}

const axisLabel = new Intl.NumberFormat('en', { notation:'compact', maximumSignificantDigits:3 })
const quantiles = ['p10','p50','p90'] as const
const noRange = (row: ProfitRow) => row.reason || 'Profit percentiles unavailable'

function medianTone(focusId:string|undefined, id:string, profit:Range|null) {
  if (focusId !== id || !profit || profit.p50 === 0) return undefined
  return profit.p50 > 0 ? 'positive' : 'negative'
}

export function ProfitRangeChart({ rows, focusId }: { rows:ProfitRow[]; focusId?:string }) {
  const id = useId()
  const [view, setView] = useState<'chart'|'table'>('chart')
  const ranges = rows.map(row => row.profit).filter(validRange)
  const { ticks, position } = profitAxis(ranges)
  return <figure className="verdict-range-chart" aria-labelledby={id}>
    <figcaption className="vr-chart-header">
      <div><h2 id={id}>Profit range by plan</h2><p>Incremental profit after costs, relative to no campaign.</p></div>
      {ranges.length > 0 && <div className="vr-view-switch" role="group" aria-label="Profit comparison view">
        <button type="button" aria-pressed={view === 'chart'} onClick={()=>setView('chart')}>Chart</button>
        <button type="button" aria-pressed={view === 'table'} onClick={()=>setView('table')}>Table</button>
      </div>}
    </figcaption>
    {!ranges.length ? <div className="vr-empty">
      <p>No profit range is available for this scenario.</p>
      {rows.map(row => <p key={row.id}><strong>{row.label}</strong> · {noRange(row)}</p>)}
    </div> : view === 'table' ? <div className="verdict-table-scroll" tabIndex={0} role="region" aria-label="Profit percentile table">
      <table aria-label="Incremental profit by plan in Thai baht">
        <thead><tr><th scope="col">Plan</th><th scope="col">P10</th><th scope="col">Median · P50</th><th scope="col">P90</th></tr></thead>
        <tbody>{rows.map(row => {
          const profit = validRange(row.profit) ? row.profit : null
          return <tr key={row.id}><th scope="row">{row.label}</th>
            {profit ? quantiles.map(q=><td key={q} data-emphasis={q === 'p50' ? medianTone(focusId,row.id,profit) : undefined}>{baht.format(profit[q])}</td>) :
            <td colSpan={3} className="vr-table-missing">{noRange(row)}</td>}
          </tr>
        })}</tbody>
      </table>
    </div> : <>
      <div className="vr-plot-key" aria-hidden="true"><span><i className="vr-key-interval"/>P10–P90</span><span><i className="vr-key-median"/>Median</span></div>
      <ul className="vr-plot">
        {rows.map(row=>{
          const value = validRange(row.profit) ? row.profit : null
          return <li className="vr-plot-row" key={row.id}>
            <span className="vr-plan-label">{row.label}</span>
            <div className="vr-track" aria-hidden="true">
              {ticks.map(t=><i key={t} className="vr-gridline" data-zero={t === 0 || undefined} style={{left:position(t)+'%'}}/>)}
              {value && <>
                <span className="vr-interval" style={{left:position(value.p10)+'%', width:(position(value.p90)-position(value.p10))+'%'}}/>
                <i className="vr-point" style={{left:position(value.p50)+'%'}}/>
              </>}
            </div>
            {value ? <><span className="vr-median-value" data-emphasis={medianTone(focusId,row.id,value)}><span className="verdict-sr-only">Median </span>{baht.format(value.p50)}</span>
              <span className="verdict-sr-only">P10 {baht.format(value.p10)}. P90 {baht.format(value.p90)}.</span></> :
              <span className="vr-no-value">Unavailable<span className="verdict-sr-only">. {noRange(row)}</span></span>}
          </li>
        })}
      </ul>
      <div className="vr-axis" aria-hidden="true"><div className="vr-axis-scale">
        {ticks.map((t,i)=><span key={t} data-edge={ticks.length > 1 ? (i === 0 ? 'first' : i === ticks.length-1 ? 'last' : undefined) : undefined} style={{left:position(t)+'%'}}>{axisLabel.format(t)}</span>)}
      </div><span className="vr-axis-unit">THB</span></div>
    </>}
  </figure>
}
