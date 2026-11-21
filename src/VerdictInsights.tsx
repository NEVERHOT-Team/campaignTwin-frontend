import { lazy, Suspense } from 'react'
import type { VerdictChartPanel } from './VerdictCharts'

const VerdictCharts = lazy(() => import('./VerdictCharts'))

export function VerdictInsights({ panels }: { panels:VerdictChartPanel[] }) {
  return <Suspense fallback={<p role="status">Loading performance charts…</p>}>
    <VerdictCharts panels={panels}/>
  </Suspense>
}
