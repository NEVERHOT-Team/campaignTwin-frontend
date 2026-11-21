import { Component, lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import './arena-views.css'

export const IsometricMarket = lazy(() => import('./isometric/IsometricMarket'))

type View = 'isometric' | '2d' | 'flow'
const views: { id: View; label: string }[] = [
  { id: 'isometric', label: 'Isometric' },
  { id: '2d', label: '2D map' },
  { id: 'flow', label: 'Workflow' },
]
// Preserve the reader's place when they open Verdict and return to the arena.
let lastView: View = 'isometric'

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

type Props = {
  twoD: ReactNode
  isometric: ReactNode
  flow: ReactNode
  onViewChange?: (view: View) => void
}

export function ArenaViews({ twoD, isometric, flow, onViewChange }: Props) {
  const [view, setView] = useState<View>(lastView)
  const group = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => { onViewChange?.(view) }, [view, onViewChange])

  function choose(id: View) {
    lastView = id
    setView(id)
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % views.length
    else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = views.length - 1
    else return
    event.preventDefault()
    choose(views[next].id)
    buttons.current[next]?.focus()
  }

  return <div className="arena-viewer">
    <div className="arena-view-tabs" role="tablist" aria-label="Arena view">
      {views.map(({ id, label }, i) => <button key={id} ref={el => { buttons.current[i] = el }}
        id={group + '-tab-' + id} type="button" role="tab" aria-selected={id === view}
        aria-controls={group + '-panel-' + id} tabIndex={id === view ? 0 : -1}
        onClick={() => choose(id)} onKeyDown={event => move(event, i)}>{label}</button>)}
    </div>
    {views.map(({ id }) => <div key={id} role="tabpanel" tabIndex={0} hidden={view !== id}
      aria-labelledby={group + '-tab-' + id} id={group + '-panel-' + id} className="arena-view-panel">
      {view === id && (id === 'flow' ? flow : id === '2d' ? twoD :
        <SceneBoundary fallback={<div className="scene-placeholder" role="status">
          <p>The isometric market couldn’t load.</p>
          <button type="button" className="ra-btn" onClick={() => { choose('2d'); buttons.current[1]?.focus() }}>Open 2D map</button>
        </div>}>
          <Suspense fallback={<div className="scene-placeholder" role="status">Opening isometric market…</div>}>{isometric}</Suspense>
        </SceneBoundary>)}
    </div>)}
  </div>
}
