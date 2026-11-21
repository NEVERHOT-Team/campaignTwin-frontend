import type { Edits, Fields } from './client'

type Control = {key:string; label:string; type?:'number'|'date'|'select'; options?:string[]; min?:number; step?:string}
export const controls:Control[] = [
  {key:'product_hint',label:'Product or listing'}, {key:'pack_hint',label:'Pack size'},
  {key:'product_choice_id',label:'Verified product and pack',type:'select'},
  {key:'channel',label:'Sales channel'},
  {key:'objective',label:'Primary objective',type:'select',options:['incremental_profit','revenue','new_buyers','repeat_rate','awareness','leads']},
  {key:'audience_hint',label:'Audience'}, {key:'budget_thb',label:'Budget (THB)',type:'number',min:0},
  {key:'start_date',label:'First active date',type:'date'}, {key:'end_date',label:'First date after campaign',type:'date'},
  {key:'offer.kind',label:'Offer type',type:'select',options:['percent_off','fixed_off','voucher','free_shipping','bundle','gift','coins_cashback','flash_sale']},
  {key:'offer.value',label:'Offer amount',type:'number',min:0}, {key:'offer.unit',label:'Offer unit',type:'select',options:['pct','THB']},
  {key:'offer.min_spend_thb',label:'Minimum spend (THB)',type:'number',min:0},
  {key:'offer.cap_per_user',label:'Redemptions per shopper',type:'number',min:1,step:'1'},
  {key:'offer.eligibility',label:'Offer eligibility',type:'select',options:['all','new_only','members','segment_hint']},
]
export const humanize=(value:string)=>value.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase())
export function toForm(fields:Fields):Record<string,string> {
  return Object.fromEntries(Object.entries(fields).flatMap(([key,value])=>key==='offer'
    ? Object.entries(value).map(([k,v])=>['offer.'+k,String(v)]) : [[key,String(value)]]))
}
export function toFields(form:Record<string,string>): Fields {
  const fields:Record<string,unknown>={}, offer:Record<string,unknown>={}
  for(const {key,type} of controls){
    const raw=form[key]?.trim()
    if(!raw)continue
    const value=type==='number'?Number(raw):raw
    if(key.startsWith('offer.')) offer[key.slice(6)]=value
    else fields[key]=value
  }
  if(Object.keys(offer).length)fields.offer=offer
  return fields as Fields
}
export function changes(initial:Fields, updated:Fields, derivedEligibility=false):Edits {
  const result:Record<string,unknown>={}
  const before=toForm(initial), after=toForm(updated)
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
    if(before[key]===after[key])continue
    const parent=key.split('.')[0] as keyof Fields
    result[parent]=updated[parent]??null
  }
  // An untouched eligibility default is recomputed when the offer or audience changes.
  if (result.offer && derivedEligibility && initial.offer?.eligibility === updated.offer?.eligibility) {
    const replacement = { ...updated.offer }
    delete replacement.eligibility
    result.offer = Object.keys(replacement).length ? replacement : null
  }
  return result as Edits
}
export function issue(fields:Fields) {
  const o=fields.offer
  if(o?.value!==undefined && (!o.kind || !o.unit || o.value<=0))return 'An offer amount needs a positive value, offer type and unit.'
  if(o?.unit && o.value===undefined)return 'Enter the amount for this offer unit.'
  if(o?.unit==='pct' && (o.value??0)>100)return 'Enter a percentage up to 100.'
  if(o?.unit && ((o.kind==='percent_off' && o.unit!=='pct') || (['fixed_off','free_shipping'].includes(o.kind??'') && o.unit!=='THB')))return 'Choose the unit that applies to this offer type.'

  return ''
}
