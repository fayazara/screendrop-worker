import { SkeletonLine, useKumoToastManager } from "@cloudflare/kumo"
import { Button, LinkButton } from "@cloudflare/kumo/components/button"
import {
  CopyIcon,
  DownloadSimpleIcon,
  LinkSimpleIcon,
} from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import type { Upload } from "@/db/schema"
import type { Author } from "@/lib/uploads.server"

interface ShareViewerProps {
  upload: Upload
  author: Author
  origin: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(`${dateString.replace(" ", "T")}Z`)
  const difference = Math.floor((Date.now() - date.getTime()) / 1000)
  if (difference < 60) return "just now"
  if (difference < 3600) return `${Math.floor(difference / 60)} min ago`
  if (difference < 86400) return `${Math.floor(difference / 3600)} hours ago`
  if (difference < 2592000) {
    return `${Math.floor(difference / 86400)} days ago`
  }
  return date.toLocaleDateString()
}

function ViewerHeader({
  upload,
  author,
  mediaSource,
  showNotice,
}: ShareViewerProps & {
  mediaSource: string
  showNotice: (message: string, variant?: "error") => void
}) {
  const dimensions =
    upload.width && upload.height
      ? `${upload.width} × ${upload.height}`
      : null

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showNotice("Link copied")
    } catch {
      showNotice("Failed to copy link", "error")
    }
  }

  async function copyImage() {
    try {
      const response = await fetch(mediaSource)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      showNotice("Image copied")
    } catch {
      showNotice("Failed to copy image", "error")
    }
  }

  const metadata = (
    <>
      {author.name}
      {dimensions ? ` · ${dimensions}` : ""}
      {` · ${formatBytes(upload.size)} · ${formatTimeAgo(upload.createdAt)}`}
    </>
  )

  const actions = (
    <>
      <Button
        variant="ghost"
        shape="square"
        size="sm"
        icon={LinkSimpleIcon}
        aria-label="Copy link"
        title="Copy link"
        onClick={copyLink}
      />
      <Button
        variant="ghost"
        shape="square"
        size="sm"
        icon={CopyIcon}
        aria-label="Copy image"
        title="Copy image"
        onClick={copyImage}
      />
      <LinkButton
        href={mediaSource}
        download={upload.filename}
        variant="secondary"
        size="sm"
        icon={DownloadSimpleIcon}
      >
        Download
      </LinkButton>
    </>
  )

  return (
    <>
      <header className="order-1 flex items-center px-4">
        <nav className="flex min-w-0 flex-1 items-center justify-between gap-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={author.avatar}
              className="size-7 shrink-0 rounded-full"
              alt={author.name}
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-neutral-500">
                {upload.filename}
              </p>
              <p className="truncate text-xs font-medium text-neutral-500">
                {metadata}
              </p>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            {actions}
          </div>
        </nav>
      </header>
      <div className="order-3 flex items-center justify-end gap-1 px-4 py-1.5 sm:hidden">
        {actions}
      </div>
    </>
  )
}

export function ShareViewer(props: ShareViewerProps) {
  const { upload, origin } = props
  const mediaSource = `${origin}/api/image/${upload.id}`
  const [loadedImageSource, setLoadedImageSource] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const toastManager = useKumoToastManager()
  const imageLoaded = loadedImageSource === mediaSource

  useEffect(() => {
    const image = imageRef.current
    if (image?.complete) {
      setLoadedImageSource(mediaSource)
    }
  }, [mediaSource])

  function showNotice(message: string, variant?: "error") {
    toastManager.add({ title: message, variant })
  }

  return (
    <div className="relative isolate flex h-dvh w-full flex-col bg-neutral-100">
      <ViewerHeader
        {...props}
        mediaSource={mediaSource}
        showNotice={showNotice}
      />

      <main className="order-2 flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
        <div className="flex grow items-center justify-center overflow-auto rounded-2xl bg-white shadow-xs ring-1 ring-neutral-950/5">
          <div className="-mt-1 max-h-full w-full max-w-7xl rounded-xl border border-neutral-300 bg-neutral-50 p-1">
            <div className="overflow-hidden rounded-lg shadow-md ring-1 shadow-black/7 ring-neutral-200">
              {!imageLoaded ? (
                <div
                  className="w-full rounded-lg"
                  style={{
                    aspectRatio:
                      upload.width && upload.height
                        ? `${upload.width} / ${upload.height}`
                        : "16 / 9",
                  }}
                >
                  <SkeletonLine
                    minWidth={100}
                    maxWidth={100}
                    minDuration={1.5}
                    maxDuration={1.5}
                    minDelay={0}
                    maxDelay={0}
                    className="h-full w-full rounded-lg"
                  />
                </div>
              ) : null}
              <img
                ref={imageRef}
                src={mediaSource}
                alt={upload.filename}
                className={`max-h-full w-full rounded-lg bg-white object-contain ${imageLoaded ? "block" : "hidden"}`}
                onLoad={() => setLoadedImageSource(mediaSource)}
                onError={() => setLoadedImageSource(mediaSource)}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
