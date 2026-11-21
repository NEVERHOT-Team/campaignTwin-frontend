import type { components, operations } from './schema'

type S = components['schemas']
export type Discovery = operations['discoverSellerApi']['responses'][200]['content']['application/json']
export type Fields = S['PlannerFields']
export type Edits = S['PlannerEdits']
export type Start = S['Start']
export type Turn = S['Reply'] | S['Choose'] | S['Change']
// An empty facts object is legal. The schema's empty-object alternative otherwise
// becomes 'unknown' in the generated TS, hiding even the documented optional fields.
export type Review = Omit<S['Review'],'facts' | 'commercial_inputs'> & {
  facts: Fields
  commercial_inputs?: Fields
}
export type Session = Omit<S['Session'],'review'> & { review: Review }
export type VolumeCase = S['VolumeCase']
export type VolumeResult = S['VolumeResult']
export type Approval = S['Approval']
export type SubmitRun = S['SubmitRun']
export type RunAccepted = S['RunAccepted']
export type RunState = S['RunState']
export type RunInput = Omit<S['RunInput'],'review'> & { review: Review }
export type Report = S['RunReport']
export type BusinessEvaluation = S['BusinessEvaluation']
export type HistoricalComparison = S['HistoricalComparison']
export type SeedLedger = S['SeedLedger']
export type ApiProblem = Omit<S['Error'],'current_review'> & { current_review?: Review }

export class V2ApiError extends Error {
  constructor(public problem: ApiProblem, public status: number) {
    super(problem.message)
    this.name = 'V2ApiError'
  }
}

export function createV2Client(base?: string) {
  const origin = new URL(base || '/', globalThis.location?.origin).origin
  const prefix = '/api/v2'
  const reviews = prefix + '/campaign-reviews'
  const runs = prefix + '/runs'
  const byId = (collection: string, id: string) => collection + '/' + encodeURIComponent(id)

  async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
    const url = new URL(path, origin)
    if (url.origin !== origin || url.username || url.password ||
        (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/'))) {
      throw new Error('The link does not belong to the configured v2 seller API.')
    }
    const envelope = body === undefined ? undefined : JSON.stringify(body)
    const response = await fetch(url, {
      method: envelope === undefined ? 'GET' : 'POST',
      headers: envelope === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: envelope,
      credentials: 'same-origin',
      signal,
    })
    const data = await response.json().catch(() => null)
    signal?.throwIfAborted()
    if (!response.ok) {
      if (typeof data?.code === 'string' && typeof data.message === 'string') throw new V2ApiError(data, response.status)
      throw new Error('The v2 seller API returned HTTP ' + response.status + '.')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Expected JSON from the v2 seller API.')
    }
    return data
  }

  return {
    origin,
    discover: (signal?: AbortSignal) => request<Discovery>(prefix, undefined, signal),
    create: (body: Start, signal?: AbortSignal) => request<Session>(reviews, body, signal),
    current: (reviewId: string, signal?: AbortSignal) => request<Session>(byId(reviews,reviewId), undefined, signal),
    turn: (session: Session, body: Turn, signal?: AbortSignal) => request<Session>(session.links.turn, body, signal),
    revise: (session: Session, body: S['ReviseReview'], signal?: AbortSignal) =>
      request<Session>(byId(reviews,session.review.review_id) + '/revisions', body, signal),
    whatIf: (session: Session, body: VolumeCase, signal?: AbortSignal) => request<VolumeResult>(session.links.what_if, body, signal),
    approve: (session: Session, signal?: AbortSignal) =>
      request<Approval>(session.links.approve, { revision: session.review.revision, confirmed: true }, signal),
    // The caller persists the submission ID before sending, including when retrying a lost response.
    submit: (body: SubmitRun, signal?: AbortSignal) => request<RunAccepted>(runs, body, signal),
    status: (url: string, signal?: AbortSignal) => request<RunState>(url, undefined, signal),
    report: (url: string, signal?: AbortSignal) => request<Report>(url, undefined, signal),
    runInput: (id: string, signal?: AbortSignal) => request<RunInput>(byId(runs,id) + '/input', undefined, signal),
    businessEvaluation: (id: string, signal?: AbortSignal) => request<BusinessEvaluation>(byId(runs,id) + '/evaluation', undefined, signal),
    historicalComparison: (id: string, signal?: AbortSignal) =>
      request<HistoricalComparison>(byId(runs,id) + '/historical-comparison', undefined, signal),
  }
}

export type V2Client = ReturnType<typeof createV2Client>
