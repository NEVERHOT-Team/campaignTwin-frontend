import { useEffect, useRef, useState, type PointerEvent } from 'react'
import east from './assets/east.webp'
import west from './assets/west.webp'
import { makeMarketEngine, type Angle, type MarketProps } from './market-engine'
import './market.css'

const plates = { east, west }
export default function IsometricMarket(props: MarketProps) {
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
            : 'Illustration of a modeled market square with four shops, a fountain, benches and landscaped streets.'
        }
        src={plates[angle]}
        onError={() => setMissingPlate(true)}
        width={1360}
        height={850}
        draggable={false}
      />
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
