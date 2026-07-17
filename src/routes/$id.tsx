import { createFileRoute, notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import { ShareViewer } from "@/components/share-viewer"
import { VideoShare } from "@/components/video-share"
import {
  getAuthor,
  getTranscript,
  getUploadById,
} from "@/lib/uploads.server"

const loadShare = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const upload = await getUploadById(id)
    if (!upload) return null

    // The transcript renders server-side so the page arrives readable
    // (and indexable) without a second round trip.
    const transcript =
      upload.mediaType === "video" ? await getTranscript(upload) : null

    return {
      upload,
      author: getAuthor(),
      origin: getRequestUrl().origin,
      transcript,
    }
  })

export const Route = createFileRoute("/$id")({
  loader: async ({ params }) => {
    if (!/^[a-f0-9]{8}$/.test(params.id)) throw notFound()
    const share = await loadShare({ data: params.id })
    if (!share) throw notFound()
    return share
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}

    const { upload, author, origin } = loaderData
    const isVideo = upload.mediaType === "video"
    const displayTitle = upload.title?.trim() || upload.filename
    const dimensions =
      upload.width && upload.height
        ? ` · ${upload.width} × ${upload.height}`
        : ""
    const duration = upload.duration
      ? ` · ${Math.round(upload.duration)}s`
      : ""
    const description = `Shared by ${author.name} via Screendrop${duration}${dimensions}`
    const title = `${displayTitle} — Screendrop`
    const previewImage = isVideo
      ? upload.posterKey
        ? `${origin}/api/poster/${upload.id}`
        : null
      : `${origin}/api/image/${upload.id}`

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: isVideo ? "video.other" : "website" },
        ...(isVideo
          ? [
              { property: "og:video", content: `${origin}/api/media/${upload.id}` },
              { property: "og:video:type", content: upload.contentType },
              ...(upload.width && upload.height
                ? [
                    { property: "og:video:width", content: String(upload.width) },
                    { property: "og:video:height", content: String(upload.height) },
                  ]
                : []),
            ]
          : []),
        ...(previewImage
          ? [
              { property: "og:image", content: previewImage },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:title", content: title },
              { name: "twitter:description", content: description },
              { name: "twitter:image", content: previewImage },
            ]
          : []),
      ],
    }
  },
  component: SharedMediaPage,
  notFoundComponent: ShareNotFound,
})

function SharedMediaPage() {
  const share = Route.useLoaderData()
  if (share.upload.mediaType === "video") {
    return <VideoShare {...share} />
  }
  return <ShareViewer {...share} />
}

function ShareNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-100 px-6 text-center dark:bg-neutral-950">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Share not found
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          This screenshot or recording is no longer available.
        </p>
      </div>
    </main>
  )
}
