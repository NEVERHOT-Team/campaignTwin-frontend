import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const DemoApp = lazy(() => import('./DemoApp'))
const LiveWorkflow = lazy(() => import('./v1/Workflow'))
const isStandalone = location.protocol === 'file:' || import.meta.env.VITE_STANDALONE === 'true'
type Mode = 'planner' | 'demo'
const modeFromUrl = (): Mode => isStandalone || new URLSearchParams(location.search).get('mode') === 'demo' ? 'demo' : 'planner'

function Studio() {
  const [mode, setMode] = useState(modeFromUrl)
  const [visitedPlanner, setVisitedPlanner] = useState(() => modeFromUrl() === 'planner')
  const [visitedDemo, setVisitedDemo] = useState(() => modeFromUrl() === 'demo')
  const [arenaVisit, setArenaVisit] = useState(() => new URLSearchParams(location.search).get('view') === 'arena' ? 1 : 0)
  useEffect(() => {
    function restoreMode() {
      const restored = modeFromUrl()
      setMode(restored)
      if (restored === 'planner') setVisitedPlanner(true)
      else {
        setVisitedDemo(true)
        if (new URLSearchParams(location.search).get('view') === 'arena') setArenaVisit(n => n + 1)
      }
    }
    window.addEventListener('popstate', restoreMode)
    return () => window.removeEventListener('popstate',restoreMode)
  }, [])
  function navigate(next: Mode) {
    const url = new URL(location.href)
    if (next === 'demo') {
      url.searchParams.set('mode','demo'); url.searchParams.set('view','arena')
      setVisitedDemo(true); setArenaVisit(n => n + 1)
    } else {
      url.searchParams.delete('mode'); url.searchParams.delete('view')
      setVisitedPlanner(true)
    }
    history.pushState(null,'',url); setMode(next); window.scrollTo(0,0)
  }
  return <>
    {visitedPlanner && <div hidden={mode !== 'planner'}><Suspense fallback={<p className="studio-loading" role="status">Opening planner…</p>}>
      <LiveWorkflow onOpenDemo={() => navigate('demo')}/>
    </Suspense></div>}
    {visitedDemo && <div hidden={mode !== 'demo'}><Suspense fallback={<p className="studio-loading" role="status">Opening demo…</p>}><DemoApp active={mode === 'demo'} arenaVisit={arenaVisit} onOpenLive={isStandalone ? undefined : () => navigate('planner')}/></Suspense></div>}
  </>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Studio/></StrictMode>)
