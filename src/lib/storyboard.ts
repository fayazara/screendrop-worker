/**
 * Scrub-preview storyboard: one sprite-sheet JPEG plus grid metadata,
 * produced by the Screendrop app and served back to the player as a
 * thumbnails WebVTT (cues pointing at `sprite.jpg#xywh=…` tiles).
 */

export interface StoryboardMeta {
  tileWidth: number
  tileHeight: number
  columns: number
  /** Seconds of video each tile covers. */
  interval: number
  count: number
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/** Validates untrusted JSON into StoryboardMeta. */
export function parseStoryboardMeta(raw: unknown): StoryboardMeta | null {
  if (typeof raw !== "object" || raw === null) return null
  const candidate = raw as Partial<StoryboardMeta>
  if (
    !isPositiveFinite(candidate.tileWidth) ||
    !isPositiveFinite(candidate.tileHeight) ||
    !isPositiveFinite(candidate.columns) ||
    !isPositiveFinite(candidate.interval) ||
    !isPositiveFinite(candidate.count)
  ) {
    return null
  }
  return {
    tileWidth: Math.round(candidate.tileWidth),
    tileHeight: Math.round(candidate.tileHeight),
    columns: Math.max(1, Math.round(candidate.columns)),
    interval: candidate.interval,
    count: Math.round(candidate.count),
  }
}

function vttTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const secs = Math.floor(clamped % 60)
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

/**
 * Storyboard WebVTT (the Mux format): one cue per tile whose text is the
 * sprite URL with an `#xywh` media fragment. Generated on request so the
 * sprite URL always matches the serving origin.
 */
export function storyboardToVtt(
  meta: StoryboardMeta,
  spriteUrl: string,
  duration?: number | null,
): string {
  const lines = ["WEBVTT", ""]
  const totalDuration =
    duration && duration > 0 ? duration : meta.count * meta.interval

  for (let index = 0; index < meta.count; index++) {
    const start = index * meta.interval
    if (start >= totalDuration) break
    const end = Math.min((index + 1) * meta.interval, totalDuration)
    const x = (index % meta.columns) * meta.tileWidth
    const y = Math.floor(index / meta.columns) * meta.tileHeight
    lines.push(`${vttTimestamp(start)} --> ${vttTimestamp(end)}`)
    lines.push(
      `${spriteUrl}#xywh=${x},${y},${meta.tileWidth},${meta.tileHeight}`,
    )
    lines.push("")
  }
  return lines.join("\n")
}
