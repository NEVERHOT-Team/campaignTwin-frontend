import type { components } from './schema'

type S = components['schemas']
export type Fields = S['PlannerFields']
export type Edits = S['PlannerEdits']
export type Review = Omit<S['Review'],'facts'> & {facts: Fields}
export type Report = S['RunReport']
export type Approval = S['Approval']
export type RunState = S['RunState']
export type ApiProblem = Omit<S['Error'],'current_review'> & {current_review?: Review}
export class ApiError extends Error {
  constructor(public problem: ApiProblem) { super(problem.message) }
}

export function createV1Client(base?: string) {
  const origin = new URL(base || window.location.origin, window.location.origin).origin
  const reviews = '/api/v1/campaign-reviews'
  async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
    const url = new URL(path, origin)
    if (url.origin !== origin) throw new Error('The run link points outside the configured API origin.')
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET', signal, credentials: 'same-origin',
      headers: { Accept:'application/json', ...(body && {'Content-Type':'application/json'}) },
      body: body && JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      if (typeof data?.code === 'string' && typeof data.message === 'string') throw new ApiError(data)
      throw new Error(`The API returned HTTP ${response.status}.`)
    }
    if (!data || typeof data !== 'object') throw new Error('The API returned an unreadable response.')
    return data
  }
  const reviewPath = (r:Review) => reviews + '/' + encodeURIComponent(r.review_id)
  return {
    origin,
    current: (id:string, signal?:AbortSignal) => request<Review>(reviews+'/'+encodeURIComponent(id),undefined,signal),
    answer: (review:Review, answer:string) => request<Review>(reviewPath(review)+'/revisions',{base_revision:review.revision,answer}),
    create: (brief:string, fields:Fields) => request<Review>(reviews,{...(brief.trim() && {brief}), ...(Object.keys(fields).length && {fields})}),
    revise: (review:Review, edits:Edits, confirm:string[]) => request<Review>(reviewPath(review)+'/revisions',{
      base_revision:review.revision, ...(Object.keys(edits).length && {edits}), ...(confirm.length && {confirm}),
    }),
    approve: (review:Review) => request<Approval>(reviewPath(review)+'/approvals',{revision:review.revision,confirmed:true}),
    submit: (body:S['SubmitRun']) => request<S['RunAccepted']>('/api/v1/runs',body),
    status: (url:string, signal:AbortSignal) => request<RunState>(url,undefined,signal),
    report: (url:string, signal:AbortSignal) => request<Report>(url,undefined,signal),
  }
}
