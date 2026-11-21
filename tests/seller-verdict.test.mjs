import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'

const cacheDir = await mkdtemp(join(tmpdir(), 'campaigntwin-approvals-test-'))
const vite = await createServer({
  configFile: false, cacheDir, optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, ws: false, hmr: false, watch: null },
})
after(async () => { await vite.close(); await rm(cacheDir, { recursive: true, force: true }) })
const { isolatedFeeChange, relatedApprovals } = await vite.ssrLoadModule('/src/v2/seller-decision.ts')

// Only fields that bind an approval, execution, and economic comparison are relevant here.
function snapshot(revision, fee) {
  const identity = { approval_id: 'approval-' + revision, review_id: 'review-A', revision }
  const run_id = 'run-' + revision
  const costs = {
    payment_fee: { status: 'confirmed', unit: 'THB_per_order', value: fee, basis: 'Fee per kept order' },
    cogs: { status: 'confirmed', unit: 'THB_per_pack', value: 60 },
  }
  const data_versions = { catalog: 'tissue', market: 'cost-hash-' + fee, segments: 'buyers', evaluation_policy: 'voucher-v2' }
  const campaign_window = { start_date: '2026-12-01', end_date: '2026-12-08' }
  const plans = ['original', 'conservative', 'baseline'].map(role => ({
    role,
    input: { ...identity, data_versions, plan_id: run_id + '/' + role, role, seeds: [0, 1], costs: structuredClone(costs),
      paired_baseline_id: run_id + '/baseline', parent_plan_id: role === 'conservative' ? run_id + '/original' : null,
      offer: role === 'baseline' ? null : { discount: { kind: 'voucher', unit: 'THB', value: role === 'original' ? 10 : 5 } },
      campaign_window, total_budget_thb: 1000, subsidy_budget: 1000, evaluation: { behavior: { discount_response: 8 } } },
    scenario_results: [{ scenario: 'S1', paired_seed_count: 2, seed_ledgers: [{ seed: 0 }, { seed: 1 }] }],
  }))
  return {
    report: { ...identity, run_id, data_versions, measurement_window: campaign_window, comparator: 'paired_no_campaign',
      plan_results: plans, recommendation: { status: 'hold' } },
    input: { run_id, approval_id: identity.approval_id, review: { review_id: identity.review_id, revision, costs } },
  }
}

test('only earlier independently approved runs from the same review can be compared', () => {
  const before = snapshot(1, 2), current = snapshot(2, 7)
  assert.equal(relatedApprovals(current, before), true)
  assert.equal(relatedApprovals(before, current), false)
  assert.equal(relatedApprovals(current, current), false)
  for (const mismatch of [
    s => { s.input.review.review_id = s.report.review_id = 'other-review' },
    s => { s.input.approval_id = before.input.approval_id },
    s => { s.report.run_id = before.report.run_id },
    s => { s.input.review.revision = 1 },
  ]) {
    const wrong = structuredClone(current)
    mismatch(wrong)
    assert.equal(relatedApprovals(wrong, before), false)
  }
})

test('fee-only attribution allows a confirmed zero and a changing cost fingerprint, and rejects mixed edits', () => {
  const before = snapshot(1, 2)
  assert.equal(isolatedFeeChange(snapshot(2, 7), before), true)
  assert.equal(isolatedFeeChange(snapshot(2, 0), before), true)
  assert.equal(isolatedFeeChange(snapshot(2, 2), before), false)
  for (const mismatch of [
    s => { s.input.review.costs.payment_fee.value = null },
    s => { s.input.review.costs.payment_fee.status = 'reference_only' },
    s => { s.input.review.costs.payment_fee.unit = 'pct' },
    s => { s.report.plan_results[1].input.costs.payment_fee.value = 2 },
    s => { s.report.plan_results[0].input.costs.cogs.value++ },
    s => { s.report.plan_results[1].input.offer.discount.value = 4 },
    s => { s.report.plan_results[1].input.evaluation.behavior.discount_response++ },
    s => { s.report.plan_results[1].input.parent_plan_id = 'unrelated' },
    s => { s.report.plan_results[1].input.paired_baseline_id = 'another-baseline' },
    s => { s.report.plan_results[0].scenario_results[0].seed_ledgers[1].seed = 0 },
    s => { s.report.plan_results[0].scenario_results[0].paired_seed_count-- },
    s => { s.report.data_versions.segments = 'different-population' },
    s => { s.report.recommendation.reason = 'incomplete_pairing' },
  ]) {
    const edited = snapshot(2, 7)
    mismatch(edited)
    assert.equal(isolatedFeeChange(edited, before), false, mismatch.toString())
  }
})
