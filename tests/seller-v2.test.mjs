import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { createServer } from 'vite'

// This integration test creates two approvals and runs on the supplied test service.
const origin = process.env.V2_TEST_ORIGIN

test('a THB 2 to 7 fee change requires a fresh approval and preserves both evaluated ledgers', {
  skip: !origin && 'Set V2_TEST_ORIGIN to a running v2 test server',
  timeout: 90_000,
}, async t => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'campaigntwin-v2-test-'))
  const vite = await createServer({
    configFile: false, cacheDir, optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, ws: false, hmr: false, watch: null },
  })
  t.after(async () => {
    await vite.close()
    await rm(cacheDir, { recursive: true, force: true })
  })
  const { createV2Client, V2ApiError } = await vite.ssrLoadModule('/src/v2/client.ts')
  const api = createV2Client(origin)
  const directory = await api.discover()
  const response = await fetch(new URL(directory.schema, origin))
  assert.ok(response.ok)
  const schema = await response.json()
  const content = schema.paths[directory.create_review].post.requestBody.content['application/json']
  const { feeDemo, formFromFields, formFields } = await vite.ssrLoadModule('/src/v2/seller-fields.ts')
  const fields = formFields(formFromFields(feeDemo))
  const { channel, ...publishedFields } = fields
  assert.equal(channel, 'shopee')
  assert.deepEqual(publishedFields, content.examples.sellerMarginCheck.value.fields)
  const first = await api.create({ fields })
  assert.equal(first.review.status, 'ready_for_approval')
  let initialRun
  let initialSubmission
  for (const [fee, recommendation, medians, contribution] of [
    [2, 'revise', [767, 1038, 0], [28, 33]],
    [7, 'hold', [534.5, 770.5, 0], [23, 28]],
  ]) {
    const session = fee === 2 ? first : await api.turn(first, {
      base_revision: first.review.revision, edits: { order_fee_thb: fee },
    })
    assert.equal((await api.current(first.review.review_id)).review.revision, session.review.revision)
    const receipt = await api.approve(session)
    const submission = { approval_id: receipt.approval_id, submission_id: randomUUID() }
    if (initialSubmission) {
      await assert.rejects(api.submit({ ...initialSubmission, submission_id: randomUUID() }),
        error => error instanceof V2ApiError && error.problem.code === 'approval_stale')
      await assert.rejects(api.submit({ ...submission, submission_id: initialSubmission.submission_id }),
        error => error instanceof V2ApiError && error.problem.code === 'submission_id_conflict')
    }
    const accepted = await api.submit(submission)
    assert.deepEqual(await api.submit(submission), accepted)
    let state = await api.status(accepted.status_url)
    while (state.status === 'queued' || state.status === 'running') {
      await delay((state.poll_after_seconds ?? 1) * 1000, undefined, { signal: t.signal })
      state = await api.status(accepted.status_url, t.signal)
    }
    assert.equal(state.status, 'done')
    await assert.rejects(api.submit({ ...submission, submission_id: randomUUID(), retry_of_run_id: accepted.run_id }),
      error => error instanceof V2ApiError && error.problem.code === 'retry_not_allowed')
    const [report, evaluation, snapshot] = await Promise.all([
      api.report(state.report_url), api.businessEvaluation(accepted.run_id), api.runInput(accepted.run_id),
    ])
    for (const resource of [report, evaluation, snapshot]) {
      assert.equal(resource.run_id, accepted.run_id)
      assert.equal(resource.approval_id, receipt.approval_id)
    }
    assert.equal(snapshot.review.revision, session.review.revision)
    assert.equal(snapshot.review.commercial_inputs.order_fee_thb, fee)
    assert.equal(report.recommendation.status, recommendation)
    assert.deepEqual(evaluation.recommendation, report.recommendation)
    for (const [index, role] of ['original', 'conservative', 'baseline'].entries()) {
      const plan = report.plan_results.find(item => item.role === role)
      const comparison = evaluation.comparisons.find(item => item.plan_id === plan.input.plan_id)
      assert.deepEqual(comparison.scenario_results, plan.scenario_results)
      const scenario = plan.scenario_results.find(item => item.scenario === 'S1')
      assert.equal(scenario.seed_ledgers.length, scenario.paired_seed_count)
      assert.ok(scenario.seed_ledgers.length > 0)
      assert.equal(scenario.metrics.find(m => m.metric === 'incremental_profit').value.p50, medians[index])
      if (role !== 'baseline') {
        const assessment = report.recommendation.assessments.find(item => item.plan_id === plan.input.plan_id)
        assert.equal(assessment.checks.find(check => check.metric === 'unit_contribution').observed, contribution[index])
      }
    }
    if (fee === 2) {
      initialRun = accepted.run_id
      initialSubmission = submission
    }
  }
  assert.equal((await api.runInput(initialRun)).review.commercial_inputs.order_fee_thb, 2)
  await assert.rejects(api.turn(first, { base_revision: first.review.revision, edits: { order_fee_thb: 9 } }),
    error => error instanceof V2ApiError && error.status === 409 && error.problem.code === 'stale_review')
})
