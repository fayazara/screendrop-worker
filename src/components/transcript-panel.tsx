import { CopyIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Transcript } from "@/lib/transcript";
import type { StoryboardMeta } from "@/lib/storyboard";
import { formatDuration } from "@/lib/format";

interface TranscriptPanelProps {
  transcript: Transcript;
  currentTime: number;
  onSeek: (time: number) => void;
  /** Scrub sprite sheet; enables frame previews on timestamp hover. */
  storyboard?: { url: string; meta: StoryboardMeta } | null;
  className?: string;
  style?: React.CSSProperties;
}

const PREVIEW_WIDTH = 176;

/**
 * The sprite tile for a video time, scaled to the preview width, as CSS
 * background props — no per-frame requests, just background-position.
 */
function storyboardTileStyle(
  url: string,
  meta: StoryboardMeta,
  time: number,
): React.CSSProperties {
  const index = Math.min(Math.floor(time / meta.interval), meta.count - 1);
  const column = index % meta.columns;
  const row = Math.floor(index / meta.columns);
  const rows = Math.ceil(meta.count / meta.columns);
  const scale = PREVIEW_WIDTH / meta.tileWidth;

  return {
    width: PREVIEW_WIDTH,
    height: meta.tileHeight * scale,
    backgroundImage: `url(${url})`,
    backgroundSize: `${meta.columns * meta.tileWidth * scale}px ${rows * meta.tileHeight * scale}px`,
    backgroundPosition: `-${column * meta.tileWidth * scale}px -${row * meta.tileHeight * scale}px`,
  };
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
  storyboard,
  className,
  style,
}: TranscriptPanelProps) {
  const segments = transcript.cues;
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  // Frame preview following the hovered timestamp: the popover is one
  // element whose `top` transitions, so it glides between rows.
  const [preview, setPreview] = useState<{ time: number; top: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleTimestampEnter = useCallback(
    (time: number, event: React.MouseEvent<HTMLElement>) => {
      if (!storyboard || !rootRef.current) return;
      const rowRect = event.currentTarget.getBoundingClientRect();
      const rootRect = rootRef.current.getBoundingClientRect();
      setPreview({
        time,
        top: rowRect.top - rootRect.top + rowRect.height / 2,
      });
    },
    [storyboard],
  );

  // Find the active segment based on current playback time
  const activeIndex = segments.findIndex(
    (segment, i) =>
      currentTime >= segment.start &&
      (i === segments.length - 1 || currentTime < segments[i + 1].start),
  );

  // Filter segments by search query
  const filteredSegments = searchQuery
    ? segments.filter((segment) =>
        segment.text.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : segments;

  // Auto-scroll to active segment
  useEffect(() => {
    const container = scrollContainerRef.current;
    const activeSegment = activeSegmentRef.current;

    if (
      !autoScroll ||
      searchQuery ||
      !container ||
      !activeSegment ||
      userScrollingRef.current
    ) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeSegment.getBoundingClientRect();
    const targetTop =
      container.scrollTop +
      (activeRect.top - containerRect.top) -
      container.clientHeight / 2 +
      activeSegment.clientHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  }, [activeIndex, autoScroll, searchQuery]);

  // Detect user scrolling to pause auto-scroll
  const handleScroll = useCallback(() => {
    userScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 2000);
  }, []);

  const handleCopyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(
        segments.map((segment) => segment.text).join(" "),
      );
    } catch {
      // fallback: do nothing
    }
  };

  // Highlight search matches in text
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(
      new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
    );
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  if (!segments.length) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-col ${className ?? ""}`}
      style={style}
    >
      {/* Frame preview popover — floats left of the panel, over the video */}
      {storyboard && preview && (
        <div
          className="pointer-events-none absolute z-10 hidden -translate-y-1/2 transition-[top] duration-200 ease-out lg:block"
          style={{ top: preview.top, right: "calc(100% + 12px)" }}
        >
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
            <div
              style={storyboardTileStyle(
                storyboard.url,
                storyboard.meta,
                preview.time,
              )}
            />
            <p className="py-1 text-center text-xs font-medium text-neutral-600 tabular-nums">
              {formatDuration(preview.time)}
            </p>
          </div>
        </div>
      )}

      {/* Search + controls, one quiet row */}
      <div className="flex shrink-0 items-center gap-1 px-2 pb-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            size={14}
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript..."
            className="w-full rounded-lg bg-neutral-100/70 py-1.5 pr-3 pl-8 text-xs transition-colors placeholder:text-neutral-400 focus:bg-neutral-100 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`cursor-pointer rounded-md px-2 py-1 text-xs transition-colors ${
            autoScroll
              ? "bg-neutral-900 text-white"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
          title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
        >
          Auto
        </button>
        <button
          onClick={() => void handleCopyTranscript()}
          className="cursor-pointer rounded-md p-1.5 text-neutral-400 transition-colors hover:text-neutral-600"
          title="Copy transcript"
        >
          <CopyIcon size={14} />
        </button>
      </div>

      {/* Segments */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseLeave={() => setPreview(null)}
        className="flex-1 space-y-1 overflow-y-auto px-2 pb-2"
      >
        {filteredSegments.map((segment, index) => {
          const originalIndex = searchQuery ? segments.indexOf(segment) : index;
          const isActive = originalIndex === activeIndex;

          return (
            <div
              key={`${segment.start}-${index}`}
              ref={isActive ? activeSegmentRef : undefined}
              onClick={() => onSeek(segment.start)}
              className={`flex cursor-pointer gap-3 rounded-xl px-3 py-2 transition-colors ${
                isActive ? "bg-neutral-100" : "hover:bg-neutral-50"
              }`}
            >
              <span
                onMouseEnter={(e) => handleTimestampEnter(segment.start, e)}
                className="-mx-1 w-11 shrink-0 rounded px-1 pt-0.5 text-sm font-medium text-neutral-800 tabular-nums transition-colors hover:bg-neutral-200/70"
              >
                {formatDuration(segment.start)}
              </span>
              <p
                className={`text-sm leading-relaxed ${
                  isActive ? "text-neutral-800" : "text-neutral-500"
                }`}
              >
                {highlightText(segment.text, searchQuery)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
