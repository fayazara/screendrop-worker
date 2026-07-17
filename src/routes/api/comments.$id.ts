import { createFileRoute } from "@tanstack/react-router"
import { and, asc, count, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { comments } from "@/db/schema"
import { json, optionsResponse } from "@/lib/api.server"
import { ensureSchema, getUploadById } from "@/lib/uploads.server"

const MAX_COMMENTS_PER_UPLOAD = 500

const createSchema = z.object({
  viewerId: z.string().min(8).max(64),
  authorName: z.string().trim().min(1).max(50),
  text: z.string().trim().min(1).max(2000),
  timestamp: z.number().finite().nonnegative().nullable().optional(),
})

const updateSchema = z.object({
  commentId: z.string().min(1).max(64),
  viewerId: z.string().min(8).max(64),
  text: z.string().trim().min(1).max(2000),
})

const deleteSchema = z.object({
  commentId: z.string().min(1).max(64),
  viewerId: z.string().min(8).max(64),
})

/**
 * Comments on a share, keyed by upload id. Anonymous but attributable:
 * the client mints a viewer id kept in localStorage, and edit/delete only
 * touch rows whose viewer_id matches — the same trust model as the name
 * field itself. Comments are public data on a public share page.
 */
export const Route = createFileRoute("/api/comments/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        await ensureSchema()
        const rows = await db.query.comments.findMany({
          where: eq(comments.uploadId, params.id),
          orderBy: asc(comments.createdAt),
        })
        return json({ comments: rows })
      },

      POST: async ({ params, request }) => {
        await ensureSchema()
        const upload = await getUploadById(params.id)
        if (!upload) return json({ error: "Upload not found" }, 404)

        const parsed = createSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return json({ error: "Invalid comment" }, 400)
        }

        const [{ total }] = await db
          .select({ total: count() })
          .from(comments)
          .where(eq(comments.uploadId, params.id))
        if (total >= MAX_COMMENTS_PER_UPLOAD) {
          return json({ error: "Comment limit reached" }, 429)
        }

        const comment = {
          id: crypto.randomUUID(),
          uploadId: params.id,
          viewerId: parsed.data.viewerId,
          authorName: parsed.data.authorName,
          text: parsed.data.text,
          timestamp: parsed.data.timestamp ?? null,
        }
        await db.insert(comments).values(comment)
        const stored = await db.query.comments.findFirst({
          where: eq(comments.id, comment.id),
        })
        return json({ comment: stored }, 201)
      },

      PATCH: async ({ params, request }) => {
        await ensureSchema()
        const parsed = updateSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return json({ error: "Invalid edit" }, 400)
        }

        const result = await db
          .update(comments)
          .set({ text: parsed.data.text })
          .where(
            and(
              eq(comments.id, parsed.data.commentId),
              eq(comments.uploadId, params.id),
              eq(comments.viewerId, parsed.data.viewerId),
            ),
          )
        if (result.meta.changes === 0) {
          return json({ error: "Comment not found" }, 404)
        }
        const stored = await db.query.comments.findFirst({
          where: eq(comments.id, parsed.data.commentId),
        })
        return json({ comment: stored })
      },

      DELETE: async ({ params, request }) => {
        await ensureSchema()
        const parsed = deleteSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return json({ error: "Invalid delete" }, 400)
        }

        const result = await db
          .delete(comments)
          .where(
            and(
              eq(comments.id, parsed.data.commentId),
              eq(comments.uploadId, params.id),
              eq(comments.viewerId, parsed.data.viewerId),
            ),
          )
        if (result.meta.changes === 0) {
          return json({ error: "Comment not found" }, 404)
        }
        return json({ deleted: true })
      },

      OPTIONS: () => optionsResponse(),
    },
  },
})
