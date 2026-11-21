type Props = { amount: number | null | undefined; formatted: string }

export function ProfitValue({ amount, formatted }: Props) {
  if (amount == null || !Number.isFinite(amount)) return <>{formatted}</>
  const direction = amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'flat'
  const description = { positive: 'Above no campaign', negative: 'Below no campaign', flat: 'Level with no campaign' }[direction]
  const arrow = { positive: '▲', negative: '▼', flat: '—' }[direction]
  return <>
    <span className="ra-profit" data-outcome={direction} title={description}>
      <span className="ra-profit-direction" aria-hidden="true">{arrow}</span>
      <span className="sr-only">{description}. </span>{formatted}
    </span>
    <span className="ra-profit-basis" aria-hidden="true">vs no campaign</span>
  </>
}
