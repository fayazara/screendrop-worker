import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

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
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull(),
    // Comment ownership key. Anonymous mode: a random id minted
    // client-side and kept in localStorage. When OAuth sign-in is
    // configured: the provider identity from the session cookie
    // ("github:1234" / "google:5678"), enforced server-side.
    viewerId: text("viewer_id").notNull(),
    authorName: text("author_name").notNull(),
    // Provider avatar URL when the comment was made signed-in.
    authorAvatar: text("author_avatar"),
    text: text("text").notNull(),
    // Video time the comment is anchored to, in seconds; null for
    // general comments.
    timestamp: real("timestamp"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_comments_upload_id").on(table.uploadId)],
);

export const likes = sqliteTable(
  "likes",
  {
    uploadId: text("upload_id").notNull(),
    // Same identity model as comments.viewer_id: the OAuth subject when
    // sign-in is configured, an anonymous localStorage id otherwise.
    viewerId: text("viewer_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.uploadId, table.viewerId] })],
);

export const viewEvents = sqliteTable(
  "view_events",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull(),
    // Viewer geo from Cloudflare's request metadata.
    country: text("country"),
    city: text("city"),
    // document.referrer of the visit; null for direct opens.
    referrer: text("referrer"),
    // Coarse device label derived from the User-Agent ("Mac", "iPhone", …).
    device: text("device"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_view_events_upload_id").on(table.uploadId)],
);

export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Like = typeof likes.$inferSelect;
export type ViewEvent = typeof viewEvents.$inferSelect;
