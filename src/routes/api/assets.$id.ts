import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { uploads } from "@/db/schema"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import { parseTranscript } from "@/lib/transcript"
import { ensureSchema, getUploadById } from "@/lib/uploads.server"

const MAX_POSTER_BYTES = 5 * 1024 * 1024
const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024
const MAX_TITLE_LENGTH = 200

/**
 * Sidecar assets for an existing upload, sent by the Screendrop app after
 * the media itself: a poster frame, the transcript JSON, an optional
 * title, and optional chapters. Multipart so the poster streams as a
 * file part.
 */
export const Route = createFileRoute("/api/assets/$id")({
  server: {
    handlers: {
      POST: async ({ params, request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          await ensureSchema()

          const upload = await getUploadById(params.id)
          if (!upload) {
            return json({ error: "Upload not found" }, 404)
          }

          const formData = await request.formData()
          const updates: Partial<typeof uploads.$inferInsert> = {}
          const stored: Array<string> = []

          const poster = formData.get("poster")
          if (poster instanceof File && poster.size > 0) {
            if (poster.size > MAX_POSTER_BYTES) {
              return json({ error: "Poster too large" }, 413)
            }
            const posterKey = `uploads/${upload.id}/poster.jpg`
            await env.BUCKET.put(posterKey, poster.stream(), {
              httpMetadata: { contentType: poster.type || "image/jpeg" },
            })
            updates.posterKey = posterKey
            stored.push("poster")
          }

          const transcriptEntry = formData.get("transcript")
          if (transcriptEntry !== null) {
            const rawText =
              transcriptEntry instanceof File
                ? await transcriptEntry.text()
                : transcriptEntry
            if (rawText.length > MAX_TRANSCRIPT_BYTES) {
              return json({ error: "Transcript too large" }, 413)
            }
            let parsed: unknown
            try {
              parsed = JSON.parse(rawText)
            } catch {
              return json({ error: "Transcript is not valid JSON" }, 400)
            }
            const transcript = parseTranscript(parsed)
            if (!transcript) {
              return json({ error: "Transcript has no usable cues" }, 400)
            }
            const transcriptKey = `uploads/${upload.id}/transcript.json`
            await env.BUCKET.put(transcriptKey, JSON.stringify(transcript), {
              httpMetadata: { contentType: "application/json" },
            })
            updates.transcriptKey = transcriptKey
            stored.push("transcript")
          }

          const title = formData.get("title")
          if (typeof title === "string" && title.trim().length > 0) {
            updates.title = title.trim().slice(0, MAX_TITLE_LENGTH)
            stored.push("title")
          }

          const chapters = formData.get("chapters")
          if (typeof chapters === "string" && chapters.length > 0) {
            try {
              const parsed = JSON.parse(chapters)
              if (Array.isArray(parsed)) {
                updates.chapters = JSON.stringify(
                  parsed
                    .filter(
                      (chapter) =>
                        typeof chapter === "object" &&
                        chapter !== null &&
                        typeof chapter.title === "string" &&
                        Number.isFinite(chapter.start),
                    )
                    .map((chapter) => ({
                      title: String(chapter.title).slice(0, 200),
                      start: Number(chapter.start),
                    })),
                )
                stored.push("chapters")
              }
            } catch {
              return json({ error: "Chapters is not valid JSON" }, 400)
            }
          }

          if (Object.keys(updates).length > 0) {
            await db
              .update(uploads)
              .set(updates)
              .where(eq(uploads.id, upload.id))
          }

          return json({ id: upload.id, stored }, 200)
        }),

      OPTIONS: () => optionsResponse(),
    },
  },
})
