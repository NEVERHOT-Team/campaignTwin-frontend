import type { Agent } from './model'

/** One observation per modeled shopper in a single frame, independent of array order. */
export function uniqueShoppers(source: readonly Agent[]): Agent[] {
  const byId = new Map<string, Agent>()
  for (const row of source) {
    if (!row || typeof row.shopper_id !== 'string' || !row.shopper_id.trim()) continue
    const brand = typeof row.brand === 'string' ? row.brand : ''
    const purchase = row.purchase === 'bought' || row.purchase === 'no_purchase' ? row.purchase : undefined
    const waiting = purchase === 'no_purchase' && typeof row.waiting === 'boolean' ? row.waiting : undefined
    const exposure = typeof row.promotion_exposed === 'boolean' ? row.promotion_exposed : undefined
    const previous = byId.get(row.shopper_id)
    if (!previous) {
      byId.set(row.shopper_id, { ...row, brand, purchase, waiting, promotion_exposed: exposure })
      continue
    }
    // A conflicting or missing fact stays unresolved until the source disambiguates it.
    const agreedPurchase = previous.purchase === purchase ? purchase : undefined
    byId.set(row.shopper_id, {
      ...previous,
      brand: previous.brand === brand ? brand : '',
      purchase: agreedPurchase,
      promotion_exposed: previous.promotion_exposed === exposure ? exposure : undefined,
      waiting: agreedPurchase === 'no_purchase' && previous.waiting === waiting ? waiting : undefined,
    })
  }
  return [...byId.values()]
}
