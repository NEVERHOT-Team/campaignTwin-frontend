export const count = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
export const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 2 })
export const baht = new Intl.NumberFormat('en-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function profitComparison(value: number, reference: number) {
  const change = value - reference
  if (change === 0) return 'Same median profit as your plan'
  if (reference < 0 && value <= 0) {
    const relative = Math.abs(change / reference)
    return `${percent.format(relative)} ${change > 0 ? 'smaller' : 'larger'} loss than your plan`
  }
  const amount = baht.format(Math.abs(change))
  const relative = reference > 0 && value >= 0 ? ' (' + percent.format(Math.abs(change) / reference) + ')' : ''
  return `${amount}${relative} ${change > 0 ? 'above' : 'below'} your plan`
}

// Both inputs are fractions. Differences between rates are expressed in percentage points.
export function percentagePoints(difference: number) {
  const magnitude = count.format(Math.abs(difference) * 100)
  return magnitude + (magnitude === '1' ? ' percentage point' : ' percentage points')
}

export function pointsComparison(value: number, reference: number) {
  const difference = value - reference
  if (difference === 0) return 'Same as your plan'
  return `${percentagePoints(difference)} ${difference > 0 ? 'higher' : 'lower'} than your plan`
}

export function attainmentRate(coverage?: { met_samples:number; valid_paired_samples:number } | null) {
  if (!coverage || !Number.isInteger(coverage.valid_paired_samples) || !Number.isInteger(coverage.met_samples) ||
      coverage.valid_paired_samples <= 0 || coverage.met_samples < 0 || coverage.met_samples > coverage.valid_paired_samples) return null
  return coverage.met_samples / coverage.valid_paired_samples
}

export function formatResult(value:number, unit:string) {
  if (unit === 'THB') return baht.format(value)
  if (unit === 'fraction') return percent.format(value)
  if (unit === 'pct' || unit === '%' || unit === 'percent') return count.format(value) + '%'
  if (unit === 'ratio') return count.format(value) + '×'
  return [count.format(value), unit.replaceAll('_',' ')].filter(Boolean).join(' ')
}
