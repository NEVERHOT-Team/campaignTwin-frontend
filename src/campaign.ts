import type { Draft } from './model'

export type Question = { field_id: string; prompt: string; blocking?: boolean }
export type FieldDescriptor = { path: string; label: string; type?: 'number' | 'integer' | 'date' | 'list' | 'boolean'; choices?: string[]; required?: boolean; min?: number; max?: number }
const objectives = ['incremental_profit', 'revenue', 'new_buyers', 'repeat_rate', 'awareness', 'leads']
const mechanics = ['percent_off', 'fixed_off', 'voucher', 'free_shipping', 'bundle', 'gift', 'coins_cashback', 'flash_sale']
const channels = ['shopee', 'lazada', 'tiktok_shop', 'line', 'meta', 'google', 'offline']

export const sections: { title: string; fields: FieldDescriptor[] }[] = [
  { title: 'Campaign and audience', fields: [
    { path: 'name', label: 'Campaign name', required: true },
    { path: 'brand.category', label: 'Product category', required: true },
    { path: 'brand.price_tier', label: 'Price tier', choices: ['budget', 'mid', 'premium'] },
    { path: 'audience.description', label: 'Target audience', required: true },
    { path: 'audience.include_hints', label: 'Include audiences', type: 'list' },
    { path: 'audience.exclude_hints', label: 'Exclude audiences', type: 'list' },
    { path: 'audience.geo', label: 'Geographies', type: 'list' },
    { path: 'competitor_hints', label: 'Competitor names', type: 'list' },
  ] },
  { title: 'Objectives and delivery', fields: [
    { path: 'objective.primary', label: 'Primary objective', choices: objectives, required: true },
    { path: 'objective.secondary', label: 'Secondary objectives', type: 'list', choices: objectives },
    { path: 'channels', label: 'Campaign channels', type: 'list', choices: channels, required: true },
    { path: 'timing.start_date', label: 'Start date', type: 'date', required: true },
    { path: 'timing.end_date', label: 'End date', type: 'date', required: true },
    { path: 'timing.event', label: 'Campaign event', choices: [...Array.from({ length: 12 }, (_, i) => `${i+1}.${i+1}`), 'payday', 'none'] },
    { path: 'timing.post_window_weeks', label: 'Follow-up (weeks)', type: 'integer', min: 0 },
  ] },
  { title: 'Offer and message', fields: [
    { path: 'offer.mechanics.0.min_spend_thb', label: 'Voucher minimum spend (THB)', type: 'number', min: 0 },
    { path: 'offer.mechanics.0.cap_per_user', label: 'Voucher cap per shopper', type: 'integer', min: 1 },
    { path: 'offer.mechanics.0.eligibility', label: 'Voucher eligibility', choices: ['all', 'new_only', 'members', 'segment_hint'] },
    { path: 'offer.mechanics.0.duration_days', label: 'Voucher duration (days)', type: 'integer', min: 1 },
    { path: 'offer.message.headline', label: 'Offer headline' },
    { path: 'offer.message.key_message', label: 'Key message' },
    { path: 'offer.message.tone', label: 'Message tone' },
  ] },
  { title: 'Budget, costs and guardrails', fields: [
    { path: 'budget.split.discount', label: 'Discount allocation (THB)', type: 'number', min: 0 },
    { path: 'budget.split.media', label: 'Media allocation (THB)', type: 'number', min: 0 },
    { path: 'budget.split.fees', label: 'Fee allocation (THB)', type: 'number', min: 0 },
    { path: 'budget.max_discount_pct', label: 'Maximum discount (%)', type: 'number', min: 0, max: 100 },
    { path: 'unit_economics.margin_pct', label: 'Margin (%)', type: 'number', min: 0, max: 100 },
    { path: 'constraints.margin_floor_pct', label: 'Minimum margin (%)', type: 'number', min: 0, max: 100 },
    { path: 'constraints.max_loss_prob', label: 'Maximum loss probability (0–1)', type: 'number', min: 0, max: 1 },
    { path: 'constraints.must_include', label: 'Required rules', type: 'list' },
    { path: 'constraints.must_avoid', label: 'Prohibited rules', type: 'list' },
  ] },
  { title: 'Strategist limits', fields: [
    { path: 'strategist_bounds.discount_pct.0', label: 'Minimum strategist discount (%)', type: 'number', min: 0, max: 100 },
    { path: 'strategist_bounds.discount_pct.1', label: 'Maximum strategist discount (%)', type: 'number', min: 0, max: 100 },
    { path: 'strategist_bounds.mechanics_allowed', label: 'Allowed offer types', type: 'list', choices: mechanics },
    { path: 'strategist_bounds.budget_flex_pct', label: 'Budget flexibility (%)', type: 'number', min: 0, max: 100 },
    { path: 'strategist_bounds.timing_shift_days', label: 'Maximum timing shift (days)', type: 'integer', min: 0 },
    { path: 'strategist_bounds.segments_locked', label: 'Keep audience segments fixed', type: 'boolean' },
  ] },
]
export const goalFields: FieldDescriptor[] = [
  { path: 'metric', label: 'Metric', required: true }, { path: 'target', label: 'Target', type: 'number', required: true },
  { path: 'unit', label: 'Unit', required: true }, { path: 'deadline', label: 'Deadline', type: 'date' },
]
export const mechanicFields: FieldDescriptor[] = [
  { path: 'type', label: 'Offer type', choices: mechanics, required: true },
  { path: 'value', label: 'Offer amount', type: 'number', min: 0 },
  { path: 'value_unit', label: 'Offer unit', choices: ['pct', 'thb'] },
  ...sections[2].fields.slice(0, 4).map(f => ({ ...f, path: f.path.split('.').at(-1)! })),
]
export const campaignFields = sections.flatMap(s => s.fields)
export const campaignDefaults: Record<string, string> = { 'objective.primary': 'incremental_profit', channels: 'shopee', 'timing.post_window_weeks': '2', 'budget.max_discount_pct': '25' }
export const exampleCampaign = {
  ...campaignDefaults, name: 'Crunchy Co. launch voucher', 'brand.category': 'Potato-chip multipacks',
  'audience.description': 'Price-sensitive snack shoppers', 'audience.geo': 'Thailand',
  'timing.start_date': '2026-11-21', 'timing.end_date': '2026-12-04', 'offer.mechanics.0.eligibility': 'all',
}
export const labelsForCorePaths: Record<string, string> = {
  'brand.name': 'brand', 'offer.mechanics.0.value': 'discount_pct', 'budget.total_thb': 'total_budget_thb',
  'unit_economics.avg_price_thb': 'unit_price_thb', 'unit_economics.fee_pct': 'fee_pct',
}
const list = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)
export function fieldIssues(draft: Draft): Question[] {
  const local: Question[] = []
  const check = (fields: FieldDescriptor[], values: Record<string, string>, prefix = '') => {
    for (const f of fields) {
      const v = (values[f.path] ?? '').trim()
      const n = Number(v)
      const issue = !v ? f.required ? 'Enter ' + f.label.toLowerCase() + '.' : '' :
        (f.type === 'number' || f.type === 'integer') && (!Number.isFinite(n) || (f.type === 'integer' && !Number.isInteger(n)) || n < (f.min ?? -Infinity) || n > (f.max ?? Infinity)) ? 'Check the value and allowed range for ' + f.label.toLowerCase() + '.' :
        f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? 'Enter a date in YYYY-MM-DD format.' :
        f.choices && (f.type === 'list' ? list(v).some(a => !f.choices!.includes(a)) : !f.choices.includes(v)) ? 'Choose a listed option for ' + f.label.toLowerCase() + '.' : ''
      if (issue) local.push({ field_id: prefix + f.path, prompt: issue, blocking: true })
    }
  }
  const values = draft.campaign
  check(campaignFields, values)
  draft.goals.forEach((row,i) => check(goalFields, row, `objective.smart_goals.${i}.`))
  draft.mechanics.forEach((row,i) => {
    const prefix = `offer.mechanics.${i+1}.`
    check(mechanicFields, row, prefix)
    const knownUnit = ({percent_off: 'pct', fixed_off: 'thb', free_shipping: 'thb'} as Record<string,string>)[row.type]
    if ((['percent_off','fixed_off','voucher','coins_cashback'].includes(row.type) && !row.value?.trim()) ||
      (row.value && ((knownUnit && row.value_unit && row.value_unit !== knownUnit) || (!knownUnit && !row.value_unit) || ((knownUnit === 'pct' || row.value_unit === 'pct') && Number(row.value) > 100)))) {
      local.push({field_id:prefix+'value',prompt:'Check the offer amount and its unit. Percentage offers must be between 0 and 100.',blocking:true})
    }
  })
  const elapsed = (Date.parse(values['timing.end_date']) - Date.parse(values['timing.start_date'])) / 86400000
  if (Number.isFinite(elapsed) && (elapsed <= 0 || elapsed > 56)) local.push({ field_id:'timing.end_date', prompt:'End after the start date and within 56 days.', blocking:true })
  if (['discount','media','fees'].reduce((n,k)=>n+Number(values['budget.split.'+k]??0),0)>Number(draft.values.total_budget_thb||Infinity)) local.push({field_id:'budget.split.discount',prompt:'Discount, media and fees together cannot exceed the total budget.',blocking:true})
  const min=values['strategist_bounds.discount_pct.0'], max=values['strategist_bounds.discount_pct.1']
  if (Boolean(min)!==Boolean(max) || (min && max && Number(min)>Number(max))) local.push({field_id:'strategist_bounds.discount_pct.1',prompt:'Provide both strategist discount limits, with the maximum at or above the minimum.',blocking:true})
  const cap = values['budget.max_discount_pct']
  if (cap && Number(draft.values.discount_pct)>Number(cap)) local.push({field_id:'discount_pct',prompt:'The voucher exceeds the campaign discount limit.',blocking:true})
  return local
}

// The agreed HTTP context adapter can consume this nested, typed brief without dropping secondary fields.
export function campaignInput(draft: Draft) {
  const read = (value: string | undefined, t?: FieldDescriptor['type']) => {
    const v = value?.trim()
    if (!v) return undefined
    return t === 'list' ? list(v) : t === 'boolean' ? v === 'true' : t === 'number' || t === 'integer' ? Number(v) : v
  }
  const brief: Record<string, unknown> = {}
  const isPrimary = (f: FieldDescriptor) => f.path.startsWith('offer.mechanics.0.')
  const primary = { type: 'voucher', value: read(draft.values.discount_pct,'number'), value_unit: 'pct',
    ...Object.fromEntries(campaignFields.filter(isPrimary).map(f => [f.path.split('.').at(-1), read(draft.campaign[f.path],f.type)])) }
  function put(path: string, value: unknown) {
    if (value === undefined) return
    const keys=path.split('.'), last=keys.pop()!
    let target=brief
    for (const k of keys) target=(target[k]??={}) as Record<string,unknown>
    target[last]=value
  }
  campaignFields.filter(f => !isPrimary(f) && !f.path.startsWith('strategist_bounds.discount_pct.')).forEach(f=>put(f.path,read(draft.campaign[f.path],f.type)))
  const parseRows=(rows: Record<string,string>[], descriptors: FieldDescriptor[])=>rows.map(row=>Object.fromEntries(descriptors.map(f=>[f.path,read(row[f.path],f.type)])))
  put('offer.mechanics',[primary,...parseRows(draft.mechanics,mechanicFields)])
  put('objective.smart_goals',parseRows(draft.goals,goalFields))
  put('brand.name',read(draft.values.brand))
  put('budget.total_thb',read(draft.values.total_budget_thb,'number'))
  put('unit_economics.avg_price_thb',read(draft.values.unit_price_thb,'number'))
  put('unit_economics.fee_pct',read(draft.values.fee_pct,'number'))
  const min=draft.campaign['strategist_bounds.discount_pct.0'],max=draft.campaign['strategist_bounds.discount_pct.1']
  if(min && max) put('strategist_bounds.discount_pct',[Number(min),Number(max)])
  return brief
}
