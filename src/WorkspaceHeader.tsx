import type { ReactNode } from 'react'

type HeaderProps = {
  status: string
  children?: ReactNode
  onHome?: () => void
  action?: ReactNode
}

export function WorkspaceHeader({status, children, onHome, action}: HeaderProps) {
  return <header className="studio-header">
    <div className="studio-header-inner">
      {onHome
        ? <button className="studio-wordmark" onClick={onHome} aria-label="CampaignTwin home">CampaignTwin</button>
        : <span className="studio-wordmark">CampaignTwin</span>}
      {children}
      <div className="studio-account"><span className="studio-source">{status}</span>{action}</div>
    </div>
  </header>
}
