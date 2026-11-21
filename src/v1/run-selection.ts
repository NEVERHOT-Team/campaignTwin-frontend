import { useState } from 'react'
import type { Report } from './client'

export function useRunSelection() {
  const [planId, setPlanId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  return { planId, scenarioId, setPlanId, setScenarioId }
}

export type RunSelection = ReturnType<typeof useRunSelection>

export function resolveRunSelection(report: Report, selection: RunSelection) {
  const plans = report.plan_results ?? []
  const originalPlan = plans.find(p => p.role === 'original')
  const plan = plans.find(p => p.input.plan_id === selection.planId) ?? originalPlan ?? plans[0]
  const results = plan ? plan.scenario_results : report.scenario_results
  const scene = results.find(s => s.scenario === selection.scenarioId) ?? results[0]

  function choosePlan(id: string) {
    const next = plans.find(p => p.input.plan_id === id)
    if (!next) return
    const nextScene = next.scenario_results.find(s => s.scenario === scene?.scenario) ?? next.scenario_results[0]
    selection.setPlanId(next.input.plan_id)
    selection.setScenarioId(nextScene?.scenario ?? '')
  }

  return { plans, originalPlan, plan, results, scene, choosePlan }
}
