import { useId, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, Rectangle, ReferenceArea, ReferenceDot,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps, type TooltipContentProps,
} from 'recharts'
import { seriesColor, type ChartSeries, type ChartTone } from './chart-series'
import { count } from './verdict-values'
import './verdict-charts.css'

type ChartUnit = 'percent' | 'points' | 'number'
type ChartRow = { label: string; x?: number; values: Record<string, number | null> }
export type VerdictChartPanel = {
  id: string
  title: string
  description?: string
  kind: 'line' | 'bar'
  unit: ChartUnit
  domain?: [number, number]
  xLabel: string
  yLabel: string
  series: ChartSeries[]
  rows: ChartRow[]
  window?: { start: number; end: number; label: string }
  emptyMessage?: string
}

const percentTicks = [0,25,50,75,100]
const axisTick = { fill:'#bdbdbd', fontSize:11 }
const compact = new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 })

function numeric(panel: VerdictChartPanel, row: ChartRow, key: string) {
  const v = row.values[key]
  return typeof v === 'number' && Number.isFinite(v) && (panel.unit !== 'percent' || (v >= 0 && v <= 100)) ? v : null
}
function formatted(value: number | null | undefined, unit: ChartUnit) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable'
  return count.format(value) + (unit === 'percent' ? '%' : unit === 'points' ? ' pts' : '')
}
function quantitativeDomain(panel: VerdictChartPanel): [number,number] {
  if (panel.unit === 'percent') return [0,100]
  const values = panel.rows.flatMap(r => panel.series.flatMap(s => {
    const v = numeric(panel,r,s.key)
    return v == null ? [] : [v]
  }))
  const min = Math.min(panel.domain?.[0] ?? 0, 0, ...values)
  const max = Math.max(panel.domain?.[1] ?? 0, 0, ...values)
  return min === max ? [min, max + 1] : [min,max]
}
function barTexture(tone: ChartTone) {
  if (tone === 'p10') return 'dots'
  if (tone === 'loss' || tone === 'p90') return 'stripes'
  return 'solid'
}

function SeriesKey({ series, kind }: { series: ChartSeries; kind: VerdictChartPanel['kind'] }) {
  const color = seriesColor(series)
  if (kind === 'line') return <svg className="vc-key" width="23" height="9" aria-hidden="true">
    <line x1="0" x2="23" y1="5" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray={series.dash}/>
  </svg>
  return <i className="vc-key vc-key-bar" aria-hidden="true" data-texture={barTexture(series.tone)} style={{color}}/>
}

function OutcomeBar({ x, y, width, height, value, fill, color }: BarShapeProps & {color:string}) {
  if (value === 0) {
    const cy = y + height / 2
    return <circle className="vc-zero" cx={x} cy={cy} r={2.5} fill={color}/>
  }
  return <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={[0,3,3,0]}/>
}

function TooltipReadout({ info, panel }: { info: TooltipContentProps; panel: VerdictChartPanel }) {
  if (!info.active) return null
  const row = (info.payload[0]?.payload as ChartRow | undefined) ?? panel.rows[Number(info.activeIndex)]
  if (!row) return null
  return <div role="status" className="vc-tooltip">
    <strong>{row.label}</strong>
    <dl>{panel.series.map(s => <div key={s.key}><dt><SeriesKey series={s} kind={panel.kind}/>{s.label}</dt><dd>{formatted(numeric(panel,row,s.key),panel.unit)}</dd></div>)}</dl>
  </div>
}

function DataTable({ panel }: { panel: VerdictChartPanel }) {
  return <div className="vc-data-scroll" tabIndex={0} role="region" aria-label={panel.title + ' data'} data-lenis-prevent="">
    <table><caption className="sr-only">{panel.title} · {panel.yLabel}</caption>
      <thead><tr><th scope="col">{panel.xLabel}</th>{panel.series.map(s => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead>
      <tbody>{panel.rows.map((row,i) => <tr key={i}><th scope="row">{row.label}</th>
        {panel.series.map(s => <td key={s.key}>{formatted(numeric(panel,row,s.key),panel.unit)}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
}

function ChartPlot({ panel, instructions, unique }: { panel: VerdictChartPanel; instructions: string; unique: string }) {
  const line = panel.kind === 'line'
  const numericX = line && panel.rows.every(row => Number.isFinite(row.x))
  const xs = numericX ? panel.rows.map(row => row.x!) : []
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const xDomain: [number,number] = minX === maxX ? [minX-.5,maxX+.5] : [minX,maxX]
  const domain = quantitativeDomain(panel)
  const window = numericX && panel.window && panel.window.start <= panel.window.end && panel.window.end >= minX && panel.window.start <= maxX ? panel.window : undefined
  const axisValue = (n: number) => (Math.abs(n) >= 1000 ? compact.format(n) : count.format(n))
    + (panel.unit === 'percent' ? '%' : panel.unit === 'points' ? ' pts' : '')
  const ticks = panel.unit === 'percent' ? percentTicks : undefined
  const tooltip = <Tooltip content={info => <TooltipReadout info={info} panel={panel}/>}
    isAnimationActive={false} cursor={line ? {stroke:'#888',strokeDasharray:'3 4'} : {fill:'#fff',fillOpacity:.035}}/>
  const chartHeight = line ? 213 : Math.max(172,panel.rows.length * Math.max(44, 17 * panel.series.length + 12) + 32)
  const tickLabel = (x: string) => x.length > 16 ? x.slice(0,15) + '…' : x
  return <>
    <div className="vc-legend" aria-label="Chart legend">
      {panel.series.map(s => <span key={s.key}>
        <SeriesKey series={s} kind={panel.kind}/>{s.label}
      </span>)}
      {window && <span><i aria-hidden="true" className="vc-window-key"/>{window.label} · {window.start}–{window.end}</span>}
    </div>
    <div className="vc-axis-label">{line ? panel.yLabel : panel.xLabel}</div>
    <div className="vc-plot" style={{height:chartHeight}}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {line ? <LineChart data={panel.rows} accessibilityLayer title={panel.title} aria-describedby={instructions}
          margin={{top:10,right:17,bottom:2,left:0}}>
          <CartesianGrid vertical={false} stroke="#343434" strokeDasharray="3 4"/>
          <XAxis dataKey={numericX ? 'x' : 'label'} type={numericX ? 'number' : 'category'} allowDecimals={!numericX}
            {...(numericX ? {domain:xDomain,ticks:minX === maxX ? [minX] : undefined} : {})}
            interval="preserveStartEnd" minTickGap={14} height={23} tickMargin={6} tick={axisTick} tickLine={false} axisLine={{stroke:'#505050'}}/>
          <YAxis domain={domain} ticks={ticks} allowDataOverflow tickFormatter={axisValue}
            tick={axisTick} tickLine={false} axisLine={false} width={43} tickMargin={5}/>
          {window && <ReferenceArea x1={Math.max(window.start,minX)} x2={Math.min(window.end,maxX)} fill="#acacac" fillOpacity={.085}/>}
          {domain[0] < 0 && domain[1] >= 0 && <ReferenceLine y={0} stroke="#858585"/>}
          {tooltip}
          {panel.series.map((s,i) => {
            const color = seriesColor(s)
            return <Line key={s.key} name={s.label} dataKey={(row:ChartRow) => numeric(panel,row,s.key)}
              stroke={color} strokeWidth={i===0 ? 2.6 : 2.1} strokeDasharray={s.dash} type="linear"
              connectNulls={false} isAnimationActive={false} activeDot={{r:4,fill:color,stroke:'#111',strokeWidth:1.5}}
              dot={point => {
                const index = point.index ?? -1, row = panel.rows[index]
                if (!row || point.cx == null || point.cy == null || numeric(panel,row,s.key) == null) return <g key={index}/>
                const isolated = [index-1,index+1].every(n => !panel.rows[n] || numeric(panel,panel.rows[n],s.key) == null)
                return panel.rows.length <= 7 || isolated
                  ? <circle key={index} cx={point.cx} cy={point.cy} r={2.7} fill={color}/>
                  : <g key={index}/>
              }}/>
          })}
        </LineChart> : <BarChart layout="vertical" data={panel.rows} accessibilityLayer title={panel.title}
          aria-describedby={instructions} barGap={4} barCategoryGap="20%" margin={{top:4,right:44,bottom:2,left:0}}>
          <defs>{panel.series.map((s,i) => {
            const texture = barTexture(s.tone)
            return texture !== 'solid' && <pattern key={s.key} id={unique+'-bar-'+i} patternUnits="userSpaceOnUse" width="6" height="6">
              <rect width="6" height="6" fill={seriesColor(s)}/>
              {texture === 'dots' ? <circle cx="3" cy="3" r="1" fill="#241c31"/> :
                <path d="M-1 1 1 -1 M0 6 6 0 M5 7 7 5" stroke="#241c31" strokeWidth="1.3"/>}
            </pattern>
          })}</defs>
          <CartesianGrid horizontal={false} stroke="#343434" strokeDasharray="3 4"/>
          <XAxis type="number" domain={domain} ticks={ticks} allowDataOverflow tickFormatter={axisValue}
            tick={axisTick} tickMargin={6} tickLine={false} axisLine={{stroke:'#505050'}} height={23}/>
          <YAxis type="category" dataKey="label" tickFormatter={tickLabel} axisLine={false} tickLine={false}
            tick={axisTick} interval={0} width={86} tickMargin={7}/>
          {domain[0] < 0 && domain[1] >= 0 && <ReferenceLine x={0} stroke="#858585"/>}
          {panel.rows.filter(row => panel.series.every(s => numeric(panel,row,s.key) == null)).map((row,i) =>
            <ReferenceDot key={i} x={0} y={row.label} shape={({ cx, cy }) =>
              <text className="vc-unavailable" x={(cx ?? 0) + 5} y={cy} dominantBaseline="middle" fill="#bcbcbc" fontSize={11}>Unavailable</text>}/>)}
          {tooltip}
          {panel.series.map((s,i) => <Bar key={s.key} name={s.label} dataKey={(row:ChartRow) => numeric(panel,row,s.key)}
            fill={barTexture(s.tone) === 'solid' ? seriesColor(s) : 'url(#'+unique+'-bar-'+i+')'}
            maxBarSize={17} isAnimationActive={false} shape={props => <OutcomeBar {...props} color={seriesColor(s)}/>}>
            {panel.unit === 'percent' && panel.series.length <= 3 && <LabelList valueAccessor={entry=> {
              const row = entry.payload as ChartRow
              const value = numeric(panel,row,s.key)
              return value == null ? '' : formatted(value,panel.unit)
            }} position="right" offset={5} fill="#e6e6e6" fontSize={11}/>}
          </Bar>)}
        </BarChart>}
      </ResponsiveContainer>
    </div>
    <div className="vc-axis-label vc-horizontal">{line ? panel.xLabel : panel.yLabel}</div>
  </>
}

function InsightCard({ panel }: { panel: VerdictChartPanel }) {
  const id = useId().replace(/[^a-z0-9_-]/gi,'')
  const [table,setTable] = useState(false)
  const hasData = panel.rows.some(row => panel.series.some(series => numeric(panel,row,series.key) != null))
  const missing = hasData && panel.rows.some(row => panel.series.some(series => numeric(panel,row,series.key) == null))
  return <figure className="vc-card" aria-labelledby={id+'-title'}>
    <figcaption className="vc-caption">
      <div><h3 id={id+'-title'}>{panel.title}</h3>{panel.description && <p>{panel.description}</p>}</div>
      {hasData && <button type="button" className="vc-switch" aria-expanded={table} aria-controls={id+'-table'}
        onClick={() => setTable(!table)}>{table ? 'View chart' : 'View data'}</button>}
    </figcaption>
    {hasData ? <>
      {!table && <>
        <p className="sr-only" id={id+'-keys'}>Use the left and right arrow keys on the chart to inspect values, or open View data for the full table.</p>
        <ChartPlot panel={panel} unique={id} instructions={id+'-keys'}/>
        {missing && <p className="vc-note">Missing values are listed as unavailable in the data table.</p>}
      </>}
      <div id={id+'-table'} hidden={!table}>{table && <DataTable panel={panel}/>}</div>
    </> : <p className="vc-empty">{panel.emptyMessage ?? 'No values were reported for this chart.'}</p>}
  </figure>
}

export default function VerdictCharts({ panels }: { panels: VerdictChartPanel[] }) {
  const id = useId()
  if (!panels.length) return null
  return <section className="verdict-charts" aria-labelledby={id}>
    <h2 id={id}>Performance insights</h2>
    <div className="vc-grid">{panels.map(p => <InsightCard key={p.id} panel={p}/>)}</div>
  </section>
}
