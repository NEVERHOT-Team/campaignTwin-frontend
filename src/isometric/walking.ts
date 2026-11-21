import type { Agent, BrandGroup, MapZone } from '../model'
import { mapZoneFor } from '../shopper-groups'

export type GroundPoint = { x: number; y: number }
type Footprint = [left: number, near: number, right: number, far: number]
// Ground plans of roofs, counters, fountain, trees and street furniture in the Blender model.
const occupied: Footprint[] = [
  [-6.54, 0.96, -1.5, 4.56],
  [2.03, 1.0, 6.35, 4.48],
  [-7.95, -3.56, -4.59, -1.45],
  [4.72, -3.83, 8.2, -1.67],
  [-1.05, -0.72, 1.05, 1.4],
  [-1.87, -4.92, 1.9, -3.94],
  [-7.99, 3.02, -6.79, 4.62],
  [6.67, 3.2, 8.36, 4.75],
  [-8.49, -0.83, -7.48, 0.25],
  [7.43, -0.45, 8.5, 0.7],
  [-4.58, -4.98, -4.03, -4.43],
  [3.02, -4.98, 4.62, -4.43],
]
const districts: Record<MapZone, Footprint[]> = {
  ours: [
    [-7.65, -0.78, -1.22, 0.83],
    [-4.36, -1.35, -1.38, -0.86],
    [-1.23, 1.65, -0.24, 2.54],
  ],
  rival: [
    [1.23, -0.74, 7.55, 0.9],
    [1.4, -1.39, 4.42, -0.85],
    [0.25, 1.7, 1.78, 2.56],
  ],
  market: [
    [-7.86, -4.93, -2.13, -3.75],
    [-4.45, -3.58, -0.29, -1.64],
    [-7.44, -1.37, -4.47, -0.99],
  ],
  commons: [
    [2.03, -4.91, 7.9, -3.96],
    [0.3, -3.69, 4.55, -1.64],
    [4.6, -1.44, 7.3, -0.99],
  ],
}
const members = (p: GroundPoint, [x, y, xx, yy]: Footprint) => p.x >= x && p.x <= xx && p.y >= y && p.y <= yy
export const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.y - b.y)

export function seedOf(id: string) {
  let value = 2166136261
  for (const c of id) value = Math.imul(value ^ c.charCodeAt(0), 16777619)
  return (value ^ (value >>> 17)) >>> 0
}
function cells(zone: MapZone, spacing: number) {
  const places: GroundPoint[] = []
  for (const [x, y, right, far] of districts[zone]) {
    let row = 0
    for (let cy = y; cy <= far; cy += spacing * 0.91, row++) {
      for (let cx = x + (row % 2) * spacing * 0.45; cx <= right; cx += spacing) {
        const jitter = seedOf(cx.toFixed(2) + ',' + cy.toFixed(2))
        const p = { x: cx + ((jitter % 13) - 6) * 0.006, y: cy + (((jitter >>> 8) % 11) - 5) * 0.005 }
        if (!occupied.some((rect) => members(p, rect))) places.push(p)
      }
    }
  }
  let state = seedOf(zone)
  for (let i = places.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[places[j], places[i]] = [places[i], places[j]]
  }
  return places
}
const districtCells = new Map<string, GroundPoint[]>()
export function destinations(people: Agent[], day: number, groups?: BrandGroup[]) {
  const result = new Map<string, GroundPoint>()
  const visitors = new Map<MapZone, { id: string; seed: number }[]>()
  for (const person of people) {
    const zone = mapZoneFor(person, groups)
    const cohort = visitors.get(zone) ?? []
    cohort.push({ id: person.shopper_id, seed: seedOf(person.shopper_id) })
    visitors.set(zone, cohort)
  }
  for (const [zone, cohort] of visitors) {
    cohort.sort((a, b) => a.seed - b.seed)
    let candidates: GroundPoint[] = []
    for (const spacing of [0.62, 0.49, 0.38, 0.29, 0.2]) {
      const key = zone + spacing
      if (!districtCells.has(key)) districtCells.set(key, cells(zone, spacing))
      candidates = districtCells.get(key)!
      if (candidates.length >= cohort.length) break
    }
    const used = new Set<number>()
    for (const p of cohort) {
      let i = p.seed % candidates.length
      while (used.has(i) && used.size < candidates.length) i = (i + 1) % candidates.length
      used.add(i)
      const cell = candidates[i]
      result.set(p.id, {
        x: cell.x + 0.049 * Math.sin(day * 0.9 + (p.seed % 99)),
        y: cell.y + 0.04 * Math.cos(day * 0.7 + (p.seed % 77)),
      })
    }
  }
  return result
}
function clear(a: GroundPoint, b: GroundPoint) {
  return occupied.every(([x, y, xx, yy]) => {
    let low = 0,
      high = 1
    for (const [start, end, min, max] of [
      [a.x, b.x, x, xx],
      [a.y, b.y, y, yy],
    ]) {
      const delta = end - start
      if (Math.abs(delta) < 0.0001) {
        if (start < min || start > max) return true
        continue
      }
      const t = (min - start) / delta,
        u = (max - start) / delta
      low = Math.max(low, Math.min(t, u))
      high = Math.min(high, Math.max(t, u))
      if (low > high) return true
    }
    return false
  })
}
const corners = occupied
  .flatMap(([x, y, xx, yy]) => [
    { x: x - 0.08, y: y - 0.08 },
    { x: xx + 0.08, y: y - 0.08 },
    { x: xx + 0.08, y: yy + 0.08 },
    { x: x - 0.08, y: yy + 0.08 },
  ])
  .filter((p) => Math.abs(p.x) < 8.42 && Math.abs(p.y) < 4.98 && !occupied.some((r) => members(p, r)))
const links = corners.map((a) => corners.map((b, i) => (clear(a, b) ? i : -1)).filter((i) => i >= 0))

export function streetRoute(a: GroundPoint, b: GroundPoint) {
  if (clear(a, b)) return [a, b]
  const costs = corners.map((p) => (clear(a, p) ? distance(a, p) : Infinity))
  const previous = corners.map(() => -1),
    seen = new Set<number>()
  let best = Infinity,
    winner = -1
  for (let pass = 0; pass < corners.length; pass++) {
    let i = -1,
      score = Infinity
    costs.forEach((cost, n) => {
      if (cost < score && !seen.has(n)) {
        i = n
        score = cost
      }
    })
    if (i < 0 || score >= best) break
    seen.add(i)
    if (clear(corners[i], b) && score + distance(corners[i], b) < best) {
      best = score + distance(corners[i], b)
      winner = i
    }
    for (const j of links[i]) {
      const via = score + distance(corners[i], corners[j])
      if (via < costs[j]) {
        costs[j] = via
        previous[j] = i
      }
    }
  }
  const via: GroundPoint[] = []
  for (let i = winner; i >= 0; i = previous[i]) via.unshift(corners[i])
  return [a, ...via, b]
}
