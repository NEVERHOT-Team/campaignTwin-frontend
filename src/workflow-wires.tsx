import { useId, useLayoutEffect, useRef, type RefObject } from 'react'

export type Connection = { from: string; to: string; kind?: 'branch' | 'merge' | 'side' | 'next'; emphasis?: boolean }
type Props = { board: RefObject<HTMLDivElement | null>; edges: Connection[] }

// Edges follow the measured cards, including when a source disclosure grows or text wraps.
export function WorkflowWires({ board, edges }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const arrow = useId().replace(/[^a-z0-9_-]/gi, '')
  useLayoutEffect(() => {
    const canvas = board.current
    const wires = svg.current
    if (!canvas || !wires) return
    let animation = 0
    const cards = Array.from(canvas.querySelectorAll<HTMLElement>('[data-flow-node]'))
    function draw() {
      if (!canvas || !wires) return
      const origin = canvas.getBoundingClientRect()
      if (!origin.width) return
      const sideways = getComputedStyle(canvas).getPropertyValue('--wf-sideways').trim() === '1'
      const boxes = new Map(cards.map(card => {
        const { top, left, width, height } = card.getBoundingClientRect()
        const x = left - origin.left, y = top - origin.top
        return [card.dataset.flowNode, { x, y, right:x + width, bottom:y + height, cx:x + width / 2, cy:y + height / 2, rank:card.closest('[data-rank]')?.getAttribute('data-rank') }]
      }))
      edges.forEach((edge, index) => {
        const a = boxes.get(edge.from), b = boxes.get(edge.to)
        const path = wires!.querySelector<SVGPathElement>(`[data-edge="${index}"]`)
        if (!path || !a || !b) return
        let d: string
        if (sideways && a.rank !== b.rank) {
          const mid = (a.right + b.x) / 2
          d = `M ${a.right} ${a.cy} H ${mid} V ${b.cy} H ${b.x - 1}`
        } else if (edge.kind === 'side') {
          const left = Math.min(a.x,b.x) - 8
          d = `M ${a.x} ${a.cy} H ${left} V ${b.cy} H ${b.x - 1}`
        } else if (!sideways && edge.kind === 'branch') {
          const left = 7
          d = `M ${a.cx} ${a.bottom} v 6 H ${left} V ${b.cy} H ${b.x - 1}`
        } else if (!sideways && edge.kind === 'merge') {
          const right = origin.width - 7
          d = `M ${a.right} ${a.cy} H ${right} V ${b.y - 7} H ${b.cx} V ${b.y - 1}`
        } else if (Math.abs(a.cy - b.cy) < 24 && a.right <= b.x) {
          d = `M ${a.right} ${a.cy} H ${b.x - 1}`
        } else {
          const mid = (a.bottom + b.y) / 2
          d = `M ${a.cx} ${a.bottom} V ${mid} H ${b.cx} V ${b.y - 1}`
        }
        path.setAttribute('d',d)
      })
    }
    function schedule() {
      cancelAnimationFrame(animation)
      animation = requestAnimationFrame(draw)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(canvas)
    cards.forEach(card => observer.observe(card))
    draw()
    return () => { cancelAnimationFrame(animation); observer.disconnect() }
  }, [board, edges])
  return <svg className="wf-wires" ref={svg} aria-hidden="true" focusable="false">
    <defs><marker id={arrow} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M1 .5 5 3 1 5.5" fill="none" stroke="currentColor" strokeWidth="1.15"/>
    </marker></defs>
    {edges.map((edge,i) => <path key={edge.from + '/' + edge.to} data-edge={i} data-active={edge.emphasis || undefined}
      data-future={edge.kind === 'next' || undefined} markerEnd={'url(#' + arrow + ')'} fill="none"/>)}
  </svg>
}
