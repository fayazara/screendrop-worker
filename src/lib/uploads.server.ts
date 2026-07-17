import { eq } from "drizzle-orm"
import { env } from "cloudflare:workers"
import type { Upload } from "@/db/schema"
import { db } from "@/db"
import { uploads } from "@/db/schema"

export const WORKER_VERSION = "1.0.0"

export interface Author {
  name: string
  avatar: string
}

export function getAuthor(): Author {
  const configuredName = Reflect.get(env, "AUTHOR_NAME")
  const configuredAvatar = Reflect.get(env, "AUTHOR_AVATAR")

  return {
    name:
      typeof configuredName === "string" && configuredName
        ? configuredName
        : "Anonymous",
    avatar:
      typeof configuredAvatar === "string" && configuredAvatar
        ? configuredAvatar
        : "https://api.dicebear.com/9.x/shapes/svg?seed=Screendrop",
  }
}

export async function getUploadById(id: string): Promise<Upload | null> {
  const row = await db.query.uploads.findFirst({
    where: eq(uploads.id, id),
  })

  if (!row) return null

  return {
    ...row,
    mediaType:
      row.mediaType ||
      (row.contentType.startsWith("video/") ? "video" : "image"),
  }
}

export async function ensureSchema(): Promise<Array<string>> {
  const applied: Array<string> = []

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER, height INTEGER, r2_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), media_type TEXT NOT NULL DEFAULT 'image', duration REAL)",
  )
  await env.DB.exec(
    "CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at DESC)",
  )

  const columns = await env.DB.prepare("PRAGMA table_info(uploads)").all<{
    name: string
  }>()
  const columnNames = new Set(columns.results.map((row) => row.name))

  if (!columnNames.has("media_type")) {
    await env.DB.exec(
      "ALTER TABLE uploads ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'",
    )
    applied.push("media_type")
  }

  if (!columnNames.has("duration")) {
    await env.DB.exec("ALTER TABLE uploads ADD COLUMN duration REAL")
    applied.push("duration")
  }

  return applied
}

export function isVideoContentType(contentType: string): boolean {
  return contentType.startsWith("video/")
}
