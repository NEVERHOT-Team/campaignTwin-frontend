import type { Plan, Report } from './model'
import type { StrategyDifferenceProps } from './StrategyDifference'
import { attainmentRate, baht, count, percent, percentagePoints } from './verdict-values'

type ReportPlan = Report['plans'][number]
const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value)
const signed = (value:number, format:(n:number)=>string) => (value>0 ? '+' : value<0 ? '−' : '') + format(Math.abs(value))
const readable = (id:string) => id.replace(/[-_]+/g,' ')
const segments = (ids:string[]) => [...ids].sort().map(id =>
  id === 'all' ? 'All eligible shoppers' : id === 'price-sensitive' ? 'Price-sensitive segment' : readable(id)).join(', ')
const split = (plan:Plan) => Object.entries(plan.budget_split).sort(([a],[b])=>a.localeCompare(b))
  .map(([channel,share])=>readable(channel)+' '+percent.format(share)).join(', ')
const voucher = (num:number|undefined) => finite(num) ? count.format(num)+'%' : undefined

export function replayStrategyDifference(report:Report, scenario:string, original:ReportPlan, alternative:ReportPlan): StrategyDifferenceProps {
  const candidate = report.candidate?.plan.plan_id === alternative.plan_id ? report.candidate : undefined
  const frozen = report.inputs?.original_plan.plan_id === original.plan_id ? report.inputs.original_plan : undefined
  const next = candidate?.plan
  const recorded = candidate?.changes ?? []
  const changes: StrategyDifferenceProps['changes'] = []
  const add = (label:string, from?:string, to?:string) => {
    const source = recorded.find(c=>c.lever.toLowerCase()===label.toLowerCase())
    if (from || to || source) changes.push({ label, from:from ?? source?.from, to:to ?? source?.to, reason:source?.why })
  }
  add('Voucher discount',voucher(original.discount_pct ?? frozen?.discount_pct),voucher(alternative.discount_pct ?? next?.discount_pct))
  add('Audience',frozen?.target_segments && segments(frozen.target_segments),next?.target_segments && segments(next.target_segments))
  if (frozen && next) {
    add('Budget',baht.format(frozen.total_budget_thb),baht.format(next.total_budget_thb))
    add('Campaign window',`Days ${frozen.start_day}–${frozen.end_day}`,`Days ${next.start_day}–${next.end_day}`)
    add('Channel allocation',split(frozen),split(next))
    add('Message',readable(frozen.message_id),readable(next.message_id))
    add('Brand',frozen.brand,next.brand)
    add('Discount cap',voucher(frozen.constraints.max_discount_pct),voucher(next.constraints.max_discount_pct))
    add('Required inclusions',[...frozen.constraints.must_include].sort().map(readable).join(', '),[...next.constraints.must_include].sort().map(readable).join(', '))
  }
  for (const c of recorded) {
    if (!changes.some(change=>change.label.toLowerCase()===c.lever.toLowerCase())) changes.push({label:c.lever,from:c.from,to:c.to,reason:c.why})
  }
  const resultFor = (id:string) => report.results.find(r=>r.plan_id===id && r.scenario_id===scenario)
  const a = resultFor(original.plan_id), b = resultFor(alternative.plan_id)
  function outcome(label:string, before:number|null|undefined, after:number|null|undefined, format:(n:number)=>string, delta=format) {
    return { label, original:finite(before) ? format(before) : undefined, alternative:finite(after) ? format(after) : undefined,
      difference:finite(before) && finite(after) ? signed(after-before,delta) : undefined }
  }
  return {
    original:original.label, alternative:alternative.label, scenario:report.scenarios.find(s=>s.scenario_id===scenario)?.label ?? scenario,
    changes, outcomes:[
      outcome('Median incremental profit',a?.metrics.incremental_profit_thb?.p50,b?.metrics.incremental_profit_thb?.p50,baht.format),
      outcome('Median new buyers',a?.metrics.new_buyers?.p50,b?.metrics.new_buyers?.p50,count.format),
      outcome('Chance of reaching goal',attainmentRate(a?.goal_attainment),attainmentRate(b?.goal_attainment),percent.format,percentagePoints),
    ],
  }
}
