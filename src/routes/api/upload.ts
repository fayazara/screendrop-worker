import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { db } from "@/db"
import { uploads } from "@/db/schema"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import { ensureSchema, isVideoContentType } from "@/lib/uploads.server"

function parseOptionalInteger(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string" || value.length === 0) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalNumber(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string" || value.length === 0) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          await ensureSchema()

          const formData = await request.formData()
          const file = formData.get("file")
          if (!(file instanceof File)) {
            return json({ error: "No file provided" }, 400)
          }

          const id = crypto.randomUUID().split("-")[0]
          const r2Key = `uploads/${id}/${file.name}`
          const contentType = file.type || "application/octet-stream"
          const requestedMediaType = formData.get("media_type")
          const mediaType =
            typeof requestedMediaType === "string" && requestedMediaType
              ? requestedMediaType
              : isVideoContentType(contentType)
                ? "video"
                : "image"

          await env.BUCKET.put(r2Key, file.stream(), {
            httpMetadata: { contentType },
            customMetadata: { originalName: file.name },
          })

          const rawTitle = formData.get("title")
          const title =
            typeof rawTitle === "string"
              ? rawTitle.trim().slice(0, 200) || null
              : null

          await db.insert(uploads).values({
            id,
            filename: file.name,
            contentType,
            size: file.size,
            width: parseOptionalInteger(formData.get("width")),
            height: parseOptionalInteger(formData.get("height")),
            r2Key,
            mediaType,
            duration: parseOptionalNumber(formData.get("duration")),
            title,
          })

          const origin = new URL(request.url).origin
          return json(
            { id, url: `${origin}/${id}`, filename: file.name, size: file.size },
            201,
          )
        }),

      PUT: async ({ request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          await ensureSchema()

          const filename = request.headers.get("x-filename")
          const contentType =
            request.headers.get("content-type") || "application/octet-stream"

          if (!filename) {
            return json({ error: "X-Filename header is required" }, 400)
          }

          if (!request.body) {
            return json({ error: "Request body is required" }, 400)
          }

          const id = crypto.randomUUID().split("-")[0]
          const r2Key = `uploads/${id}/${filename}`
          const requestedMediaType = request.headers.get("x-media-type")
          const mediaType =
            requestedMediaType ||
            (isVideoContentType(contentType) ? "video" : "image")

          await env.BUCKET.put(r2Key, request.body, {
            httpMetadata: { contentType },
            customMetadata: { originalName: filename },
          })

          const size = parseOptionalInteger(
            request.headers.get("content-length"),
          )

          const rawTitle = request.headers.get("x-title")
          const title = rawTitle
            ? decodeURIComponent(rawTitle).trim().slice(0, 200) || null
            : null

          await db.insert(uploads).values({
            id,
            filename,
            contentType,
            size: size ?? 0,
            width: parseOptionalInteger(request.headers.get("x-width")),
            height: parseOptionalInteger(request.headers.get("x-height")),
            r2Key,
            mediaType,
            duration: parseOptionalNumber(request.headers.get("x-duration")),
            title,
          })

          const origin = new URL(request.url).origin
          return json(
            { id, url: `${origin}/${id}`, filename, size: size ?? 0 },
            201,
          )
        }),

      OPTIONS: () => optionsResponse(),
    },
  },
})
