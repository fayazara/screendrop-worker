import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { db } from "@/db"
import { uploads } from "@/db/schema"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import {
  ensureSchema,
  insertUpload,
  isVideoContentType,
  newUploadId,
  parseOptionalInteger,
  parseOptionalNumber,
  parseSocialEnabled,
  uploadCreatedBody,
  uploadFieldsFromHeaders,
} from "@/lib/uploads.server"

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

          const id = newUploadId()
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
            socialEnabled: parseSocialEnabled(formData.get("social_enabled")),
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

          const fields = uploadFieldsFromHeaders(request.headers)
          if (!fields) {
            return json({ error: "X-Filename header is required" }, 400)
          }

          if (!request.body) {
            return json({ error: "Request body is required" }, 400)
          }

          const id = newUploadId()
          const r2Key = `uploads/${id}/${fields.filename}`

          await env.BUCKET.put(r2Key, request.body, {
            httpMetadata: { contentType: fields.contentType },
            customMetadata: { originalName: fields.filename },
          })

          const size =
            parseOptionalInteger(request.headers.get("content-length")) ?? 0
          await insertUpload({ id, r2Key, size, fields })

          return json(uploadCreatedBody(request, id, fields.filename, size), 201)
        }),

      OPTIONS: () => optionsResponse(),
    },
  },
})
