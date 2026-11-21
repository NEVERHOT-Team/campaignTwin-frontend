import type { Question } from './campaign'
export type FieldKey = 'brand' | 'discount_pct' | 'total_budget_thb' | 'unit_price_thb' | 'unit_cost_thb' | 'fee_pct' | 'fixed_campaign_spend_thb'
export type Values = { brand: string } & Record<Exclude<FieldKey, 'brand'>, string>
export type Field = { field_id: FieldKey; value: string | number | null; origin: 'user' | 'extracted' | 'proposed' | 'unavailable'; source_quote?: string; confirmation?: 'pending' | 'blocked' }
export type Draft = { values: Values; fields: Field[]; confirmed: FieldKey[]; campaign: Record<string, string>; goals: Record<string, string>[]; mechanics: Record<string, string>[]; answers: Record<string, string> }
export type Ref = { id: string; revision: number }
export type Plan = {
  plan_id: string; revision: number; label: string; brand: string; discount_pct: number
  total_budget_thb: number; target_segments: string[]; start_day: number; end_day: number
  budget_split: Record<string, number>; message_id: string
  constraints: { max_discount_pct: number; must_include: string[] }
}
export type Candidate = { plan: Plan; summary: string; changes: { lever: string; from: string; to: string; why: string }[]; issues: string[] }
export type ReviewContext = {
  context: Ref; original_plan: Plan; baseline: Ref; scenario_config: Ref
  fields: Field[]; assumptions: string[]; blocking_gaps: string[]; open_questions?: Question[]
}
export type Approval = {
  context: Ref; original_plan: Pick<Plan, 'plan_id' | 'revision'>; included_alternatives: Pick<Plan, 'plan_id' | 'revision'>[]
  baseline: Ref; scenario_config: Ref; confirmed_field_ids: FieldKey[]
}
export type Scenario = { scenario_id: string; label: string; description: string }
export type Range = { p10: number; p50: number; p90: number }
export type Brand = 'ours' | 'market' | 'rival' | 'waiting'
export type Agent = { shopper_id: string; brand: Brand }
export type Day = { day: number; brand_share_pct: number | null; baseline_share_pct: number | null; agents?: Agent[] }
export type Move = { day: number; brand: string; action: string; value?: number; reason: string }
export type Result = {
  plan_id: string; scenario_id: string; seeds: number
  metrics: { incremental_profit_thb: Range | null; roas: Range | null; new_buyers: Range | null; repeat_rate: Range | null; brand_attitude_change_post: Range | null }
  metric_units?: Partial<Record<keyof Result['metrics'], string>>
  metric_unavailable_reasons?: Partial<Record<keyof Result['metrics'], string>>
  guardrails: { name: string; pass: boolean }[]
  goal_attainment?: { met_samples: number; valid_paired_samples: number } | null
  daily: Day[]; competitor_actions: Move[]
}
export type Trace = {
  shopper_id: string; segment_id: string; traits: { price_sensitivity: number; loyalty: number }
  memory_by_day: Record<string, Record<string, { awareness: number; attitude: number }>>
  events: { day: number; type: 'exposed' | 'purchased' | 'switched' | 'ignored'; brand: string; channel: string; detail: string }[]
  explanation?: string | null
}
export type Backtest = {
  status: 'pending' | 'complete' | 'insufficient' | 'failed'; dataset: string; case_id: string | null
  comparability: string; benchmark_outcome: string | null; gaps: string[]
  metrics: { label: string; unit: string; observed: number; simulated: number; naive: number }[]
}
export type Report = {
  plans: { plan_id: string; label: string; role: 'original' | 'alternative' | 'baseline'; discount_pct?: number }[]
  scenarios: Scenario[]; results: Result[]; assumptions: string[]; candidate?: Candidate
  recommendation: { plan_id: string | null; summary: string } | null
  integrity: { status: 'passed' | 'failed'; reason?: string }
  confidence: { label: string; reason: string }; goal_thb: number
  window: { start_day: number; end_day: number; follow_up_end_day: number }
}
export type Run = {
  run_id: string; status: 'queued' | 'simulating' | 'evaluating' | 'complete' | 'failed'
  progress: { completed: number; total: number; unit: string } | null
  report: Report | null; error?: { code: string; message: string }
}
export type Replay = {
  replay_id: string; source_class: 'synthetic_fixture' | 'recorded_run'; origin_run_id?: string | null
  recorded_at?: string | null; fixture_version?: string; run: Run; historical_check: Backtest | null
  traces?: Record<string, Trace>
}

export interface CampaignApi {
  mode: 'fixture' | 'live'
  extract(text: string, known: Values, signal?: AbortSignal): Promise<{ fields: Field[]; questions?: Question[] }>
  context(draft: Draft, previous?: Ref): Promise<ReviewContext>
  optimize(context: ReviewContext): Promise<{ candidates: Candidate[] }>
  revalidate(context: ReviewContext, candidate: Candidate, discount: number): Promise<{ candidates: Candidate[] }>
  simulate(approval: Approval, submissionId: string): Promise<Pick<Run, 'run_id' | 'status'>>
  run(runId: string, signal?: AbortSignal): Promise<Run>
  backtest(runId: string, signal?: AbortSignal): Promise<Backtest>
  shopper(runId: string, id: string, day: number, scenario: string, planId: string, signal?: AbortSignal): Promise<Trace>
  replay(): Promise<Replay>
}
export const fieldLabels: Record<FieldKey, string> = {
  brand: 'Brand name', discount_pct: 'Voucher discount', total_budget_thb: 'Campaign budget',
  unit_price_thb: 'Price per multipack', unit_cost_thb: 'Cost per multipack', fee_pct: 'Marketplace fee', fixed_campaign_spend_thb: 'Fixed campaign cost',
}
export const fieldKeys = Object.keys(fieldLabels) as FieldKey[]
export const emptyValues: Values = { brand: '', discount_pct: '', total_budget_thb: '', unit_price_thb: '', unit_cost_thb: '', fee_pct: '', fixed_campaign_spend_thb: '' }
export const sampleBrief = 'Rehearse a 15% seller voucher for Crunchy Co. on Shopee Thailand. Budget ฿20,000. Each potato-chip multipack sells for ฿120 and costs ฿65. Marketplace fee 10%; fixed cost ฿0.'
export const money = (value: number) => new Intl.NumberFormat('en-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value)
export const brandLabels: Record<Brand, string> = { ours: 'Your brand', market: 'Market lane', rival: 'Discounter', waiting: 'Undecided' }
export const brandColors: Record<Brand, string> = { ours: '#4d8dff', market: '#b59af2', rival: '#f58a66', waiting: '#b2b9ad' }

export function validate(values: Values) {
  const issues: Partial<Record<FieldKey, string>> = {}
  if (!values.brand.trim()) issues.brand = 'Enter a brand name.'
  for (const key of fieldKeys) {
    if (key === 'brand') continue
    const value = Number(values[key])
    if (!values[key].trim() || !Number.isFinite(value) || value < 0) issues[key] = 'Enter a number at or above zero.'
    else if (key === 'discount_pct' && (value === 0 || value > 25)) issues[key] = 'Use a voucher greater than 0% and at most 25%.'
    else if (key === 'fee_pct' && value > 100) issues[key] = 'The fee cannot be above 100%.'
    else if ((key === 'unit_price_thb' || key === 'total_budget_thb') && value === 0) issues[key] = 'Enter an amount greater than zero.'
  }
  if (!issues.fixed_campaign_spend_thb && !issues.total_budget_thb && Number(values.fixed_campaign_spend_thb) > Number(values.total_budget_thb)) {
    issues.fixed_campaign_spend_thb = 'Fixed cost cannot exceed the campaign budget.'
  }
  return issues
}
