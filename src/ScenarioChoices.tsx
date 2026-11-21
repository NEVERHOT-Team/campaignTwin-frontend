import { useId } from 'react'
import './scenario-choices.css'

type Props = {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  label?: string
  description?: string
}

export function ScenarioChoices({ options, value, onChange, label = 'Rival scenario', description }: Props) {
  const id = useId()
  return <section className="scenario-choices" aria-labelledby={id} aria-describedby={description ? id+'-description' : undefined}>
    <div className="sc-label" id={id}>{label}</div>
    {options.length > 1 ? <div className="sc-options" role="radiogroup" aria-labelledby={id}>
      {options.map(option => <label key={option.id} className="sc-option">
        <input name={id} type="radio" value={option.id} checked={option.id === value} onChange={() => onChange(option.id)} />
        <span>{option.label}</span>
      </label>)}
    </div> : <span className="sc-single">{options[0]?.label ?? 'Unavailable'}</span>}
    {description && <p id={id+'-description'} className="sc-description">{description}</p>}
  </section>
}
