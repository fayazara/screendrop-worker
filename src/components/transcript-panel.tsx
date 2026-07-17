import {
  CopyIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Transcript } from "@/lib/transcript"
import { formatDuration } from "@/lib/format"

interface TranscriptPanelProps {
  transcript: Transcript
  currentTime: number
  onSeek: (time: number) => void
  className?: string
  style?: React.CSSProperties
}

/**
 * The live transcript panel, ported from Bloom: one row per segment with
 * a mono timestamp, the active row following playback (centered by
 * auto-scroll unless the viewer is scrolling), search with highlighting,
 * and an Auto toggle for the follow behavior.
 */
export function TranscriptPanel({
  transcript,
  currentTime,
  onSeek,
  className,
  style,
}: TranscriptPanelProps) {
  const segments = transcript.cues
  const [searchQuery, setSearchQuery] = useState("")
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeSegmentRef = useRef<HTMLDivElement>(null)
  const userScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Find the active segment based on current playback time
  const activeIndex = segments.findIndex(
    (segment, i) =>
      currentTime >= segment.start &&
      (i === segments.length - 1 || currentTime < segments[i + 1].start),
  )

  // Filter segments by search query
  const filteredSegments = searchQuery
    ? segments.filter((segment) =>
        segment.text.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : segments

  // Auto-scroll to active segment
  useEffect(() => {
    const container = scrollContainerRef.current
    const activeSegment = activeSegmentRef.current

    if (
      !autoScroll ||
      searchQuery ||
      !container ||
      !activeSegment ||
      userScrollingRef.current
    ) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const activeRect = activeSegment.getBoundingClientRect()
    const targetTop =
      container.scrollTop +
      (activeRect.top - containerRect.top) -
      container.clientHeight / 2 +
      activeSegment.clientHeight / 2

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    })
  }, [activeIndex, autoScroll, searchQuery])

  // Detect user scrolling to pause auto-scroll
  const handleScroll = useCallback(() => {
    userScrollingRef.current = true
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false
    }, 2000)
  }, [])

  const handleCopyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(
        segments.map((segment) => segment.text).join(" "),
      )
    } catch {
      // fallback: do nothing
    }
  }

  // Highlight search matches in text
  const highlightText = (text: string, query: string) => {
    if (!query) return text
    const parts = text.split(
      new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
    )
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">
          {part}
        </mark>
      ) : (
        part
      ),
    )
  }

  if (!segments.length) {
    return null
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white ${className ?? ""}`}
      style={style}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} className="text-neutral-400" />
            <h2 className="text-sm font-medium text-neutral-900">Transcript</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`cursor-pointer rounded-md px-2 py-1 text-xs transition-colors ${
                autoScroll
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              }`}
              title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
            >
              Auto
            </button>
            <button
              onClick={() => void handleCopyTranscript()}
              className="cursor-pointer rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              title="Copy transcript"
            >
              <CopyIcon size={14} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mt-2">
          <MagnifyingGlassIcon
            size={14}
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pr-3 pl-8 text-xs transition-colors placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
          />
        </div>
      </div>

      {/* Segments */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="divide-y divide-neutral-100">
          {filteredSegments.map((segment, index) => {
            const originalIndex = searchQuery
              ? segments.indexOf(segment)
              : index
            const isActive = originalIndex === activeIndex

            return (
              <div
                key={`${segment.start}-${index}`}
                ref={isActive ? activeSegmentRef : undefined}
                onClick={() => onSeek(segment.start)}
                className={`group cursor-pointer px-4 py-2.5 transition-colors ${
                  isActive
                    ? "border-l-2 border-l-neutral-900 bg-neutral-100"
                    : "border-l-2 border-l-transparent hover:bg-neutral-50"
                }`}
              >
                <span
                  className={`font-mono text-xs ${
                    isActive
                      ? "text-neutral-900"
                      : "text-neutral-400 group-hover:text-neutral-500"
                  }`}
                >
                  {formatDuration(segment.start)}
                </span>
                <p
                  className={`mt-0.5 text-sm leading-relaxed ${
                    isActive ? "text-neutral-900" : "text-neutral-600"
                  }`}
                >
                  {highlightText(segment.text, searchQuery)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer with segment count */}
      <div className="shrink-0 border-t border-neutral-100 px-4 py-2">
        <p className="text-xs text-neutral-400">
          {segments.length} segments
          {searchQuery && filteredSegments.length !== segments.length && (
            <span> &middot; {filteredSegments.length} matches</span>
          )}
        </p>
      </div>
    </div>
  )
}
