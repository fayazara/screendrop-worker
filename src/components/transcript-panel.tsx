import { MagnifyingGlassIcon } from "@phosphor-icons/react";
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
 * auto-scroll unless the viewer is scrolling), and search with
 * highlighting.
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
  // Frame preview following the hovered timestamp: one element whose
  // `top` transitions, so it glides between rows. It stays mounted with
  // `previewOpen` false while closing so the exit animation can play.
  const [preview, setPreview] = useState<{ time: number; top: number } | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  // Whether there's more to scroll below the fold, to show the bottom
  // fade only when it's telling the truth.
  const [canScrollDown, setCanScrollDown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateScrollFade = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const remaining =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setCanScrollDown(remaining > 4);
  }, []);

  const handleTimestampEnter = useCallback(
    (time: number, event: React.MouseEvent<HTMLElement>) => {
      if (!storyboard || !rootRef.current) return;
      const rowRect = event.currentTarget.getBoundingClientRect();
      const rootRect = rootRef.current.getBoundingClientRect();
      setPreview({
        time,
        top: rowRect.top - rootRect.top + rowRect.height / 2,
      });
      // Double rAF: a freshly mounted popover paints in its closed state
      // first, so the open transition actually plays on entry.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPreviewOpen(true));
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
  }, [activeIndex, searchQuery]);

  // Detect user scrolling to pause auto-scroll
  const handleScroll = useCallback(() => {
    userScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 2000);
    updateScrollFade();
  }, [updateScrollFade]);

  // Recompute the bottom fade whenever the content or the container's
  // own size changes (search filtering, panel resize, initial mount).
  useEffect(() => {
    updateScrollFade();
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateScrollFade);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateScrollFade, filteredSegments.length]);

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
          style={{ top: preview.top, right: "calc(100% + 4px)" }}
        >
          <div
            className={`transcript-preview relative ${previewOpen ? "is-open" : ""}`}
          >
            <div className="transcript-preview-card rounded-2xl bg-white p-1.5">
              <div
                className="rounded-lg"
                style={storyboardTileStyle(
                  storyboard.url,
                  storyboard.meta,
                  preview.time,
                )}
              />
            </div>
            {/* Rounded notch, NSPopover-style: overlaps the card 2px,
                with the border stroked only along the outer curve. The
                card's ring renders 1px outside its edge (box-shadow
                spread), so the flanks base at x=2.5 — the stroke sits
                exactly on the ring line and the outline reads as one
                continuous shape. */}
            <svg
              className="absolute top-1/2 left-full -translate-y-1/2"
              style={{ marginLeft: -2 }}
              width="12"
              height="28"
              viewBox="0 0 12 28"
              aria-hidden="true"
            >
              <path
                d="M2.5 0 C2.5 4 5 7 9.5 11.5 C11.2 13.2 11.2 14.8 9.5 16.5 C5 21 2.5 24 2.5 28 L0 28 L0 0 Z"
                fill="#fff"
              />
              <path
                d="M2.5 0 C2.5 4 5 7 9.5 11.5 C11.2 13.2 11.2 14.8 9.5 16.5 C5 21 2.5 24 2.5 28"
                fill="none"
                stroke="var(--card-border)"
                strokeWidth="1"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Search, one quiet row */}
      <div className="shrink-0 px-2 pb-2">
        <div className="relative">
          <MagnifyingGlassIcon
            size={14}
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript..."
            className="w-full rounded-lg bg-neutral-100 py-3 pr-3 pl-8 text-xs transition-colors placeholder:text-neutral-400 focus:bg-neutral-100 focus:outline-none"
          />
        </div>
      </div>

      {/* Segments */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onMouseLeave={() => setPreviewOpen(false)}
          className="h-full space-y-1 overflow-y-auto px-2 pb-2"
        >
          {filteredSegments.map((segment, index) => {
            const originalIndex = searchQuery
              ? segments.indexOf(segment)
              : index;
            const isActive = originalIndex === activeIndex;

            return (
              <div
                key={`${segment.start}-${index}`}
                ref={isActive ? activeSegmentRef : undefined}
                onClick={() => onSeek(segment.start)}
                className={`flex cursor-pointer gap-3 rounded-xl px-3 py-2 transition-colors ${
                  isActive ? "bg-neutral-200" : "hover:bg-neutral-50"
                }`}
              >
                <span
                  onMouseEnter={(e) => handleTimestampEnter(segment.start, e)}
                  className="-mx-1 flex w-11 shrink-0 items-center justify-center rounded font-mono text-sm font-medium text-neutral-600 tabular-nums transition-colors hover:bg-neutral-300/50"
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

        {/* Bottom fade — hints there's more below, fades out once the
            viewer reaches the actual end so it never misrepresents. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-neutral-50 to-transparent transition-opacity duration-200 ${
            canScrollDown ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </div>
  );
}
