type Props = {
  checked: boolean
  disabled: boolean
  label: string
  action: string
  onChange: (checked: boolean) => void
  onRun: () => void
}

export function RunApproval({checked, disabled, label, action, onChange, onRun}: Props) {
  return <>
    <label className="intake-check intake-approval">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}/>
      {label}
    </label>
    <button type="button" className="intake-primary" disabled={disabled || !checked} onClick={onRun}>{action}</button>
  </>
}
