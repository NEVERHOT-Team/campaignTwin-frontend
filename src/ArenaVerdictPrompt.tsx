import { useId } from 'react'

export function ArenaVerdictPrompt({ onVerdict, replayEnd = false }: { onVerdict: () => void; replayEnd?: boolean }) {
  const statusId = useId()
  return <div className="ra-verdict-prompt">
    <span id={statusId} className="ra-complete-status">{replayEnd ? 'Replay complete' : 'Simulation complete'}</span>
    <button type="button" className="ra-verdict-action" onClick={onVerdict} aria-describedby={statusId}>
      {replayEnd ? 'Open verdict' : 'View verdict'}
    </button>
  </div>
}
