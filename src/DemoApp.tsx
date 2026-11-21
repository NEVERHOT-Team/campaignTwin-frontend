import { campaignDefaults, campaignFields, exampleCampaign, fieldIssues, labelsForCorePaths, type Question } from './campaign'
import { WorkspaceHeader } from './WorkspaceHeader'
import { demoEconomics } from './fixtures'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Arena } from './Arena'
import { Input } from './Input'
import { Verdict } from './Verdict'
import { api, planRef } from './api'
import { type Approval, type Backtest, type Candidate, type Draft, type FieldKey, type Ref, type Replay, type Report, type ReviewContext, type Run, type Trace, emptyValues, fieldKeys, sampleBrief, validate } from './model'

type Screen = 'input' | 'arena' | 'verdict'
const steps: { id: Screen; label: string }[] = [
  { id: 'input', label: 'Plan' }, { id: 'arena', label: 'Arena' }, { id: 'verdict', label: 'Verdict' },
]
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const pendingFields = (draft: Draft) => draft.fields.filter(f => f.confirmation === 'pending' && f.value !== null && !draft.confirmed.includes(f.field_id))
const startDraft = (): Draft => ({ values: { ...emptyValues, ...demoEconomics }, fields: [], confirmed: [], campaign: { ...campaignDefaults }, goals: [], mechanics: [], answers: {} })

export default function DemoApp({ arenaVisit, active, onOpenLive }: { arenaVisit: number; active: boolean; onOpenLive?: () => void }) {
  const [screen, setScreen] = useState<Screen>('input')
  const [brief, setBrief] = useState('')
  const [draft, setDraft] = useState(startDraft)
  const [questions, setQuestions] = useState<Question[]>([])
  const [issues, setIssues] = useState<ReturnType<typeof validate>>({})
  const [review, setReview] = useState<ReviewContext | null>(null)
  const contextRef = useRef<Ref | undefined>(undefined)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidateEdits, setCandidateEdits] = useState<Record<string, string>>({})
  const [chosen, setChosen] = useState<string[]>([])
  const [approved, setApproved] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [run, setRun] = useState<Run | null>(null)
  const [pollProblem, setPollProblem] = useState('')
  const [pollAttempt, setPollAttempt] = useState(0)
  const [replay, setReplay] = useState<Replay | null>(null)
  const [history, setHistory] = useState<Backtest | null>(null)
  const [historyStatus, setHistoryStatus] = useState('')
  const [scenario, setScenario] = useState('')
  const [planId, setPlanId] = useState('')
  const [day, setDay] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [traceStatus, setTraceStatus] = useState('')
  const submission = useRef<{ body: string; id: string } | undefined>(undefined)
  const report = run?.report
  const runId = run?.run_id
  const hasReport = Boolean(report)

  const previousScreen = useRef<Screen>('input')
  useEffect(() => {
    if (previousScreen.current === screen) return
    previousScreen.current = screen
    const headings = document.querySelectorAll<HTMLElement>('#demo-workspace h1')
    const title = Array.from(headings).find(h => h.getClientRects().length > 0)
    title?.setAttribute('tabindex','-1')
    title?.focus({ preventScroll:true })
  }, [screen])

  const openedFromPlanner = useRef(0)
  useEffect(() => {
    if (!active || !arenaVisit || openedFromPlanner.current === arenaVisit) return
    openedFromPlanner.current = arenaVisit
    if (run) go('arena')
    else void openReplay()
  }, [active, arenaVisit])

  function go(next: Screen) {
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function showReport(value: Report, isReplay: boolean) {
    const original = value.plans.find(p => p.role === 'original')?.plan_id ?? value.plans[0]?.plan_id ?? ''
    const initialScenario = (isReplay ? value.scenarios.find(s => s.scenario_id === 'S3') : undefined)?.scenario_id ?? value.scenarios[0]?.scenario_id ?? ''
    const result = value.results.find(r => r.plan_id === original && r.scenario_id === initialScenario)
    setPlanId(original)
    setScenario(initialScenario)
    setDay((isReplay ? result?.competitor_actions[0]?.day : undefined) ?? result?.daily[0]?.day ?? value.window.start_day)
    setSelected(null)
    setTrace(null)
  }

  useEffect(() => {
    if (!runId || hasReport || replay || run?.status === 'failed') return
    const controller = new AbortController()
    let timer: number | undefined
    async function poll() {
      try {
        const next = await api.run(runId!, controller.signal)
        if (controller.signal.aborted) return
        if (next.status === 'complete' && !next.report) throw new Error('This run completed without a report. Try checking again.')
        setPollProblem('')
        setRun(next)
        if (next.status === 'complete' && next.report) showReport(next.report, false)
        else if (next.status !== 'failed') timer = window.setTimeout(poll, api.mode === 'live' ? 1500 : 420)
      } catch (err) {
        if (!controller.signal.aborted) setPollProblem(errorText(err, 'Cannot reach the run right now.'))
      }
    }
    void poll()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [runId, hasReport, replay, pollAttempt, run?.status === 'failed'])

  useEffect(() => {
    if (!runId || !hasReport) return
    if (replay) { setHistory(replay.historical_check); setHistoryStatus(replay.historical_check ? '' : 'No historical check was included in this replay.'); return }
    const controller = new AbortController()
    setHistory(null); setHistoryStatus('Checking historical evidence…')
    api.backtest(runId, controller.signal).then(value => {
      if (controller.signal.aborted) return
      setHistory(value); setHistoryStatus('')
    }).catch(err => { if (!controller.signal.aborted) setHistoryStatus(errorText(err, 'Historical evidence is unavailable.')) })
    return () => controller.abort()
  }, [runId, hasReport, replay])

  useEffect(() => {
    if (!selected || !runId || !hasReport) return
    const agents = report?.results.find(r => r.scenario_id === scenario && r.plan_id === planId)?.daily.find(d => d.day === day)?.agents
    if (!agents?.some(a => a.shopper_id === selected)) {
      setSelected(null); setTrace(null); setTraceStatus('')
      return
    }
    const controller = new AbortController()
    setTrace(null); setTraceStatus('Loading shopper trace…')
    const scoped = replay?.traces?.[`${scenario}:${planId}:${day}:${selected}`]
    async function inspect() {
      if (scoped) return scoped
      if (replay && api.mode === 'live') throw new Error('No trace for this shopper and day was included in the replay.')
      return api.shopper(runId!, selected!, day, scenario, planId, controller.signal)
    }
    inspect().then(value => {
      if (controller.signal.aborted) return
      setTrace(value); setTraceStatus('')
    }).catch(err => { if (!controller.signal.aborted) setTraceStatus(errorText(err, 'Shopper trace unavailable.')) })
    return () => controller.abort()
  }, [selected, runId, hasReport, day, scenario, planId, replay])

  function invalidate() {
    setReview(null); setApproved(false); setCandidates([]); setChosen([]); setCandidateEdits({})
  }

  function update(key: FieldKey, value: string) {
    if (busy) return
    setDraft(current => {
      const prior = current.fields.find(f => f.field_id === key)
      const needsConfirmation = Boolean(prior?.source_quote || prior?.confirmation === 'pending')
      return {
        ...current,
        values: { ...current.values, [key]: value },
        answers: Object.fromEntries(Object.entries(current.answers).filter(([path])=>path!==key&&labelsForCorePaths[path]!==key)),
        confirmed: current.confirmed.filter(x => x !== key),
        fields: [...current.fields.filter(f => f.field_id !== key), {
          ...prior, field_id: key, origin: 'user', value,
          confirmation: needsConfirmation ? 'pending' : undefined,
        }],
      }
    })
    setQuestions(current => current.filter(q => q.field_id !== key && labelsForCorePaths[q.field_id] !== key));
    setIssues(current => ({ ...current, [key]: undefined })); setError(''); invalidate()
  }

  function loadSample() {
    if (busy) return
    setBrief(sampleBrief)
    setDraft(current => ({
      ...current,
      campaign: { ...exampleCampaign, ...Object.fromEntries(Object.entries(current.campaign).filter(([,value]) => value.trim())) },
    }))
    setQuestions([]); setIssues({}); setNotice(''); setError(''); invalidate()
  }

  async function extract(text: string) {
    const submitted = text.trim()
    if (!submitted || busy) return { ok: false, reply: 'Enter a campaign brief.' }
    const known = { ...draft.values }
    for (const key of fieldKeys) {
      const previous = draft.fields.find(f => f.field_id === key)
      if (previous?.origin === 'extracted' || (!previous && key in demoEconomics)) known[key] = ''
    }
    setBusy('extract'); setError(''); setNotice('')
    try {
      const data = await api.extract(submitted, known)
      const trusted = data.fields.filter(f => f.value != null && (f.origin !== 'extracted' || (f.source_quote && submitted.includes(f.source_quote))))
      const values = { ...draft.values }
      const touched = new Set(trusted.map(f => f.field_id))
      for (const f of trusted) values[f.field_id] = String(f.value)
      const questions = (data.questions ?? []).filter(q => !values[q.field_id as FieldKey] && !draft.campaign[q.field_id])
      const missingQuote = data.fields.some(f => f.value != null && !trusted.includes(f))
      const reply = missingQuote ? 'A source quote could not be matched. Please enter that detail in the form.'
        : trusted.length ? `I found ${trusted.length} ${trusted.length === 1 ? 'detail' : 'details'}. Check the quoted values in the form and confirm the ones to use.`
        : questions.length ? 'I still need a few details to review this campaign.' : 'The form already contains the available details. You can review it now.'
      setDraft({
        ...draft, values, fields: [...draft.fields.filter(f => !touched.has(f.field_id)), ...trusted.map(f => ({...f, confirmation:'pending' as const}))],
        confirmed: draft.confirmed.filter(k => !touched.has(k)),
      })
      setBrief(submitted); setIssues({}); setQuestions(questions); setNotice(reply); invalidate()
      return { ok:true, reply }
    } catch (err) {
      const reply = errorText(err, 'Could not read the brief. Try sending it again or enter the details in the form.')
      setError(reply)
      return { ok:false, reply }
    } finally { setBusy('') }
  }

  function editCampaign(path: string, value: string) {
    setDraft(current => ({ ...current, campaign: { ...current.campaign, [path]: value }, answers: Object.fromEntries(Object.entries(current.answers).filter(([key])=>key!==path)) }))
    setQuestions(current => current.filter(q => q.field_id !== path))
    setError(''); invalidate()
  }

  function editRows(type: 'goals' | 'mechanics', rows: Record<string, string>[]) {
    const root = type === 'goals' ? 'objective.smart_goals.' : 'offer.mechanics.'
    setDraft(current => ({ ...current, [type]: rows, answers: Object.fromEntries(Object.entries(current.answers).filter(([key])=>!key.startsWith(root))) }))
    setQuestions(current => current.filter(q => !q.field_id.startsWith(root)))
    setError(''); invalidate()
  }

  function answer(question: Question, value: string) {
    const path = question.field_id
    const core = labelsForCorePaths[path] ?? path
    if (fieldKeys.includes(core as FieldKey)) update(core as FieldKey, value)
    else if (campaignFields.some(f => f.path === path)) editCampaign(path, value)
    else {
      const match = /^(objective\.smart_goals|offer\.mechanics)\.(\d+)\.([a-z_]+)$/.exec(path)
      if (match) {
        const type = match[1] === 'objective.smart_goals' ? 'goals' : 'mechanics'
        const index = Number(match[2]) - (type === 'mechanics' ? 1 : 0)
        if (draft[type][index]) editRows(type, draft[type].map((r,i)=>i===index?{...r,[match[3]]:value}:r))
      }
      setQuestions(current => current.filter(q => q.field_id !== path))
    }
    setDraft(current => ({ ...current, answers: { ...current.answers, [path]: value } }))
    invalidate()
    setNotice('Answer saved. Review the campaign again to check for follow-up questions.')
  }

  async function prepare() {
    if (busy) return
    const invalid = validate(draft.values)
    setIssues(invalid); setError('')
    const followUp = [...Object.entries(invalid).map(([field_id,prompt])=>({field_id,prompt,blocking:true})), ...fieldIssues(draft)]
    if (api.mode === 'fixture' && followUp.length) {
      setQuestions([...new Map(followUp.map(q=>[q.field_id,q])).values()])
      setError('Complete the highlighted campaign details to continue.')
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.campaign-questions')?.focus())
      return
    }
    if (pendingFields(draft).length && !Object.keys(invalid).length) {
      setError('Confirm the extracted or proposed values before reviewing the campaign.')
      return
    }
    setBusy('review'); setApproved(false); setCandidateEdits({})
    try {
      const context = await api.context(draft, contextRef.current)
      contextRef.current = context.context; setReview(context)
      const open = context.open_questions ?? []
      setQuestions(open)
      if (open.length) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.campaign-questions')?.focus())
      const proposed = context.fields?.filter(f => f.origin === 'proposed' && f.value != null && String(f.value) !== draft.values[f.field_id]) ?? []
      if (proposed.length) {
        setDraft(current => {
          const values = { ...current.values }
          for (const f of proposed) values[f.field_id] = String(f.value)
          return { ...current, values, fields: [...current.fields.filter(f => !proposed.some(p => p.field_id === f.field_id)), ...proposed], confirmed: current.confirmed.filter(k => !proposed.some(f => f.field_id === k)) }
        })
        setIssues({})
      }
      setCandidates([]); setChosen([])
      if (!context.blocking_gaps.length && !open.some(q => q.blocking !== false)) {
        try {
          const value = await api.optimize(context)
          setCandidates(value.candidates)
          setChosen(value.candidates.filter(c => !c.issues.length).map(c => c.plan.plan_id))
          if (!value.candidates.length) setNotice('No alternative was returned. You can still review the original plan.')
        } catch (err) { setNotice(errorText(err, 'The Strategist is unavailable. You can review the original plan.')) }
      }
      if (!open.length) window.requestAnimationFrame(() => document.getElementById('review-title')?.focus())
    } catch (err) { setError(errorText(err, 'Campaign review could not be prepared.')) }
    finally { setBusy('') }
  }

  async function revalidate(candidate: Candidate) {
    if (!review || busy || candidateEdits[candidate.plan.plan_id] === undefined) return
    const input = candidateEdits[candidate.plan.plan_id].trim()
    if (!input || !Number.isFinite(Number(input))) { setError('Enter a discount to check the Strategist plan.'); return }
    setBusy('candidate'); setError(''); setApproved(false)
    try {
      const value = await api.revalidate(review, candidate, Number(input))
      const refreshed = value.candidates.find(c => c.plan.plan_id === candidate.plan.plan_id)
      if (!refreshed) throw new Error('The updated plan was not returned.')
      setCandidates(current => current.map(c => c.plan.plan_id === refreshed.plan.plan_id ? refreshed : c))
      setCandidateEdits(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== candidate.plan.plan_id)))
    } catch (err) { setError(errorText(err, 'The change could not be checked.')) }
    finally { setBusy('') }
  }

  async function startRun() {
    if (!review || !approved || busy || pendingFields(draft).length || review.blocking_gaps.length || questions.some(q => q.blocking !== false)) return
    const included = candidates.filter(c => chosen.includes(c.plan.plan_id))
    if (included.some(c => c.issues.length || (candidateEdits[c.plan.plan_id] !== undefined && Number(candidateEdits[c.plan.plan_id]) !== c.plan.discount_pct))) return
    const approval: Approval = {
      context: review.context, original_plan: planRef(review.original_plan), baseline: review.baseline, scenario_config: review.scenario_config,
      included_alternatives: included.map(c => planRef(c.plan)), confirmed_field_ids: [...draft.confirmed].sort(),
    }
    const body = JSON.stringify(approval)
    if (submission.current?.body !== body) submission.current = { body, id: crypto.randomUUID() }
    setBusy('run'); setError('')
    try {
      const reply = await api.simulate(approval, submission.current.id)
      setReplay(null); setRun({ ...reply, progress: null, report: null }); setPollProblem(''); setSelected(null); go('arena')
      submission.current = undefined
    } catch (err) { setError(errorText(err, 'The run could not be started.')) }
    finally { setBusy('') }
  }

  async function openReplay() {
    if (busy) return
    setBusy('replay'); setError('')
    try {
      const value = await api.replay()
      if (!value.run?.report) throw new Error('A completed run is unavailable for replay.')
      setReplay(value); setRun(value.run); setPollProblem(''); showReport(value.run.report, true); go('arena')
    } catch (err) { setError(errorText(err, 'Replay could not be opened.')) }
    finally { setBusy('') }
  }

  const changeDay = useCallback((value: number) => { setDay(value) }, [])
  function changeScope(nextScenario: string, nextPlan: string) {
    setScenario(nextScenario); setPlanId(nextPlan)
    const row = report?.results.find(r => r.scenario_id === nextScenario && r.plan_id === nextPlan)
    changeDay(row?.daily.some(d => d.day === day) ? day : row?.daily[0]?.day ?? report?.window.start_day ?? 0)
  }
  function selectShopper(id: string | null) { if (id === selected) return; setSelected(id); setTrace(null); setTraceStatus(id ? 'Loading shopper trace…' : '') }
  const result = report?.results.find(r => r.scenario_id === scenario && r.plan_id === planId)
  const baselineId = report?.plans.find(p => p.role === 'baseline')?.plan_id
  const baseline = report?.results.find(r => r.scenario_id === scenario && r.plan_id === baselineId)
  const label = replay?.source_class === 'recorded_run' ? 'Recorded replay' : 'Synthetic demo'
  const runFailed = run?.status === 'failed'
  const runTitle = runFailed ? 'Simulation did not complete' : pollProblem ? 'Run status unavailable' : run?.status === 'evaluating' ? 'Evaluating outcomes…' : run?.status === 'queued' ? 'Run queued…' : 'Simulating the market…'

  return <>
    <a className="skip-link" href="#demo-workspace">Skip to workspace</a>
    <WorkspaceHeader status={label} onHome={() => go('input')} action={onOpenLive && <button onClick={onOpenLive}>Back to planner</button>}>
      <nav className="studio-steps" aria-label="Rehearsal steps">{steps.map(({id, label}) =>
        <button key={id} aria-current={screen === id ? 'page' : undefined} disabled={id === 'verdict' && !report}
          onClick={() => id === 'arena' && !run ? void openReplay() : go(id)}
          title={id === 'arena' && !run ? 'Explore the sample arena' : undefined}>{label}</button>)}</nav>
    </WorkspaceHeader>
    <main id="demo-workspace" className="workspace" data-screen={screen}>
      <div hidden={screen !== 'input'}><Input brief={brief} draft={draft} onChange={update} onConfirm={key => {
        if (busy) return
        setApproved(false); setError('')
        setDraft(current => ({ ...current, confirmed: current.confirmed.includes(key) ? current.confirmed.filter(k => k !== key) : [...current.confirmed, key] }))
      }} onSample={loadSample} onExtract={extract} onReview={prepare} onRun={startRun} onReplay={openReplay} review={review} candidates={candidates} chosen={chosen} onToggle={id => {
        setApproved(false); setChosen(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
      }} candidateEdits={candidateEdits} onCandidateEdit={(id, value) => { setApproved(false); setCandidateEdits(current => ({ ...current, [id]: value })) }} onRevalidate={revalidate} approved={approved} onApprove={setApproved} busy={busy} issues={issues} error={error} notice={notice} replayLabel="Open demo arena" questions={questions} onAnswer={answer} onCampaignField={editCampaign} onCampaignRows={editRows} /></div>
      {active && screen === 'arena' && report && <Arena report={report} result={result} baseline={baseline} scenario={scenario} changeScenario={s => changeScope(s, planId)} planId={planId} changePlan={p => changeScope(scenario, p)} day={day} changeDay={changeDay} selected={selected} select={selectShopper} trace={trace} traceStatus={traceStatus} light={false} onVerdict={() => go('verdict')} />}
      {screen === 'arena' && !report && <section className="panel pending-panel" aria-live="polite">
        <h1>{runTitle}</h1><p>{pollProblem || run?.error?.message || (runFailed ? 'No completed report was returned. Return to input to review the campaign and try again.' : run?.progress ? `${run.progress.completed} of ${run.progress.total} ${run.progress.unit}` : 'You can leave this screen and return while the run is in progress.')}</p>
        {!pollProblem && !runFailed && run?.progress && <progress max={run.progress.total} value={run.progress.completed}/>}
        <div className="intro-actions"><button className="button secondary" onClick={() => go('input')}>Back to plan</button>{pollProblem && <button className="button primary" onClick={() => { setPollProblem(''); setPollAttempt(x => x + 1) }}>Check status again</button>}</div>
      </section>}
      {screen === 'verdict' && report && <Verdict report={report} scenario={scenario} changeScenario={s => changeScope(s, planId)} history={history} historyStatus={historyStatus} onArena={() => go('arena')} onInput={() => go('input')}/>}
    </main>
  </>
}
