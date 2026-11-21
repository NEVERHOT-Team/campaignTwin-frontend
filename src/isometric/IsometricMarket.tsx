import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { BrandGroup } from '../model'
import { PixelArena } from '../PixelArena'
import { resolveBrandGroups } from '../shopper-groups'
import { uniqueShoppers } from '../shopper-snapshot'
import east from './assets/east.webp'
import west from './assets/west.webp'
import { makeMarketEngine, project, type Angle, type MarketProps } from './market-engine'
import './market.css'

const plates = { east, west }
// Merchant roof anchors in the editable market model, in Blender world coordinates.
const rooftops: Record<BrandGroup['role'], {x: number; y: number; z: number}> = {
  focal: {x: -4.0, y: 3.0, z: 4.35},
  competitor: {x: 4.18, y: 3.10, z: 3.08},
  market: {x: -6.27, y: -2.51, z: 2.68},
}

export default function IsometricMarket(props: MarketProps) {
  const agents = useMemo(() => props.agents && uniqueShoppers(props.agents), [props.agents])
  const ghosts = useMemo(() => props.ghosts && uniqueShoppers(props.ghosts), [props.ghosts])
  const groups = useMemo(() => {
    if (!props.groups && !agents?.length && !ghosts?.length) return undefined
    return resolveBrandGroups(props.groups, [...(agents ?? []), ...(ghosts ?? [])])
  }, [props.groups, agents, ghosts])
  const roles = new Set(groups?.map(group => group.role))
  if (groups && (groups.length !== Object.keys(rooftops).length ||
      !Object.keys(rooftops).every(role => roles.has(role as BrandGroup['role'])))) {
    return <div className="isometric-schematic">
      <p>This run uses a 2D layout to show each purchase group.</p>
      <PixelArena groups={groups} agents={agents ?? []} ghosts={ghosts}
        selected={props.selected ?? null} onSelect={id => props.onSelect?.(id)}
        day={props.day ?? 0} playing={props.playing ?? false}/>
    </div>
  }
  return <MarketSquare {...props} groups={groups} agents={agents} ghosts={ghosts}/>
}

function MarketSquare(props: MarketProps) {
  const [angle, setAngle] = useState<Angle>('east')
  const [missingPlate, setMissingPlate] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const plate = useRef<HTMLImageElement>(null)
  const rotating = useRef(false)
  const engine = useRef<ReturnType<typeof makeMarketEngine>>(undefined)
  const current = useRef({ props, angle })
  current.current = { props, angle }
  useEffect(() => {
    if (!canvas.current) return
    engine.current = makeMarketEngine(canvas.current, current.current.props, current.current.angle)
    return () => {
      engine.current?.dispose()
      engine.current = undefined
    }
  }, [])
  useEffect(() => {
    engine.current?.update(props, angle)
  }, [props, angle])

  function hit(e: PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return null
    return (
      engine.current?.closest(
        ((e.clientX - box.left) / box.width) * 960,
        ((e.clientY - box.top) / box.height) * 600,
        ((e.pointerType === 'touch' ? 16 : 9) * 960) / box.width,
      ) ?? null
    )
  }
  async function rotate() {
    if (rotating.current) return
    rotating.current = true
    const target = angle === 'east' ? 'west' : 'east'
    const image = new Image()
    image.src = plates[target]
    try {
      await image.decode()
      if (!plate.current) return
      engine.current?.captureAngle(plate.current)
      setAngle(target)
    } catch {
      if (plate.current) setMissingPlate(true)
    } finally {
      rotating.current = false
    }
  }
  const hasShoppers = Boolean(props.agents?.length)
  if (missingPlate) throw new Error('The isometric market image could not load.')
  return (
    <div className="isometric-market" data-view-angle={angle}>
      <img
        ref={plate}
        alt={
          hasShoppers
            ? ''
            : 'Illustration of a market hall, arcade and florist around a fountain, with a public garden and benches.'
        }
        src={plates[angle]}
        onError={() => setMissingPlate(true)}
        width={1360}
        height={850}
        draggable={false}
      />
      {props.groups?.map(group => {
        const anchor = rooftops[group.role]
        const point = project(anchor, angle, anchor.z)
        return <span key={group.id} className="isometric-shop-label" title={group.label}
          style={{ left: `${point.x / 960 * 100}%`, top: `${point.y / 600 * 100}%` }}>
          <i aria-hidden="true" style={{backgroundColor: group.color}}/>{group.label}
        </span>
      })}
      <canvas
        ref={canvas}
        width={960}
        height={600}
        data-shopper-count={props.agents?.length ?? 0}
        role={hasShoppers ? 'group' : undefined}
        aria-hidden={hasShoppers ? undefined : true}
        tabIndex={hasShoppers ? 0 : -1}
        aria-label={
          hasShoppers
            ? 'Isometric shopper map. Use the arrow keys to choose a shopper, then press Enter to inspect.'
            : undefined
        }
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return
          const id = hit(e)
          engine.current?.hover(id)
          e.currentTarget.style.cursor = id ? 'pointer' : 'default'
        }}
        onPointerLeave={() => engine.current?.hover(null)}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const id = hit(e)
          // Selection is completed on release so touch scrolling and cancellations remain native.
          e.currentTarget.dataset.pressedShopper = id ?? ''
        }}
        onPointerCancel={(e) => {
          delete e.currentTarget.dataset.pressedShopper
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return
          const id = hit(e)
          if (id && id === e.currentTarget.dataset.pressedShopper) props.onSelect?.(id)
          delete e.currentTarget.dataset.pressedShopper
        }}
        onKeyDown={(e) => {
          if (engine.current?.key(e.key)) e.preventDefault()
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) engine.current?.focusMap(true)
        }}
        onBlur={() => engine.current?.focusMap(false)}
      />
      <button
        type="button"
        className="isometric-angle"
        aria-label={'Rotate view to the ' + (angle === 'east' ? 'west' : 'east') + ' camera'}
        onClick={() => void rotate()}
      >
        Rotate view
      </button>
    </div>
  )
}
