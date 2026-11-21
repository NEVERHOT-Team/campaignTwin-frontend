import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Day, Report } from './model'

const axis = { fontSize: 11, fill: '#a6a6a6' }
const dashed = '5 4'

export default function TrendChart({ data, window, day }: { data: Day[]; window: Report['window']; day: number }) {
  const point = data.find(entry => entry.day === day)
  return <div className="chart" role="img" aria-label="Share of simulated shoppers who would choose your brand by day, with the active campaign period shaded">
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="#303030" vertical={false}/>
        <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} minTickGap={20} tickFormatter={n => `D${n}`}/>
        <YAxis tick={axis} tickFormatter={n => `${n}%`} axisLine={false} tickLine={false}/>
        <ReferenceArea x1={window.start_day} x2={window.end_day} fill="#d9d9d9" fillOpacity={.045}/>
        <ReferenceLine x={day} stroke="#888" strokeDasharray="2 4"/>
        <Tooltip contentStyle={{ background:'#202020', border:'1px solid #454545', borderRadius:6, color:'#f0f0f0' }}
          labelFormatter={value => `Day ${value}`} formatter={value => `${value}%`}/>
        <Line type="monotone" name="No campaign" dataKey="baseline_share_pct" stroke="#999" strokeDasharray={dashed} dot={false} isAnimationActive={false}/>
        <Line type="monotone" name="Plan" dataKey="brand_share_pct" stroke="#f4f4f4" strokeWidth={2.5} dot={false} isAnimationActive={false}/>
        {point?.brand_share_pct != null && <ReferenceDot x={day} y={point.brand_share_pct} r={3.5} fill="#f4f4f4" stroke="#171717" strokeWidth={1.5}/>}
      </ComposedChart>
    </ResponsiveContainer>
  </div>
}
