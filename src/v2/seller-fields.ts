import type { Edits, Fields } from './client'

// The published syntheticRehearsal inputs plus the four overrides in
// backend tests/test_seller_report.py::test_known_seller_fee_changes_eligibility.
export const feeDemo: Fields = {
  product_choice_id:'demo-tissue-12-shopee', channel:'shopee', audience_hint:'all',
  objective:'incremental_profit', budget_thb:1000, start_date:'2026-12-01', end_date:'2026-12-08',
  offer:{kind:'voucher',value:10,unit:'THB',eligibility:'all'},
  order_fee_thb:2, profit_target_thb:25, min_unit_contribution_thb:32, discount_response:8,
}

type Key = Exclude<keyof Fields,'offer'> | `offer.${keyof NonNullable<Fields['offer']>}`
type Field = {key:Key; label:string; type?:'number'|'date'; choices?:string[]; min?:number; max?:number; step?:string; help?:string}
export const fieldGroups: {label:string; fields:Field[]}[] = [
  {label:'Decision inputs', fields:[
    {key:'order_fee_thb',label:'Order fee (THB per kept order)',type:'number',min:0},
    {key:'min_unit_contribution_thb',label:'Minimum contribution per redeemed pack (THB)',type:'number'},
    {key:'profit_target_thb',label:'Incremental profit target (THB)',type:'number'},
    {key:'discount_response',label:'Discount response multiplier',type:'number',min:0,max:100},
  ]},
  {label:'Campaign and offer', fields:[
    {key:'product_hint',label:'Product or listing description'},
    {key:'pack_hint',label:'Pack description'},
    {key:'product_choice_id',label:'Product and pack'},
    {key:'channel',label:'Sales channel'},
    {key:'objective',label:'Objective',choices:['incremental_profit','revenue','new_buyers','repeat_rate','awareness','leads']},
    {key:'audience_hint',label:'Audience'},
    {key:'budget_thb',label:'Budget (THB)',type:'number',min:0},
    {key:'start_date',label:'First active date',type:'date'},
    {key:'end_date',label:'First date after campaign',type:'date'},
    {key:'offer.kind',label:'Offer type',choices:['voucher','percent_off','fixed_off','free_shipping','bundle','gift','coins_cashback','flash_sale']},
    {key:'offer.value',label:'Offer amount',type:'number',min:0},
    {key:'offer.unit',label:'Offer unit',choices:['THB','pct']},
    {key:'offer.eligibility',label:'Offer eligibility',choices:['all','new_only','members','segment_hint']},
  ]},
  {label:'Seller costs',fields:[
    {key:'regular_price_thb',label:'Regular pack price (THB)',type:'number',min:0},
    {key:'cogs_thb',label:'Cost of goods per pack (THB)',type:'number',min:0},
    {key:'commission_pct',label:'Commission (%)',type:'number',min:0,max:100},
    {key:'fulfillment_thb',label:'Fulfillment per kept order (THB)',type:'number',min:0},
    {key:'voucher_fee_thb',label:'Service fee per redeemed voucher (THB)',type:'number',min:0},
    {key:'paid_media_thb',label:'Committed media spend (THB)',type:'number',min:0},
  ]},
  {label:'Offer restrictions and simulation settings',fields:[
    {key:'offer.min_spend_thb',label:'Minimum spend (THB)',type:'number',min:0},
    {key:'offer.cap_per_user',label:'Redemptions per shopper',type:'number',min:1,step:'1'},
    {key:'max_loss_probability',label:'Maximum loss probability (0–1)',type:'number',min:0,max:1},
    {key:'alternative_policy',label:'Alternative strategy',choices:['half_discount','fixed_offer','agent_bounded']},
    {key:'stockup_days',label:'Stock-up period (days)',type:'number',min:0,max:42,step:'1'},
    {key:'post_days',label:'Follow-up period (days)',type:'number',min:1,max:42,step:'1'},
    {key:'stop_vouchers_at_utilization_pct',label:'Stop vouchers at budget use (%)',type:'number',min:0,max:100},
    {key:'rival_demand_reduction_pct',label:'Rival demand reduction (%)',type:'number',min:0,max:100},
    {key:'product_scope',label:'Product scope',choices:['single_product','multiple_products']},
  ]},
]
export function formFromFields(fields:Fields):Record<string,string> {
  const result:Record<string,string> = {}
  for (const [key,value] of Object.entries(fields)) {
    if (key === 'offer') {
      for (const [name,term] of Object.entries(fields.offer ?? {})) if (term != null) result['offer.'+name] = String(term)
    } else if (value != null) result[key]=String(value)
  }
  return result
}
export function formFields(form:Record<string,string>):Fields {
  const fields:Record<string,unknown> = {}, offer:Record<string,unknown> = {}
  for (const group of fieldGroups) for (const field of group.fields) {
    const raw=form[field.key]?.trim()
    if (!raw) continue
    const value=field.type==='number' ? Number(raw) : raw
    if (field.key.startsWith('offer.')) offer[field.key.slice(6)]=value
    else fields[field.key]=value
  }
  if (Object.keys(offer).length) fields.offer=offer
  return fields as Fields
}
export function formEdits(before:Fields,after:Fields):Edits {
  const original=formFromFields(before), current=formFromFields(after)
  const edits:Record<string,unknown>={}
  for (const field of new Set([...Object.keys(original),...Object.keys(current)])) {
    if (original[field]===current[field]) continue
    const key=field.split('.')[0] as keyof Fields
    edits[key]=after[key] ?? null
  }
  return edits as Edits
}
