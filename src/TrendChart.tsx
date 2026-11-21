import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { baselineSeries, seriesColor, type ChartSeries } from './chart-series'
import type { Day, Report } from './model'

const axis = { fontSize: 11, fill: '#a6a6a6' }

function dayLine({x1, y1, y2}: {x1:number; y1:number; y2:number}) {
  return <line className="ra-chart-cursor" x1={0} x2={0} y1={y1} y2={y2} stroke="#888" strokeDasharray="2 4"
    style={{transform:`translateX(${x1}px)`}}/>
}
export default function TrendChart({ data, window, day, plan }: { data: Day[]; window: Report['window']; day: number; plan: ChartSeries }) {
  const color = seriesColor(plan)
  const point = data.find(entry => entry.day === day)
  return <div className="chart" role="img" aria-label="Share of simulated shoppers who would choose your brand by day, with the active campaign period shaded">
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="#303030" vertical={false}/>
        <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} minTickGap={20} tickFormatter={n => `D${n}`}/>
        <YAxis tick={axis} tickFormatter={n => `${n}%`} axisLine={false} tickLine={false}/>
        <ReferenceArea x1={window.start_day} x2={window.end_day} fill="#d9d9d9" fillOpacity={.045}/>
        <ReferenceLine x={day} shape={dayLine}/>
        <Tooltip contentStyle={{ background:'#202020', border:'1px solid #454545', borderRadius:6, color:'#f0f0f0' }}
          labelFormatter={value => `Day ${value}`} formatter={value => `${value}%`}/>
        <Line type="monotone" name="No campaign" dataKey="baseline_share_pct" stroke={seriesColor(baselineSeries)} strokeDasharray={baselineSeries.dash} dot={false} isAnimationActive={false}/>
        <Line type="monotone" name={plan.label} dataKey="brand_share_pct" stroke={color} strokeDasharray={plan.dash} strokeWidth={2.5} dot={false} isAnimationActive={false}/>
        {point?.brand_share_pct != null && <ReferenceDot x={day} y={point.brand_share_pct} shape={({cx,cy}) => <circle className="ra-chart-cursor" r={3.5} fill={color} stroke="#171717" strokeWidth={1.5}
          style={{transform:`translate(${cx}px, ${cy}px)`}}/>}/>}
      </ComposedChart>
    </ResponsiveContainer>
  </div>
}
