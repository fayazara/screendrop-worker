import "plyr/dist/plyr.css"
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"

export interface Chapter {
  title: string
  startTime: number
  endTime: number
}

interface VideoPlayerProps {
  src: string
  poster?: string
  className?: string
  style?: CSSProperties
  layout?: "responsive" | "fill"
  initialTime?: number
  chapters?: Array<Chapter>
  subtitlesUrl?: string
  onActivate?: (element: HTMLVideoElement) => void
  onTimeUpdate?: (currentTime: number, element: HTMLVideoElement) => void
}

const controls = [
  "play-large",
  "play",
  "progress",
  "current-time",
  "mute",
  "volume",
  "captions",
  "settings",
  "pip",
  "fullscreen",
]

/** Finds the chapter at a given time position. */
export function getChapterAtTime(
  chapters: Array<Chapter>,
  time: number,
): Chapter | null {
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (time >= chapters[i].startTime) {
      return chapters[i]
    }
  }
  return chapters[0] ?? null
}

/** Builds Plyr marker points from chapters (skipping the first chapter start at 0). */
function buildMarkerPoints(
  chapters: Array<Chapter>,
): Array<{ time: number; label: string }> {
  return chapters
    .filter((_chapter, i) => i > 0)
    .map((chapter) => ({ time: chapter.startTime, label: chapter.title }))
}

/**
 * Sets up a MutationObserver on Plyr's seek tooltip to prepend the chapter
 * name whenever Plyr updates the tooltip text. Returns a cleanup function.
 */
function setupChapterTooltip(
  plyrContainer: HTMLElement,
  chapters: Array<Chapter>,
  totalDuration: number,
): () => void {
  if (!chapters.length || totalDuration <= 0) return () => {}

  const progressEl = plyrContainer.querySelector<HTMLElement>(
    ".plyr__progress",
  )
  if (!progressEl) return () => {}

  plyrContainer.classList.add("plyr--has-chapters")

  const tooltip = progressEl.querySelector<HTMLElement>(".plyr__tooltip")
  if (!tooltip) {
    return () => {
      plyrContainer.classList.remove("plyr--has-chapters")
    }
  }

  // Track mouse position to know which chapter is being hovered
  let lastMousePct = 0
  const handleMouseMove = (e: MouseEvent) => {
    const rect = progressEl.getBoundingClientRect()
    lastMousePct = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    )
  }
  progressEl.addEventListener("mousemove", handleMouseMove)

  // Observe tooltip text changes and prepend chapter name
  let isUpdating = false
  const observer = new MutationObserver(() => {
    if (isUpdating) return
    const text = tooltip.textContent
    if (text.includes(" — ")) return
    const hoverTime = lastMousePct * totalDuration
    const chapter = getChapterAtTime(chapters, hoverTime)
    if (chapter) {
      isUpdating = true
      tooltip.textContent = `${chapter.title} — ${text}`
      isUpdating = false
    }
  })
  observer.observe(tooltip, {
    childList: true,
    characterData: true,
    subtree: true,
  })

  // Also apply on mousemove to cover initial hover
  const handleMouseMoveTooltip = () => {
    const text = tooltip.textContent
    if (text.includes(" — ")) return
    const hoverTime = lastMousePct * totalDuration
    const chapter = getChapterAtTime(chapters, hoverTime)
    if (chapter) {
      tooltip.textContent = `${chapter.title} - ${text}`
    }
  }
  progressEl.addEventListener("mousemove", handleMouseMoveTooltip)

  return () => {
    plyrContainer.classList.remove("plyr--has-chapters")
    progressEl.removeEventListener("mousemove", handleMouseMove)
    progressEl.removeEventListener("mousemove", handleMouseMoveTooltip)
    observer.disconnect()
  }
}

export function VideoPlayer({
  src,
  poster,
  className,
  style,
  layout = "responsive",
  initialTime = 0,
  chapters,
  subtitlesUrl,
  onActivate,
  onTimeUpdate,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [startingTime] = useState(initialTime)
  const [aspectRatio, setAspectRatio] = useState<string>()
  const hasAppliedInitialTimeRef = useRef(false)
  const chapterCleanupRef = useRef<(() => void) | null>(null)

  const mergedStyle = useMemo(() => {
    if (layout !== "responsive" || !aspectRatio) {
      return style
    }

    return {
      ...style,
      aspectRatio,
    }
  }, [aspectRatio, layout, style])

  useEffect(() => {
    const element = videoRef.current

    if (!element) {
      return
    }

    let isDisposed = false
    let teardown = () => {}

    const applyInitialTime = () => {
      if (hasAppliedInitialTimeRef.current || startingTime <= 0) {
        return
      }

      try {
        element.currentTime = startingTime
        hasAppliedInitialTimeRef.current = true
      } catch {
        return
      }
    }

    const handleLoadedMetadata = () => {
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setAspectRatio(`${element.videoWidth} / ${element.videoHeight}`)
      }

      applyInitialTime()
      onActivate?.(element)
      onTimeUpdate?.(element.currentTime, element)

      // Set up chapter tooltip overlay once we know the duration
      if (chapters?.length && element.duration > 0 && containerRef.current) {
        chapterCleanupRef.current?.()
        const plyrEl = containerRef.current.querySelector<HTMLElement>(".plyr")
        if (plyrEl) {
          chapterCleanupRef.current = setupChapterTooltip(
            plyrEl,
            chapters,
            element.duration,
          )
        }
      }
    }

    const handleTimeUpdate = () => {
      onActivate?.(element)
      onTimeUpdate?.(element.currentTime, element)
    }

    const handleActivate = () => {
      onActivate?.(element)
    }

    void import("plyr").then(({ default: Plyr }) => {
      if (isDisposed) {
        return
      }

      const markerPoints = chapters?.length ? buildMarkerPoints(chapters) : []

      const player = new Plyr(element, {
        controls,
        keyboard: { focused: true, global: false },
        settings: ["speed"],
        tooltips: { controls: false, seek: true },
        markers: {
          enabled: markerPoints.length > 0,
          points: markerPoints,
        },
      })

      element.addEventListener("loadedmetadata", handleLoadedMetadata)
      element.addEventListener("timeupdate", handleTimeUpdate)
      element.addEventListener("play", handleActivate)
      element.addEventListener("pause", handleActivate)

      if (element.readyState >= 1) {
        handleLoadedMetadata()
      } else {
        onActivate?.(element)
      }

      teardown = () => {
        element.removeEventListener("loadedmetadata", handleLoadedMetadata)
        element.removeEventListener("timeupdate", handleTimeUpdate)
        element.removeEventListener("play", handleActivate)
        element.removeEventListener("pause", handleActivate)
        chapterCleanupRef.current?.()
        chapterCleanupRef.current = null
        player.destroy()
      }
    })

    return () => {
      isDisposed = true
      teardown()
    }
  }, [onActivate, onTimeUpdate, src, startingTime, chapters])

  return (
    <div
      ref={containerRef}
      className={[`video-player video-player--${layout}`, className]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        className="block h-full w-full"
      >
        {subtitlesUrl && (
          <track kind="captions" label="English" srcLang="en" src={subtitlesUrl} />
        )}
      </video>
    </div>
  )
}
