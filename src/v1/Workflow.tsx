import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WorkspaceHeader } from '../WorkspaceHeader'
import { ApiError, createV1Client, type Approval, type Review, type Report, type RunState } from './client'
import { changes, controls, humanize, issue, toFields, toForm } from './planner'
import { RunReport } from './RunReport'
import { useRunSelection } from './run-selection'
import LiveArena from './LiveArena'
import { ReviewEvidence } from './ReviewEvidence'
import '../intake.css'
import './workflow.css'

type Turn = { speaker: 'user' | 'assistant'; text: string }
type RunLink = { id: string; url: string }
type Pending = { id: string; key: string }
type Saved = { reviewId: string; turns: Turn[]; receipt: Approval | null; run: RunLink | null; pending: Pending | null }
const firstKeys = ['product_hint','pack_hint','product_choice_id','channel','audience_hint','objective','budget_thb','start_date','end_date']
const offerKeys = ['offer.kind','offer.value','offer.unit']
const restrictionKeys = ['offer.min_spend_thb','offer.cap_per_user','offer.eligibility']
const demoBrief = 'Use the synthetic demo toilet tissue for all buyers. Target incremental profit, with a 1000 THB budget and a 10 THB voucher next week.'
const fieldKey = (pointer:string) => pointer.startsWith('/facts/') ? pointer.slice(7).replaceAll('/','.') : ''
const valueLabel = (value:unknown):string => typeof value === 'object' && value !== null ? Object.entries(value).map(([k,v]) => humanize(k) + ' ' + String(v)).join(' · ') : String(value)
function loadSaved(key:string):Saved|null {
  try {
    const data = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    return typeof data?.reviewId === 'string' && Array.isArray(data.turns) ? data : null
  } catch { return null }
}
function summary(r:Review) {
  return r.questions[0]?.prompt ?? (r.status === 'ready_for_approval' ? 'Your campaign is ready for approval.' : r.blockers[0]?.message)
}
function addPendingQuestion(turns:Turn[], r:Review|null) {
  const prompt = r && summary(r)
  return prompt ? [...turns,{speaker:'assistant' as const,text:prompt}] : turns
}

export default function Workflow({ onOpenDemo }: { onOpenDemo?: () => void }) {
  const [api] = useState(() => createV1Client(import.meta.env.VITE_API_BASE_URL))
  const sessionKey = 'campaigntwin-v1-session/' + api.origin
  const [saved] = useState(() => loadSaved(sessionKey))
  const [restoring, setRestoring] = useState(Boolean(saved))
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const [draftText,setDraftText] = useState('')
  const [turns,setTurns] = useState<Turn[]>([])
  const [form,setForm] = useState<Record<string,string>>({})
  const [review,setReview] = useState<Review|null>(null)
  const [confirmed,setConfirmed] = useState<string[]>([])
  const [consent,setConsent] = useState(false)
  const [receipt,setReceipt] = useState<Approval|null>(null)
  const [run,setRun] = useState<RunLink|null>(null)
  const [state,setState] = useState<RunState|null>(null)
  const [report,setReport] = useState<Report|null>(null)
  const [viewVerdict,setViewVerdict] = useState(false)
  const selection = useRunSelection()
  const [pollError,setPollError] = useState('')
  const [attempt,setAttempt] = useState(0)
  const [busy,setBusy] = useState<'send'|'save'|'submit'|null>(null)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [pending,setPending] = useState<Pending|null>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const fields = toFields(form)
  const edits = changes(review?.facts ?? {},fields,review?.fact_origins['/facts/offer/eligibility'] === 'default')
  const dirty = Object.keys(edits).length > 0 || confirmed.length > 0
  const locked = Boolean(busy || restoring)

  useEffect(() => {
    if (!saved) return
    const controller = new AbortController()
    setRestoring(true)
    setError('')
    api.current(saved.reviewId,controller.signal).then(r => {
      if (controller.signal.aborted) return
      const activeReceipt = saved.receipt?.review_id === r.review_id && (saved.run || saved.receipt.revision === r.revision) ? saved.receipt : null
      setReview(r)
      setForm(toForm(r.facts))
      setTurns(saved.turns)
      setReceipt(activeReceipt)
      setConsent(Boolean(activeReceipt))
      setRun(activeReceipt ? saved.run : null)
      setPending(activeReceipt ? saved.pending : null)
      setRestoring(false)
    }).catch(e => {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Could not reopen the campaign.')
      setRestoring(false)
    })
    return () => controller.abort()
  },[api,saved,restoreAttempt])

  useEffect(() => {
    if (!review || restoring) return
    try { sessionStorage.setItem(sessionKey,JSON.stringify({reviewId:review.review_id,turns,receipt,run,pending} satisfies Saved)) } catch { /* Storage is optional. */ }
  },[sessionKey,review,restoring,turns,receipt,run,pending])

  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight
  },[turns,review?.revision])

  useEffect(() => {
    if (!run) return
    const activeRun = run
    const controller = new AbortController()
    let timer:number|undefined
    async function poll() {
      try {
        const status = await api.status(activeRun.url,controller.signal)
        if (controller.signal.aborted) return
        if (status.run_id !== activeRun.id) throw new Error('The status belongs to a different run.')
        setState(status)
        if (status.status === 'done' && status.report_url) {
          const value = await api.report(status.report_url,controller.signal)
          if (controller.signal.aborted) return
          if (value.run_id !== activeRun.id || value.approval_id !== receipt?.approval_id || value.review_id !== receipt.review_id || value.revision !== receipt.revision)
            throw new Error('The report does not match the approved run.')
          setReport(value)
        } else if (status.status === 'running' || status.status === 'queued') {
          timer = window.setTimeout(poll,(status.poll_after_seconds ?? 2)*1000)
        }
      } catch(e) {
        if (!controller.signal.aborted) setPollError(e instanceof Error ? e.message : 'Run status unavailable.')
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  },[api,run,attempt,receipt])

  function accept(next:Review) {
    setReview(next); setForm(toForm(next.facts)); setConfirmed([]); setConsent(false); setReceipt(null); setPending(null)
  }
  function edit(key:string,value:string) {
    setForm(f => ({...f,[key]:value})); setConsent(false); setReceipt(null); setError(''); setNotice('')
    const parent = key.split('.')[0]
    setConfirmed(ids => ids.filter(id => fieldKey(review?.candidates.find(c => c.candidate_id === id)?.field ?? '').split('.')[0] !== parent))
  }
  function handle(e:unknown) {
    const message = e instanceof Error ? e.message : 'Request failed.'
    if (!(e instanceof ApiError)) { setError(message); return }
    const problem = e.problem
    if (problem.code === 'stale_review' && problem.current_review) {
      const local = toForm(review?.facts ?? {}), latest = problem.current_review
      const unsaved = Object.entries(form).filter(([k,v]) => v !== (local[k] ?? ''))
      const latestValues = toForm(latest.facts)
      const conflicts = unsaved.filter(([k,v]) => (latestValues[k] ?? '') !== (local[k] ?? '') && (latestValues[k] ?? '') !== v)
      accept(latest)
      setForm({...latestValues,...Object.fromEntries(unsaved)})
      if (conflicts.length) setNotice(conflicts.map(([k,v]) => (controls.find(c => c.key === k)?.label ?? k)+' · Saved '+(latestValues[k] || 'cleared')+' · Your edit '+(v || 'clear')).join(' / '))
      setError(`Another planner saved revision ${latest.revision}. Review your pending changes and send them again.`)
      return
    }
    if (problem.code === 'incomplete_review' || problem.code === 'approval_stale') { setReceipt(null); setConsent(false) }
    setError([message,...(problem.issues ?? problem.blockers ?? []).map(v => v.field+' · '+v.message)].join('\n'))
  }
  async function write(kind:'send'|'save', e?:FormEvent) {
    e?.preventDefault()
    if (locked) return
    const text = draftText.trim()
    setError(''); setNotice('')
    const invalid = kind === 'send' && review ? '' : issue(fields)
    if (invalid) { setError(invalid); return }
    if (!review && !Object.keys(fields).length && !text) { setError('Write a brief or enter a campaign detail.'); return }
    if (kind === 'send' && !text) return
    setBusy(kind)
    try {
      let next:Review
      if (!review) next = await api.create(text,fields)
      else if (kind === 'send') next = await api.answer(review,text)
      else next = await api.revise(review,edits,confirmed)
      const conversational = kind === 'send' || (!review && Boolean(text))
      setTurns(t => [...addPendingQuestion(t,review), ...(conversational ? [{speaker:'user' as const,text}] : [])])
      if (conversational) setDraftText('')
      accept(next)
      if (kind === 'send' && review && dirty) {
        // Answer is its own revision. Preserve unrelated unfinished form edits and rebind only still-offered quotes.
        const savedFields = toForm(review.facts)
        const pendingFields = Object.fromEntries(Object.entries(form).filter(([key,value]) => value !== (savedFields[key] ?? '')))
        setForm({...toForm(next.facts),...pendingFields})
        const previousCandidates = review.candidates.filter(c => confirmed.includes(c.candidate_id))
        setConfirmed(next.candidates.filter(c => previousCandidates.some(p =>
          p.field === c.field && p.brief_quote === c.brief_quote && JSON.stringify(p.value) === JSON.stringify(c.value)
        )).map(c => c.candidate_id))
        if (Object.keys(pendingFields).length) setNotice('Reply saved. Your pending form edits are available to review.')
      }
    } catch(e) { handle(e) } finally { setBusy(null) }
  }
  function openRun(id:string,url:string) { setRun({id,url}); setState(null); setReport(null); setPollError(''); setPending(null) }
  async function submit(retry?:string) {
    if (!review || !consent || (!retry && (dirty || review.status !== 'ready_for_approval')) || busy) return
    setBusy('submit'); setError('')
    try {
      const a = receipt ?? await api.approve(review)
      if (!retry && (a.review_id !== review.review_id || a.revision !== review.revision)) throw new Error('Approval does not match the current revision.')
      setReceipt(a)
      const key = a.approval_id+':'+(retry ?? '')
      const attempt = pending?.key === key ? pending : {key,id:crypto.randomUUID()}
      setPending(attempt)
      const created = await api.submit({approval_id:a.approval_id,submission_id:attempt.id,...(retry && {retry_of_run_id:retry})})
      openRun(created.run_id,created.status_url)
    } catch(e) {
      if (e instanceof ApiError && e.problem.code === 'retry_already_submitted' && e.problem.run_id)
        openRun(e.problem.run_id,'/api/v1/runs/'+encodeURIComponent(e.problem.run_id))
      else handle(e)
    } finally { setBusy(null) }
  }
  function newCampaign() {
    selection.setPlanId('')
    selection.setScenarioId('')
    try { sessionStorage.removeItem(sessionKey) } catch { /* Storage is optional. */ }
    setRun(null); setState(null); setReport(null); setViewVerdict(false); setReview(null); setReceipt(null); setConsent(false); setConfirmed([])
    setDraftText(''); setForm({}); setTurns([]); setError(''); setNotice(''); setPollError(''); setPending(null)
    setAbandoned(true)
  }
  const [abandoned,setAbandoned] = useState(false)
  const failedRestore = saved && !review && !restoring && !abandoned
  function selectCandidate(c:Review['candidates'][number]) {
    setConfirmed(ids => ids.includes(c.candidate_id) ? ids.filter(id => id !== c.candidate_id) :
      [...ids.filter(id => review?.candidates.find(other => other.candidate_id === id)?.field !== c.field),c.candidate_id])
    setConsent(false); setReceipt(null)
  }
  function field(key:string) {
    const c = controls.find(c => c.key === key)!
    if (key === 'product_choice_id' && !review?.supported_product_choices.length && !form[key]) return null
    const provenance = review?.fact_origins['/facts/'+key.replace('.','/')] ?? review?.fact_origins['/facts/'+key.split('.')[0]]
    const origin = provenance === 'data' ? 'From catalog' : provenance === 'default' ? 'Server assumption' : provenance === 'planner_confirmed_extraction' ? 'Confirmed from chat' : ''
    const changed = (form[key] ?? '') !== (review ? toForm(review.facts)[key] ?? '' : '')
    return <label key={key} className="intake-field" htmlFor={'v1-'+key}><span>{c.label}</span>
      {c.type === 'select' ? <select className="intake-control" id={'v1-'+key} value={form[key] ?? ''} onChange={e => edit(key,e.target.value)}>
        <option value="">Choose…</option>{key === 'product_choice_id' ? review?.supported_product_choices.map(p =>
          <option key={p.choice_id} value={p.choice_id}>{p.label} · {p.pack_label} · {p.channel}</option>)
          : c.options?.map(o => <option key={o} value={o}>{o === 'THB' ? 'THB' : o === 'pct' ? 'Percent' : humanize(o)}</option>)}
      </select> : <input className="intake-control" id={'v1-'+key} type={c.type ?? 'text'} min={c.min} maxLength={key === 'channel' ? 80 : undefined}
        step={c.type === 'number' ? c.step ?? 'any' : undefined} value={form[key] ?? ''} onChange={e => edit(key,e.target.value)}/>}
      {origin && !changed && <small>{origin}</small>}
    </label>
  }
  const phase = report ? (viewVerdict ? 'Verdict' : 'Arena') : run ? 'Run' : 'Plan'
  return <>
    <a className="skip-link" href="#planner-workspace">Skip to workspace</a>
    <WorkspaceHeader status="API workspace" action={onOpenDemo && <button type="button" onClick={onOpenDemo}>Demo arena</button>}><span className="v1-current-step">{phase}</span></WorkspaceHeader>
    <main className="workspace v1-workspace" id="planner-workspace">
      {restoring ? <p className="v1-loading" role="status">Reopening campaign…</p>
        : failedRestore ? <section className="v1-loading"><h1>Reopen campaign</h1><p role="alert">{error}</p><button className="intake-primary" onClick={() => setRestoreAttempt(n => n+1)}>Try again</button><button className="intake-link" onClick={newCampaign}>Start a new campaign</button></section>
        : report && !viewVerdict ? <LiveArena report={report} review={review} selection={selection} onVerdict={() => { setViewVerdict(true); window.scrollTo(0,0) }}/>
        : report ? <><RunReport report={report} selection={selection}/><div className="v1-verdict-actions"><button className="intake-secondary" onClick={() => { setViewVerdict(false); window.scrollTo(0,0) }}>Back to arena</button><button className="intake-link" onClick={newCampaign}>Start a new campaign</button></div></>
        : run ? <section className="v1-loading">
          <h1>{state?.status === 'error' ? 'Run failed' : state?.status === 'done' ? 'Opening verdict…' : 'Rehearsal in progress'}</h1>
          <p>{state?.failure?.message ?? (state ? `${humanize(state.status)} · ${Math.round(state.progress*100)}%` : 'Waiting for run status…')}</p>
          {state && <progress value={state.progress} max="1"/>}
          {pollError && <><p role="alert">{pollError}</p><button className="intake-secondary" onClick={() => { setPollError(''); setAttempt(x => x+1) }}>Check status again</button></>}
          {state?.failure?.retryable && <button className="intake-primary" disabled={Boolean(busy)} onClick={() => submit(run.id)}>Retry simulation</button>}
          {state?.status === 'error' && <button className="intake-link" disabled={Boolean(busy)} onClick={newCampaign}>Start a new campaign</button>}
          {error && <p role="alert">{error}</p>}
        </section> :
        <div className="intake-workbench v1-intake">
          <section className="intake-chat" aria-labelledby="v1-chat-title">
            <header className="intake-heading"><h1 id="v1-chat-title">Campaign chat</h1>{review && <button type="button" className="intake-link" disabled={locked} onClick={newCampaign}>New campaign</button>}</header>
            <div className={'intake-chat-main'+(review ? ' has-conversation' : '')}>
              {!review ? <div className="intake-empty"><h2>What are you planning?</h2><p>Start with a brief or the campaign details you know.</p></div>
                : <div className="intake-transcript v1-transcript" ref={transcript} aria-label="Campaign conversation">
                  {turns.map((turn,i) => <div key={i} className="intake-turn" data-speaker={turn.speaker}><small>{turn.speaker === 'user' ? 'You' : 'CampaignTwin'}</small><p>{turn.text}</p></div>)}
                  <div className="intake-turn" data-speaker="assistant" aria-live="polite"><small>CampaignTwin · Revision {review.revision}</small><p>{summary(review)}</p></div>
                  {review.questions.length > 1 && <details className="v1-evidence v1-questions"><summary>{review.questions.length-1} more {review.questions.length === 2 ? 'question' : 'questions'}</summary>
                    <ul>{review.questions.slice(1).map((q,i) => <li key={q.field+i}>{q.prompt}</li>)}</ul></details>}
                  {review.candidates.length > 0 && <section className="v1-suggestions" aria-label="Suggested values">
                    <h2>Check the suggested values</h2>
                    {review.candidates.map(c => <label className="v1-candidate" key={c.candidate_id}><input type="checkbox" disabled={locked || fieldKey(c.field).split('.')[0] in edits} checked={confirmed.includes(c.candidate_id)} onChange={() => selectCandidate(c)}/>
                      <span>{controls.find(control => control.key === fieldKey(c.field))?.label ?? humanize(fieldKey(c.field))} · {valueLabel(c.value)}<small>“{c.brief_quote}”</small></span>
                    </label>)}
                    <button className="intake-secondary" disabled={locked || !confirmed.length} onClick={() => write('save')}>Confirm selected{confirmed.length ? ` (${confirmed.length})` : ''}</button>
                  </section>}
                </div>}
              <form className="intake-composer" onSubmit={e => write('send',e)}>
                <label className="sr-only" htmlFor="v1-message">{review ? 'Reply to CampaignTwin' : 'Campaign brief'}</label>
                <textarea rows={2} id="v1-message" ref={composer} maxLength={1000} disabled={locked} value={draftText}
                  placeholder={review ? 'Reply to CampaignTwin…' : 'Describe your campaign…'}
                  onChange={e => setDraftText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}/>
                <div className="intake-composer-actions">
                  {!review ? <button type="button" className="intake-link" disabled={locked} onClick={() => { setDraftText(demoBrief); composer.current?.focus() }}>Use sample brief</button>
                    : <small>{review.agent.status === 'degraded' ? 'Local interpretation · assistant unavailable' : 'Enter to send'}</small>}
                  <button type="submit" className="intake-send" disabled={locked || !draftText.trim()}>{busy === 'send' ? 'Sending…' : 'Send'}</button>
                </div>
              </form>
              {error && <p className="v1-feedback" role="alert">{error}</p>}{notice && <p className="v1-feedback" role="status">{notice}</p>}
            </div>
          </section>
          <form className="intake-form" onSubmit={e => write('save',e)} aria-labelledby="v1-form-title">
            <header className="intake-heading"><h2 id="v1-form-title">Campaign details</h2>{review && <small>Revision {review.revision}</small>}</header>
            <fieldset className="v1-fields intake-form-body" disabled={locked}>
              <div className="intake-field-grid">{firstKeys.map(field)}</div>
              <h3>Offer</h3><div className="intake-field-grid v1-offer-grid">{offerKeys.map(field)}</div>
              <details className="v1-evidence"><summary>Offer restrictions</summary><div className="intake-field-grid">{restrictionKeys.map(field)}</div></details>
              <button type="submit" className="intake-primary" disabled={locked || (!!review && !dirty)}>{busy === 'save' ? 'Saving…' : review ? 'Save revision' : 'Create review'}</button>
            </fieldset>
            {review && <><ReviewEvidence review={review}/>
              {review.status === 'ready_for_approval' && !review.blockers.length && !review.questions.some(q => q.blocking) && <section className="v1-approval">
                <label className="v1-candidate"><input type="checkbox" disabled={locked || dirty} checked={consent} onChange={e => setConsent(e.target.checked)}/>
                  <span>I approve revision {review.revision} and its assumptions.</span></label>
                <button type="button" className="intake-primary" disabled={locked || dirty || !consent} onClick={() => submit()}>{busy === 'submit' ? 'Starting…' : receipt ? 'Submit approved run' : 'Approve and start simulation'}</button>
              </section>}</>}
          </form>
        </div>}
    </main>
  </>
}
