import type { ReactNode } from 'react'
import mark from './assets/campaigntwin-mark.png'

type HeaderProps = {
  status: string
  children?: ReactNode
  onHome?: () => void
  action?: ReactNode
}

export function WorkspaceHeader({status, children, onHome, action}: HeaderProps) {
  const brand = <><img className="studio-mark" src={mark} alt="" width={36} height={36}/>CampaignTwin</>
  return <header className="studio-header">
    <div className="studio-header-inner">
      {onHome
        ? <button className="studio-wordmark" onClick={onHome} aria-label="CampaignTwin home">{brand}</button>
        : <span className="studio-wordmark">{brand}</span>}
      {children}
      <div className="studio-account"><span className="studio-source">{status}</span>{action}</div>
    </div>
  </header>
}
