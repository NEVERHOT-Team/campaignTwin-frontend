import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArenaViews, IsometricMarket } from './ArenaViews'
import { WorkflowMap } from './WorkflowMap'
import { replayWorkflowEvidence } from './replay-workflow'
import { ScenarioChoices } from './ScenarioChoices'
import { ProfitValue } from './ProfitValue'
import { PixelArena } from './PixelArena'
import { DayScrubber } from './DayScrubber'
import { ShopperPicker, shopperName } from './ShopperPicker'
import { money, type Agent, type Day, type Report, type Result, type Trace } from './model'
import { preferredBrand, resolveBrandGroups, summarizePurchases } from './shopper-groups'
import { purchaseLabel, wouldBuyLabel } from './shopper-observation'
import { uniqueShoppers } from './shopper-snapshot'
import './arena-page.css'

const TrendChart = lazy(() => import('./TrendChart'))
const emptyAgents: Agent[] = []
function normalizedDays(result?: Result) {
  return result?.daily.map(frame => frame.agents ? { ...frame, agents:uniqueShoppers(frame.agents) } : frame)
}
type ShopperLens = { kind: 'purchased'; groupId: string } | { kind: 'no_purchase' | 'waiting' | 'unknown' | 'unknown_brand' | 'changed' }
type ShopperRow = { key: string; label: string; color?: string; members: Agent[]; lens: ShopperLens }
const formatNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
class TrendBoundary extends Component<{ days: Day[]; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed:true } }
  render() {
    if (!this.state.failed) return this.props.children
    const percentage = (n:number | null) => n == null ? 'Unavailable' : formatNumber.format(n)+'%'
    return <details className="ra-series-fallback"><summary>Chart unavailable · view daily values</summary>
      <table><thead><tr><th>Day</th><th>Plan</th><th>No campaign</th></tr></thead><tbody>
        {this.props.days.map(d => <tr key={d.day}><th scope="row">{d.day}</th>
          <td>{percentage(d.brand_share_pct)}</td><td>{percentage(d.baseline_share_pct)}</td></tr>)}
      </tbody></table>
    </details>
  }
}

function RangeNote({ low, high, currency = false }: { low: number; high: number; currency?: boolean }) {
  const fmt = currency ? money : (n: number) => formatNumber.format(n)
  return <>P10–P90 · {fmt(low)} to {fmt(high)}</>
}

function Metric({ title, value, note }: { title: string; value: ReactNode; note: ReactNode }) {
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
  const [view, setView] = useState<'isometric' | '2d' | 'flow'>('isometric')
  const [lens, setLens] = useState<ShopperLens | null>(null)
  const inspector = useRef<HTMLHeadingElement>(null)
  const days = useMemo(() => normalizedDays(result), [result])
  const baselineDays = useMemo(() => normalizedDays(baseline), [baseline])
  const index = days?.findIndex(d => d.day === day) ?? -1
  const current = days?.[index]
  const previous = days?.[index - 1]?.agents ?? emptyAgents
  const agents = current?.agents ?? emptyAgents
  const groups = useMemo(() => {
    const observed = [...days ?? [],...baselineDays ?? []].flatMap(frame => frame.agents ?? [])
    return resolveBrandGroups(report.brand_groups, observed)
  }, [report.brand_groups, days, baselineDays])
  const baselineDay = baselineDays?.find(d => d.day === day)
  const baselineAgents = baselineDay?.agents
  const canOverlay = !!agents.length && !!baselineAgents?.length
  const series = useMemo(() => {
    const byDay = new Map(baselineDays?.map(frame => [frame.day, frame.brand_share_pct]))
    return days?.map(frame => ({ ...frame, baseline_share_pct: frame.baseline_share_pct ?? byDay.get(frame.day) ?? null }))
  }, [days, baselineDays])
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
  const before = new Map(previous.map(a => [a.shopper_id, preferredBrand(a, groups)]))
  const switchers = agents.filter(a => {
    const oldBrand = before.get(a.shopper_id), newBrand = preferredBrand(a, groups)
    return oldBrand != null && newBrand != null && oldBrand !== newBrand
  })
  const purchases = summarizePurchases(agents)
  const purchaseRows: ShopperRow[] = groups.map(group => ({
    key: 'brand/' + group.id, label: group.label, color: group.color, lens: { kind: 'purchased', groupId: group.id },
    members: agents.filter(a => a.purchase === 'bought' && preferredBrand(a, groups) === group.id),
  }))
  const unbranded = agents.filter(a => a.purchase === 'bought' && preferredBrand(a, groups) == null)
  if (unbranded.length) purchaseRows.push({ key:'unknown-brand', label:'Brand unavailable', members:unbranded, lens:{kind:'unknown_brand'} })
  const noPurchaseRow: ShopperRow = { key:'no-purchase', label:'No purchase', members:agents.filter(a => a.purchase === 'no_purchase'), lens:{kind:'no_purchase'} }
  const waitingRow: ShopperRow = { key:'waiting-subset', label:'Waiting for a promotion', members:noPurchaseRow.members.filter(a => a.waiting === true), lens:{kind:'waiting'} }
  const unknownRow: ShopperRow = { key:'unknown', label:'Outcome unavailable', members:agents.filter(a => a.purchase !== 'bought' && a.purchase !== 'no_purchase'), lens:{kind:'unknown'} }
  const rows = [...purchaseRows, noPurchaseRow, waitingRow, unknownRow]
  const selectedRow = lens?.kind === 'purchased'
    ? purchaseRows.find(row => row.lens.kind === 'purchased' && row.lens.groupId === lens.groupId)
    : rows.find(row => row.lens.kind === lens?.kind)
  const filtered = lens?.kind === 'changed' ? switchers : selectedRow?.members
  const keepLens = filtered?.some(a => a.shopper_id === selected)
  const pool = keepLens && filtered ? filtered : agents
  const poolName = keepLens ? (lens?.kind === 'changed' ? 'changed would-be brand' : selectedRow?.label ?? 'all shoppers') : 'all shoppers'
  const selectedShopper = agents.find(a => a.shopper_id === selected)
  const activeTrace = trace?.shopper_id === selected ? trace : null
  const memory = activeTrace?.memory_by_day[String(day)]
  const events = activeTrace?.events.filter(e => e.day <= day) ?? []
  const basePerson = selected && baselineAgents?.find(a => a.shopper_id === selected)
  const rivalDays = [...new Set(result?.competitor_actions.map(action => action.day))].sort((a,b) => a-b)
  const checkpoints = [
    { label:'Baseline', at:from, show:from < report.window.start_day },
    { label:'Launch', at:report.window.start_day, show:true },
    ...rivalDays.map(at => ({ label:rivalDays.length === 1 ? 'Rival move' : `Rival move · D${at}`, at, show:true })),
    { label:'Promotion ends', at:report.window.end_day, show:true },
    { label:'Follow-up ends', at:to, show:to > report.window.end_day },
  ].filter(m => m.show && days?.some(d => d.day === m.at)).sort((a,b) => a.at-b.at)
  const nextCheckpoint = checkpoints.find(m => m.at > day)
  const comparisons = report.plans.filter(p => report.results.some(row => row.plan_id === p.plan_id && row.scenario_id === scenario)).map(p => p.label)
  const firstChange = report.candidate?.changes[0]

  useEffect(() => {
    if (!playing) return
    const next = days?.find(item => item.day > day)
    if (!next) { setPlaying(false); return }
    const timer = window.setTimeout(() => changeDay(next.day),1050)
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

  const mapProps = { agents, groups, ghosts: canOverlay && ghost ? baselineAgents : undefined, selected, onSelect: (id:string) => inspect(id,null), day, playing }
  function cohortRow(row: ShopperRow, subset = false) {
    const coverageKnown = purchases.bought + purchases.noPurchase > 0
    const amount = row.members.length
    const rate = agents.length ? amount / agents.length * 100 : 0
    return <button key={row.key} type="button" disabled={!amount} className={'ra-cohort' + (subset ? ' ra-cohort-subset' : '')}
      aria-describedby="ra-group-help" onClick={() => { inspect(row.members[0].shopper_id,row.lens); focusInspector() }}>
      <span className="ra-cohort-name">{row.color && <i aria-hidden="true" style={{backgroundColor:row.color}}/>}{row.label}</span><b>{coverageKnown || row.lens.kind === 'unknown' ? formatNumber.format(amount) :
        <><span aria-hidden="true">—</span><span className="sr-only">Unavailable</span></>}</b>
      {!subset && coverageKnown && <i aria-hidden="true"><i style={{width:rate+'%',backgroundColor:row.color}}/></i>}
    </button>
  }

  return <div className="rehearsal-arena">
    <header className="ra-heading">
      <h1>Market arena</h1>
      <button className="ra-btn ra-primary" onClick={onVerdict}>View verdict</button>
    </header>
    <ScenarioChoices options={report.scenarios.map(s => ({ id:s.scenario_id, label:s.label, description:s.description }))}
      value={scenario} onChange={id => { setPlaying(false); changeScenario(id) }}/>
    <dl className="ra-metrics" aria-label="Simulation highlights">
      <Metric title="Profit lift · full-run median" value={<ProfitValue amount={profit?.p50} formatted={profit ? money(profit.p50) : 'Unavailable'}/>}
        note={profit ? <RangeNote low={profit.p10} high={profit.p90} currency/> : 'No estimate returned'}/>
      <Metric title="Buyer lift · full-run median" value={buyers ? formatNumber.format(buyers.p50) : 'Unavailable'}
        note={buyers ? <RangeNote low={buyers.p10} high={buyers.p90}/> : 'No estimate returned'}/>
      <Metric title={`Would choose your brand · day ${day}`} value={share == null ? 'Unavailable' : formatNumber.format(share)+'%'}
        note={lift == null ? 'Share of simulated shoppers' : `${lift > 0 ? '+' : ''}${formatNumber.format(lift)} pp vs no campaign`}/>
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
          {firstChange ? <><span className="ra-subtitle">{firstChange.lever}</span>
            <p className="ra-change"><span>{firstChange.from}</span> to <strong>{firstChange.to}</strong></p>
            <details className="ra-supplement"><summary>Why this change?</summary><p>{firstChange.why}</p></details>
          </> : <p>{report.candidate?.summary ?? 'No proposal was returned.'}</p>}
        </RailSection>
        <section className="ra-rail-section ra-inspector">
          <h2 id="ra-inspector-title" ref={inspector} tabIndex={-1}>Shopper inspector</h2>
          {agents.length ? <ShopperPicker agents={agents} groups={groups} pool={pool} poolName={poolName} selected={selected} switchers={switchers}
            onChoose={id => inspect(id,lens)} onFind={id => inspect(id,null)} onClear={() => { setLens(null); select(null) }}
            onSwitchers={() => switchers[0] && inspect(switchers[0].shopper_id,{kind:'changed'})}/> : <p>No shoppers were returned for this day.</p>}
          {selectedShopper && <div className="ra-decision"><small>Day {day} purchase</small><p>{purchaseLabel(selectedShopper, groups)}</p></div>}
          {selected && (traceStatus ? <p role="status">{traceStatus}</p> : activeTrace ? <div className="ra-trace">
            <details key={selected} className="ra-supplement"><summary>Shopper details</summary><div className="ra-detail-copy">
              <h3>{activeTrace.segment_id}</h3>
              <dl className="ra-facts"><div><dt>Price sensitivity</dt><dd>{activeTrace.traits.price_sensitivity}</dd></div>
                <div><dt>Loyalty</dt><dd>{activeTrace.traits.loyalty}</dd></div></dl>
              {activeTrace.explanation && <p>{activeTrace.explanation}</p>}
              {basePerson && <div><strong>No-campaign comparison</strong><p>{purchaseLabel(basePerson, groups)}</p>
                <p>Would choose · {wouldBuyLabel(basePerson, groups) ?? 'Unavailable'}</p></div>}
              {memory && <dl className="ra-memory">{Object.entries(memory).map(([brand,v])=><div key={brand}><dt>{brand}</dt><dd>Awareness {v.awareness} · Attitude {v.attitude}</dd></div>)}</dl>}
              {events.length > 0 && <details><summary>Event history ({events.length})</summary><ol>{events.map((e,i)=><li key={i}>Day {e.day} · {e.detail}</li>)}</ol></details>}
            </div></details>
          </div> : <p role="status">Shopper trace unavailable.</p>)}
        </section>
      </aside>

      <section className="ra-market" aria-label="Market and timeline">
        <div className="ra-stage-header">
          <div><h2>{view === 'flow' ? 'Simulation workflow' : 'Market square'}</h2>{view !== 'flow' && <p>{agents.length ? `${agents.length} simulated shoppers` : 'Shopper positions unavailable'}</p>}</div>
          {view !== 'flow' && <label className="ra-baseline"><input type="checkbox" checked={canOverlay && ghost}
            disabled={!canOverlay} onChange={e => setGhost(e.target.checked)}/>Baseline overlay</label>}
        </div>
        <ArenaViews onViewChange={setView}
          twoD={<div className="ra-stage"><PixelArena {...mapProps}/></div>}
          isometric={<div className="ra-stage ra-isometric"><IsometricMarket {...mapProps}/></div>}
          flow={<WorkflowMap mode="demo" plan={choice?.label} scenario={scenarioInfo?.label ?? scenario} comparisons={comparisons}
            evidence={view === 'flow' ? replayWorkflowEvidence({ report, result, groups, baselineDay, frame: current, previous: days?.[index - 1],
              plan: choice, scenario: scenarioInfo, selected, day, phase, lastMove }) : undefined}
            selectablePlans={availablePlans.map(p => p.label)} seedCount={result?.seeds}
            onChoosePlan={label => {
              const plan = availablePlans.find(p => p.label === label)
              if (plan) { setPlaying(false); changePlan(plan.plan_id) }
            }} day={day} phase={phase} nextCheckpoint={nextCheckpoint?.at != null ? {day:nextCheckpoint.at,label:nextCheckpoint.label,onGo:()=>jump(nextCheckpoint.at)} : undefined}
            onVerdict={onVerdict}/>}/>
        {view !== 'flow' && <div className="ra-stage-caption">
          {agents.length ? <><span>{selected ? <button type="button" className="ra-text-btn" onClick={focusInspector}>Inspect {shopperName(selected)}</button> : 'Select a shopper to inspect'}</span>
            <span>{ghost && canOverlay ? 'Overlay shows the no-campaign baseline' : purchases.bought + purchases.noPurchase ? 'Brand areas show purchases' : 'Purchase locations unavailable'}</span></> : <p>No shopper positions are available for this day.</p>}
        </div>}
        <div className="ra-playback">
          <button className="ra-btn ra-inverse" aria-label={playing ? 'Pause timeline' : day >= to ? 'Replay timeline' : 'Play timeline'} disabled={!days || days.length < 2}
            onClick={() => { if (!playing && day >= to) changeDay(from); setPlaying(!playing) }}>{playing ? 'Pause' : day >= to ? 'Replay' : 'Play'}</button>
          <DayScrubber days={days} day={day} from={from} to={to} onJump={jump}/>
        </div>
        <div className="ra-checkpoints" aria-label="Timeline checkpoints">{checkpoints.map(m=>
          <button type="button" aria-pressed={day===m.at} key={m.label} onClick={() => jump(m.at)}>{m.label}</button>)}</div>
      </section>

      <aside className="ra-rail ra-right" aria-label="Rival activity and purchase decisions">
        <RailSection title="Rival activity">
          {lastMove ? <div className="ra-last-move"><small>Day {lastMove.day} · {lastMove.brand}</small>
            <h3>{lastMove.action}</h3>
            <details className="ra-supplement"><summary>Reason for move</summary><p>{lastMove.reason}</p></details>
          </div> : <p className="ra-quiet-event">No rival move through day {day}.</p>}
        </RailSection>
        <RailSection title="Purchase decisions">
          <p>Day {day} · {current?.agents ? formatNumber.format(agents.length) + ' simulated shoppers' : 'Shopper counts unavailable'}</p>
          <div className="ra-purchase-mix">
            <span className="ra-subtitle">Bought by brand{purchases.bought + purchases.noPurchase > 0 && ' · ' + formatNumber.format(purchases.bought)}</span>
            <div className="ra-cohorts">{purchaseRows.map(row => cohortRow(row))}</div>
            <div className="ra-cohort-outside">{cohortRow(noPurchaseRow)}
              {purchases.noPurchase > 0 && <div className="ra-waiting-subset">
                <small>Of those with no purchase</small>
                {purchases.noPurchase > purchases.waitingUnknown ? <>{cohortRow(waitingRow,true)}
                  {purchases.waitingUnknown > 0 && <small>Waiting state unavailable for {purchases.waitingUnknown}</small>}</>
                  : <small>Waiting state unavailable</small>}
              </div>}
              {purchases.unknown > 0 && cohortRow(unknownRow)}
            </div>
          </div>
          <p id="ra-group-help" className="ra-cohort-note">{!current?.agents ? 'Purchase decisions are unavailable for this day.' : !agents.length ? 'No shoppers in this snapshot.' : purchases.unknown === agents.length
            ? 'This snapshot has no recorded purchase outcomes.' : 'Bars show share of all shoppers on this day. Select a group to inspect a shopper.'}</p>
        </RailSection>
      </aside>

      <section className="ra-trend">
        <div className="ra-trend-header"><h2>Would choose your brand</h2><div className="ra-key" aria-label="Chart legend"><span>Plan</span><span>No campaign</span></div></div>
        {series?.some(d => d.brand_share_pct != null) ? <TrendBoundary days={series}><Suspense fallback={<p className="ra-chart-loading" role="status">Loading preference trend…</p>}>
          <TrendChart day={day} data={series} window={report.window}/>
        </Suspense></TrendBoundary> : <p>Would-be brand choice by day is unavailable for this scenario.</p>}
      </section>
    </div>

    <details className="ra-more"><summary>Arena insights</summary><div className="ra-insights-content">
      <section><h2>Rival moves</h2>{moves.length ? <ol>{moves.map((m,i)=><li key={i}><strong>Day {m.day} · {m.brand}</strong><p>{m.action}. {m.reason}</p></li>)}</ol> : <p>No events through day {day}.</p>}</section>
      <section><h2>Plan evidence</h2>{result && <p>{result.seeds} simulation seeds · {scenarioInfo?.label ?? scenario}</p>}
        {result?.guardrails.map(g=><p key={g.name}>{g.name} · <strong>{g.pass ? 'Passed' : 'Failed'}</strong></p>)}
        {report.assumptions.map(s=><p key={s}>{s}</p>)}</section>
      <section><h2>Strategist changes</h2>{report.candidate?.changes.length ? <ul>{report.candidate.changes.map(c=><li key={c.lever}><strong>{c.lever}</strong><p>{c.from} to {c.to}. {c.why}</p></li>)}</ul> : <p>No changes provided.</p>}</section>
    </div></details>
  </div>
}
