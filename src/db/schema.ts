import { sql } from "drizzle-orm"
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    r2Key: text("r2_key").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    mediaType: text("media_type").notNull().default("image"),
    duration: real("duration"),
    // Human title shown on the share page; falls back to filename.
    title: text("title"),
    // R2 keys for sidecar assets uploaded after the media itself.
    posterKey: text("poster_key"),
    transcriptKey: text("transcript_key"),
    // Scrub-preview sprite sheet plus its JSON grid metadata
    // ({ tileWidth, tileHeight, columns, interval, count }).
    storyboardKey: text("storyboard_key"),
    storyboardMeta: text("storyboard_meta"),
    // Optional JSON array of { title, start } chapter markers.
    chapters: text("chapters"),
    views: integer("views").notNull().default(0),
  },
  (table) => [index("idx_uploads_created_at").on(table.createdAt)],
)

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull(),
    // Anonymous viewer identity minted client-side and kept in
    // localStorage; lets a viewer edit/delete their own comments
    // without any auth.
    viewerId: text("viewer_id").notNull(),
    authorName: text("author_name").notNull(),
    text: text("text").notNull(),
    // Video time the comment is anchored to, in seconds; null for
    // general comments.
    timestamp: real("timestamp"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_comments_upload_id").on(table.uploadId)],
)

export type Upload = typeof uploads.$inferSelect
export type NewUpload = typeof uploads.$inferInsert
export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
