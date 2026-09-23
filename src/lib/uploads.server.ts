import { count, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import type { Upload } from "@/db/schema";
import type { Transcript } from "@/lib/transcript";
import { db } from "@/db";
import { likes, uploads } from "@/db/schema";
import { parseTranscript } from "@/lib/transcript";

export const WORKER_VERSION = "1.0.0";

export interface Author {
  name: string;
  avatar: string;
}

export function getAuthor(): Author {
  const configuredName = Reflect.get(env, "AUTHOR_NAME");
  const configuredAvatar = Reflect.get(env, "AUTHOR_AVATAR");

  return {
    name:
      typeof configuredName === "string" && configuredName
        ? configuredName
        : "Anonymous",
    avatar:
      typeof configuredAvatar === "string" && configuredAvatar
        ? configuredAvatar
        : "https://api.dicebear.com/10.x/glyphs/svg?seed=Screendrop",
  };
}

export async function getUploadById(id: string): Promise<Upload | null> {
  const row = await db.query.uploads.findFirst({
    where: eq(uploads.id, id),
  });

  if (!row) return null;

  return {
    ...row,
    mediaType:
      row.mediaType ||
      (row.contentType.startsWith("video/") ? "video" : "image"),
  };
}

/** Transcript sidecar from R2, already validated; null when absent. */
export async function getTranscript(
  upload: Upload,
): Promise<Transcript | null> {
  if (!upload.transcriptKey) return null;
  const object = await env.BUCKET.get(upload.transcriptKey);
  if (!object) return null;
  try {
    return parseTranscript(await object.json());
  } catch {
    return null;
  }
}

export async function ensureSchema(): Promise<Array<string>> {
  const applied: Array<string> = [];

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER, height INTEGER, r2_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), media_type TEXT NOT NULL DEFAULT 'image', duration REAL)",
  );
  await env.DB.exec(
    "CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at DESC)",
  );

  const columns = await env.DB.prepare("PRAGMA table_info(uploads)").all<{
    name: string;
  }>();
  const columnNames = new Set(columns.results.map((row) => row.name));

  if (!columnNames.has("media_type")) {
    await env.DB.exec(
      "ALTER TABLE uploads ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'",
    );
    applied.push("media_type");
  }

  if (!columnNames.has("duration")) {
    await env.DB.exec("ALTER TABLE uploads ADD COLUMN duration REAL");
    applied.push("duration");
  }

  const v2Columns: Array<[name: string, definition: string]> = [
    ["title", "TEXT"],
    ["poster_key", "TEXT"],
    ["transcript_key", "TEXT"],
    ["storyboard_key", "TEXT"],
    ["storyboard_meta", "TEXT"],
    ["chapters", "TEXT"],
    ["views", "INTEGER NOT NULL DEFAULT 0"],
    ["social_enabled", "INTEGER NOT NULL DEFAULT 1"],
  ];
  for (const [name, definition] of v2Columns) {
    if (!columnNames.has(name)) {
      await env.DB.exec(`ALTER TABLE uploads ADD COLUMN ${name} ${definition}`);
      applied.push(name);
    }
  }

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, upload_id TEXT NOT NULL, viewer_id TEXT NOT NULL, author_name TEXT NOT NULL, author_avatar TEXT, text TEXT NOT NULL, timestamp REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  await env.DB.exec(
    "CREATE INDEX IF NOT EXISTS idx_comments_upload_id ON comments(upload_id)",
  );

  const commentColumns = await env.DB.prepare(
    "PRAGMA table_info(comments)",
  ).all<{ name: string }>();
  if (!commentColumns.results.some((row) => row.name === "author_avatar")) {
    await env.DB.exec("ALTER TABLE comments ADD COLUMN author_avatar TEXT");
    applied.push("author_avatar");
  }

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS likes (upload_id TEXT NOT NULL, viewer_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (upload_id, viewer_id))",
  );

  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS view_events (id TEXT PRIMARY KEY, upload_id TEXT NOT NULL, country TEXT, city TEXT, referrer TEXT, device TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  await env.DB.exec(
    "CREATE INDEX IF NOT EXISTS idx_view_events_upload_id ON view_events(upload_id)",
  );

  return applied;
}

/**
 * Like total for a share. Tolerates the likes table not existing yet
 * (fresh deployment before any API call has run ensureSchema) so the
 * page loader stays fast and never 500s over a count.
 */
export async function getLikeCount(uploadId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ total: count() })
      .from(likes)
      .where(eq(likes.uploadId, uploadId));
    return row.total;
  } catch {
    return 0;
  }
}

export function isVideoContentType(contentType: string): boolean {
  return contentType.startsWith("video/");
}

export function parseOptionalInteger(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalNumber(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Comments/likes are on by default; only an explicit "false"/"0" turns
// them off for an upload.
export function parseSocialEnabled(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return value !== "false" && value !== "0";
}

/** Upload metadata sent as X-* headers by the streaming and multipart APIs. */
export interface UploadFields {
  filename: string;
  contentType: string;
  mediaType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  title: string | null;
  socialEnabled: boolean;
}

/** Returns null when the required X-Filename header is missing. */
export function uploadFieldsFromHeaders(headers: Headers): UploadFields | null {
  const filename = headers.get("x-filename");
  if (!filename) return null;

  const contentType = headers.get("content-type") || "application/octet-stream";
  const rawTitle = headers.get("x-title");

  return {
    filename,
    contentType,
    mediaType:
      headers.get("x-media-type") ||
      (isVideoContentType(contentType) ? "video" : "image"),
    width: parseOptionalInteger(headers.get("x-width")),
    height: parseOptionalInteger(headers.get("x-height")),
    duration: parseOptionalNumber(headers.get("x-duration")),
    title: rawTitle
      ? decodeURIComponent(rawTitle).trim().slice(0, 200) || null
      : null,
    socialEnabled: parseSocialEnabled(headers.get("x-social-enabled")),
  };
}

export function newUploadId(): string {
  return crypto.randomUUID().split("-")[0];
}

export async function insertUpload(upload: {
  id: string;
  r2Key: string;
  size: number;
  fields: UploadFields;
}): Promise<void> {
  const { fields } = upload;
  await db.insert(uploads).values({
    id: upload.id,
    filename: fields.filename,
    contentType: fields.contentType,
    size: upload.size,
    width: fields.width,
    height: fields.height,
    r2Key: upload.r2Key,
    mediaType: fields.mediaType,
    duration: fields.duration,
    title: fields.title,
    socialEnabled: fields.socialEnabled,
  });
}

/** Response body shared by every endpoint that creates an upload. */
export function uploadCreatedBody(
  request: Request,
  id: string,
  filename: string,
  size: number,
) {
  const origin = new URL(request.url).origin;
  return { id, url: `${origin}/${id}`, filename, size };
}
