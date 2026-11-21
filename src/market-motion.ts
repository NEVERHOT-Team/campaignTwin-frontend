/** Pixel distance measured at the authored 2D map scale. All walks finish before the next day. */
export function walkingTime(distance: number, seed: number, playing: boolean, reduced: boolean) {
  if (reduced || distance < 0.01) return { delay: 0, duration: 0 }
  return {
    delay: distance > 8 ? (seed >>> 8) % 80 : 0,
    duration: Math.min(playing ? 840 : 650, 225 + distance * 1.8),
  }
}

// A bounded gait keeps legs readable even when a long trip is compressed into one timeline step.
export function walkingPose(elapsed: number, duration: number, seed: number) {
  if (elapsed <= 0 || elapsed >= duration) return 0
  const stepTime = 122 + (seed % 27)
  return 1 + ((Math.floor(elapsed / stepTime) + (seed & 1)) % 2)
}

export const selectionDuration = 210
export function selectionInset(time: number, start: number, reduced: boolean) {
  const remaining = reduced ? 0 : Math.max(0, Math.min(1, 1 - (time - start) / selectionDuration))
  return 4 * remaining * remaining * remaining
}
