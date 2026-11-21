import type { Report as ReplayReport } from './model'
import type { Report as RunReport } from './v1/client'
import type { VerdictChartPanel } from './VerdictCharts'
import { baselineSeries, preferenceSeries } from './chart-series'
import { attainmentRate, baht } from './verdict-values'

function percentValue(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

function fractionToPercent(value: number | null | undefined) {
  return value == null ? null : percentValue(value * 100)
}

export function replayInsights(report: ReplayReport, scenarioId: string): VerdictChartPanel[] {
  const scenario = report.scenarios.find(item => item.scenario_id === scenarioId)?.label ?? scenarioId
  const inScenario = report.results.filter(result => result.scenario_id === scenarioId)
  const plans = report.plans.map((plan, index) => {
    const result = inScenario.find(row => row.plan_id === plan.plan_id)
    const days = new Map(result?.daily.filter(frame => Number.isSafeInteger(frame.day)).map(frame => [frame.day, frame]))
    return { key:'plan'+index, label:plan.label, role:plan.role, style:preferenceSeries(plan,report.plans), result, days }
  })
  const campaigns = [...plans.filter(plan => plan.role === 'original'), ...plans.filter(plan => plan.role === 'alternative')]
  const reference = plans.find(plan => plan.role === 'baseline')
  const baselineKey = reference?.key ?? 'baseline'
  const series = campaigns.map(({key,style}) => ({...style,key}))
  const days = [...new Set(plans.flatMap(plan => [...plan.days.keys()]))].sort((a,b) => a-b)
  const hasPairedShare = campaigns.some(plan => plan.result?.daily.some(frame => percentValue(frame.baseline_share_pct) != null))
  if (reference || hasPairedShare) series.push({ ...baselineSeries, key:baselineKey, label:reference?.label ?? baselineSeries.label })

  const rows: VerdictChartPanel['rows'] = []
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    const prior = days[i-1]
    if (prior != null && day > prior+1) {
      const gap = day === prior+2 ? 'Day '+(prior+1) : 'Days '+(prior+1)+'–'+(day-1)
      rows.push({ label:gap+' · unrecorded', x:prior+1, values:{} })
    }
    const values: Record<string,number|null> = {}
    const pairedShares = new Set<number>()
    for (const campaign of campaigns) {
      const frame = campaign.days.get(day)
      values[campaign.key] = percentValue(frame?.brand_share_pct)
      const share = percentValue(frame?.baseline_share_pct)
      if (share != null) pairedShares.add(share)
    }
    // A legacy replay can carry the shared baseline on the individual plan frames.
    const shared = pairedShares.size === 1 ? [...pairedShares][0] : null
    values[baselineKey] = percentValue(reference?.days.get(day)?.brand_share_pct) ?? shared
    rows.push({ label:'Day '+day, x:day, values })
  }
  const targets = [...campaigns]
  if (reference && attainmentRate(reference.result?.goal_attainment) != null) targets.push(reference)
  return [
    {
      id:'brand-preference', kind:'line', title:'Brand preference over time',
      description:scenario+' · Share of shoppers who prefer your brand, including shoppers who made no purchase.',
      xLabel:'Replay day', yLabel:'Shopper share', unit:'percent', domain:[0,100], series, rows,
      window:{ start:report.window.start_day, end:report.window.end_day, label:'Promotion' },
      emptyMessage:'No daily brand preference was recorded for this scenario.',
    },
    {
      id:'goal-attainment', kind:'bar', title:'Chance of reaching the profit goal',
      description:scenario+' · Share of valid paired samples reaching '+baht.format(report.goal_thb)+' in incremental profit.',
      xLabel:'Plan', yLabel:'Share of samples', unit:'percent', domain:[0,100], series:[{key:'target',tone:'target',label:'Reached goal'}],
      rows:targets.map(plan => ({label:plan.label, values:{target:fractionToPercent(attainmentRate(plan.result?.goal_attainment))}})),
      emptyMessage:'No valid paired samples were returned for this goal.',
    },
  ]
}

type Scenario = RunReport['scenario_results'][number]
type Metric = Scenario['metrics'][number]
type ScopedPlan = { label: string; scope: Scenario | undefined }
const byName = (scope: Scenario, metric: Metric['metric']) => scope.metrics.find(m => m.metric === metric)

function chance(metric: Metric | undefined) {
  return metric?.status === 'available' && metric.unit === 'fraction' && typeof metric.value === 'number'
    ? fractionToPercent(metric.value) : null
}

export function evaluationInsights(plans:ScopedPlan[], scopeLabel:string): VerdictChartPanel[] {
  const probabilityRows: VerdictChartPanel['rows'] = []
  const leakageRows: VerdictChartPanel['rows'] = []
  for (const { label, scope } of plans) {
    if (!scope) continue
    probabilityRows.push({ label, values:{
      target:chance(byName(scope,'probability_hit_target')),
      loss:chance(byName(scope,'probability_loss')),
    }})
    const leakage = byName(scope,'subsidy_leakage')
    const range = leakage?.status === 'available' && leakage.unit === 'fraction' && typeof leakage.value === 'object' ? leakage.value : null
    leakageRows.push({ label, values:{
      p10:fractionToPercent(range?.p10), p50:fractionToPercent(range?.p50), p90:fractionToPercent(range?.p90),
    }})
  }
  return [
    {
      id:'outcome-probabilities', kind:'bar', title:'Target and loss probabilities',
      description:scopeLabel+' · Share of paired seeds meeting the approved target or producing an incremental loss.',
      xLabel:'Evaluated plan', yLabel:'Probability', unit:'percent', domain:[0,100],
      series:[{key:'target',tone:'target',label:'Met target'},{key:'loss',tone:'loss',label:'Loss'}], rows:probabilityRows,
      emptyMessage:'No target or loss probabilities were returned for this scenario.',
    },
    {
      id:'subsidy-leakage', kind:'bar', title:'Subsidy leakage by plan',
      description:scopeLabel+' · Share of subsidy spent on purchases that would also occur without the campaign.',
      xLabel:'Evaluated plan', yLabel:'Subsidy share', unit:'percent', domain:[0,100],
      series:[{key:'p10',tone:'p10',label:'P10'},{key:'p50',tone:'p50',label:'Median'},{key:'p90',tone:'p90',label:'P90'}], rows:leakageRows,
      emptyMessage:'No subsidy leakage estimates were returned for this scenario.',
    },
  ]
}
