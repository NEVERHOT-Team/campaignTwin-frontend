import type { Review } from './client'
import { humanize } from './planner'

export function ReviewEvidence({ review, summary = 'Evidence and assumptions' }: { review: Review; summary?: string }) {
  const {resolved_product: product, resolved_offer: offer, evaluation} = review
  const segments = review.segments.filter(s => s.households >= 50)
  return <details className="v1-evidence">
    <summary>{summary}</summary>
    <h3>Product and offer</h3>
    <p>{product ? `${product.label} · ${product.pack_label} · ${humanize(product.channel)} · ${product.timezone}` : 'Awaiting an exact product and selling pack.'}</p>
    {offer && <p>{humanize(offer.discount.kind)} · {offer.discount.value} {offer.discount.unit} · {humanize(offer.discount.eligibility ?? '')} · {offer.funder} funded · {offer.stackable ? 'stackable' : 'single offer'} · up to {offer.max_redemptions_per_order} per order · {offer.eligible_order_scope}{offer.min_spend_basis && ' · ' + offer.min_spend_basis}</p>}
    {Object.keys(review.costs).length > 0 && <><h3>Cost evidence</h3><dl>{Object.entries(review.costs).map(([key, item]) =>
      <div key={key}><dt>{humanize(key)} · {humanize(item.status)}</dt><dd>{item.value === null ? 'Unknown' : `${item.value} ${item.unit ?? ''}`}{item.basis && ' · ' + item.basis}{item.reason && ' · ' + item.reason}{item.source && ' · ' + item.source}{item.evidence_ref && ' · ' + item.evidence_ref}</dd></div>)}</dl></>}
    <h3>Audience</h3><p>{review.target_segment_ids === null ? 'Audience unresolved.' : review.target_segment_ids.length ? review.target_segment_ids.join(', ') : 'All eligible buyers.'}</p>
    {segments.map(s => <p key={s.segment_id}>{humanize(s.name)} · {s.households} households · {(s.share*100).toFixed(1)}% of category · {(s.weekly_purchase_probability*100).toFixed(1)}% weekly purchase probability</p>)}
    {evaluation && <><h3>Evaluation</h3><p>{evaluation.scenarios.join(', ')} · Paired no-campaign comparison · {evaluation.measurement_window.start_date} to {evaluation.measurement_window.end_date} (exclusive) · Maximum loss probability {evaluation.max_loss_probability*100}%{evaluation.goal_target && ` · Target ${evaluation.goal_target.metric} ≥ ${evaluation.goal_target.minimum} ${evaluation.goal_target.unit}`}</p>
      {evaluation.assumptions?.length ? <ul>{evaluation.assumptions.map(a => <li key={a}>{a}</li>)}</ul> : null}</>}
    <h3>Data versions</h3><dl>{Object.entries(review.data_versions).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{value ?? 'Unresolved'}</dd></div>)}</dl>
  </details>
}
