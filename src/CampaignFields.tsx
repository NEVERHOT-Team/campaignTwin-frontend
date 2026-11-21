import { useEffect, useState, type ReactNode } from 'react'
import { goalFields, mechanicFields, sections, type FieldDescriptor, type Question } from './campaign'
import type { Draft } from './model'

export function Disclosure({title, openOnError = false, children}: {
  title:string; openOnError?:boolean; children:ReactNode
}) {
  const [open, setOpen] = useState(openOnError)
  useEffect(() => { if (openOnError) setOpen(true) }, [openOnError])
  return <details className="intake-disclosure" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary>{children}
  </details>
}

export function CampaignControl({field, value, update, issue, disabled, path = field.path}: {
  field:FieldDescriptor; value:string; update:(value:string)=>void; disabled:boolean; issue?:string; path?:string
}) {
  const id = 'campaign-' + path
  const props = {id, name:path, disabled, 'aria-invalid':!!issue, 'aria-describedby':issue ? id+'-error' : undefined}
  const text = (option:string) => option.replaceAll('_',' ')
  return <div className="intake-field">
    {field.type === 'boolean' ? <label className="intake-check" htmlFor={id}>
      <input {...props} type="checkbox" checked={value==='true'} onChange={e=>update(String(e.target.checked))}/>{field.label}
    </label> : <>
      <label htmlFor={id}>{field.label}</label>
      {field.choices && field.type === 'list' ? <select {...props} className="intake-control" multiple size={Math.min(4,field.choices.length)}
        value={value.split(',').map(s=>s.trim()).filter(Boolean)} onChange={e=>update(Array.from(e.target.selectedOptions,o=>o.value).join(', '))}>
        {field.choices.map(v=><option key={v} value={v}>{text(v)}</option>)}
      </select> : field.choices ? <select {...props} className="intake-control" value={value} onChange={e=>update(e.target.value)}>
        <option value="">Choose an option</option>{field.choices.map(v=><option key={v} value={v}>{text(v)}</option>)}
      </select> : <input {...props} className="intake-control" type={field.type==='date' ? 'date' : field.type==='number'||field.type==='integer'?'number':'text'}
        step={field.type==='integer'?1:'any'} min={field.min} max={field.max}
        placeholder={field.path==='name' ? 'e.g. December voucher' : field.path==='brand.category' ? 'e.g. Potato-chip multipacks'
          : field.path==='audience.description' ? 'Who is the offer for?' : field.type==='list' ? 'Separate entries with commas' : undefined}
        value={value} onChange={e=>update(e.target.value)}/>}
    </>}
    {issue && <p className="intake-field-error" id={id+'-error'}>{issue}</p>}
  </div>
}

type Props = {
  draft:Draft; change:(path:string,value:string)=>void
  rows:(type:'goals'|'mechanics', rows:Record<string,string>[])=>void
  errors:Record<string,string>; disabled:boolean; omit:ReadonlySet<string>
}
export function CampaignFields({draft, change, rows, errors, disabled, omit}:Props) {
  function repeat(type:'goals'|'mechanics', descriptors:FieldDescriptor[], title:string, path:string, offset:number) {
    const bank=draft[type]
    const noun=type==='goals'?'goal':'offer'
    return <Disclosure title={title} openOnError={Object.keys(errors).some(k=>k.startsWith(path+'.'))}>
      {bank.map((row,i)=><fieldset className="intake-repeat" key={i}>
        <legend>{type==='goals'?'Goal':'Offer'} {i+1}</legend>
        <div className="intake-field-grid">{descriptors.map(f=>{
          const key=`${path}.${i+offset}.${f.path}`
          return <CampaignControl key={key} path={key} field={f} value={row[f.path]??''} disabled={disabled} issue={errors[key]}
            update={v=>rows(type,bank.map((r,j)=>j===i?{...r,[f.path]:v}:r))}/>
        })}</div>
        <button type="button" className="intake-link" disabled={disabled} onClick={()=>rows(type,bank.filter((_,j)=>j!==i))}>Remove {noun} {i+1}</button>
      </fieldset>)}
      <button type="button" className="intake-secondary" disabled={disabled} onClick={()=>rows(type,[...bank,{}])}>Add {noun}</button>
    </Disclosure>
  }
  return <div className="intake-detail-list">
    {sections.map(section=>{
      const rest=section.fields.filter(f=>!omit.has(f.path))
      if(!rest.length)return null
      return <Disclosure key={section.title} title={section.title} openOnError={rest.some(f=>!!errors[f.path])}>
        <div className="intake-field-grid">{rest.map(f=><CampaignControl key={f.path} field={f} value={draft.campaign[f.path]??''} disabled={disabled}
          issue={errors[f.path]} update={v=>change(f.path,v)}/>)}</div>
      </Disclosure>
    })}
    {repeat('goals',goalFields,'Success targets','objective.smart_goals',0)}
    {repeat('mechanics',mechanicFields,'Additional offers','offer.mechanics',1)}
  </div>
}

export function questionErrors(questions:Question[]) {
  return Object.fromEntries(questions.filter(q=>q.blocking!==false).map(q=>[q.field_id,q.prompt]))
}
