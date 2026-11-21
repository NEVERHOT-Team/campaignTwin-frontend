import { useRef, useState } from 'react'
import { brandLabels, type Agent } from './model'

export const shopperName = (id: string) => id.replace(/^shopper-/i, 'Shopper ')

type Props = {
  agents: Agent[]
  pool: Agent[]
  poolName: string
  selected: string | null
  switchers: Agent[]
  onChoose: (id: string) => void
  onClear: () => void
  onFind: (id: string) => void
  onSwitchers: () => void
}

export function ShopperPicker({ agents, pool, poolName, selected, switchers, onChoose, onFind, onSwitchers, onClear }: Props) {
  const [searching, setSearching] = useState(false)
  const [term, setTerm] = useState('')
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const shopper = agents.find(a => a.shopper_id === selected)
  const index = pool.findIndex(a => a.shopper_id === selected)
  const query = term.trim().toLowerCase()
  const matches = query ? agents.filter(a =>
    (a.shopper_id + ' ' + shopperName(a.shopper_id)).toLowerCase().includes(query),
  ) : []

  function closeSearch() {
    setSearching(false)
    setTerm('')
    searchTrigger.current?.focus()
  }

  function chooseMatch(id: string) {
    closeSearch()
    onFind(id)
  }

  return <div className="ra-picker">
    {shopper ? <div className="ra-person">
      <strong>{shopperName(shopper.shopper_id)}</strong>
      <span>{brandLabels[shopper.brand]}</span>
    </div> : <p>Select a shopper on the map to see their decisions.</p>}
    <div className="ra-picker-actions">
      {(!shopper || (switchers.length > 0 && poolName !== 'changed preference')) && <button className="ra-btn" type="button" disabled={!agents.length}
        onClick={() => switchers.length ? onSwitchers() : onFind(agents[0].shopper_id)}>
        {switchers.length ? 'Inspect a switcher' : 'Inspect a shopper'}
      </button>}
      <button type="button" ref={searchTrigger} className="ra-text-btn" aria-expanded={searching}
        onClick={() => { if (searching) closeSearch(); else setSearching(true) }}>Find by ID</button>
      {shopper && <button type="button" className="ra-text-btn" aria-label="Clear shopper selection" onClick={onClear}>Clear</button>}
    </div>
    {searching && <div className="ra-find">
      <label htmlFor="ra-shopper-search">Shopper ID</label>
      <input type="search" autoFocus id="ra-shopper-search" placeholder="e.g. 002" value={term}
        onChange={e => setTerm(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') closeSearch() }} />
      {query && <><span className="ra-muted" role="status">{matches.length > 4 ? 'First 4 of ' : ''}{matches.length} {matches.length === 1 ? 'match' : 'matches'}</span>
        <ul>{matches.slice(0, 4).map(a => <li key={a.shopper_id}>
          <button type="button" onClick={() => chooseMatch(a.shopper_id)}>{shopperName(a.shopper_id)}</button>
        </li>)}</ul></>}
    </div>}
    {shopper && index >= 0 && <div className="ra-paging">
      <span>{index + 1} of {pool.length} · {poolName}</span>
      <div><button className="ra-text-btn" type="button" disabled={pool.length <= 1}
        aria-label="Previous shopper" onClick={() => onChoose(pool[(index + pool.length - 1) % pool.length].shopper_id)}>Previous</button>
        <button className="ra-text-btn" type="button" disabled={pool.length <= 1}
          aria-label="Next shopper" onClick={() => onChoose(pool[(index + 1) % pool.length].shopper_id)}>Next</button></div>
    </div>}
  </div>
}
