import type { Report } from './model'

export type ChartTone = 'original' | 'alternative' | 'baseline' | 'unspecified' | 'target' | 'loss' | 'p10' | 'p50' | 'p90'
export type ChartSeries = { key: string; label: string; tone: ChartTone; dash?: string; variant?: number }

export function seriesColor({tone,variant}: Pick<ChartSeries, 'tone' | 'variant'>) {
  const base = `var(--chart-${tone})`
  if (!variant) return base
  return `color-mix(in srgb, ${base}, white ${60 * variant / (variant + 1)}%)`
}
export const baselineSeries: ChartSeries = { key: 'baseline', label: 'No campaign', tone: 'baseline', dash: '2 4' }

type Plan = Report['plans'][number]

export function preferenceSeries(plan: Plan, plans: Plan[]): ChartSeries {
  let dash: string | undefined
  let variant = 0
  if (plan.role === 'baseline') dash = baselineSeries.dash
  if (plan.role === 'alternative') {
    // Preserve each alternative's line pattern when a report is sorted or filtered by scenario.
    const ids = plans.filter(p => p.role === 'alternative').map(p => p.plan_id).sort()
    variant = ids.indexOf(plan.plan_id)
    dash = variant <= 0 ? '8 4' : '8 3 ' + '2 3 '.repeat(variant).trimEnd()
  }
  return { key: plan.plan_id, label: plan.label, tone: plan.role, dash, variant }
}
