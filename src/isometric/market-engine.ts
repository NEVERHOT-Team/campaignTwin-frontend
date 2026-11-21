import { brandColors, type Agent, type BrandGroup, type MapZone } from '../model'
import { mapZoneFor } from '../shopper-groups'
import projection from './assets/projection.json'
import eastDepth from './assets/east-depth.png'
import westDepth from './assets/west-depth.png'
import shopAtlas from './assets/shoppers.webp'
import { destinations, distance, seedOf, streetRoute, type GroundPoint } from './walking'

export type Angle = keyof typeof projection
export type MarketProps = {
  agents?: Agent[]
  ghosts?: Agent[]
  groups?: BrandGroup[]
  selected?: string | null
  onSelect?: (id: string) => void
  day?: number
  playing?: boolean
}
type Walker = {
  id: string
  zone: MapZone
  seed: number
  points: GroundPoint[]
  lengths: number[]
  length: number
  start: number
  duration: number
}
type ScreenPoint = { x: number; y: number; depth: number }
type ScreenShopper = ScreenPoint & { id: string }
const empty: Agent[] = []
const wardrobe: Record<MapZone, number> = { ours: 0, rival: 1, market: 2, commons: 3 }
const width = 960,
  height = 600
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(v, lo))
export function project(p: GroundPoint, view: Angle, z = 0): ScreenPoint {
  const { origin, x, y, z: up } = projection[view]
  const at = (i: number) =>
    origin[i] + (x[i] - origin[i]) * p.x + (y[i] - origin[i]) * p.y + (up[i] - origin[i]) * z
  return { x: at(0) * width, y: at(1) * height, depth: at(2) }
}
function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Market art could not load.'))
    img.src = url
  })
}
type DepthMap = { pixels: Uint8ClampedArray; width: number; height: number }
const depths = new Map<Angle, Promise<DepthMap>>()
function depthFor(view: Angle) {
  if (!depths.has(view)) {
    const loaded = loadImage(view === 'east' ? eastDepth : westDepth).then((img) => {
      const buffer = document.createElement('canvas')
      buffer.width = img.width
      buffer.height = img.height
      const c = buffer.getContext('2d', { willReadFrequently: true })
      if (!c) throw new Error('Depth buffer unavailable.')
      c.drawImage(img, 0, 0)
      return {
        width: img.width,
        height: img.height,
        pixels: c.getImageData(0, 0, img.width, img.height).data,
      }
    })
    depths.set(
      view,
      loaded.catch((error) => {
        depths.delete(view)
        throw error
      }),
    )
  }
  return depths.get(view)!
}
type Portraits = { left: HTMLImageElement; right: HTMLCanvasElement }
let atlas: Promise<Portraits> | undefined
function portraitAtlas() {
  atlas ??= loadImage(shopAtlas)
    .then((left) => {
      const right = document.createElement('canvas')
      right.width = left.width
      right.height = left.height
      const pen = right.getContext('2d')!
      pen.translate(right.width, 0)
      pen.scale(-1, 1)
      pen.drawImage(left, 0, 0)
      return { left, right }
    })
    .catch((error) => {
      atlas = undefined
      throw error
    })
  return atlas
}
function interpolate(w: Walker, now: number) {
  const t = w.duration ? clamp((now - w.start) / w.duration, 0, 1) : 1
  const walk = w.length * t * t * (3 - 2 * t)
  let segment = 0,
    offset = walk
  while (segment < w.lengths.length - 1 && offset > w.lengths[segment]) offset -= w.lengths[segment++]
  const a = w.points[segment],
    b = w.points[segment + 1]
  const f = w.lengths[segment] ? offset / w.lengths[segment] : 1
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    dx: b.x - a.x,
    dy: b.y - a.y,
    step: t < 1 && w.length > 0.18 ? 1 + (Math.floor(walk * 4.8) % 2) : 0,
  }
}
export function makeMarketEngine(surface: HTMLCanvasElement, initial: MarketProps, initialView: Angle) {
  const context = surface.getContext('2d')
  if (!context) return
  const c = context,
    reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let props = initial,
    view = initialView,
    walkers: Walker[] = [],
    frame = 0,
    expiry = 0,
    disposed = false
  let figures: Portraits | undefined,
    depth: DepthMap | undefined,
    requestedFigures = false
  let previousAngle: HTMLCanvasElement | null = null,
    transitionStart = 0
  let source: Agent[] | undefined,
    lastDay: number | undefined,
    ghosts: ReturnType<typeof destinations> | undefined
  let ghostSource: Agent[] | undefined,
    slots: ScreenShopper[] = [],
    hover: string | null = null,
    focus: string | null = null
  function groundDepth(x: number, y: number) {
    if (!depth) return Infinity
    const px = clamp(Math.round((x / width) * (depth.width - 1)), 0, depth.width - 1)
    const py = clamp(Math.round((y / height) * (depth.height - 1)), 0, depth.height - 1)
    return 20 + (38 * depth.pixels[(py * depth.width + px) * 4]) / 255
  }
  function render(time: number) {
    frame = 0
    if (disposed || document.hidden) return
    c.clearRect(0, 0, width, height)
    const people = walkers
      .map((w) => {
        const position = interpolate(w, reduced.matches ? Infinity : time)
        const foot = project(position, view, 0.04)
        return { w, position, foot }
      })
      .sort((a, b) => b.foot.depth - a.foot.depth)
    slots = []
    for (const { w, foot } of people) {
      const baseline = ghosts?.get(w.id)
      if (!baseline || !ghostSource?.length || !different.has(w.id)) continue
      const b = project(baseline, view, 0.05)
      if (groundDepth(b.x, b.y) + 0.22 < b.depth) continue
      c.beginPath()
      c.ellipse(b.x, b.y, 4.9, 2.3, 0, 0, Math.PI * 2)
      c.setLineDash([2, 2])
      c.strokeStyle = '#344244'
      c.lineWidth = 1
      c.stroke()
      c.setLineDash([])
      if (w.id === props.selected) {
        c.beginPath()
        c.moveTo(b.x, b.y)
        c.lineTo(foot.x, foot.y)
        c.setLineDash([3, 4])
        c.stroke()
        c.setLineDash([])
      }
    }
    for (const { w, foot, position } of people) {
      const size = 37 + (w.seed % 4) * 0.85
      const left = foot.x - size / 2,
        top = foot.y - size * 0.82
      const row = position.step
      const facingRight = row
        ? position.dx + (view === 'east' ? 0.67 : -0.67) * position.dy > 0
        : Boolean((w.seed >>> 6) % 2)
      const variant = wardrobe[w.zone] * 3 + (w.seed % 3),
        column = facingRight ? 11 - variant : variant
      const visible = (screenY: number, screenX = foot.x) => {
        const above = clamp((foot.y - screenY) / size, 0, 0.76)
        return foot.depth - above * 0.72 < groundDepth(screenX, screenY) + 0.18
      }
      if (visible(foot.y)) {
        c.fillStyle = 'rgba(69,62,54,.20)'
        c.beginPath()
        c.ellipse(foot.x + 1.2, foot.y + 0.4, 5.8, 2.8, -0.1, 0, 2 * Math.PI)
        c.fill()
      }
      if (!visible(foot.y - size * 0.3) && !visible(foot.y - size * 0.59)) continue
      slots.push({ x: foot.x, y: foot.y - size * 0.34, depth: foot.depth, id: w.id })
      if (figures) {
        const sheet = facingRight ? figures.right : figures.left
        const tile = sheet.width / 12,
          sx = column * tile,
          sy = row * tile
        // Most people are on open paving. Only an overlapping roof or tree needs a clipped portrait.
        if (
          [0.06, 0.32, 0.59].every((f) => [-4, 0, 4].every((dx) => visible(foot.y - size * f, foot.x + dx)))
        ) {
          c.drawImage(sheet, sx, sy, tile, tile, left, top, size, size)
        } else {
          c.save()
          c.beginPath()
          for (let y = 0; y < size; y += 2) {
            for (let x = Math.floor(size * 0.23); x < size * 0.77; x += 3)
              if (visible(top + y, left + x)) c.rect(left + x, top + y, 3, 2)
          }
          c.clip()
          c.drawImage(sheet, sx, sy, tile, tile, left, top, size, size)
          c.restore()
        }
      } else {
        c.fillStyle = brandColors[w.zone]
        c.beginPath()
        c.arc(foot.x, foot.y - 6, 4.3, 0, Math.PI * 2)
        c.fill()
      }
    }
    const indicated = hover ?? focus ?? props.selected
    const marked = slots.find((p) => p.id === indicated)
    if (marked) marker(marked)
    else if (indicated) {
      const occluded = people.find((p) => p.w.id === indicated)
      if (occluded) marker({ ...occluded.foot, id: indicated, y: occluded.foot.y - 11 })
    }
    if (previousAngle && transitionStart) {
      const t = clamp((time - transitionStart) / 230, 0, 1)
      if (!reduced.matches && t < 1) {
        c.globalAlpha = 1 - t * t * (3 - 2 * t)
        c.drawImage(previousAngle, 0, 0)
        c.globalAlpha = 1
        request()
      } else {
        previousAngle = null
        transitionStart = 0
      }
    }
    if (!reduced.matches && time < expiry) request()
  }
  function marker(p: ScreenShopper) {
    c.save()
    c.strokeStyle = '#fff6d8'
    c.lineWidth = 2
    c.shadowColor = '#384243'
    c.shadowBlur = 2
    c.strokeRect(p.x - 7.5, p.y - 12, 15, 23)
    c.shadowBlur = 0
    const label = p.id.replace(/^shopper-/i, 'Shopper ')
    c.font = '600 13px system-ui'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const w = c.measureText(label).width + 15
    const x = clamp(p.x, w / 2 + 4, width - w / 2 - 4),
      y = Math.max(13, p.y - 26)
    c.fillStyle = '#243333'
    c.beginPath()
    c.roundRect(x - w / 2, y - 10, w, 20, 5)
    c.fill()
    c.fillStyle = '#fff9e8'
    c.fillText(label, x, y)
    c.restore()
  }
  function request() {
    if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(render)
  }
  function ensureDepth(angle: Angle) {
    depth = undefined
    depthFor(angle)
      .then((v) => {
        if (!disposed && view === angle) {
          depth = v
          request()
        }
      })
      .catch(() => {})
  }
  let different = new Set<string>()
  function update(next: MarketProps, angle: Angle) {
    const agents = next.agents ?? empty,
      day = next.day ?? 0
    const changed = agents !== source || day !== lastDay || props.groups !== next.groups
    if (changed) {
      const now = performance.now()
      const old = new Map(walkers.map((w) => [w.id, interpolate(w, now)]))
      const points = destinations(agents, day, next.groups)
      walkers = agents.flatMap((a) => {
        const dest = points.get(a.shopper_id)
        if (!dest) return []
        const initial = old.get(a.shopper_id) ?? dest
        const path = streetRoute(initial, dest),
          lengths = path.slice(1).map((p, i) => distance(path[i], p))
        const length = lengths.reduce((s, n) => s + n, 0)
        return [
          {
            id: a.shopper_id,
            zone: mapZoneFor(a, next.groups),
            seed: seedOf(a.shopper_id),
            points: path,
            lengths,
            length,
            start: now,
            duration:
              reduced.matches || length < 0.001 ? 0 : Math.min(next.playing ? 850 : 625, 210 + length * 56),
          },
        ]
      })
      expiry = walkers.some((w) => w.duration > 0) ? now + 860 : 0
    }
    if (changed || next.ghosts !== ghostSource) {
      ghostSource = next.ghosts
      ghosts = ghostSource ? destinations(ghostSource, day, next.groups) : undefined
      const live = new Map(walkers.map((w) => [w.id, w.zone]))
      different = new Set(
        ghostSource?.filter((g) => live.get(g.shopper_id) !== mapZoneFor(g, next.groups)).map((g) => g.shopper_id),
      )
    }
    if (angle !== view) {
      view = angle
      transitionStart = previousAngle ? performance.now() : 0
      if (agents.length) ensureDepth(view)
    }
    if (agents.length && !requestedFigures) {
      requestedFigures = true
      ensureDepth(view)
      portraitAtlas()
        .then((a) => {
          figures = a
          request()
        })
        .catch(() => {})
    }
    source = agents
    lastDay = day
    props = next
    request()
  }
  function closest(x: number, y: number, limit: number) {
    let nearest: string | null = null
    for (const p of slots) {
      const d = Math.hypot(x - p.x, y - p.y)
      if (d <= limit) {
        limit = d
        nearest = p.id
      }
    }
    return nearest
  }
  function focusMap(active: boolean) {
    focus = active ? (props.selected ?? slots[0]?.id ?? null) : null
    request()
  }
  function key(k: string) {
    if (!slots.length) return false
    const current = slots.find((p) => p.id === (focus ?? props.selected)) ?? slots[0]
    if (k === 'Enter' || k === ' ') {
      props.onSelect?.(current.id)
      return true
    }
    const axes: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if (!(k in axes)) return false
    const [dx, dy] = axes[k]
    let best = Infinity
    for (const p of slots) {
      const x = p.x - current.x,
        y = p.y - current.y,
        along = dx * x + dy * y
      if (along < 1.5) continue
      const score = along + Math.abs(dx * y - dy * x) * 3
      if (score < best) {
        best = score
        focus = p.id
      }
    }
    hover = null
    request()
    return true
  }
  function motionChanged() {
    if (reduced.matches) for (const w of walkers) w.duration = 0
    request()
  }
  reduced.addEventListener('change', motionChanged)
  document.addEventListener('visibilitychange', request)
  update(initial, initialView)
  function captureAngle(plate: HTMLImageElement) {
    if (reduced.matches || !plate.complete || !plate.naturalWidth) return
    const buffer = document.createElement('canvas')
    buffer.width = width
    buffer.height = height
    const pen = buffer.getContext('2d')
    if (!pen) return
    pen.drawImage(plate, 0, 0, width, height)
    pen.drawImage(surface, 0, 0)
    previousAngle = buffer
  }
  return {
    update,
    closest,
    focusMap,
    key,
    captureAngle,
    hover: (id: string | null) => {
      if (hover !== id) {
        hover = id
        request()
      }
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      reduced.removeEventListener('change', motionChanged)
      document.removeEventListener('visibilitychange', request)
    },
  }
}
