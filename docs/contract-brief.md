# Frozen contract summary

This is the contract summary from Section 9 of the Campaign Rehearsal hackathon brief. It gives both repos a common reference during preparation. On build day, the backend owns the agreed schema and publishes the corresponding OpenAPI. Compare that schema with this summary before wiring the client and flag any discrepancy to the two repo owners.

| Type | Fields from the brief |
|---|---|
| `Segment` | `segment_id`, `name`, `households` (≥50), `share_of_market`, `weekly_purchase_prob`, `avg_basket_thb`, `price_sensitivity`, `promo_response`, `loyalty_tendency`, `channel_pref{}`, `brand_share{}`, `source` (`data\|default`) |
| `CampaignPlan` | `plan_id`, `label`, `brand`, `discount_pct`, `start_day`, `end_day`, `total_budget_thb`, `budget_split{}` (sums to 1), `target_segments[]`, `message_id`, `constraints{max_discount_pct, must_include[]}` |
| `Scenario` | `scenario_id`, `label`, `shocks[{type, severity, day}]` |
| `SimResult` | `plan_id`, `scenario_id`, `seeds`, `metrics{incremental_profit_thb, roas, new_buyers, repeat_rate, brand_attitude_change_post}` (each has `p10/p50/p90`), `guardrails[{name, pass}]`, `daily[]`, `competitor_actions[{day, brand, action, value, reason}]` |
| `StrategistProposal` | `plan`, `changes[{lever, from, to, why}]`, `robust_score` (P10 profit across scenarios), `summary` |
| `ShopperTrace` | `shopper_id`, `segment_id`, `traits{price_sensitivity, loyalty}`, `memory_by_day{brand → awareness, attitude}`, `events[{day, type, brand, channel, detail}]` (type is exposed, purchased, switched, or ignored) |

Endpoints in the brief are `POST /extract`, `POST /simulate`, `POST /optimize`, `GET /backtest`, and `GET /shopper/{id}`.

The summary leaves some wire details open, including endpoint envelopes, extraction quotes and confirmations, sales ranges, the shape of `daily[]`, the shopper explanation, and back-test details. Agree on the relevant shape before adding fields or binding UI. Treat an unknown value as unavailable until it has a source.
