import { humanize } from '../v1/planner'
import { feeDemo, fieldGroups } from './seller-fields'
import type { Session } from './client'

type Props = {
  form:Record<string,string>; session:Session|null; onChange:(key:string,value:string)=>void; disabled:boolean
}

export default function SellerFields({form,session,onChange,disabled}:Props) {
  const choices=session?.review.supported_product_choices ?? []
  const inputs=[...(session?.cost_inputs ?? []),...(session?.policy_inputs ?? [])]
  const groups=fieldGroups.map(({label,fields},index)=>{
    const grid=<div className="intake-field-grid">{fields.map(field=>{
      const key=field.key, id='seller-'+key, value=form[key] ?? ''
      const evidence=inputs.find(row=>row.field===key)
      const effective=evidence?.value
      const sourceValue=typeof effective === 'number' || typeof effective === 'string' ? String(effective) : undefined
      const props={id,disabled,value,onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>onChange(key,event.target.value)}
      return <label key={key} className="intake-field" htmlFor={id}><span>{field.label}</span>
        {key==='product_choice_id' ? <select {...props} className="intake-control">
          <option value="">{choices.length || value ? 'Choose a listing' : 'Describe the product to find a listing'}</option>
          {value && !choices.some(p=>p.choice_id===value) && <option value={value}>{value===feeDemo.product_choice_id?'Synthetic toilet tissue · 12 rolls':value}</option>}
          {choices.map(p=><option key={p.choice_id} value={p.choice_id}>{p.label} · {p.pack_label}</option>)}
        </select> : field.choices ? <select {...props} className="intake-control">
          <option value="">Choose…</option>{field.choices.map(c=><option key={c} value={c}>{c==='pct'?'Percent':c==='THB'?'THB':humanize(c)}</option>)}
        </select> : <input {...props} className="intake-control" type={field.type ?? 'text'} min={field.min} max={field.max}
          step={field.type==='number'?field.step ?? 'any':undefined} placeholder={value ? undefined : sourceValue}/>}
        {!value && sourceValue != null && <small>Current review: {sourceValue} · {humanize(evidence!.origin)}</small>}
      </label>
    })}</div>
    return index===0 ? <section key={label} className="seller-field-priority"><h3>{label}</h3>{grid}</section> :
      <details key={label} className="v1-evidence"><summary>{label}</summary>{grid}</details>
  })
  return <>{groups}</>
}
