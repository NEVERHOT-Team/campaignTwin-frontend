import { useEffect, useState } from 'react'
import type { createV2Client, Report, RunInput, RunState } from './client'

export type SellerApi = ReturnType<typeof createV2Client>
export type SavedRun = { id:string; reviewId:string; revision:number; approvalId:string; statusUrl:string }
export type PinnedResult = { report:Report; input:RunInput }

type Loaded = {
  id?:string; state?:RunState; current?:PinnedResult; previous?:PinnedResult
  error?:string; comparisonError?:string; loadingPrevious?:boolean
}

async function loadResult(api:SellerApi, run:SavedRun, reportUrl:string, signal:AbortSignal):Promise<PinnedResult> {
  const [input, report] = await Promise.all([api.runInput(run.id,signal), api.report(reportUrl,signal)])
  if (input.run_id !== run.id || report.run_id !== run.id || input.approval_id !== run.approvalId
      || report.approval_id !== run.approvalId || input.review.review_id !== run.reviewId
      || report.review_id !== run.reviewId || input.review.revision !== run.revision || report.revision !== run.revision) {
    throw new Error('The returned inputs and report do not match this approved run.')
  }
  return {input,report}
}

export function useSellerRun(api:SellerApi, selected:SavedRun|undefined, previous:SavedRun|undefined, attempt:number) {
  const [loaded,setLoaded] = useState<Loaded>({})
  useEffect(()=>{
    if (!selected) return
    const run = selected
    const controller = new AbortController()
    const {signal} = controller
    let timer:number|undefined
    setLoaded({id:run.id})
    async function read() {
      try {
        const state = await api.status(run.statusUrl,signal)
        if (signal.aborted) return
        if (state.run_id !== run.id) throw new Error('The returned status belongs to a different run.')
        setLoaded({id:run.id,state})
        if (state.status === 'error') return
        if (state.status !== 'done') {
          timer = window.setTimeout(read, Math.max(.25,state.poll_after_seconds ?? 1)*1000)
          return
        }
        if (!state.report_url) throw new Error('This completed run has no report link.')
        const current = await loadResult(api,run,state.report_url,signal)
        if (signal.aborted) return
        setLoaded({id:run.id,state,current,loadingPrevious:!!previous})
        if (!previous) return
        try {
          const earlier = await api.status(previous.statusUrl,signal)
          if (earlier.run_id !== previous.id || earlier.status !== 'done' || !earlier.report_url)
            throw new Error('The preceding revision has no completed report.')
          const prior = await loadResult(api,previous,earlier.report_url,signal)
          if (!signal.aborted) setLoaded({id:run.id,state,current,previous:prior})
        } catch(error) {
          if (!signal.aborted) setLoaded({id:run.id,state,current,comparisonError:error instanceof Error ? error.message : 'Could not open the preceding revision.'})
        }
      } catch(error) {
        if (!signal.aborted) setLoaded({id:run.id,error:error instanceof Error ? error.message : 'Could not load this run.'})
      }
    }
    void read()
    return ()=>{controller.abort();window.clearTimeout(timer)}
  },[api,selected,previous,attempt])
  return loaded.id === selected?.id ? loaded : {}
}
