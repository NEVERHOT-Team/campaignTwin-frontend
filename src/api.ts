import { fixtureApi } from './fixtures'

// The illustrative rehearsal has richer Arena data than the proposed v1 service.
export const api = fixtureApi
export const planRef = ({plan_id, revision}:{plan_id:string;revision:number}) => ({plan_id,revision})
