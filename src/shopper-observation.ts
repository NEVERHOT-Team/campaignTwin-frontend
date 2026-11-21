import type { Agent, BrandGroup } from './model'
import { preferredBrand } from './shopper-groups'

export function wouldBuyLabel(agent: Agent, groups: BrandGroup[]) {
  const choice = preferredBrand(agent, groups)
  return groups.find(group => group.id === choice)?.label ?? choice
}

export function purchaseLabel(agent: Agent, groups: BrandGroup[]) {
  if (agent.purchase === 'bought') {
    const label = wouldBuyLabel(agent, groups)
    return label ? `Bought from ${label}` : 'Bought · brand unavailable'
  }
  if (agent.purchase === 'no_purchase') {
    return agent.waiting === true ? 'No purchase · waiting for a promotion' : 'No purchase'
  }
  return 'Purchase outcome unavailable'
}
