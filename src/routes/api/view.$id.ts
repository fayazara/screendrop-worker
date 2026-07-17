import { createFileRoute } from "@tanstack/react-router"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { uploads } from "@/db/schema"
import { json, optionsResponse } from "@/lib/api.server"
import { ensureSchema } from "@/lib/uploads.server"

/**
 * View counter ping. The client sends this once per viewer per share
 * (localStorage-guarded), so the count reads as "people who opened it",
 * not raw page loads.
 */
export const Route = createFileRoute("/api/view/$id")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        await ensureSchema()
        const result = await db
          .update(uploads)
          .set({ views: sql`${uploads.views} + 1` })
          .where(eq(uploads.id, params.id))
        if (result.meta.changes === 0) {
          return json({ error: "Upload not found" }, 404)
        }
        return json({ ok: true })
      },
      OPTIONS: () => optionsResponse(),
    },
  },
})
