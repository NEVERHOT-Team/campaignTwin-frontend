import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WorkspaceHeader } from '../WorkspaceHeader'
import { RunApproval } from '../RunApproval'
import { ProductGoods, catalogPhoto } from '../ProductGoods'
import { fillBlank, shiftedDay } from '../form-sample'
import { scrollToWorkspaceStart } from '../workspace-motion'
import { createV2Client, V2ApiError, type Fields, type Session } from './client'
import SellerFields from './SellerFields'
import { feeDemo, formEdits, formFields, formFromFields } from './seller-fields'
import SellerEvidence from './SellerEvidence'
import SellerVerdict from './SellerVerdict'
import { useSellerRun, type SavedRun } from './seller-runs'
import '../intake.css'
import './seller-workflow.css'

type Props = { onOpenV1:()=>void }
type Message = {speaker:'assistant'|'user'; text:string}
type Pending = {submissionId:string; reviewId:string; revision:number; approvalId?:string; retryOf?:string}
type Saved = {reviewId:string|null; mode:'guided'|'form'; turns:Message[]; history:SavedRun[]; selected:string|null; pending:Pending|null}
const blank:Saved={reviewId:null,mode:'form',turns:[],history:[],selected:null,pending:null}
const facts=(session:Session|null):Fields=>({...session?.review.facts,...session?.review.commercial_inputs})
const short=(v:string)=>v.replaceAll('_',' ')
function description(value:unknown):string {
  if (Array.isArray(value)) return value.map(description).join(', ')
  if (value && typeof value === 'object') return Object.entries(value).map(([k,v])=>short(k)+' '+description(v)).join(' · ')
  return typeof value === 'string' ? short(value) : String(value ?? 'Unknown')
}
function restore(key:string):Saved {
  try {
    const value=JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (Array.isArray(value?.history) && Array.isArray(value?.turns)) return {...blank,...value}
  } catch { /* A fresh tab also works without browser storage. */ }
  return blank
}
function message(error:unknown) {
  if (error instanceof V2ApiError) return [error.message,...(error.problem.issues ?? error.problem.blockers ?? []).map(i=>i.field+' · '+i.message)].join('\n')
  return error instanceof Error ? error.message : 'The request could not be completed.'
}

export default function SellerWorkflow({onOpenV1}:Props) {
  const [api]=useState(()=>createV2Client(import.meta.env.VITE_API_BASE_URL))
  const storageKey='campaigntwin-seller-v2/'+api.origin
  const [initial]=useState(()=>restore(storageKey))
  const [saved,setSaved]=useState(initial)
  const savedRef=useRef(initial)
  const [session,setSession]=useState<Session|null>(null)
  const [form,setForm]=useState<Record<string,string>>({})
  const [draft,setDraft]=useState('')
  const [consent,setConsent]=useState(false)
  const [busy,setBusy]=useState('')
  const inFlight=useRef(false)
  const [restoring,setRestoring]=useState(!!initial.reviewId)
  const [restoreFailed,setRestoreFailed]=useState(false)
  const [restoreAttempt,setRestoreAttempt]=useState(0)
  const [runAttempt,setRunAttempt]=useState(0)
  const [issue,setIssue]=useState('')
  const [notice,setNotice]=useState('')
  const [unavailable,setUnavailable]=useState(false)
  const [connectAttempt,setConnectAttempt]=useState(0)
  const transcript=useRef<HTMLDivElement>(null)
  const composer=useRef<HTMLTextAreaElement>(null)
  const locked=!!busy || restoring
  const review=session?.review
  const baseline=facts(session)
  const baselineForm=formFromFields(baseline)
  const dirty=Object.keys({...form,...baselineForm}).some(k=>(form[k] ?? '') !== (baselineForm[k] ?? ''))
  const isReady=!!session && review?.status==='ready_for_approval' && !review.blockers.length && !review.candidates.length
    && (saved.mode==='form' || session.next_step.mode==='review')
  const selected=saved.history.find(r=>r.id===saved.selected)
  const previous=selected ? saved.history.filter(r=>r.reviewId===selected.reviewId && r.revision<selected.revision)
    .reduce<SavedRun|undefined>((best,r)=>!best || r.revision>=best.revision ? r : best,undefined) : undefined
  const loaded=useSellerRun(api,selected,previous,runAttempt)
  const existing=review && [...saved.history].reverse().find(r=>r.reviewId===review.review_id && r.revision===review.revision)

  function remember(changes:Partial<Saved>) {
    const next={...savedRef.current,...changes}
    savedRef.current=next
    setSaved(next)
    try {sessionStorage.setItem(storageKey,JSON.stringify(next))} catch { /* The in-memory session is usable. */ }
  }
  function accept(next:Session) {
    setSession(next);setForm(formFromFields(facts(next)));setConsent(false)
  }
  useEffect(()=>{
    const controller=new AbortController()
    api.discover(controller.signal).then(()=>setUnavailable(false)).catch(()=>{
      if (!controller.signal.aborted) setUnavailable(true)
    })
    return ()=>controller.abort()
  },[api,connectAttempt])
  useEffect(()=>{
    if (!initial.reviewId || savedRef.current.reviewId!==initial.reviewId) return
    const controller=new AbortController()
    setRestoring(true);setRestoreFailed(false)
    api.current(initial.reviewId,controller.signal).then(next=>{
      if (controller.signal.aborted) return
      accept(next);setRestoring(false);setIssue('')
    }).catch(error=>{
      if (controller.signal.aborted) return
      setRestoring(false);setRestoreFailed(true);setIssue(message(error))
    })
    return ()=>controller.abort()
  },[api,initial,restoreAttempt])
  useEffect(()=>{
    const log=transcript.current
    if (log) log.scrollTop=log.scrollHeight
  },[session,saved.turns])
  useEffect(()=>{scrollToWorkspaceStart()},[selected?.id])

  function edit(key:string,value:string) {
    setForm(old=>({...old,[key]:value}));setConsent(false);setIssue('');setNotice('')
  }
  function fillDemo() {
    const sample=formFromFields(feeDemo)
    const chosen=form.product_choice_id?.trim()
    const matchesProduct=(!chosen || chosen===sample.product_choice_id)
      && (!form.channel?.trim() || form.channel.trim().toLowerCase()===sample.channel)
      && (!!chosen || !(form.product_hint?.trim() || form.pack_hint?.trim()))
    const customOffer=Object.entries(form).some(([k,v])=>k.startsWith('offer.') && v.trim() && v.trim()!==sample[k])
    const pending=new Set(review?.candidates.map(c=>c.field.split('/').at(-1)))
    const additions=Object.fromEntries(Object.entries(sample).filter(([key])=>{
      if (pending.has(key.split('.')[0])) return false
      if (key.startsWith('offer.')) return matchesProduct && !customOffer
      if (['product_choice_id','channel','order_fee_thb','discount_response'].includes(key)) return matchesProduct
      return true
    }))
    if (form.start_date && !form.end_date) additions.end_date=shiftedDay(form.start_date,7) ?? sample.end_date
    if (form.end_date && !form.start_date) additions.start_date=shiftedDay(form.end_date,-7) ?? sample.start_date
    const next=fillBlank(form,additions)
    if (next===form) {setNotice('All applicable demo fields already have values.');return}
    setForm(next);setConsent(false);setIssue('')
    setNotice('Filled empty fields with demo values. Review them before saving.')
  }
  async function handle(error:unknown) {
    setIssue(message(error))
    if (/seller API returned HTTP 404/.test(message(error))) setUnavailable(true)
    if (!(error instanceof V2ApiError)) return
    const stale=error.problem.code==='stale_review' || error.problem.code==='approval_stale'
    if (stale || error.problem.code==='incomplete_review') {setConsent(false);remember({pending:null})}
    if (!stale || !review) return
    setConsent(false)
    try {
      const latest=await api.current(review.review_id)
      const latestForm=formFromFields(facts(latest))
      const local=Object.fromEntries(Object.keys({...form,...baselineForm}).filter(k=>(form[k] ?? '')!==(baselineForm[k] ?? '')).map(k=>[k,form[k] ?? '']))
      const conflicts=Object.keys(local).filter(k=>(baselineForm[k] ?? '')!==(latestForm[k] ?? '') && (latestForm[k] ?? '')!==local[k])
      accept(latest);setForm({...latestForm,...local});remember({pending:null})
      setIssue(latest.review.revision!==review.revision
        ? 'Another planner saved revision '+latest.review.revision+'. Review the updated inputs before continuing.'
        : 'The approved inputs are no longer current. Check the available costs and save a new revision before running again.')
      if (conflicts.length) setNotice(conflicts.map(k=>short(k)+' · Saved '+(latestForm[k] || 'blank')+' · Your edit '+(local[k] || 'blank')).join('\n'))
    } catch(reloadError) {setIssue(message(error)+' '+message(reloadError))}
  }
  function start(action:string) {
    if (locked || inFlight.current || (restoreFailed && action!=='edit' && action!=='run')) return false
    inFlight.current=true;setBusy(action);setIssue('');setNotice('')
    return true
  }
  function finish() {inFlight.current=false;setBusy('')}
  async function submitApproved(pending:Pending, approvalId:string) {
    let created
    try {
      created=await api.submit({approval_id:approvalId,submission_id:pending.submissionId,...(pending.retryOf && {retry_of_run_id:pending.retryOf})})
    } catch(error) {
      if (!(error instanceof V2ApiError) || error.problem.code!=='retry_already_submitted' || !error.problem.run_id) throw error
      created={run_id:error.problem.run_id,status_url:'/api/v2/runs/'+encodeURIComponent(error.problem.run_id)}
    }
    const record={id:created.run_id,reviewId:pending.reviewId,revision:pending.revision,approvalId,statusUrl:created.status_url}
    remember({history:[...savedRef.current.history.filter(r=>r.id!==record.id),record],pending:null})
    return record
  }
  async function write(kind:'save'|'send'|'choice',choice?:Session['next_step']['choices'][number]) {
    const text=draft.trim()
    if (kind==='send' && !text || session && kind!=='save' && dirty || !start(kind)) return
    try {
      const fields=formFields(form)
      const edits=formEdits(baseline,fields)
      if (kind==='save' && session && !Object.keys(edits).length) {setNotice('The saved values already match your form.');return}
      // A previous POST may have succeeded even if its response was lost.
      // Recover its immutable run ID before advancing the editable revision.
      const pending=savedRef.current.pending
      if (session && pending?.approvalId && pending.reviewId===session.review.review_id && pending.revision===session.review.revision)
        await submitApproved(pending,pending.approvalId)
      let next:Session
      if (!session) next=await api.create({...((kind==='send' && text) ? {brief:text} : {}),...(Object.keys(fields).length ? {fields} : {})})
      else if (kind==='send') next=await api.turn(session,{base_revision:session.review.revision,answer:text})
      else if (kind==='choice' && choice) next=await api.turn(session,{base_revision:session.review.revision,choice:choice.id})
      else next=await api.turn(session,{base_revision:session.review.revision,edits})
      const turns=[...savedRef.current.turns]
      if (kind!=='save') {
        if (session) turns.push({speaker:'assistant',text:session.next_step.prompt})
        turns.push({speaker:'user',text:choice?.label ?? text})
        if (kind==='send') setDraft('')
      }
      accept(next);setUnavailable(false)
      remember({reviewId:next.review.review_id,mode:session ? saved.mode : kind==='save' && Object.keys(fields).length ? 'form' : 'guided',turns,pending:null})
      if (kind==='save') setNotice('Revision '+next.review.revision+' saved.')
    } catch(error) {await handle(error)} finally {finish()}
  }
  function showRun(run:SavedRun) {
    setIssue('');setNotice('');remember({selected:run.id})
  }
  async function run(retry?:SavedRun) {
    if (!retry && (!session || !isReady || !consent || dirty) || !start('run')) return
    const id=retry?.reviewId ?? session!.review.review_id
    const revision=retry?.revision ?? session!.review.revision
    const pinned=savedRef.current.pending
    let pending:Pending=pinned?.reviewId===id && pinned.revision===revision && pinned.retryOf===retry?.id
      ? pinned : {reviewId:id,revision,submissionId:crypto.randomUUID(),...(retry && {retryOf:retry.id,approvalId:retry.approvalId})}
    try {
      remember({pending})
      if (!pending.approvalId) {
        const receipt=await api.approve(session!)
        if (receipt.review_id!==id || receipt.revision!==revision) throw new Error('The approval does not match the selected revision.')
        pending={...pending,approvalId:receipt.approval_id};remember({pending})
      }
      const record=await submitApproved(pending,pending.approvalId!)
      remember({selected:record.id});setConsent(false)
    } catch(error) {await handle(error)} finally {finish()}
  }
  async function editCampaign(focusFee=false) {
    if (!selected) return
    let editingRevision=review?.revision
    if (selected.reviewId!==review?.review_id) {
      if (!start('edit')) return
      try {
        const reopened=await api.current(selected.reviewId)
        accept(reopened);setRestoreFailed(false);editingRevision=reopened.review.revision
        remember({reviewId:reopened.review.review_id,turns:[],mode:'form',pending:null})
      } catch(error) {setIssue(message(error));finish();return}
      finish()
    }
    remember({selected:null});setIssue('')
    setNotice(editingRevision && editingRevision!==selected.revision
      ? 'Editing the current revision '+editingRevision+'. The saved run still uses revision '+selected.revision+'.' : '')
    if (focusFee) requestAnimationFrame(()=>{
      const fee=document.getElementById('seller-order_fee_thb')
      if (fee) {fee.scrollIntoView({block:'center'});fee.focus({preventScroll:true})}
    })
  }
  function newCampaign() {
    setSession(null);setForm({});setConsent(false);setIssue('');setNotice('');setDraft('');setRestoreFailed(false)
    remember({reviewId:null,selected:null,pending:null,turns:[],mode:'form'})
  }
  function approval(inChat:boolean) {
    if (!review || !isReady) return null
    if (existing && !dirty) return <button type="button" className="intake-secondary" onClick={()=>showRun(existing)}>View saved result</button>
    const retrying=saved.pending?.reviewId===review.review_id && saved.pending.revision===review.revision && !saved.pending.retryOf
    return <RunApproval checked={consent} disabled={locked || dirty} onChange={setConsent} onRun={()=>run()}
      label={(inChat?'Approve revision ':'I approve revision ')+review.revision+' and its costs and assumptions'}
      action={busy==='run'?'Starting…':retrying?'Retry submission':inChat?'Run simulation':'Approve and start simulation'}/>
  }
  function historySelect() {
    if (!saved.history.length) return null
    return <label className="seller-history"><span>Saved run</span><select aria-label="Saved run" value={selected?.id ?? ''} disabled={locked}
      onChange={e=>{const choice=saved.history.find(r=>r.id===e.target.value);if (choice) showRun(choice)}}>
      <option value="" disabled>Select a run…</option>
      {[...saved.history].reverse().map(r=><option key={r.id} value={r.id}>Revision {r.revision} · {r.id.slice(0,8)}</option>)}
    </select></label>
  }
  const resultScreen=!!selected
  const submitChat=(e:FormEvent)=>{e.preventDefault();void write('send')}
  return <>
    <a className="skip-link" href="#seller-workspace">Skip to workspace</a>
    <WorkspaceHeader status="Seller API · v2" action={<div className="planner-actions">
      {(review || selected || saved.reviewId) && !restoreFailed && <button type="button" disabled={locked} onClick={newCampaign}>New campaign</button>}
      <button type="button" onClick={onOpenV1}>Back to v1</button>
    </div>}>
      <span className="seller-phase">{resultScreen?'Verdict':'Plan'}</span>
    </WorkspaceHeader>
    <main className="workspace seller-workspace" id="seller-workspace">
      {resultScreen && selected ? <>
        <div className="seller-results-nav"><button className="intake-secondary" disabled={locked} onClick={()=>editCampaign()}>Edit campaign</button>{historySelect()}</div>
        {!!issue && <p role="alert" className="seller-feedback">{issue}</p>}
        {loaded.current ? <>
          <SellerVerdict {...loaded.current} previous={loaded.previous} onEditFee={()=>editCampaign(true)}/>
          {loaded.loadingPrevious && <p className="seller-feedback" role="status">Loading the preceding approved revision…</p>}
          {loaded.comparisonError && <div className="seller-feedback"><p role="alert">{loaded.comparisonError}</p><button className="intake-link" onClick={()=>setRunAttempt(n=>n+1)}>Retry comparison</button></div>}
        </> : <section className="seller-status"><h1>{loaded.state?.failure?'Run failed':loaded.error?'Saved run unavailable':'Opening your run'}</h1>
          <p role="status">{loaded.error ?? loaded.state?.failure?.message ?? (loaded.state ? short(loaded.state.status)+' · '+Math.round(loaded.state.progress*100)+'%' : 'Retrieving the approved revision and run status…')}</p>
          {loaded.error && <button className="intake-secondary" onClick={()=>setRunAttempt(n=>n+1)}>Check again</button>}
          {loaded.state?.failure?.retryable && <button className="intake-primary" disabled={locked} onClick={()=>run(selected)}>Retry approved run</button>}
        </section>}
      </> : <div className="intake-workbench seller-intake">
        <section className="intake-chat" aria-labelledby="seller-chat-title">
          <header className="intake-heading"><h1 id="seller-chat-title">Campaign chat</h1></header>
          <div className={'intake-chat-main'+(session?' has-conversation':'')}>
            {session ? <div className="intake-transcript seller-transcript" role="log" aria-label="Seller interview" ref={transcript}>
              {saved.turns.map((t,i)=><p className="intake-turn" data-speaker={t.speaker} key={i}><span className="sr-only">{t.speaker==='user'?'You':'CampaignTwin'} </span>{t.text}</p>)}
              <div className="intake-turn" data-speaker="assistant"><span className="seller-caption">Revision {review?.revision}</span>
                {isReady && session.next_step.mode!=='review' && <p>Your campaign is ready to approve with the displayed assumptions. You can also change this choice.</p>}
                <p>{session.next_step.prompt}</p><small>{session.next_step.reason}</small></div>
              {session.next_step.choices.length>0 && <div className="seller-choices">
                {session.next_step.choices.map(c=><button type="button" className="intake-secondary" key={c.id} disabled={locked || dirty} onClick={()=>write('choice',c)}>
                  {c.source==='extracted'?<><span>Confirm {description(c.value)}</span><small>“{c.label}”</small></>:c.label}
                </button>)}
              </div>}
              {isReady && <SellerEvidence session={session} label={'Review revision '+review?.revision+' and its assumptions'}/>}
            </div> : <div className="intake-empty"><h2>{restoring?'Opening your campaign…':'What are you promoting?'}</h2><p>Describe your offer or fill in the campaign details.</p></div>}
            {session && dirty && <div className="seller-unsaved"><p>Save your form changes to continue.</p><button type="button" className="intake-link" disabled={locked} onClick={()=>write('save')}>Save edits</button></div>}
            {isReady && <div className="intake-chat-run">{approval(true)}</div>}
            <form className="intake-composer" onSubmit={submitChat}>
              <label className="sr-only" htmlFor="seller-message">{session?'Reply to CampaignTwin':'Campaign brief'}</label>
              <textarea id="seller-message" ref={composer} rows={2} maxLength={1000} disabled={locked || restoreFailed} value={draft}
                placeholder={session?'Reply to CampaignTwin…':'Describe your campaign…'} onChange={e=>setDraft(e.target.value)}
                onKeyDown={e=>{if (e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode!==229){e.preventDefault();e.currentTarget.form?.requestSubmit()}}}/>
              <div className="intake-composer-actions"><span>{session?'Seller interview':''}</span><button type="submit" className="intake-send" disabled={locked || restoreFailed || !draft.trim() || (!!session && dirty)}>{busy==='send'?'Sending…':'Send'}</button></div>
            </form>
            {unavailable && <div className="seller-feedback"><p role="alert">The v2 API is unavailable. You can continue planning in v1.</p>
              <div className="seller-recovery"><button type="button" className="intake-secondary" onClick={onOpenV1}>Open v1 planner</button><button type="button" className="intake-link" onClick={()=>setConnectAttempt(n=>n+1)}>Check connection</button></div></div>}
            {issue && <p className="seller-feedback" role="alert">{issue}</p>}
            {notice && <p className="seller-feedback" role="status">{notice}</p>}
            {restoreFailed && <div><button className="intake-secondary" onClick={()=>setRestoreAttempt(n=>n+1)}>Reopen campaign</button><button className="intake-link" onClick={newCampaign}>Start a new campaign</button></div>}
          </div>
        </section>
        <form className="intake-form" aria-labelledby="seller-form-title" onSubmit={e=>{e.preventDefault();void write('save')}}>
          <header className="intake-heading"><h2 id="seller-form-title">Campaign details</h2><button type="button" className="intake-secondary" disabled={locked || restoreFailed} onClick={fillDemo}>Fill demo</button></header>
          <ProductGoods photo={review?.resolved_product?.choice_id===form.product_choice_id ? catalogPhoto(review?.resolved_product) : null}/>
          <SellerFields form={form} session={session} onChange={edit} disabled={locked || restoreFailed}/>
          <div className="intake-form-actions"><button type="submit" className="intake-primary" disabled={locked || restoreFailed || (!!session && !dirty)}>{busy==='save'?'Saving…':session?'Save revision':'Create review'}</button></div>
          {session && <><SellerEvidence session={session}/>{isReady && <div className="seller-form-approval">{approval(false)}</div>}</>}
          {historySelect()}
        </form>
      </div>}
    </main>
  </>
}
