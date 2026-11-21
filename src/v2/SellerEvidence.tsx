import type { Session } from './client'
const money=(v:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)+' THB'
const title=(v:string)=>v.replaceAll('_',' ')

export default function SellerEvidence({session, label='Review costs and assumptions'}:{session:Session;label?:string}) {
  const unit=session.unit_economics
  return <details className="seller-evidence">
    <summary>{label}</summary>
    {unit && <><h3>Contribution per pack</h3>
      <p>Regular price · {money(unit.ordinary_contribution_thb)}<br/>Redeemed voucher · {money(unit.redeemed_contribution_thb)}</p>
      <p>{money(unit.voucher_budget_thb)} available for up to {unit.max_funded_redemptions.toLocaleString()} funded redemptions.</p>
    </>}
    {session.cost_inputs.length>0 && <><h3>Seller costs</h3><dl>{session.cost_inputs.map(cost=><div key={cost.field}>
      <dt>{title(cost.field)}</dt><dd>{cost.value === null ? 'Unknown' : String(cost.value)+' '+cost.unit}
      <small>{[cost.basis,cost.source,cost.reason].filter(Boolean).join(' · ')}</small></dd>
    </div>)}</dl></>}
    {session.policy_inputs.length>0 && <><h3>Evaluation assumptions</h3><dl>{session.policy_inputs.map(item=><div key={item.field}>
      <dt>{title(item.field)}</dt><dd>{typeof item.value === 'object' ? JSON.stringify(item.value) : title(String(item.value))} {item.unit}
        <small>{[item.basis,item.origin].filter(Boolean).join(' · ')}</small></dd>
    </div>)}</dl></>}
    {Object.entries(session.review.confirmed_quotes ?? {}).length>0 && <><h3>Confirmed source quotes</h3><dl>
      {Object.entries(session.review.confirmed_quotes ?? {}).map(([k,v])=><div key={k}><dt>{title(k.split('/').at(-1) ?? k)}</dt><dd>“{v}”</dd></div>)}
    </dl></>}
  </details>
}
