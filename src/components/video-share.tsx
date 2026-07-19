import {
  DropdownMenu,
  Tooltip,
  TooltipProvider,
  useKumoToastManager,
} from "@cloudflare/kumo";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ChatTextIcon,
  DownloadSimpleIcon,
  EyeIcon,
  ShareNetworkIcon,
  TextboxIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Upload } from "@/db/schema";
import type { Author } from "@/lib/uploads.server";
import type { Transcript } from "@/lib/transcript";
import type { Chapter } from "@/components/video-player";
import type { AuthUser } from "@/lib/use-auth";
import { CommentsPanel } from "@/components/comments-panel";
import { TranscriptPanel } from "@/components/transcript-panel";
import { VideoPlayer, getChapterAtTime } from "@/components/video-player";
import {
  formatBytes,
  formatDuration,
  formatTimeAgo,
  formatViews,
} from "@/lib/format";
import { parseStoryboardMeta } from "@/lib/storyboard";
import { useAuth } from "@/lib/use-auth";
import { hasViewedShare, markShareViewed } from "@/lib/viewer-identity";

interface VideoShareProps {
  upload: Upload;
  author: Author;
  origin: string;
  transcript: Transcript | null;
}

/** The share page, layout ported from Bloom: sticky header, video with
 *  sidebar (transcript/comments), info row below, and a theater mode
 *  that stretches the video across the full width. */
export function VideoShare({
  upload,
  author,
  origin,
  transcript,
}: VideoShareProps) {
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeTab, setActiveTab] = useState<string>(
    transcript ? "transcript" : "comments",
  );
  const [views, setViews] = useState(upload.views);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const toastManager = useKumoToastManager();
  const { auth, signOut } = useAuth();

  const toggleTheater = () => setIsTheaterMode((v) => !v);

  const mediaSource = `${origin}/api/media/${upload.id}`;
  const posterSource = upload.posterKey
    ? `${origin}/api/poster/${upload.id}`
    : undefined;
  const subtitlesUrl = upload.transcriptKey
    ? `${origin}/api/captions/${upload.id}`
    : undefined;
  const thumbnailsUrl = upload.storyboardKey
    ? `${origin}/api/storyboard-vtt/${upload.id}`
    : undefined;
  const hasTranscript = transcript !== null;

  // Sprite sheet + grid for the transcript's hover frame previews.
  const storyboard = useMemo(() => {
    if (!upload.storyboardKey || !upload.storyboardMeta) return null;
    try {
      const meta = parseStoryboardMeta(JSON.parse(upload.storyboardMeta));
      return meta
        ? { url: `${origin}/api/storyboard/${upload.id}`, meta }
        : null;
    } catch {
      return null;
    }
  }, [upload.storyboardKey, upload.storyboardMeta, upload.id, origin]);

  const chapters = useMemo<Array<Chapter> | undefined>(() => {
    if (!upload.chapters) return undefined;
    try {
      const parsed: Array<{ title: string; start: number }> = JSON.parse(
        upload.chapters,
      );
      if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
      return parsed.map((chapter, index) => ({
        title: chapter.title,
        startTime: chapter.start,
        endTime:
          index < parsed.length - 1
            ? parsed[index + 1].start
            : (upload.duration ?? Number.MAX_SAFE_INTEGER),
      }));
    } catch {
      return undefined;
    }
  }, [upload.chapters, upload.duration]);

  const currentChapter = useMemo(() => {
    if (!chapters?.length) return null;
    return getChapterAtTime(chapters, currentTime);
  }, [chapters, currentTime]);

  const handlePlayerActivate = useCallback((element: HTMLVideoElement) => {
    activeVideoRef.current = element;
  }, []);

  const handlePlayerTimeUpdate = useCallback(
    (time: number, element: HTMLVideoElement) => {
      activeVideoRef.current = element;
      setCurrentTime(time);
    },
    [],
  );

  const handleSeek = useCallback((time: number) => {
    const el = activeVideoRef.current;

    if (el) {
      el.currentTime = time;
      void el.play().catch(() => {});
    }

    setCurrentTime(time);
  }, []);

  // Count each viewer once, client-guarded — good enough without auth.
  useEffect(() => {
    if (hasViewedShare(upload.id)) return;
    markShareViewed(upload.id);
    fetch(`/api/view/${upload.id}`, { method: "POST" })
      .then(() => setViews((count) => count + 1))
      .catch(() => {});
  }, [upload.id]);

  const sidebarTabs = (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-1 px-2 pb-2">
        <Tooltip
          content="Transcript"
          render={
            <Button
              variant={activeTab === "transcript" ? "secondary" : "ghost"}
              shape="square"
              icon={TextboxIcon}
              aria-label="Transcript"
              onClick={() => setActiveTab("transcript")}
            />
          }
        />
        <Tooltip
          content="Comments"
          render={
            <Button
              variant={activeTab === "comments" ? "secondary" : "ghost"}
              shape="square"
              icon={ChatTextIcon}
              aria-label="Comments"
              onClick={() => setActiveTab("comments")}
            />
          }
        />
      </div>
    </TooltipProvider>
  );

  const sidebarContent =
    activeTab === "transcript" && hasTranscript ? (
      <TranscriptPanel
        transcript={transcript}
        currentTime={currentTime}
        onSeek={handleSeek}
        storyboard={storyboard}
        className="h-full"
      />
    ) : (
      <CommentsPanel
        uploadId={upload.id}
        currentTime={currentTime}
        onSeek={handleSeek}
        auth={auth}
        className="h-full"
      />
    );

  const videoInfo = (
    <VideoInfo
      upload={upload}
      author={author}
      views={views}
      mediaSource={mediaSource}
      isTheaterMode={isTheaterMode}
      onToggleTheater={toggleTheater}
      onNotify={(message, variant) =>
        toastManager.add({ title: message, variant })
      }
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <Header user={auth?.user ?? null} onSignOut={() => void signOut()} />

      {/* Full-width video in theater mode — hidden on mobile */}
      {isTheaterMode && (
        <div
          className="hidden w-full bg-black lg:block"
          style={{ height: "calc(100vh - 56px - 280px)" }}
        >
          <VideoPlayer
            src={mediaSource}
            poster={posterSource}
            layout="fill"
            initialTime={currentTime}
            subtitlesUrl={subtitlesUrl}
            thumbnailsUrl={thumbnailsUrl}
            onActivate={handlePlayerActivate}
            onTimeUpdate={handlePlayerTimeUpdate}
            className="block h-full w-full"
          />
        </div>
      )}

      {/* Content */}
      <div
        className={`flex-1 px-0 lg:px-6 ${isTheaterMode ? "lg:py-3" : "lg:py-6"} overflow-auto py-0`}
      >
        {isTheaterMode ? (
          /* Theater mode: single column stack */
          <div className="flex flex-col">
            <div className="w-full overflow-hidden bg-black lg:hidden">
              <VideoPlayer
                src={mediaSource}
                poster={posterSource}
                initialTime={currentTime}
                subtitlesUrl={subtitlesUrl}
                thumbnailsUrl={thumbnailsUrl}
                onActivate={handlePlayerActivate}
                onTimeUpdate={handlePlayerTimeUpdate}
                className="block w-full"
              />
            </div>
            <div className="mt-3 px-4 lg:px-0">{videoInfo}</div>
            {currentChapter && (
              <div className="mt-2 px-4 lg:px-0">
                <CurrentChapterIndicator chapter={currentChapter} />
              </div>
            )}
            {hasTranscript && (
              <div className="mt-4 px-4 lg:px-0">
                <TranscriptPanel
                  transcript={transcript}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                  storyboard={storyboard}
                  style={{ maxHeight: "400px" }}
                />
              </div>
            )}
            <div className="mt-4 px-4 lg:px-0">
              <CommentsPanel
                uploadId={upload.id}
                currentTime={currentTime}
                onSeek={handleSeek}
                auth={auth}
              />
            </div>
          </div>
        ) : (
          /* Default mode: YouTube-like layout */
          <div className="flex flex-col">
            {/* Row 1: Video + Sidebar */}
            <div className="flex flex-col lg:flex-row lg:gap-6">
              {/* Video */}
              <div
                className="w-full overflow-hidden rounded-none bg-black lg:flex-1 lg:rounded-2xl"
                style={{ maxHeight: "calc(100vh - 56px - 240px)" }}
              >
                <VideoPlayer
                  src={mediaSource}
                  poster={posterSource}
                  initialTime={currentTime}
                  subtitlesUrl={subtitlesUrl}
                  thumbnailsUrl={thumbnailsUrl}
                  onActivate={handlePlayerActivate}
                  onTimeUpdate={handlePlayerTimeUpdate}
                  className="block h-full w-full"
                />
              </div>

              {/* Sidebar */}
              <div
                className="hidden shrink-0 flex-col lg:flex"
                style={{
                  width: "400px",
                  maxHeight: "calc(100vh - 56px - 240px)",
                }}
              >
                {hasTranscript && sidebarTabs}
                <div className="min-h-0 flex-1">{sidebarContent}</div>
              </div>
            </div>

            {/* Row 2: Video Info + Chapters (constrained to video width) */}
            <div className="mt-3 w-full px-4 lg:max-w-[calc(100%-400px-1.5rem)] lg:px-0">
              {videoInfo}

              {currentChapter && (
                <CurrentChapterIndicator chapter={currentChapter} />
              )}
            </div>

            {/* Mobile-only: Sidebar below content */}
            <div className="mt-4 px-4 lg:hidden">
              {hasTranscript && sidebarTabs}
              <div className="flex flex-col" style={{ maxHeight: "400px" }}>
                {sidebarContent}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoInfo({
  upload,
  author,
  views,
  mediaSource,
  isTheaterMode,
  onToggleTheater,
  onNotify,
}: {
  upload: Upload;
  author: Author;
  views: number;
  mediaSource: string;
  isTheaterMode: boolean;
  onToggleTheater: () => void;
  onNotify: (message: string, variant?: "error") => void;
}) {
  const timeAgo = formatTimeAgo(upload.createdAt);
  const title = upload.title?.trim() || upload.filename;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      onNotify("Link copied");
    } catch {
      onNotify("Failed to copy link", "error");
    }
  };

  return (
    <div className="flex flex-col">
      {/* Title */}
      <h1 className="order-1 text-lg font-semibold text-neutral-900 lg:text-xl">
        {title}
      </h1>

      {/* Author + Actions row */}
      <div className="order-2 mt-3 flex flex-wrap items-start justify-between gap-3">
        {/* Author */}
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={author.avatar}
            alt={author.name}
            className="size-10 shrink-0 rounded-full"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              {author.name}
            </p>
            <p className="text-xs text-neutral-500">{timeAgo}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-2">
          <Button
            variant="secondary"
            icon={ShareNetworkIcon}
            onClick={() => void handleShare()}
          >
            Share
          </Button>
          <LinkButton
            href={mediaSource}
            download={upload.filename}
            variant="secondary"
            icon={DownloadSimpleIcon}
          >
            Download
          </LinkButton>
          <Button
            variant="secondary"
            shape="square"
            className="hidden lg:inline-flex"
            aria-label={isTheaterMode ? "Default view" : "Theater mode"}
            title={isTheaterMode ? "Default view" : "Theater mode"}
            icon={isTheaterMode ? ArrowsInSimpleIcon : ArrowsOutSimpleIcon}
            onClick={onToggleTheater}
          />
        </div>
      </div>

      {/* Description */}
      <div className="order-3 mt-4 rounded-2xl bg-neutral-200/50 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-neutral-900">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <EyeIcon size={14} />
            {formatViews(views)}
          </span>
          <span className="whitespace-nowrap">{formatBytes(upload.size)}</span>
          {upload.duration && (
            <span className="whitespace-nowrap">
              {formatDuration(upload.duration)}
            </span>
          )}
          <span className="whitespace-nowrap">{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

function CurrentChapterIndicator({ chapter }: { chapter: Chapter }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700">
        <span className="size-1.5 animate-pulse rounded-full bg-neutral-900" />
        {chapter.title}
      </span>
      <span className="font-mono text-xs text-neutral-400 tabular-nums">
        {formatDuration(chapter.startTime)}
      </span>
    </div>
  );
}

function Header({
  user,
  onSignOut,
}: {
  user: AuthUser | null;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4">
      <a href="/" className="flex items-center gap-2">
        <img src="/favicon.ico" alt="" className="size-6" />
        <span className="font-semibold text-neutral-900">Screendrop</span>
      </a>
      {user && (
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <button
                className="cursor-pointer rounded-full transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-neutral-900/20 focus-visible:outline-none"
                aria-label={`Signed in as ${user.name}`}
              >
                <img
                  src={
                    user.avatar ||
                    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.name)}`
                  }
                  alt={user.name}
                  className="size-7 rounded-full"
                />
              </button>
            }
          />
          <DropdownMenu.Content>
            <div className="px-3 py-1.5 text-xs text-neutral-500">
              Signed in as{" "}
              <span className="font-medium text-neutral-800">{user.name}</span>
            </div>
            <DropdownMenu.Item onClick={onSignOut}>Sign out</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      )}
    </header>
  );
}
