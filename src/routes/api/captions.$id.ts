import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { optionsResponse, withCors } from "@/lib/api.server"
import { parseTranscript, transcriptToVtt } from "@/lib/transcript"
import { getUploadById } from "@/lib/uploads.server"

/** WebVTT captions generated from the stored transcript sidecar. */
export const Route = createFileRoute("/api/captions/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const upload = await getUploadById(params.id)
        if (!upload?.transcriptKey) {
          return withCors(new Response("Not found", { status: 404 }))
        }

        const object = await env.BUCKET.get(upload.transcriptKey)
        if (!object) {
          return withCors(new Response("Not found", { status: 404 }))
        }

        const transcript = parseTranscript(await object.json())
        if (!transcript) {
          return withCors(new Response("Not found", { status: 404 }))
        }

        return withCors(
          new Response(transcriptToVtt(transcript), {
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
