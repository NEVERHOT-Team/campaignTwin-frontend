import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { enableWorkspaceMotion, scrollToWorkspaceStart } from './workspace-motion'
import './styles.css'

const SellerWorkflow = lazy(() => import('./v2/SellerWorkflow'))
const ArenaWorkflow = lazy(() => import('./v1/Workflow'))
const DemoApp = lazy(() => import('./DemoApp'))
const hostedDemo = import.meta.env.VITE_HOSTED === 'true' && !import.meta.env.VITE_API_BASE_URL?.trim()
const isStandalone = location.protocol === 'file:' || import.meta.env.VITE_STANDALONE === 'true' || hostedDemo
type Mode = 'seller' | 'v1' | 'demo'
function currentMode():Mode {
  const value = new URLSearchParams(location.search).get('mode')
  if (isStandalone || value === 'demo') return 'demo'
  return value === 'v1' ? 'v1' : 'seller'
}

function Studio() {
  useEffect(enableWorkspaceMotion, [])
  const [mode,setMode]=useState(currentMode)
  const [visited,setVisited]=useState(() => new Set([currentMode()]))
  const [arenaVisit,setArenaVisit]=useState(() => Number(new URLSearchParams(location.search).get('view')==='arena'))
  function show(next:Mode) {
    setMode(next)
    setVisited(previous => previous.has(next) ? previous : new Set([...previous,next]))
  }
  useEffect(() => {
    function restore() {
      show(currentMode())
      if (currentMode()==='demo' && new URLSearchParams(location.search).get('view')==='arena') setArenaVisit(n=>n+1)
    }
    window.addEventListener('popstate',restore)
    return ()=>window.removeEventListener('popstate',restore)
  }, [])
  function navigate(next:Mode, play=false) {
    const url=new URL(location.href)
    for (const key of ['mode','view','play','from']) url.searchParams.delete(key)
    if (next!=='seller') url.searchParams.set('mode',next)
    if (next==='demo') {
      url.searchParams.set('view','arena')
      if (mode==='v1') url.searchParams.set('from','v1')
      if (play) url.searchParams.set('play','1')
      setArenaVisit(n=>n+1)
    }
    history.pushState(null,'',url)
    show(next)
    scrollToWorkspaceStart()
  }
  const query=new URLSearchParams(location.search)
  return <>
    {visited.has('seller') && <div hidden={mode!=='seller'}><Suspense fallback={<p className="studio-loading" role="status">Opening seller planner…</p>}>
      <SellerWorkflow onOpenArena={()=>navigate('v1')} onOpenDemo={()=>navigate('demo')}/>
    </Suspense></div>}
    {visited.has('v1') && <div hidden={mode!=='v1'}><Suspense fallback={<p className="studio-loading" role="status">Opening Arena planner…</p>}>
      <ArenaWorkflow onSeller={()=>navigate('seller')} onOpenDemo={play=>navigate('demo',play)}/>
    </Suspense></div>}
    {visited.has('demo') && <div hidden={mode!=='demo'}><Suspense fallback={<p className="studio-loading" role="status">Opening demo…</p>}>
      <DemoApp active={mode==='demo'} arenaVisit={arenaVisit} playVisit={query.get('play')==='1' ? arenaVisit : 0}
        onOpenLive={isStandalone ? undefined : ()=>navigate(query.get('from')==='v1'?'v1':'seller')}/>
    </Suspense></div>}
  </>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Studio/></StrictMode>)
