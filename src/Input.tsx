import { ProductGoods, categoryPhoto } from './ProductGoods'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { RunApproval } from './RunApproval'
import { CampaignControl, CampaignFields, Disclosure, questionErrors } from './CampaignFields'
import { campaignFields, goalFields, labelsForCorePaths, mechanicFields, type FieldDescriptor, type Question } from './campaign'
import { type Candidate, type Draft, type FieldKey, type ReviewContext, fieldKeys, fieldLabels, money, sampleBrief, validate } from './model'
import './intake.css'

type Props = {
  brief:string; onBrief?:(text:string)=>void; draft:Draft; onChange:(field:FieldKey,value:string)=>void
  onConfirm:(field:FieldKey)=>void; onSample:()=>void; onFillSample:()=>string; onExtract:(text:string)=>Promise<{ok:boolean;reply:string}>
  onReview:()=>void; onRun:()=>void; onReplay:()=>void; review:ReviewContext|null; candidates:Candidate[]
  chosen:string[]; onToggle:(id:string)=>void; candidateEdits:Record<string,string>; onCandidateEdit:(id:string,value:string)=>void
  onRevalidate:(candidate:Candidate)=>void; onApprove:(approved:boolean)=>void; approved:boolean
  busy:string; issues:Partial<Record<FieldKey,string>>; error:string; notice:string; light?:boolean; replayLabel:string
  questions:Question[]; onAnswer:(q:Question,value:string)=>void
  onCampaignField:(path:string,value:string)=>void; onCampaignRows:(type:'goals'|'mechanics',rows:Record<string,string>[])=>void
}
type Turn = {speaker:'user'|'assistant'; text:string}
const visiblePaths=new Set(['name','brand.category','audience.description','timing.start_date','timing.end_date'])
const costs:FieldKey[]=['unit_price_thb','unit_cost_thb','fee_pct','fixed_campaign_spend_thb']
const fieldsByPath=new Map(campaignFields.map(f=>[f.path,f]))
const coreUnits:Record<FieldKey,string>={brand:'',discount_pct:'%',total_budget_thb:'THB',unit_price_thb:'THB',unit_cost_thb:'THB',fee_pct:'%',fixed_campaign_spend_thb:'THB'}
const placeholders:Record<FieldKey,string>={brand:'e.g. Crunchy Co.',discount_pct:'15',total_budget_thb:'20000',unit_price_thb:'120',unit_cost_thb:'65',fee_pct:'10',fixed_campaign_spend_thb:'0'}

function describeQuestion(q:Question):FieldDescriptor|undefined {
  const core=(labelsForCorePaths[q.field_id]??q.field_id) as FieldKey
  if(fieldKeys.includes(core))return {path:core,label:fieldLabels[core],type:core==='brand'?undefined:'number',min:0}
  const descriptor=fieldsByPath.get(q.field_id)
  if(descriptor)return descriptor
  const match=/^(objective\.smart_goals|offer\.mechanics)\.\d+\.([a-z_]+)$/.exec(q.field_id)
  if(match)return (match[1]==='objective.smart_goals' ? goalFields : mechanicFields).find(f=>f.path===match[2])
}
function questionText(q:Question){
  const f=describeQuestion(q)
  if(!f)return q.prompt
  const core=f.path as FieldKey
  const unit=fieldKeys.includes(core)?coreUnits[core]:''
  if(q.prompt.startsWith('Enter ') && !q.prompt.includes('YYYY')){
    const prompts:Record<string,string>={
      brand:'Which brand is the promotion for?', discount_pct:'What percentage discount will the voucher offer?',
      total_budget_thb:'What is the total campaign budget in THB?', name:'What would you like to call this campaign?',
      'brand.category':'Which product category are you promoting?', 'audience.description':'Who should receive the offer?',
      'timing.start_date':'When does the campaign start? Use YYYY-MM-DD.',
      'timing.end_date':'When does the campaign end? Use YYYY-MM-DD.',
    }
    return prompts[f.path]??('What '+f.label.toLowerCase()+' should we use'+(unit?' ('+unit+')':'')+'?')
  }
  return q.prompt.toLowerCase().includes(f.label.toLowerCase())?q.prompt:f.label+' — '+q.prompt
}
function readAnswer(text:string, q:Question, draft:Draft):{value:string;error?:string} {
  const f=describeQuestion(q)
  let value=text.trim()
  if(!f)return {value}
  if(f.type==='number'||f.type==='integer'){
    value=value.replaceAll(',','').replace(/^(?:฿|THB)\s*/i,'').replace(/\s*(?:%|THB|baht)$/i,'')
    const n=Number(value)
    if(!value || !Number.isFinite(n) || (f.type==='integer'&&!Number.isInteger(n)) || n<(f.min??-Infinity) || n>(f.max??Infinity)){
      return {value,error:'Enter a valid '+(f.type==='integer'?'whole number':'number')+' for '+f.label.toLowerCase()+'.'}
    }
    if(fieldKeys.includes(f.path as FieldKey)){
      const key=f.path as FieldKey
      const issue=validate({...draft.values,[key]:value})[key]
      if(issue)return {value,error:issue}
    }
  }
  if(f.choices){
    const values=value.split(',').map(s=>s.trim().toLowerCase().replace(/\s+/g,'_'))
    if(values.some(v=>!f.choices!.includes(v)) || (f.type!=='list' && values.length!==1))return {value,error:'Choose '+f.choices.map(s=>s.replaceAll('_',' ')).join(', ')+'.'}
    value=values.join(', ')
  }
  if(f.type==='date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value))return {value,error:'Use a calendar date in YYYY-MM-DD format.'}
  return {value}
}

function CampaignChat({p, runApproval}:{p:Props; runApproval:ReactNode}){
  const [turns,setTurns]=useState<Turn[]>([])
  const [message,setMessage]=useState('')
  const [sending,setSending]=useState(false)
  const [chatError,setChatError]=useState('')
  const composing=useRef<HTMLTextAreaElement>(null)
  const transcript=useRef<HTMLDivElement>(null)
  const locked=!!p.busy||sending
  const question=p.questions[0]
  const prompt=question?questionText(question):''
  const hasConversation=!!(turns.length||question||sending||runApproval)
  useEffect(()=>{
    const log=transcript.current
    if(log)log.scrollTop=log.scrollHeight
  },[turns,prompt,sending,chatError,p.review])
  function useSample(){
    p.onSample()
    setChatError('')
    setMessage(sampleBrief)
    requestAnimationFrame(()=>composing.current?.focus())
  }
  function append(...messages:Turn[]){setTurns(current=>[...current,...messages])}
  async function send(event:FormEvent){
    event.preventDefault()
    const text=message.trim()
    if(!text||locked)return
    setChatError('')
    if(question){
      const reply=readAnswer(text,question,p.draft)
      if(reply.error){setChatError(reply.error);return}
      append({speaker:'assistant',text:prompt},{speaker:'user',text})
      p.onAnswer(question,reply.value)
      if(p.questions.length===1)append({speaker:'assistant',text:'Your answer is in the form. Review the campaign to check the updated plan.'})
      setMessage('')
      requestAnimationFrame(()=>composing.current?.focus())
      return
    }
    setSending(true)
    try{
      const result=await p.onExtract(text)
      if(!result.ok){setChatError(result.reply);return}
      append({speaker:'user',text},{speaker:'assistant',text:result.reply})
      setMessage('')
    }catch(error){
      setChatError(error instanceof Error?error.message:'The brief could not be read. You can send it again.')
    }finally{
      setSending(false)
      requestAnimationFrame(()=>composing.current?.focus())
    }
  }
  return <section className="intake-chat" aria-labelledby="intake-chat-title">
    <header className="intake-heading"><h2 id="intake-chat-title">Campaign chat</h2>
      <button type="button" className="intake-link" disabled={locked} onClick={p.onReplay}>{p.busy==='replay'?'Opening replay…':p.replayLabel}</button>
    </header>
    <div className={'intake-chat-main'+(hasConversation?' has-conversation':'')}>
      {hasConversation ? <div ref={transcript} role="log" aria-label="Campaign conversation" aria-live="polite" aria-relevant="additions" className="intake-transcript">
        {turns.map((turn,i)=><div className="intake-turn" data-speaker={turn.speaker} key={i}><span className="sr-only">{turn.speaker==='user'?'You':'CampaignTwin'} </span>{turn.text}</div>)}
        {sending && <><div className="intake-turn" data-speaker="user">{message.trim()}</div><p className="intake-status">Reading your brief…</p></>}
        {question && <div className="intake-turn campaign-questions" data-speaker="assistant" tabIndex={-1}>
          <p>{prompt}</p>
          {describeQuestion(question)?.choices && <p className="intake-question-choices">{describeQuestion(question)?.choices?.map(c=>c.replaceAll('_',' ')).join(' · ')}</p>}
        </div>}
        {runApproval && p.review && <div className="intake-turn" data-speaker="assistant">
          <p>{p.review.original_plan.label} · {p.review.original_plan.discount_pct}% voucher · {money(p.review.original_plan.total_budget_thb)} budget</p>
          <Disclosure title="Plans and assumptions">
            <p>{[p.review.original_plan.label,...p.candidates.filter(c=>p.chosen.includes(c.plan.plan_id)).map(c=>c.plan.label)].join(' · ')}</p>
            <ul>{p.review.assumptions.map(assumption=><li key={assumption}>{assumption}</li>)}</ul>
          </Disclosure>
        </div>}
      </div> : <div className="intake-empty">
        <h2>What are you planning?</h2>
        <p>Describe your promotion and review the details in the form.</p>
      </div>}
      {runApproval && <div className="intake-chat-run">{runApproval}</div>}
      <form className="intake-composer" onSubmit={send}>
        <label htmlFor="brief" className="sr-only">{question ? 'Reply to the campaign question' : 'Campaign brief'}</label>
        <textarea ref={composing} id="brief" value={message} onChange={e=>{setMessage(e.target.value);setChatError('')}} rows={2}
          readOnly={locked} placeholder={question?'Write your answer…':hasConversation?'Add to your brief…':'Describe your campaign…'}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing && e.nativeEvent.keyCode!==229){
            e.preventDefault();e.currentTarget.form?.requestSubmit()
          }}}/>
        <div className="intake-composer-actions">
          {!message.trim() && !turns.some(turn=>turn.speaker==='user' && turn.text===sampleBrief) ? <button type="button" className="intake-link" disabled={locked} onClick={useSample}>Use sample brief</button> : <span/>}
          <button type="submit" className="intake-send" disabled={locked||!message.trim()}>{sending?'Sending…':'Send'}</button>
        </div>
      </form>
      {chatError && <p className="intake-chat-error" role="alert">{chatError}</p>}
      {runApproval && p.error && <p className="intake-chat-error">{p.error}</p>}
    </div>
  </section>
}

function PlanReview({p, chosenInvalid, approval}:{p:Props;chosenInvalid:boolean;approval:ReactNode}){
  const r=p.review
  if(!r)return null
  return <section className="intake-review" aria-labelledby="review-title">
    <h3 id="review-title" tabIndex={-1}>Approve the run</h3>
    <p>{r.original_plan.label} · {r.original_plan.discount_pct}% voucher · {money(r.original_plan.total_budget_thb)} budget</p>
    {p.candidates.map(c=><div key={c.plan.plan_id} className="intake-alternative">
      <label className="intake-check"><input type="checkbox" disabled={!!p.busy} checked={p.chosen.includes(c.plan.plan_id)} onChange={()=>p.onToggle(c.plan.plan_id)}/> Include {c.plan.label}</label>
      <p>{c.summary}</p>
      {c.issues.map(issue=><p className="intake-field-error" key={issue}>{issue}</p>)}
      <Disclosure title="Edit alternative discount"><label className="intake-field">Alternative discount (%)
        <input className="intake-control" type="number" step="any" min="0" value={p.candidateEdits[c.plan.plan_id]??c.plan.discount_pct} disabled={!!p.busy} onChange={e=>p.onCandidateEdit(c.plan.plan_id,e.target.value)}/>
      </label><button type="button" className="intake-secondary" onClick={()=>p.onRevalidate(c)} disabled={!!p.busy||p.candidateEdits[c.plan.plan_id]===undefined}>Check change</button></Disclosure>
    </div>)}
    <Disclosure title="Comparison and assumptions"><p>Each selected plan uses the same no-campaign baseline.</p><ul>{r.assumptions.map(a=><li key={a}>{a}</li>)}</ul></Disclosure>
    {r.blocking_gaps.map(g=><p className="intake-field-error" key={g}>{g}</p>)}
    {chosenInvalid && <p className="intake-field-error">Check the edited alternative or remove it before starting.</p>}
    {approval}
  </section>
}

export function Input(p:Props){
  const [sampleNotice,setSampleNotice]=useState('')
  const needed=p.draft.fields.filter(f=>f.value!==null && f.confirmation==='pending')
  const remaining=needed.filter(f=>!p.draft.confirmed.includes(f.field_id))
  const errors=questionErrors(p.questions)
  const disabled=!!p.busy
  const chosenInvalid=p.candidates.some(c=>p.chosen.includes(c.plan.plan_id) && (c.issues.length ||
    (p.candidateEdits[c.plan.plan_id]!==undefined && Number(p.candidateEdits[c.plan.plan_id])!==c.plan.discount_pct)))
  const ready=!!p.review && !remaining.length && !p.review.blocking_gaps.length && !chosenInvalid && !p.questions.some(q=>q.blocking!==false)
  const approval={checked:p.approved,disabled:disabled||!ready,onChange:p.onApprove,onRun:p.onRun}
  function campaign(path:string){
    const descriptor=fieldsByPath.get(path)!
    return <CampaignControl field={descriptor} value={p.draft.campaign[path]??''} issue={errors[path]} disabled={disabled} update={v=>p.onCampaignField(path,v)}/>
  }
  function field(key:FieldKey){
    const issue=p.issues[key]??errors[key]
    return <div className="intake-field" key={key}><label htmlFor={key}>{fieldLabels[key]}</label>
      <div className="intake-unit-input"><input id={key} className="intake-control" type={key==='brand'?'text':'number'} step="any" min={key==='brand'?undefined:0}
        disabled={disabled} placeholder={placeholders[key]} value={p.draft.values[key]} onChange={e=>p.onChange(key,e.target.value)} aria-invalid={!!issue} aria-describedby={issue?key+'-issue':undefined}/>
        {coreUnits[key] && <span aria-hidden="true">{coreUnits[key]}</span>}
      </div>{issue && <p className="intake-field-error" id={key+'-issue'}>{issue}</p>}
    </div>
  }
  return <div className="intake-workbench">
    <h1 className="sr-only">Campaign plan</h1>
    <CampaignChat p={p} runApproval={ready && <RunApproval {...approval} label="Approve the selected plans and assumptions" action={p.busy==='run'?'Starting…':'Run simulation'}/>}/>
    <section className="intake-form" aria-labelledby="campaign-details-title">
      <header className="intake-heading"><h2 id="campaign-details-title">Campaign details</h2>
        {!p.review && <button type="button" className="intake-link" disabled={disabled} onClick={()=>setSampleNotice(p.onFillSample())}>Fill sample fields</button>}
      </header>
      <div className="intake-form-body">
        {!p.review && sampleNotice && <p className="intake-review-notice" role="status">{sampleNotice}</p>}
        <ProductGoods photo={categoryPhoto(p.draft.campaign['brand.category'], p.draft.values.brand)}/>
        {needed.length>0 && <Disclosure title={remaining.length?`Confirm details from your brief (${remaining.length})`:'Confirmed details from your brief'} openOnError={!!remaining.length}>
          <ul className="intake-candidates">{needed.map(f=><li key={f.field_id}>
            <label className="intake-check"><input type="checkbox" disabled={disabled} checked={p.draft.confirmed.includes(f.field_id)} aria-label={'Confirm '+fieldLabels[f.field_id].toLowerCase()} onChange={()=>p.onConfirm(f.field_id)}/>
              <span><strong>{fieldLabels[f.field_id]}</strong> · {p.draft.values[f.field_id]} {coreUnits[f.field_id]}</span></label>
            <p>{f.source_quote ? <>{f.origin==='user' && 'Before your edit · '}“{f.source_quote}”</>:'Suggested assumption'}</p>
          </li>)}</ul>
        </Disclosure>}
        <div className="intake-field-grid">
          <div className="intake-span">{campaign('name')}</div>
          {field('brand')}{campaign('brand.category')}
          {field('discount_pct')}{field('total_budget_thb')}
          <div className="intake-span">{campaign('audience.description')}</div>
          {campaign('timing.start_date')}{campaign('timing.end_date')}
        </div>
        <Disclosure title="Sample economics" openOnError={costs.some(k=>!!p.issues[k]||!!errors[k])}>
          <p>These values apply to the synthetic multipack rehearsal.</p><div className="intake-field-grid">{costs.map(field)}</div>
        </Disclosure>
        <Disclosure title="More campaign settings" openOnError={Object.keys(errors).some(k=>!visiblePaths.has(k) && !fieldKeys.includes(k as FieldKey))}>
          <CampaignFields draft={p.draft} change={p.onCampaignField} rows={p.onCampaignRows} disabled={disabled} errors={errors} omit={visiblePaths}/>
        </Disclosure>
        {p.error && <p role="alert" className="intake-form-error">{p.error}</p>}
        {!p.review && <div className="intake-form-actions"><button className="intake-primary" type="button" onClick={p.onReview} disabled={disabled}>{p.busy==='review'?'Reviewing…':'Review campaign'}</button></div>}
        {p.review && !p.busy && !p.candidates.length && !p.review.blocking_gaps.length && !p.questions.length && p.notice && <p className="intake-review-notice" role="status">{p.notice}</p>}
        <PlanReview p={p} chosenInvalid={chosenInvalid} approval={<RunApproval {...approval} label="I approve the selected plans and assumptions." action={p.busy==='run'?'Starting…':'Start simulation'}/>}/>
      </div>
    </section>
  </div>
}
