import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

let scroll: Lenis | undefined

export function enableWorkspaceMotion() {
  const preference = matchMedia('(prefers-reduced-motion: no-preference) and (any-pointer: fine)')
  let frame = 0
  function advance(time: number) {
    frame = 0
    scroll?.raf(time)
    if (scroll?.isScrolling === 'smooth') frame = requestAnimationFrame(advance)
  }
  function configure() {
    cancelAnimationFrame(frame)
    frame = 0
    scroll?.destroy()
    scroll = preference.matches ? new Lenis({
      lerp: 0.14,
      allowNestedScroll: true,
      prevent: element => element.matches('textarea, select, input[type="range"]'),
    }) : undefined
    scroll?.on('virtual-scroll', () => {
      if (frame) return
      // Restart the clock before a wheel gesture, excluding the time spent idle.
      scroll?.raf(performance.now())
      frame = requestAnimationFrame(advance)
    })
  }
  configure()
  preference.addEventListener('change', configure)
  return () => {
    preference.removeEventListener('change', configure)
    cancelAnimationFrame(frame)
    scroll?.destroy()
    scroll = undefined
  }
}

export function scrollToWorkspaceStart() {
  if (scroll) scroll.scrollTo(0, { immediate: true, force: true })
  else window.scrollTo({ top: 0, behavior: 'instant' })
}
