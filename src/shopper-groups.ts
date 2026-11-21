import { defaultBrandGroups, type Agent, type Brand, type BrandGroup, type MapZone } from './model'

export function preferredBrand(agent: Agent, groups?: BrandGroup[]): Brand | undefined {
  if (!agent.brand) return undefined
  // The original fixture stored an undecided state in its brand field.
  if (agent.brand === 'waiting' && !groups?.some(group => group.id === 'waiting')) return undefined
  return agent.brand
}

export function resolveBrandGroups(config: BrandGroup[] | undefined, agents: Agent[]): BrandGroup[] {
  const groups = new Map(config?.map(group => [group.id, group]))
  for (const agent of agents) {
    const id = preferredBrand(agent, config)
    if (id === undefined || groups.has(id)) continue
    const fallback = defaultBrandGroups.find(group => group.id === id)
    groups.set(id, fallback ?? { id, label: id, role: 'market', color: '#b6b6b6' })
  }
  return [...groups.values()]
}

export function summarizePurchases(agents: Agent[]) {
  const counts = { bought: 0, noPurchase: 0, waiting: 0, waitingUnknown: 0, unknown: 0 }
  for (const agent of agents) {
    if (agent.purchase === 'bought') counts.bought++
    else if (agent.purchase === 'no_purchase') {
      counts.noPurchase++
      if (agent.waiting === true) counts.waiting++
      else if (agent.waiting !== false) counts.waitingUnknown++
    } else counts.unknown++
  }
  return counts
}

export function mapZoneFor(agent: Agent, groups?: BrandGroup[]): MapZone {
  if (agent.purchase !== 'bought') return 'commons'
  const id = preferredBrand(agent, groups)
  if (id === undefined) return 'commons'
  const group = groups?.find(item => item.id === id) ?? defaultBrandGroups.find(item => item.id === id)
  if (group?.role === 'focal') return 'ours'
  if (group?.role === 'competitor') return 'rival'
  return 'market'
}
