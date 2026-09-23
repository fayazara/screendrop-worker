import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import {
  ensureSchema,
  newUploadId,
  uploadFieldsFromHeaders,
} from "@/lib/uploads.server"

/**
 * Starts a chunked upload for files larger than one request body allows
 * (Cloudflare rejects bodies over 100 MB on Free/Pro plans before the
 * Worker runs). Accepts the same X-* metadata headers as PUT /api/upload
 * and keeps them in the R2 object's custom metadata until
 * POST /api/upload/multipart/:id completes the upload.
 */
export const Route = createFileRoute("/api/upload/multipart")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          await ensureSchema()

          const fields = uploadFieldsFromHeaders(request.headers)
          if (!fields) {
            return json({ error: "X-Filename header is required" }, 400)
          }

          const id = newUploadId()
          const key = `uploads/${id}/${fields.filename}`
          const multipart = await env.BUCKET.createMultipartUpload(key, {
            httpMetadata: { contentType: fields.contentType },
            customMetadata: {
              originalName: fields.filename,
              uploadFields: JSON.stringify(fields),
            },
          })

          return json({ id, key, uploadId: multipart.uploadId }, 201)
        }),

      OPTIONS: () => optionsResponse(),
    },
  },
})
