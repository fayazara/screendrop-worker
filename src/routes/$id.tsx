import { createFileRoute, notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import { ShareViewer } from "@/components/share-viewer"
import { getAuthor, getUploadById } from "@/lib/uploads.server"

const loadShare = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const upload = await getUploadById(id)
    if (!upload) return null

    return {
      upload,
      author: getAuthor(),
      origin: getRequestUrl().origin,
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
    const dimensions =
      upload.width && upload.height
        ? ` · ${upload.width} × ${upload.height}`
        : ""
    const duration = upload.duration ? ` · ${upload.duration}s` : ""
    const description = `Shared by ${author.name} via Screendrop${duration}${dimensions}`
    const title = `${upload.filename} — Screendrop Cloud`
    const image = `${origin}/api/image/${upload.id}`

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(upload.mediaType === "video"
          ? []
          : [
              { property: "og:image", content: image },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:title", content: title },
              { name: "twitter:description", content: description },
              { name: "twitter:image", content: image },
            ]),
      ],
    }
  },
  component: SharedMediaPage,
  notFoundComponent: ShareNotFound,
})

function SharedMediaPage() {
  const share = Route.useLoaderData()
  return <ShareViewer {...share} />
}

function ShareNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-100 px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">
          Share not found
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          This screenshot or recording is no longer available.
        </p>
      </div>
    </main>
  )
}
