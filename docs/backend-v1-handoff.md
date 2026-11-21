# CampaignTwin frontend and backend agreement

The live planner targets the implemented seven-operation API at backend `dev@26e5e96`, including Big’s implementation at `45a3bdc`. Its published version is `1.0.0`. The backend checkout tracks `dev`. GitHub `main@80b3fcc` still has the older fixture API. The separate review-and-approval draft is historical. [Pinned wire contract](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/26e5e96/docs/campaigntwin-api-v1.openapi.yaml) · [Review implementation](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/26e5e96/api/v1_reviews.py)

## Who fills what

A planner can start with a brief, one structured field, or both. Saving a blocked review is supported. The exact merchandising intake for future seller campaigns still needs Big’s next specification. The current screen exposes only fields accepted by this version.

| Input | Planner’s part | Backend’s part |
|---|---|---|
| Product and pack | Describe the product or selling pack. Explicitly select a returned exact choice or confirm a quoted suggestion. | Supply the catalog options, choice/product/pack IDs, supported offers, timezone and category. Product and pack hints are optional for the runnable choice. The current catalog contains a single **synthetic 12-roll toilet-tissue listing on Shopee**. |
| Channel | May enter a platform name, including an unsupported one. | Normalize the name, retain unsupported intent with a blocker, and derive Shopee if the selected demo listing has no entered channel or pending channel suggestion. |
| Audience and objective | State the audience and objective. | Resolve segment IDs and measurement support. The current synthetic evaluator requires all eligible buyers and incremental profit. |
| Budget and dates | Give a total subsidy cap in THB and a first active and first inactive date. A supplied zero is valid input. | Resolve relative interview dates in the market timezone, ask for confirmation, and add the post-campaign measurement window. The general readiness window is up to 56 days. This evaluator accepts 1–42 active days plus 14 follow-up days. |
| Offer | Describe one offer. Structured intent can include kind, value, unit, minimum spend, redemptions per shopper, and eligibility. Some requested mechanics save as blocked. | Resolve exact terms, funder, stacking and eligible orders. For broad all-buyer intent, missing eligibility can be derived as `all`. Current execution supports 0.01–30% off or a 0.02–30 THB whole-satang voucher without threshold or per-user cap. |
| Costs, policy and evidence | Review the supplied evidence and approve the exact revision. | Supply costs, their basis and source, immutable data versions, aggregate segment statistics, seeds, assumptions, baseline, conservative alternative and decision gates. A confirmed cost with source `default` is a synthetic policy assumption. |

The frontend submits neither seller fee schedules nor hand-entered unit economics on v1. Synthetic assumptions currently include a THB 100 regular price, THB 60 COGS per pack, and no fees or paid media. Commercial seller coverage still depends on applicable verified evidence. [Catalog and policy](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/26e5e96/api/v1_catalog.py)

## Request flow

All paths are relative to `/api/v1`. The JSON API serves a single trusted local planner. The browser sends no API keys and uses the server’s configured planner identity. A separately hosted frontend can set `VITE_API_BASE_URL` to the backend origin and add the frontend origin to backend `CORS_ORIGINS`. Vite proxies same-origin requests to port 8000. [Client](../src/v1/client.ts) · [Generated wire declarations](../src/v1/schema.d.ts)

| Operation | Request | Response and interaction |
|---|---|---|
| POST /campaign-reviews | Nonempty brief up to 1000 characters, sparse planner fields, or both | 201 saves the first revision. Present the highest-priority question, other open questions, current facts, origins and quoted candidates. |
| GET /campaign-reviews/{review_id} | Current interaction ID | Restore the latest saved review when the tab reloads. The browser preserves its local transcript and current run link in tab session storage. The API returns current facts, candidates and questions. |
| POST /campaign-reviews/{review_id}/revisions | `base_revision` with either a natural-language `answer` up to 1000 characters, or structured `edits` and/or `confirm` candidate IDs | An answer creates its own revision. Present quotes from the brief or answer and explicitly confirm candidate IDs from the **current** revision. Local deterministic extraction remains available without an LLM key. Edited fields replace their complete value, including an edited offer. Null clears a field. Omitted fields carry forward. A stale 409 returns the latest review for a manual rebase. |
| POST /campaign-reviews/{review_id}/approvals | `revision` and explicit `confirmed: true` | Returns the receipt for that exact ready revision. A new revision requires renewed approval. |
| POST /runs | `approval_id`, client `submission_id`, and optional `retry_of_run_id` | First submission returns 202. Reuse its ID after a lost response. An identical repeat returns the existing run. A retryable terminal failure takes a fresh ID with its parent run. |
| GET /runs/{run_id} | The accepted run’s status URL | Follow server poll intervals while pending. The current local synthetic screen normally finishes during submission. A terminal error carries the failure and retryability. |
| GET /runs/{run_id}/report | The completed run’s report URL | Display the evaluation, percentiles, scalar probabilities, unavailable reasons and per-plan inputs/results when returned. Validate the run, review, approval and revision identity. |

## Results and Arena scope

The connected Arena shows real per-plan aggregate results for the selected run. Its market illustration does not assign real shopper positions. The synthetic evaluator compares the submitted offer, a conservative half-discount alternative, and the paired no-campaign baseline in **S1**. The verdict applies to the submitted plan. It exposes frozen inputs and the reasons for alternative changes. The app uses the backend’s decision and never infers a recommendation from a chart. Missing ROAS, buyer coverage or other metrics retain their reason codes. [Evaluator](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/26e5e96/engine/synthetic.py)

V1 returns aggregate comparisons. It does not publish shopper IDs, per-shopper traces, per-day map frames, or a held-out back-test. The selectable shoppers and rival scenarios in **Demo arena** use a labeled, independent fixture. The app keeps that walkthrough separate from submitted v1 results. An engine-backed Arena will need an agreed observation stream or read model covering timeline grain, stable simulated IDs, per-plan and per-scenario identity, preference state and companion traces.

## Verification

All seven operations were exercised with the actual FastAPI app on `dev@26e5e96` in isolated JSON mode with local deterministic extraction. Runtime OpenAPI v1 paths and schemas matched the repository YAML. The connected browser walkthrough exercised a brief, session reload, a natural-language answer, eight quote-backed candidate confirmations, derived channel and eligibility, explicit approval, Arena and Verdict, both alternative and baseline comparisons, run reload and mobile overflow checks. The real response to the runnable sample included S1 and all three plans. The backend’s 22 review-flow tests passed. Local server integration establishes compatibility for the synthetic workspace. It does not establish production availability or calibrated seller-specific results.
