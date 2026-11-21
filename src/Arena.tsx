import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { PixelArena } from './PixelArena'
import { ShopperPicker, shopperName } from './ShopperPicker'
import { brandColors, brandLabels, money, type Agent, type Brand, type Report, type Result, type Trace } from './model'
import './arena-page.css'

const TrendChart = lazy(() => import('./TrendChart'))
const emptyAgents: Agent[] = []
const groups: Brand[] = ['ours', 'rival', 'market', 'waiting']
const formatNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const rangeOf = (low: string, high: string) => `P10–P90 · ${low} to ${high}`

export function ScenarioControl({ report, scenario, change }: {
  report: Report; scenario: string; change: (id: string) => void
}) {
  const id = useId()
  return <div className="ra-scenario"><label htmlFor={id}>Rival scenario</label>
    <select id={id} value={scenario} onChange={e => change(e.target.value)}>
      {report.scenarios.map(s => <option key={s.scenario_id} value={s.scenario_id}>{s.label}</option>)}
    </select>
  </div>
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return <div><dt>{title}</dt><dd>{value}</dd><dd className="ra-metric-note">{note}</dd></div>
}

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ra-rail-section"><h2>{title}</h2>{children}</section>
}

type Props = {
  report: Report; result?: Result; baseline?: Result; scenario: string; changeScenario: (id: string) => void
  planId: string; changePlan: (id: string) => void; day: number; changeDay: (day: number) => void
  selected: string | null; select: (id: string | null) => void; trace: Trace | null; traceStatus: string
  light: boolean; onVerdict: () => void
}

export function Arena({ report, result, baseline, scenario, changeScenario, planId, changePlan, day, changeDay, selected, select, trace, traceStatus, onVerdict }: Props) {
  const [playing, setPlaying] = useState(false)
  const [ghost, setGhost] = useState(false)
  const [lens, setLens] = useState<Brand | 'changed' | null>(null)
  const inspector = useRef<HTMLHeadingElement>(null)
  const days = result?.daily
  const index = days?.findIndex(d => d.day === day) ?? -1
  const current = days?.[index]
  const previous = days?.[index - 1]?.agents ?? emptyAgents
  const shoppers = current?.agents ?? emptyAgents
  const agents = shoppers.length > 180 ? shoppers.slice(0, 180) : shoppers
  const baselineDay = baseline?.daily.find(d => d.day === day)
  const baselineAgents = baselineDay?.agents
  const from = days?.[0]?.day ?? report.window.start_day
  const to = days?.at(-1)?.day ?? report.window.follow_up_end_day
  const phase = day < report.window.start_day ? 'Pre-launch' : day <= report.window.end_day ? 'Campaign active' : 'Follow-up'
  const choice = report.plans.find(p => p.plan_id === planId)
  const availablePlans = report.plans.filter(p => p.role !== 'baseline')
  const scenarioInfo = report.scenarios.find(s => s.scenario_id === scenario)
  const moves = (result?.competitor_actions ?? []).filter(m => m.day <= day).sort((a,b) => b.day - a.day)
  const lastMove = moves[0]
  const profit = result?.metrics.incremental_profit_thb
  const buyers = result?.metrics.new_buyers
  const share = current?.brand_share_pct
  const baseShare = current?.baseline_share_pct ?? baselineDay?.brand_share_pct
  const lift = share != null && baseShare != null ? share - baseShare : null
  const before = new Map(previous.map(a => [a.shopper_id, a.brand]))
  const switchers = agents.filter(a => before.has(a.shopper_id) && before.get(a.shopper_id) !== a.brand)
  const byGroup = Object.fromEntries(groups.map(brand => [brand, agents.filter(a => a.brand === brand)])) as Record<Brand, Agent[]>
  const filtered = lens === 'changed' ? switchers : lens ? byGroup[lens] : agents
  const keepLens = filtered.some(a => a.shopper_id === selected)
  const pool = keepLens ? filtered : agents
  const poolName = !keepLens || !lens ? 'all shoppers' : lens === 'changed' ? 'changed preference' : brandLabels[lens]
  const activeTrace = trace?.shopper_id === selected ? trace : null
  const memory = activeTrace?.memory_by_day[String(day)]
  const events = activeTrace?.events.filter(e => e.day <= day) ?? []
  const basePerson = selected && baselineAgents?.find(a => a.shopper_id === selected)
  const checkpoints = [
    { label:'Baseline', at:from, show:from < report.window.start_day },
    { label:'Launch', at:report.window.start_day, show:true },
    { label:'Rival move', at:result?.competitor_actions[0]?.day, show:true },
    { label:'Promotion ends', at:report.window.end_day, show:true },
    { label:'Follow-up', at:to, show:to > report.window.end_day },
  ].filter(m => m.show && m.at != null && days?.some(d => d.day === m.at))

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      const next = days?.find(item => item.day > day)
      if (next) changeDay(next.day)
      else setPlaying(false)
    }, 1050)
    return () => clearTimeout(timer)
  }, [playing, day, days, changeDay])

  function jump(value: number) {
    setPlaying(false)
    changeDay(value)
  }

  function inspect(id: string, group: typeof lens) {
    setPlaying(false)
    setLens(group)
    select(id)
  }

  function focusInspector() {
    inspector.current?.focus()
  }

  return <div className="rehearsal-arena">
    <header className="ra-heading">
      <h1>Market arena</h1>
      <div className="ra-head-controls"><ScenarioControl report={report} scenario={scenario} change={id => { setPlaying(false); changeScenario(id) }}/>
        <button className="ra-btn ra-primary" onClick={onVerdict}>View verdict</button></div>
    </header>

    <dl className="ra-metrics" aria-label="Simulation highlights">
      <Metric title="Incremental profit" value={profit ? money(profit.p50) : 'Unavailable'}
        note={profit ? rangeOf(money(profit.p10), money(profit.p90)) : 'No estimate returned'}/>
      <Metric title="Incremental buyers" value={buyers ? formatNumber.format(buyers.p50) : 'Unavailable'}
        note={buyers ? rangeOf(formatNumber.format(buyers.p10), formatNumber.format(buyers.p90)) : 'No estimate returned'}/>
      <Metric title="Brand preference" value={share == null ? 'Unavailable' : formatNumber.format(share)+'%'}
        note={lift == null ? 'At the selected day' : `${lift > 0 ? '+' : ''}${formatNumber.format(lift)} pp vs no campaign`}/>
      <Metric title="Simulation day" value={String(day)} note={`${phase} · through day ${to}`}/>
    </dl>

    <div className="ra-layout">
      <aside aria-label="Plan and shopper inspector" className="ra-rail ra-left">
        <RailSection title="Campaign plan">
          <label className="sr-only" htmlFor="ra-plan">Plan on map</label>
          <select className="ra-plan" id="ra-plan" value={planId} onChange={e => { setPlaying(false); changePlan(e.target.value) }}>
            {availablePlans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.label}</option>)}
          </select>
          <dl className="ra-facts">{choice?.discount_pct != null && <div><dt>Voucher</dt><dd>{choice.discount_pct}% off</dd></div>}
            <div><dt>Window</dt><dd>Days {report.window.start_day}–{report.window.end_day}</dd></div>
          </dl>
        </RailSection>
        <RailSection title="Strategist">
          <p>{report.candidate?.summary ?? 'No Strategist proposal was returned for this run.'}</p>
        </RailSection>
        <section className="ra-rail-section ra-inspector">
          <h2 id="ra-inspector-title" ref={inspector} tabIndex={-1}>Shopper inspector</h2>
          {agents.length ? <ShopperPicker agents={agents} pool={pool} poolName={poolName} selected={selected} switchers={switchers}
            onChoose={id => inspect(id,lens)} onFind={id => inspect(id,null)} onClear={() => { setLens(null); select(null) }}
            onSwitchers={() => switchers[0] && inspect(switchers[0].shopper_id,'changed')}/> : <p>No shoppers were returned for this day.</p>}
          {selected && (traceStatus ? <p role="status">{traceStatus}</p> : activeTrace ? <div className="ra-trace">
            <h3>{activeTrace.segment_id}</h3>
            <dl className="ra-facts"><div><dt>Price sensitivity</dt><dd>{activeTrace.traits.price_sensitivity}</dd></div>
              <div><dt>Loyalty</dt><dd>{activeTrace.traits.loyalty}</dd></div></dl>
            <p>{activeTrace.explanation || 'This shopper has no recorded explanation.'}</p>
            <details><summary>Memory and events</summary><div className="ra-detail-copy">
              {basePerson && <p>No campaign · {brandLabels[basePerson.brand]}</p>}
              {memory && <dl className="ra-memory">{Object.entries(memory).map(([brand,v])=><div key={brand}><dt>{brand}</dt><dd>Awareness {v.awareness} · Attitude {v.attitude}</dd></div>)}</dl>}
              {events.length ? <ol>{events.map((e,i)=><li key={i}>Day {e.day} · {e.type} · {e.detail}</li>)}</ol> : <p>No events recorded through day {day}.</p>}
            </div></details>
          </div> : <p role="status">Shopper trace unavailable.</p>)}
        </section>
      </aside>

      <section className="ra-market" aria-label="Market and timeline">
        <div className="ra-stage-header">
          <div><h2>Market square</h2><p>{agents.length ? `${agents.length} simulated shoppers` : 'Shopper positions unavailable'}</p></div>
          <label className="ra-baseline"><input type="checkbox" checked={!!baselineAgents?.length && ghost}
            disabled={!baselineAgents?.length} onChange={e => setGhost(e.target.checked)}/>Baseline overlay</label>
        </div>
        <div className="ra-stage">
          <PixelArena agents={agents} ghosts={ghost ? baselineAgents : undefined} selected={selected} onSelect={id => inspect(id,null)} day={day} playing={playing}/>
          {!agents.length && <p className="ra-map-message">No shopper positions are available for this day.</p>}
        </div>
        <div className="ra-stage-caption">
          <span>{selected ? <button type="button" className="ra-text-btn" onClick={focusInspector}>Inspect {shopperName(selected)}</button> : 'Select a shopper on the map'}</span>
          <span>{ghost && baselineAgents?.length ? 'Outlines show the baseline' : 'Positions illustrate preference'}</span>
        </div>
        <div className="ra-playback">
          <button className="ra-btn ra-inverse" aria-label={playing ? 'Pause timeline' : 'Play timeline'} disabled={!days || days.length < 2}
            onClick={() => { if (day >= to) changeDay(from); setPlaying(!playing) }}>{playing ? 'Pause' : day >= to ? 'Replay' : 'Play'}</button>
          <div className="ra-scrub"><div><label htmlFor="ra-day">Timeline</label><span>Day {day} of {to}</span></div>
            <input id="ra-day" type="range" aria-label="Simulation day" min={from} max={to} value={day} disabled={!days || days.length < 2}
              onChange={e => { const wanted = Number(e.target.value); if(days?.length) jump(days.reduce((best,d) => Math.abs(d.day - wanted) < Math.abs(best - wanted) ? d.day : best,from)) }}/>
          </div>
        </div>
        <div className="ra-checkpoints" aria-label="Timeline checkpoints">{checkpoints.map(m=>
          <button type="button" aria-pressed={day===m.at} key={m.label} onClick={() => jump(m.at!)}>{m.label}</button>)}</div>
      </section>

      <aside className="ra-rail ra-right" aria-label="Rival activity and market mix">
        <RailSection title="Rival activity">
          <h3>{scenarioInfo?.label ?? scenario}</h3><p>{scenarioInfo?.description}</p>
          {lastMove ? <div className="ra-last-move"><small>Day {lastMove.day} · {lastMove.brand}</small>
            <h3>{lastMove.action}</h3><p>{lastMove.reason}</p>
          </div> : <p className="ra-quiet-event">No rival move through day {day}.</p>}
        </RailSection>
        <RailSection title="Shopper mix">
          <p>Preference on day {day}</p>
          <div className="ra-cohorts">{groups.map(brand => {
            const group = byGroup[brand]
            return <button key={brand} disabled={!group.length} className="ra-cohort" type="button" aria-describedby="ra-group-help"
              onClick={() => { inspect(group[0].shopper_id,brand); focusInspector() }}>
              <span>{brandLabels[brand]}</span><b>{group.length}</b>
              <i aria-hidden="true"><i style={{width:(agents.length ? group.length/agents.length*100 : 0)+'%',background:brandColors[brand]}}/></i>
            </button>
          })}</div>
          <p id="ra-group-help" className="ra-cohort-note">{shoppers.length>agents.length ? `${agents.length} of ${shoppers.length} shoppers shown.` : 'Choose a group to inspect a shopper.'}</p>
        </RailSection>
      </aside>

      <section className="ra-trend">
        <div className="ra-trend-header"><h2>Brand preference</h2><div className="ra-key" aria-label="Chart legend"><span>Plan</span><span>No campaign</span></div></div>
        {days?.some(d => d.brand_share_pct != null) ? <Suspense fallback={<p className="ra-chart-loading" role="status">Loading preference trend…</p>}>
          <TrendChart day={day} data={days} window={report.window}/>
        </Suspense> : <p>No preference trend was returned for this scenario.</p>}
      </section>
    </div>

    <details className="ra-more"><summary>Arena insights</summary><div className="ra-insights-content">
      <section><h2>Rival moves</h2>{moves.length ? <ol>{moves.map((m,i)=><li key={i}><strong>Day {m.day} · {m.brand}</strong><p>{m.action}. {m.reason}</p></li>)}</ol> : <p>No events through day {day}.</p>}</section>
      <section><h2>Plan evidence</h2>{result && <p>{result.seeds} simulation seeds · {scenarioInfo?.label ?? scenario}</p>}
        {result?.guardrails.map(g=><p key={g.name}>{g.name} · {g.pass ? 'Passed' : 'Failed'}</p>)}
        {report.assumptions.map(s=><p key={s}>{s}</p>)}</section>
      <section><h2>Strategist changes</h2>{report.candidate?.changes.length ? <ul>{report.candidate.changes.map(c=><li key={c.lever}><strong>{c.lever}</strong><p>{c.from} to {c.to}. {c.why}</p></li>)}</ul> : <p>No changes provided.</p>}</section>
    </div></details>
  </div>
}
