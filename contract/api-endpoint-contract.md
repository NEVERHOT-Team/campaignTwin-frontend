# CampaignTwin Demo 1 · API Endpoint Contract

**For Phee, Big, Mic and Gan. Review draft for contract sign-off.** The five frozen operation names are the integration baseline. New routes, field names, HTTP codes and example values below are proposals unless marked frozen or required by the SRS. Big's published FastAPI OpenAPI at an agreed revision will define the wire contract. The frozen brief came from the earlier backend checkout at `a7981b7`. The current `campaignTwin-backend` checkout has no commits, so these examples have yet to be validated against a published OpenAPI schema.

## Scope and sources

The planner enters a Shopee Thailand potato-chip multipack promotion, resolves material gaps, reviews the original plan and editable Strategist alternatives, and approves exactly what will run. Arena shows progress and supported observations. Verdict compares the approved plans against the paired no-campaign baseline and displays historical evidence separately. The planner can also explicitly open a local replay. The report supports a planner decision. The API has no launch, spend or marketplace write operation.

- **Frozen baseline.** `POST /extract`, `POST /optimize`, `POST /simulate`, `GET /backtest` and `GET /shopper/{id}`, plus the named fields in the [frozen contract brief](../docs/contract-brief.md).
- **Product requirements.** Big's *CampaignTwin software requirements* (21 November 2026), especially §§2, 4–7 and 9, specifies the Demo 1 flow and meaning of results.
- **Scaffold input.** Gan's *Codex Handoff — Backend repo setup*, §§2–4 and 7, describes a proposed mock API. Its fixtures and route aliases can support development while the team agrees on the contract. The data store and backend framework setup are implementation choices.

## Recommended API surface

Paths below are relative to one configured API base URL. Agree whether that URL includes `/api` when Big publishes OpenAPI. Use one React API client. Keep scaffold-specific mappings in its fixture adapter.

| Operation | React sends | FastAPI returns |
|---|---|---|
| **Frozen** `POST /extract` | Brief text and optional known structured business fields. Manual intake can go straight to context with entered fields. | Extracted field candidates with supporting quotes, missing or ambiguous fields, targeted questions and model availability. A failed extraction leaves manual entry and prior answers usable. |
| **Proposed** `POST /plan/context` | Current structured fields with provenance, follow-up answers or edits, and the previous context reference on a revision. | Versioned review context with validated field values, economics, evidence and assumptions; mapped segments; blocking gaps; structured goal; original plan with revision; baseline and scenario configuration references. |
| **Frozen** `POST /optimize` | Context and original-plan revisions. Proposed `action` selects generation or revalidation of edited plans. | Draft candidates, plan revisions, change reasons, hypotheses, supporting references and field-level validation. If strategy is unavailable, return a recoverable status and retain the reviewed original. |
| **Frozen** `POST /simulate` | Explicit approval of the current context, original and included alternatives, scenario configuration and baseline definition. Include a stable submission ID for retry. | Proposed `202` with run ID and status. Atomically validate and freeze the approval and accepted run. |
| **Proposed** `GET /runs/{run_id}` | Run ID. | Stage, measured progress where available, optional provisional Arena observations, and failure or completed report. The same ID addresses both progress and final results. |
| **Frozen** `GET /backtest` | Proposed `run_id` query parameter for the historical artifact associated with the live run. | Separate historical status, protocol, source, case comparability and aligned comparison rows where supported. |
| **Frozen** `GET /shopper/{id}` | Synthetic shopper ID. Add `run_id` if lookup is run-scoped. | Trace with its scope and supported explanation. Return a clear unavailable state or lookup error for an absent trace. |
| **Proposed** `GET /demo/replay` | No request body. The UI calls this after the user selects local replay. | Completed fixture or recorded-run bundle with the same report shape, provenance, captured historical status and any included traces. The read uses a retained local artifact. |

**Why this shape.** Fit context into Gan's proposed `/plan/context` and use his polling pattern for the live run. Keep run acceptance at the frozen `/simulate` operation. Combining approval and run creation binds the reviewed revision set to one run without a separate approval round trip. One run read can carry the terminal report for the demo. If the scaffold exposes status and report separately, the fixture adapter can combine those reads under the proposed run response. Polling gives Arena recovery by run ID and works with indeterminate progress. Exact status names, async response compatibility and route aliases need Big and Phee's sign-off.

## Wire examples and invariants

Examples are synthetic payloads or labeled excerpts. IDs are opaque strings. Each plan reference uses the same `plan_id` that appears on `CampaignPlan` and `SimResult`, plus a revision. Other revision references use `id` and `revision`. Field paths, reference types and the final schema are subject to confirmation.

**Input → context.** Example `POST /extract` request:

```json
{
  "text": "Rehearse a 15% seller voucher for our potato-chip multipack.",
  "known_fields": {"unit_price_thb": 120, "unit_cost_thb": 65}
}
```

Example extraction response excerpt. The fee stays a gap until the planner supplies it or confirms a proposed assumption.

```json
{
  "fields": [
    {
      "field_id": "discount_pct",
      "value": 15,
      "origin": "extracted",
      "source_quote": "15% seller voucher",
      "confirmation": "pending"
    },
    {
      "field_id": "fee_pct",
      "value": null,
      "origin": "unavailable",
      "confirmation": "blocked"
    }
  ],
  "questions": [
    {"field_id": "fee_pct", "prompt": "What fee applies after the seller discount?"}
  ]
}
```

Field origin (`user`, `extracted`, `retrieved`, `calculated`, `proposed`, `unavailable`) describes how a value entered the review. Evidence class describes what supports it, such as a seller-provided business input, a transferred observation, an assumption or a synthetic fixture. These serve different UI labels. Include evidence references and applicability where present. After a user edit, confirm the revised value. Any prior quote remains provenance for the earlier extraction. Scope source quotes to the supplied brief and redact personal details before sending business text to a model. Keep household records out of model calls and suppress or merge household-derived cells below 50, including filtered breakdowns.

The review context must expose the goal (metric, direction, numeric target, unit, comparator and window), supported product/brand/channel, product unit, segment eligibility and scale, promotion and follow-up dates, voucher terms and funding, applicable fee basis/costs, spend cap, minimum unit contribution, permitted levers, baseline definition and scenario assumptions. Resolve material gaps before approval. Keep shared business fields alongside the frozen `CampaignPlan` where feasible. A confirmed zero expense is valid. An unknown expense blocks approval when it could change the decision.

For context creation, send the current structured fields and any answers. For edits, send changed fields and the current context reference. The backend normalizes and validates the revision and returns field IDs that the planner can confirm. The confirmation must match the returned revision and value. For example, a fee lookup or interview can return this context excerpt:

```json
{
  "context": {"id": "ctx-1", "revision": 3},
  "fields": [
    {
      "field_id": "fee_pct",
      "value": 10,
      "origin": "proposed",
      "confirmation": "pending",
      "basis": "net_item_revenue_after_seller_discount"
    }
  ],
  "original_plan": {"plan_id": "plan-original", "revision": 2},
  "baseline": {"id": "baseline-1", "revision": 1},
  "scenario_config": {"id": "scenarios-1", "revision": 1}
}
```

Here 10% is a proposed assumption for the fictional campaign. The backend records the basis and provenance. A material gap with no support remains blocked. If a context or original-plan edit changes a candidate dependency, revalidate or regenerate the affected candidates under the new revision before approval.

**Context → plan review.** Big's SRS permits changes to discount depth, eligible segments and voucher timing within the fixed dates. The React client submits the current context and original-plan revisions for generation, or those revisions plus edited values for revalidation. The server returns the canonical revision of each reviewable plan, guardrails and blocking issues. For example, the request below edits only the discount of an existing candidate:

```json
{
  "action": "revalidate",
  "context": {"id": "ctx-1", "revision": 3},
  "original_plan": {"plan_id": "plan-original", "revision": 2},
  "plan_edits": [
    {"plan": {"plan_id": "plan-alt-1", "revision": 1}, "changes": {"discount_pct": 10}}
  ]
}
```

The returned revision supersedes the edited candidate for new approvals. Refresh any affected review and get confirmation again. An original-plan edit that changes shared inputs goes through context review. A draft candidate can explain hypotheses and cite evidence. The evaluated `StrategistProposal.robust_score` belongs with evaluated results. The SRS permits a valid original-only rehearsal after a strategy failure; the demo acceptance case includes at least one valid reviewed alternative.

**Approval → run.** Proposed `POST /simulate` example, after the user has reviewed all material inputs. Field confirmations attach to the specified context revision; plan references identify the exact included plan revisions.

```json
{
  "submission_id": "submit-1",
  "approval": {
    "context": {"id": "ctx-1", "revision": 3},
    "original_plan": {"plan_id": "plan-original", "revision": 2},
    "included_alternatives": [{"plan_id": "plan-alt-1", "revision": 2}],
    "baseline": {"id": "baseline-1", "revision": 1},
    "scenario_config": {"id": "scenarios-1", "revision": 1},
    "confirmed_field_ids": ["discount_pct", "fee_pct", "fixed_campaign_spend_thb"]
  }
}
```

The field IDs illustrate extracted and proposed values. The client's explicit approval action submits the references for the exact context and each plan the planner confirmed. The backend checks required confirmations, unresolved blockers, guardrails and revision dependencies, including whether the selected plans belong to this context and original-plan revision. A material edit to fee, budget, goal, audience or timing invalidates affected review state. Preserve accepted runs and their source versions as drafts change.

Treat `submission_id` as a proposed idempotency key. The client generates one ID per intended run and reuses it with the same approval if the response is lost. The server checks an existing accepted submission before checking draft freshness and creates at most one run even if identical requests arrive together. Return the existing run ID on an exact retry. A reused ID with different approval data conflicts. A new submission against stale revisions fails before a run is created.

**Run → Arena.** The proposed `202 Accepted` response is `{"run_id":"run-1","status":"queued"}`. Then `GET /runs/run-1` can return:

```json
{
  "run_id": "run-1",
  "status": "simulating",
  "progress": {"completed": 6, "total": 18, "unit": "engine_blocks"},
  "report": null
}
```

| Proposed stage | What the client can show |
|---|---|
| `queued`, `simulating`, `evaluating` | Stage and supported provisional Arena observations. `report` is null. Show indeterminate progress when measured counts are unavailable. A count applies to the current stage and its stated work unit. |
| `complete` | Evaluated report, including integrity outcome. A published integrity failure or insufficient result coverage can still explain the outcome while withholding the ordinary recommendation and any affected ranking. |
| `failed` | Terminal operational failure with stage, stable code, message and recovery. `report` is null. |

A 1–2 second polling interval is a starting point from Gan's scaffold. Keep one poll in flight per active run. Resume using the same run ID after a transient read error, and stop on a terminal stage. Provisional Arena observations carry no final rank.

For rejected requests, propose one error envelope with optional field and plan issues. Use `422` for invalid inputs, `409` for stale review or a conflicting submission ID, and `404` for an unknown run or trace identifier. Reading a known failed run can still return `200` with `status: "failed"`. Big and Phee need to agree on how FastAPI request-validation errors fit this envelope. Example stale response:

```json
{
  "error": {
    "code": "STALE_APPROVAL",
    "message": "The fee changed after this context was reviewed.",
    "issues": [{"field_id": "fee_pct", "code": "RECONFIRM_REQUIRED"}],
    "recovery": "review"
  }
}
```

**Arena → Verdict.** Use a plan catalog with roles `original`, `alternative` and `baseline`, and rows keyed by plan and scenario. Include each approved alternative and the comparable baseline outcomes. Only eligible campaign plans participate in the campaign ranking. A normal recommendation names the original, a specific alternative or hold. Use a missing recommendation with an integrity or coverage reason when the result cannot support one. Include sample coverage, guardrails, plan changes and reasons, confidence and evidence, and any supported breakpoint. Keep simulation integrity, confidence and historical validation separate. Expose sufficient risk and scenario data to explain why a recommendation changes.

Use the approved horizon and compatible time buckets for plan and baseline. Demo 1 includes the promotion and 14 days of follow-up. Resolve frozen `daily[]` versus scaffold `weekly[]` before binding charts. If results are daily and the report needs weekly ranges, the evaluator aggregates compatible values per seed before computing percentiles. Supply bucket boundaries and units. Do not sum displayed quantiles.

Pair outcomes by scenario and seed, using the same underlying population, window and background conditions. Apply shared background events to both arms. A rival reaction triggered only by the campaign voucher is absent in the no-campaign arm. Compute incremental profit after costs in THB by taking plan contribution minus baseline contribution per paired seed, then summarizing the paired differences. Deduct the seller voucher once in net sales and show its redeemed value in the separate spend ledger. Goal attainment uses the number of valid paired samples that meet the goal divided by all valid paired samples for that plan and scenario. In the sample, the goal is at least ฿5,000 incremental profit across the approved horizon. Show unavailable when coverage cannot support a share. The backend evaluates both ranking and goal attainment, and the UI displays each separately.

The voucher demo lacks attributed sales and ad spend. Proposed evaluated row excerpt with an explicit null for frozen `roas`:

```json
{
  "plan_id": "plan-original",
  "scenario_id": "S3",
  "metrics": {
    "incremental_profit_thb": {"p10": -1600, "p50": 5200, "p90": 9100},
    "roas": null
  },
  "metric_unavailable_reasons": {
    "roas": "No attributed sales or modeled ad spend."
  },
  "goal_attainment": {"met_samples": 11, "valid_paired_samples": 20}
}
```

Supported repeat and brand metrics need their units, denominator or modeled scale. Use a null value and a reason for an unavailable metric; zero remains a measurement. For timeline lists, distinguish an available list with no events from a series the backend could not produce. An available shopper trace may have no events, or no supported explanation. For an unknown trace ID, use the lookup error. The proposed rival cases are S1 no incremental response, S2 plausible match and S3 stronger undercut. Show them as stress scenarios while evidence is sparse. Big, Mic and the data lead confirm scenario labels and policies. Display empirical likelihood only when the data lead can substantiate it.

**Historical check and replay.** A historical row aligns the observed, simulated and naive quantities on the metric, unit, cohort and window and carries the appropriate coverage, limitations and protocol. For a missing case, use an explicit status and gaps. Proposed example:

```json
{
  "run_id": "run-1",
  "historical_check": {
    "case_id": null,
    "dataset": "complete_journey",
    "status": "insufficient",
    "comparability": "insufficient",
    "benchmark_outcome": null,
    "metrics": [],
    "gaps": ["No eligible campaign with verified coverage for the selected category."]
  }
}
```

Historical status is independent of simulation integrity and benchmark outcome. Proposed statuses are `pending` while evaluation is expected, `complete` after evaluation, `insufficient` when evidence cannot support evaluation, and `failed` after an evaluation error. An agreed benchmark outcome is available only after the check can be evaluated. A completed evaluation can miss the benchmark. Historical coverage does not gate the live run if the simulation inputs are otherwise valid. Keep source-native units and qualify comparability. Complete Journey is a potential grocery proxy. Data coverage and the validation coworker's protocol determine what is reportable.

For replay, use a stable `replay_id` and an explicit source class (`recorded_run` or `synthetic_fixture`). A recorded replay includes its original run ID and timestamp, approval snapshot, versions and historical artifact or availability reason captured at export. A synthetic fixture has a fixture version and may have null original-run metadata. Use the bundle's report and optional traces and history locally. Keep a failed live run visible and have the planner select replay separately.

## How to use Gan's scaffold

| Gan's proposed fixture API or field | Decision for the integration contract |
|---|---|
| `POST /api/brief/parse` returns flat `CampaignSpec` and questions | Use it to exercise intake in fixture mode. The frozen operation is `/extract`. Live review needs field-level quotes, provenance and explicit gaps. |
| `POST /api/plan/context` returns `ContextPack` | Reuse the route concept. Add review revisions, a structured goal, scenario/baseline references and the evidence needed at the approval gate. |
| `POST /api/runs` accepts a raw `SimulationPlan` | Fixture initiation can use the scaffold route. Live initiation needs the frozen `/simulate` operation, with server-validated approval for the exact context and included plan set. |
| `GET /api/runs/{run_id}` and `GET /api/runs/{run_id}/report` | Reuse polling and canonical run identity. Gan's `running/done/error` and scripted `0→1` are mock behavior. Show a measured percentage in live only when actual work units exist. |
| `Strategy`, `weekly[]`, `incr_profit`, required `iroas` and scenario likelihood | Keep scaffold names local to its fixture adapter. Big and Mic reconcile canonical plan IDs, timeline grain and metric availability with the frozen types. Voucher-only ad ROAS is unavailable. Scenario likelihood needs evidence. |
| `GET /api/demo/replay` combines status and report | Reuse the bundle pattern. Include origin, snapshot, versions and historical status. Keep synthetic numbers visibly labeled. |
| 40% original, 20% plus loyalty alternative, week 3 failure | Keep this as a scaffold-only narrative. Build the shared approval fixture around Big's 15% voucher and 25% maximum. A breakpoint or winning alternative must come from the evaluator in live mode. |

Gan's route list does not include `/optimize`, `/backtest` or `/shopper/{id}`. If the frontend uses the scaffold for screen development, represent these via explicit fixtures or unavailable states until Big publishes their contracts. Keep sample seed counts, shopper counts, week totals, database implementation and timer delays out of frontend assumptions.

## Sign-off and shared fixtures

| Freeze before binding live | Who confirms |
|---|---|
| Base URL, routes, operation bodies, candidate revalidation, errors, missing-value convention, approval revisions and retry behavior | Big + Phee |
| Real progress counters, time grain and boundaries, shopper trace scope, seed coverage, percentile method, cross-scenario P10 score and tie-break, supported repeat/brand outputs | Mic + Big; Phee confirms rendering needs |
| Currency and quantity conventions, fee/tax basis, decimal encoding, percentage encoding and timestamp display. Proposed wire convention is 0–100 for fields named `*_pct` (15 means 15%), with money in THB and per-unit values per sellable multipack. Use Asia/Bangkok for live date display. Preserve the frozen `budget_split` rule that shares sum to 1. | Big + Mic + Phee |
| Context evidence classes, supported scenario policy and source coverage, historical case/protocol and confidence inputs | Big + Mic + Gan/data lead; designated validation coworker confirms historical method and thresholds |

Big publishes OpenAPI and a small fixture set. Phee types the client from that revision and checks the live-response fixtures against it before binding the React UI. Gan's scaffold can use separate mock shapes inside its fixture adapter. Separate engineering acceptance from the data milestone for a valid historical case.

1. **Intake and strategy** · Extract the 15% source quote, leave the fee unresolved, then confirm the proposed 10% fee and ฿0 fixed spend. Compare one eligible candidate with the original. Demonstrate that an included voucher above 25% blocks approval.
2. **Approval and retry** · Edit a fee or an included plan after review. Reject stale revisions on a new submission. Send the same approval and submission ID twice, including concurrent requests, and verify both recover one run ID.
3. **Arena and replay** · Exercise indeterminate and measured progress, evaluated completion, failed integrity and operational failure. Open synthetic and recorded replay explicitly. Verify replay provenance and captured historical status, including a bundle without a shopper trace.
4. **Verdict and accounting** · Compare approved plans and no-campaign baseline by scenario. Check the sample original's ฿26.80 contribution per redeemed multipack (฿120 × 0.85 − ฿65 − ฿10.20) under the stated assumptions. Show unavailable ad ROAS and independent historical pending, insufficient, failed and complete variants.

**Sources for review.** [Repository frozen contract brief](../docs/contract-brief.md). Big's *CampaignTwin software requirements*, §§2 (approval), 3 (evidence), 4 (interfaces), 5 (results), 6–7 (historical and acceptance) and 9 (scope). Gan's *Codex Handoff — Backend repo setup*, §§2–4 (scaffold contracts and fixtures) and 7 (scaffold tests).
