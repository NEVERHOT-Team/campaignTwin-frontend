import type { CSSProperties, KeyboardEvent } from 'react'
import type { Day } from './model'

type Props = {
  days?: Day[]
  day: number
  from: number
  to: number
  onJump: (day: number) => void
}

export function DayScrubber({ days, day, from, to, onJump }: Props) {
  const disabled = !days || days.length < 2
  const progress = to > from ? Math.min(1, Math.max(0, (day - from) / (to - from))) : 0

  function chooseClosest(wanted: number) {
    if (!disabled) onJump(days.reduce((nearest, frame) =>
      Math.abs(frame.day - wanted) < Math.abs(nearest - wanted) ? frame.day : nearest, from))
  }

  function step(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp'
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
    if (!forward && !backward) return
    event.preventDefault()
    // Some reports omit days. Arrow keys move to the next available observation.
    const next = forward ? days.find(frame => frame.day > day) :
      days.reduce<Day | undefined>((prior, frame) => frame.day < day ? frame : prior, undefined)
    if (next) onJump(next.day)
  }

  return <div className="ra-scrub" style={{'--day-progress':progress} as CSSProperties}>
    <div><label htmlFor="ra-day">Timeline</label><span>Day <b key={day} className="ra-day-number">{day}</b> of {to}</span></div>
    <div className="ra-day-slider" data-disabled={disabled}>
      <div className="ra-day-track" aria-hidden="true">
        <i className="ra-day-fill"/><i className="ra-day-thumb"/>
      </div>
      <input id="ra-day" type="range" aria-label="Simulation day" aria-valuetext={'Day '+day} min={from} max={to}
        value={day} disabled={disabled} onKeyDown={step} onChange={e=>chooseClosest(Number(e.target.value))}/>
    </div>
  </div>
}
