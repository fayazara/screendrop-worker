import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { z } from "zod"
import { db } from "@/db"
import { uploads } from "@/db/schema"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import { ensureSchema, isVideoContentType } from "@/lib/uploads.server"

const registerUploadSchema = z.object({
  r2_key: z.string().min(1),
  filename: z.string().min(1),
  content_type: z.string().optional(),
  size: z.number().nonnegative().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  media_type: z.string().optional(),
  duration: z.number().nonnegative().nullable().optional(),
})

export const Route = createFileRoute("/api/register")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          await ensureSchema()

          let body: unknown
          try {
            body = await request.json()
          } catch {
            return json({ error: "Invalid JSON" }, 400)
          }

          const parsed = registerUploadSchema.safeParse(body)
          if (!parsed.success) {
            return json(
              { error: "Validation failed", issues: parsed.error.issues },
              400,
            )
          }

          const data = parsed.data
          const id = crypto.randomUUID().split("-")[0]
          const contentType =
            data.content_type || "application/octet-stream"
          const mediaType =
            data.media_type ||
            (isVideoContentType(contentType) ? "video" : "image")

          await db.insert(uploads).values({
            id,
            filename: data.filename,
            contentType,
            size: data.size ?? 0,
            width: data.width ?? null,
            height: data.height ?? null,
            r2Key: data.r2_key,
            mediaType,
            duration: data.duration ?? null,
          })

          const origin = new URL(request.url).origin
          return json(
            {
              id,
              url: `${origin}/${id}`,
              filename: data.filename,
              size: data.size ?? 0,
            },
            201,
          )
        }),
      OPTIONS: () => optionsResponse(),
    },
  },
})
