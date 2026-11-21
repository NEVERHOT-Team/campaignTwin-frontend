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

test('each demo shopper has both a brand choice and a separate daily purchase outcome', () => {
  const groups = new Set(report.brand_groups.map(group => group.id))
  assert.deepEqual(groups, new Set(['ours', 'rival', 'market']))
  let sawWaiting = false
  for (const result of report.results) {
    for (const frame of result.daily) {
      const buyers = frame.agents.filter(shopper => shopper.purchase === 'bought')
      const nonbuyers = frame.agents.filter(shopper => shopper.purchase === 'no_purchase')
      assert.equal(buyers.length + nonbuyers.length, frame.agents.length)
      assert.equal(new Set(frame.agents.map(shopper => shopper.shopper_id)).size, frame.agents.length)
      assert.ok(frame.agents.every(shopper => groups.has(shopper.brand)))
      assert.ok(buyers.every(shopper => !shopper.waiting))
      assert.ok(nonbuyers.every(shopper => typeof shopper.waiting === 'boolean'))
      if (frame.day <= report.window.end_day || report.plans.find(plan => plan.plan_id === result.plan_id).role === 'baseline') {
        assert.ok(nonbuyers.every(shopper => !shopper.waiting), 'Waiting requires a previous promotion that has ended')
      }
      sawWaiting ||= nonbuyers.some(shopper => shopper.waiting)
    }
  }
  assert.ok(sawWaiting, 'The demo exercises waiting as a subset of non-buyers')
})

test('custom group labels, empty groups, and missing shopper outcomes survive replay inspection', async () => {
  const { resolveBrandGroups, preferredBrand, summarizePurchases } = await vite.ssrLoadModule('/src/shopper-groups.ts')
  const configured = [
    { id: '751', label: 'Example brand', color: '#e6b23d', role: 'focal' },
    { id: 'own-label', label: 'Example competitor', color: '#e67e57', role: 'competitor' },
  ]
  const people = [
    { shopper_id: 'a', brand: '751', purchase: 'bought' },
    { shopper_id: 'b', brand: 'other-group', purchase: 'no_purchase', waiting: true },
    { shopper_id: 'c', brand: 'waiting' }, // Old replay placeholder without an outcome.
    { shopper_id: 'd', brand: '751' },
    { shopper_id: 'e', brand: '751', purchase: 'no_purchase', waiting: false },
    { shopper_id: 'f', brand: '751', purchase: 'no_purchase' },
  ]
  const groups = resolveBrandGroups(configured, people)
  assert.deepEqual(groups.slice(0, 2), configured)
  assert.deepEqual(groups.map(group => group.id), ['751', 'own-label', 'other-group'])
  assert.equal(preferredBrand(people[2], groups), undefined)
  assert.equal(preferredBrand(people[1], groups), 'other-group')
  assert.deepEqual(summarizePurchases(people), { bought: 1, noPurchase: 3, waiting: 1, waitingUnknown: 1, unknown: 2 })
  assert.deepEqual(resolveBrandGroups([], []), [])
})

test('the map allocates a distinct shop to each group even when several groups share a role', async () => {
  const { marketLayout } = await vite.ssrLoadModule('/src/pixel-market-art.ts')
  const catalog = ['ours', 'rival-a', 'rival-b', 'rival-c', 'other'].map((id, i) => ({
    id, label: id, role: i === 0 ? 'focal' : i === 4 ? 'market' : 'competitor', color: '#dadada',
  }))
  for (const groups of [[], catalog.slice(0, 1), catalog, [...catalog].reverse()]) {
    const layout = marketLayout(groups)
    assert.deepEqual(layout.sites.map(site => site.group.id), groups.map(group => group.id))
    assert.equal(new Set(layout.sites.map(site => site.x + ',' + site.y)).size, groups.length)
    assert.ok(layout.sites.every(site => site.courts.every(bounds => bounds[3] <= layout.height)))
    assert.ok(layout.commons.length > 0)
  }
})

test('a conflicting duplicate observation cannot count a shopper twice', async () => {
  const { uniqueShoppers } = await vite.ssrLoadModule('/src/shopper-snapshot.ts')
  const { summarizePurchases } = await vite.ssrLoadModule('/src/shopper-groups.ts')
  const buyer = { shopper_id: 'same-person', brand: 'ours', purchase: 'bought' }
  const nonbuyer = { ...buyer, purchase: 'no_purchase', waiting: true }
  const canonical = uniqueShoppers([buyer, buyer, nonbuyer])
  assert.equal(canonical.length, 1)
  assert.equal(canonical[0].purchase, undefined)
  assert.deepEqual(summarizePurchases(canonical), { bought: 0, noPurchase: 0, waiting: 0, waitingUnknown: 0, unknown: 1 })
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

test('a shopper who waits still has a preferred group and their trace preserves both facts', async () => {
  const plan = report.plans.find(p => p.role === 'original')
  const result = report.results.find(row => row.plan_id === plan.plan_id && row.scenario_id === 'S3')
  const frame = result.daily.find(day => day.agents.some(shopper => shopper.waiting))
  const shopper = frame.agents.find(person => person.waiting)
  const group = report.brand_groups.find(option => option.id === shopper.brand)
  const trace = await fixtureApi.shopper(run.run_id, shopper.shopper_id, frame.day, result.scenario_id, plan.plan_id)
  const event = trace.events.at(-1)
  assert.equal(event.day, frame.day)
  assert.equal(event.brand, group.label)
  assert.equal(event.purchase, 'no_purchase')
  assert.equal(event.waiting, true)
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

test('Verdict trends preserve missing days and use the selected scenario’s observations', async () => {
  const { replayInsights } = await vite.ssrLoadModule('/src/verdict-insights.ts')
  const replay = {
    scenarios: [{ scenario_id: 'S1', label: 'Quiet' }, { scenario_id: 'S2', label: 'Match' }],
    plans: [{ plan_id: 'p', label: 'Original', role: 'original' }],
    window: { start_day: 1, end_day: 2 }, goal_thb: 500,
    results: [
      { plan_id: 'p', scenario_id: 'S1', daily: [{ day: 1, brand_share_pct: 87 }] },
      { plan_id: 'p', scenario_id: 'S2', daily: [
        { day: 1, brand_share_pct: 0, baseline_share_pct: 10 },
        { day: 4, brand_share_pct: 23, baseline_share_pct: 14 },
      ], goal_attainment: { met_samples: 1, valid_paired_samples: 4 } },
    ],
  }
  const [trend, target] = replayInsights(replay, 'S2')
  assert.deepEqual(trend.rows.filter(row => row.values.plan0 != null).map(row => [row.x, row.values.plan0]), [[1, 0], [4, 23]])
  assert.ok(trend.rows.some(row => row.x > 1 && row.x < 4 && row.values.plan0 == null))
  assert.equal(trend.rows[0].values.baseline, 10)
  assert.equal(target.rows[0].values.target, 25)
})

test('live insight charts distinguish missing estimates, measured zero and unevaluated plans', async () => {
  const { evaluationInsights } = await vite.ssrLoadModule('/src/verdict-insights.ts')
  const metric = (name, value) => ({ metric: name, status: 'available', unit: 'fraction', value })
  const metrics = [
    metric('probability_loss', 0),
    { metric: 'probability_hit_target', status: 'unavailable', unit: 'fraction', value: null },
    metric('subsidy_leakage', { p10: 0, p50: 0.25, p90: 0.75 }),
  ]
  const [odds, leakage] = evaluationInsights([{ label: 'Original', scope: { scenario: 'S2', metrics } }, { label: 'Other scenario' }], 'S2')
  assert.deepEqual(odds.rows, [{ label: 'Original', values: { loss: 0, target: null } }])
  assert.deepEqual(leakage.rows, [{ label: 'Original', values: { p10: 0, p50: 25, p90: 75 } }])
})
