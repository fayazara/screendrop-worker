import { createFileRoute } from "@tanstack/react-router"
import { optionsResponse, withCors } from "@/lib/api.server"
import { parseStoryboardMeta, storyboardToVtt } from "@/lib/storyboard"
import { getUploadById } from "@/lib/uploads.server"

/**
 * Thumbnails WebVTT for the player's scrub preview, generated from the
 * stored grid metadata so the sprite URL always matches this origin.
 */
export const Route = createFileRoute("/api/storyboard-vtt/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const upload = await getUploadById(params.id)
        if (!upload?.storyboardKey || !upload.storyboardMeta) {
          return withCors(new Response("Not found", { status: 404 }))
        }

        let meta = null
        try {
          meta = parseStoryboardMeta(JSON.parse(upload.storyboardMeta))
        } catch {
          meta = null
        }
        if (!meta) {
          return withCors(new Response("Not found", { status: 404 }))
        }

        const origin = new URL(request.url).origin
        const spriteUrl = `${origin}/api/storyboard/${upload.id}`
        return withCors(
          new Response(storyboardToVtt(meta, spriteUrl, upload.duration), {
            headers: {
              "content-type": "text/vtt; charset=utf-8",
              "cache-control": "public, max-age=31536000, immutable",
            },
          }),
        )
      },
      OPTIONS: () => optionsResponse(),
    },
  },
})
