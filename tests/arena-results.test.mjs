import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { after, test } from 'node:test'
import { createServer } from 'vite'

// Load the same TypeScript modules used by the browser, including their fixture data.
const cacheDir = await mkdtemp(join(tmpdir(), 'campaigntwin-result-test-'))
const vite = await createServer({
  configFile: false,
  cacheDir,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, ws: false, hmr: false, watch: null },
})
after(async () => {
  await vite.close()
  await rm(cacheDir, { recursive: true, force: true })
})
const { fixtureApi } = await vite.ssrLoadModule('/src/fixtures.ts')
const { exampleCampaign } = await vite.ssrLoadModule('/src/campaign.ts')
const { attainmentRate, formatResult, pointsComparison, profitComparison } = await vite.ssrLoadModule('/src/verdict-values.ts')
const { run } = await fixtureApi.replay()
const report = run.report

test('switching live plans retains the visible scenario or selects an evaluated fallback for both screens', async () => {
  const { resolveRunSelection } = await vite.ssrLoadModule('/src/v1/run-selection.ts')
  const s1 = { scenario: 'S1', metrics: [] }
  const s2 = { scenario: 'S2', metrics: [] }
  const live = {
    scenario_results: [s1, s2],
    plan_results: [
      { role: 'original', input: { plan_id: 'submitted' }, scenario_results: [s1, s2] },
      { role: 'conservative', input: { plan_id: 'alternative' }, scenario_results: [s2] },
      { role: 'baseline', input: { plan_id: 'baseline' }, scenario_results: [s1] },
    ],
  }
  const choice = {
    planId: 'submitted', scenarioId: 'S1',
    setPlanId(id) { this.planId = id },
    setScenarioId(id) { this.scenarioId = id },
  }
  resolveRunSelection(live, choice).choosePlan('alternative')
  assert.equal(choice.scenarioId, 'S2')
  assert.equal(resolveRunSelection(live, choice).scene.scenario, 'S2')
  resolveRunSelection(live, choice).choosePlan('submitted')
  assert.equal(choice.scenarioId, 'S2')
  resolveRunSelection(live, choice).choosePlan('baseline')
  assert.equal(choice.scenarioId, 'S1')
  const legacy = resolveRunSelection({ scenario_results: [s2] }, choice)
  assert.equal(legacy.plan, undefined)
  assert.equal(legacy.scene.scenario, 'S2')
})

test('the displayed no-campaign percentage matches the baseline shoppers for every scenario and day', () => {
  const baselineId = report.plans.find(p => p.role === 'baseline').plan_id
  for (const scenario of report.scenarios) {
    const results = report.results.filter(r => r.scenario_id === scenario.scenario_id)
    const baseline = results.find(r => r.plan_id === baselineId)
    for (const result of results) {
      for (const day of result.daily) {
        const source = baseline.daily.find(d => d.day === day.day)
        const ownBrandCount = source.agents.filter(a => a.brand === 'ours').length
        assert.equal(day.baseline_share_pct, Math.round(ownBrandCount / source.agents.length * 1000) / 10)
      }
    }
  }
})

test('a shopper switches only on a recorded change, including switches away from the rival', async () => {
  const plan = report.plans.find(p => p.role === 'original')
  const row = report.results.find(r => r.plan_id === plan.plan_id && r.scenario_id === 'S3')
  const today = row.daily.find(d => d.day === 1)
  const before = row.daily.find(d => d.day === 0).agents
  const staying = today.agents.find(a => a.brand === 'rival' && before.find(b => b.shopper_id === a.shopper_id).brand === a.brand)
  const switching = today.agents.find(a => a.brand !== 'rival' && before.find(b => b.shopper_id === a.shopper_id).brand === 'rival')
  assert.ok(staying && switching)
  const traceFor = person => fixtureApi.shopper(run.run_id, person.shopper_id, today.day, row.scenario_id, plan.plan_id)
  const [first, second] = await Promise.all([traceFor(staying), traceFor(switching)])
  assert.notEqual(first.events.at(-1).type, 'switched')
  assert.equal(second.events.at(-1).type, 'switched')
  assert.match(second.events.at(-1).detail, /→/)
  assert.ok(second.events.every(event => event.day <= today.day))
})

test('rate, lift, loss and missing-denominator formatting respect the reported units', () => {
  assert.equal(formatResult(0.23, 'fraction'), '23%')
  assert.equal(formatResult(23, 'pct'), '23%')
  assert.equal(formatResult(0, 'ratio'), '0×')
  assert.match(pointsComparison(0.7, 0.6), /10 percentage points higher/)
  assert.match(profitComparison(-50, -100), /50% smaller loss/)
  assert.doesNotMatch(profitComparison(7, 0), /%|Infinity|NaN/)
  assert.equal(attainmentRate({ met_samples: 0, valid_paired_samples: 20 }), 0)
  assert.equal(attainmentRate({ met_samples: 0, valid_paired_samples: 0 }), null)
})

test('the demo reports profit and goal attainment against its saved review inputs', async () => {
  const values = { brand: 'Test', discount_pct: '15', total_budget_thb: '6000', unit_price_thb: '120',
    unit_cost_thb: '65', fee_pct: '10', fixed_campaign_spend_thb: '0' }
  const draft = { brief: 'Budget test brief', values, fields: [], confirmed: [], campaign: { ...exampleCampaign, name: 'Budget test' }, goals: [], mechanics: [], answers: {} }
  const review = await fixtureApi.context(draft)
  draft.brief = 'Later draft'
  draft.campaign.name = 'Another campaign'
  const approval = { context: review.context, original_plan: review.original_plan, included_alternatives: [],
    baseline: review.baseline, scenario_config: review.scenario_config, confirmed_field_ids: [] }
  const submitted = await fixtureApi.simulate(approval, 'test-small-budget')
  let state = await fixtureApi.run(submitted.run_id)
  const deadline = Date.now() + 5000
  while (!state.report && state.status !== 'failed' && Date.now() < deadline) {
    await delay(100)
    state = await fixtureApi.run(submitted.run_id)
  }
  assert.ok(state.report)
  assert.equal(state.report.inputs.brief, 'Budget test brief')
  assert.equal(state.report.inputs.campaign.name, 'Budget test')
  assert.equal(state.report.inputs.original_plan.total_budget_thb, 6000)
  assert.equal(state.report.inputs.source, 'submission')
  assert.equal(report.inputs.source, 'example')
  const small = state.report.results.find(row => row.plan_id === review.original_plan.plan_id && row.scenario_id === 'S1')
  assert.ok(small.metrics.incremental_profit_thb.p90 < state.report.goal_thb)
  assert.deepEqual(small.goal_attainment, { met_samples: 0, valid_paired_samples: 20 })
  const example = report.results.find(row => row.plan_id === report.plans[0].plan_id && row.scenario_id === 'S1')
  assert.deepEqual(example.goal_attainment, { met_samples: 19, valid_paired_samples: 20 })
})
