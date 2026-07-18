import "@videojs/react/video/skin.css"
import { createPlayer } from "@videojs/react"
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video"
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"

export interface Chapter {
  title: string
  startTime: number
  endTime: number
}

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

interface VideoPlayerProps {
  src: string
  poster?: string
  className?: string
  style?: CSSProperties
  layout?: "responsive" | "fill"
  initialTime?: number
  subtitlesUrl?: string
  /** Storyboard WebVTT for hover-scrub thumbnail previews. */
  thumbnailsUrl?: string
  onActivate?: (element: HTMLVideoElement) => void
  onTimeUpdate?: (currentTime: number, element: HTMLVideoElement) => void
}

// One store definition for every player on the page; each <Player.Provider>
// below creates its own isolated instance of it.
const Player = createPlayer({ features: videoFeatures })

/**
 * The share page's player: Video.js v10's packaged frosted-glass video
 * skin around a native video element we control, so captions, poster,
 * and time callbacks stay wired to our own data.
 */
export function VideoPlayer({
  src,
  poster,
  className,
  style,
  layout = "responsive",
  initialTime = 0,
  subtitlesUrl,
  thumbnailsUrl,
  onActivate,
  onTimeUpdate,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [startingTime] = useState(initialTime)
  const [aspectRatio, setAspectRatio] = useState<string>()
  const hasAppliedInitialTimeRef = useRef(false)

  const mergedStyle = useMemo(() => {
    if (layout !== "responsive" || !aspectRatio) {
      return style
    }

    return {
      ...style,
      aspectRatio,
    }
  }, [aspectRatio, layout, style])

  // The theater-mode layout swap remounts the player; picking the start
  // time up from the previous instance keeps playback continuous.
  useEffect(() => {
    const element = videoRef.current
    if (!element) return

    const handleLoadedMetadata = () => {
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setAspectRatio(`${element.videoWidth} / ${element.videoHeight}`)
      }
      if (!hasAppliedInitialTimeRef.current && startingTime > 0) {
        try {
          element.currentTime = startingTime
          hasAppliedInitialTimeRef.current = true
        } catch {
          // Not seekable yet; the media element will honor later seeks.
        }
      }
      onActivate?.(element)
      onTimeUpdate?.(element.currentTime, element)
    }

    if (element.readyState >= 1) {
      handleLoadedMetadata()
    } else {
      element.addEventListener("loadedmetadata", handleLoadedMetadata)
    }
    return () => {
      element.removeEventListener("loadedmetadata", handleLoadedMetadata)
    }
  }, [onActivate, onTimeUpdate, startingTime])

  return (
    <Player.Provider>
      <VideoSkin
        poster={poster}
        className={[`video-player video-player--${layout}`, className]
          .filter(Boolean)
          .join(" ")}
        style={mergedStyle}
      >
        <Video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          onTimeUpdate={(event) => {
            const element = event.currentTarget
            onActivate?.(element)
            onTimeUpdate?.(element.currentTime, element)
          }}
          onPlay={(event) => onActivate?.(event.currentTarget)}
          onPause={(event) => onActivate?.(event.currentTarget)}
        >
          {subtitlesUrl && (
            <track
              kind="captions"
              label="English"
              srcLang="en"
              src={subtitlesUrl}
            />
          )}
          {thumbnailsUrl && (
            <track
              kind="metadata"
              label="thumbnails"
              src={thumbnailsUrl}
              default
            />
          )}
        </Video>
      </VideoSkin>
    </Player.Provider>
  )
}
