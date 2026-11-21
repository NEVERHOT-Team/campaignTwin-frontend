import { useId } from 'react'
import './scenario-choices.css'

type Props = {
  options: { id: string; label: string; description?: string }[]
  value: string
  onChange: (id: string) => void
  label?: string
  description?: string
}

export function ScenarioChoices({ options, value, onChange, label = 'Rival scenario', description }: Props) {
  const id = useId()
  return <section className="scenario-choices" aria-labelledby={id}>
    <h2 className="sc-label" id={id}>{label}</h2>
    {options.length > 1 ? <div className="sc-options" role="radiogroup" aria-labelledby={id}>
      {options.map((option, index) => {
        const optionId = id + '-choice-' + index
        const detail = option.description || (option.id === value ? description : undefined)
        return <label key={option.id} className="sc-option">
          <input name={id} type="radio" value={option.id} checked={option.id === value}
            aria-labelledby={optionId} aria-describedby={detail ? optionId + '-detail' : undefined} onChange={() => onChange(option.id)} />
          <span className="sc-surface"><span className="sc-mark" aria-hidden="true"/>
            <span className="sc-copy"><strong id={optionId}>{option.label}</strong>
              {detail && <span className="sc-description" id={optionId + '-detail'}>{detail}</span>}
            </span>
          </span>
        </label>
      })}
    </div> : <div className="sc-single"><strong>{options[0]?.label ?? 'Unavailable'}</strong>
      {(options[0]?.description || description) && <span className="sc-description">{options[0]?.description || description}</span>}
    </div>}
  </section>
}
