import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { z } from "zod"
import type { UploadFields } from "@/lib/uploads.server"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import {
  ensureSchema,
  insertUpload,
  uploadCreatedBody,
} from "@/lib/uploads.server"

const MAX_PART_NUMBER = 10_000

const completeSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(MAX_PART_NUMBER),
        etag: z.string().min(1),
      }),
    )
    .min(1),
})

/** The key must belong to this upload id, as returned by the start call. */
function isKeyForUpload(key: string | null, id: string): key is string {
  return Boolean(key?.startsWith(`uploads/${id}/`))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Parts, completion, and abort for a chunked upload started with
 * POST /api/upload/multipart.
 *
 * - PUT    ?key=…&uploadId=…&partNumber=N  body = one part → { partNumber, etag }
 * - POST   { key, uploadId, parts }                         → same body as PUT /api/upload
 * - DELETE ?key=…&uploadId=…                               → aborts and discards parts
 *
 * R2 requires every part except the last to be at least 5 MiB and all
 * non-final parts to be the same size.
 */
export const Route = createFileRoute("/api/upload/multipart/$id")({
  server: {
    handlers: {
      PUT: async ({ params, request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          const query = new URL(request.url).searchParams
          const key = query.get("key")
          const uploadId = query.get("uploadId")
          const partNumber = Number(query.get("partNumber"))

          if (!isKeyForUpload(key, params.id) || !uploadId) {
            return json({ error: "Valid key and uploadId are required" }, 400)
          }
          if (
            !Number.isInteger(partNumber) ||
            partNumber < 1 ||
            partNumber > MAX_PART_NUMBER
          ) {
            return json({ error: "partNumber must be 1-10000" }, 400)
          }
          if (!request.body) {
            return json({ error: "Request body is required" }, 400)
          }

          try {
            const part = await env.BUCKET.resumeMultipartUpload(
              key,
              uploadId,
            ).uploadPart(partNumber, request.body)
            return json(part)
          } catch (error) {
            return json({ error: errorMessage(error) }, 400)
          }
        }),

      POST: async ({ params, request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          await ensureSchema()

          let body: unknown
          try {
            body = await request.json()
          } catch {
            return json({ error: "Invalid JSON" }, 400)
          }

          const parsed = completeSchema.safeParse(body)
          if (!parsed.success) {
            return json(
              { error: "Validation failed", issues: parsed.error.issues },
              400,
            )
          }
          const { key, uploadId, parts } = parsed.data
          if (!isKeyForUpload(key, params.id)) {
            return json({ error: "Key does not belong to this upload" }, 400)
          }

          let object: R2Object
          try {
            object = await env.BUCKET.resumeMultipartUpload(
              key,
              uploadId,
            ).complete(parts.sort((a, b) => a.partNumber - b.partNumber))
          } catch (error) {
            return json({ error: errorMessage(error) }, 400)
          }

          // The metadata headers from the start call live on the object.
          const head = await env.BUCKET.head(key)
          const stored = head?.customMetadata?.uploadFields
          if (!stored) {
            return json({ error: "Upload metadata missing" }, 500)
          }
          const fields = JSON.parse(stored) as UploadFields

          await insertUpload({
            id: params.id,
            r2Key: key,
            size: object.size,
            fields,
          })

          return json(
            uploadCreatedBody(request, params.id, fields.filename, object.size),
            201,
          )
        }),

      DELETE: async ({ params, request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          const query = new URL(request.url).searchParams
          const key = query.get("key")
          const uploadId = query.get("uploadId")
          if (!isKeyForUpload(key, params.id) || !uploadId) {
            return json({ error: "Valid key and uploadId are required" }, 400)
          }

          try {
            await env.BUCKET.resumeMultipartUpload(key, uploadId).abort()
          } catch (error) {
            return json({ error: errorMessage(error) }, 400)
          }
          return json({ aborted: true })
        }),

      OPTIONS: () => optionsResponse(),
    },
  },
})
