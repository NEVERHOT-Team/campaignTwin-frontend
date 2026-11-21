import { exampleCampaign } from './campaign'
import { type Draft, type Values } from './model'

export function fillBlank<T extends Record<string,string>>(current:T, sample:Partial<T>):T {
  const additions = Object.entries(sample).filter(([key,value]) => !current[key]?.trim() && typeof value === 'string' && value.trim())
  return additions.length ? { ...current, ...Object.fromEntries(additions) } : current
}

export function shiftedDay(date:string|undefined, days:number) {
  if (!date) return
  const stamp = Date.parse(date+'T00:00:00Z')
  if (Number.isFinite(stamp)) return new Date(stamp+days*86400000).toISOString().slice(0,10)
}

export function sampleOffer(form:Record<string,string>, defaults:{kind:string; unit:string; value:string}, percentageVoucher = false) {
  const kind = form['offer.kind'] || (form['offer.unit'] === 'THB' ? 'voucher'
    : form['offer.unit'] === 'pct' ? 'percent_off' : defaults.kind)
  const unit = form['offer.unit'] || (kind === 'percent_off' ? 'pct' : 'THB')
  if (!(kind === 'percent_off' && unit === 'pct' || kind === 'voucher' && (unit === 'THB' || percentageVoucher && unit === 'pct')))
    return {}
  return {
    'offer.kind':kind, 'offer.unit':unit,
    'offer.value':kind === defaults.kind && unit === defaults.unit ? defaults.value : '10',
  }
}

export function fillOfflineSample(draft:Draft, economics:Partial<Values>):Draft {
  const values = fillBlank(draft.values,{brand:'Crunchy Co.',discount_pct:'15',total_budget_thb:'20000',...economics})
  const campaign = draft.campaign
  const first = campaign['timing.start_date'] || shiftedDay(campaign['timing.end_date'],-13) || exampleCampaign['timing.start_date']
  const last = campaign['timing.end_date'] || shiftedDay(first,13)
  const days = last ? Math.round((Date.parse(last)-Date.parse(first))/86400000)+1 : NaN
  const duration = Number.isFinite(days) && days>0 ? String(days) : undefined
  const target = Number(values.total_budget_thb)
  const discountBudget = target - Number(campaign['budget.split.media']||0) - Number(campaign['budget.split.fees']||0)
  const price = Number(values.unit_price_thb)
  const margin = price > 0 ? Math.max(0,Math.min(100,100*(price-Number(values.unit_cost_thb))/price)).toFixed(2) : undefined
  const filled = fillBlank(campaign,{
    ...exampleCampaign, name:values.brand+' launch voucher', 'brand.price_tier':'mid',
    'audience.include_hints':'Snack shoppers', 'audience.exclude_hints':'Bulk resellers', competitor_hints:'Sample snack brand',
    'objective.secondary':'new_buyers', 'timing.start_date':first,'timing.end_date':last,'timing.event':'none',
    'offer.mechanics.0.min_spend_thb':'0','offer.mechanics.0.cap_per_user':'1','offer.mechanics.0.duration_days':duration,
    'offer.message.headline':'A voucher for your next multipack','offer.message.key_message':'Save on a snack multipack during the campaign.','offer.message.tone':'Friendly',
    'budget.split.discount':Number.isFinite(discountBudget) ? String(Math.max(0,discountBudget)) : undefined,
    'budget.split.media':'0','budget.split.fees':'0','unit_economics.margin_pct':margin,
    'constraints.margin_floor_pct':'10','constraints.max_loss_prob':'0.25','constraints.must_include':'Seller-funded voucher','constraints.must_avoid':'Stacked discounts',
    'strategist_bounds.discount_pct.0':'1','strategist_bounds.discount_pct.1':campaign['budget.max_discount_pct']||'25',
    'strategist_bounds.mechanics_allowed':'voucher','strategist_bounds.budget_flex_pct':'0','strategist_bounds.timing_shift_days':'0','strategist_bounds.segments_locked':'false',
  })
  const examples:Record<string,[string,string]> = {incremental_profit:['5000','THB'],revenue:['20000','THB'],new_buyers:['100','buyers'],
    repeat_rate:['25','percent'],awareness:['10','percent'],leads:['100','leads']}
  const goals = (draft.goals.length ? draft.goals : [{}]).map(row=>{
    const metric = row.metric || 'incremental_profit'
    const goal = examples[metric.trim().toLowerCase().replaceAll(' ','_')]
    return fillBlank(row,{metric,target:goal?.[0],unit:goal?.[1],deadline:last})
  })
  const mechanics = draft.mechanics.map(row=>{
    const type = row.type || 'voucher'
    const priceBased = ['percent_off','fixed_off','voucher','coins_cashback','free_shipping'].includes(type)
    return fillBlank(row,{type,value:priceBased ? '5' : undefined,
      value_unit:priceBased ? (['fixed_off','free_shipping'].includes(type) ? 'thb' : 'pct') : undefined,
      eligibility:'all',cap_per_user:'1',min_spend_thb:'0',duration_days:duration})
  })
  if (values===draft.values && filled===campaign && goals.length===draft.goals.length && goals.every((g,i)=>g===draft.goals[i]) && mechanics.every((m,i)=>m===draft.mechanics[i])) return draft
  return {...draft,values,campaign:filled,goals,mechanics}
}
