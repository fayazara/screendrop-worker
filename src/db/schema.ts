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
  },
  (table) => [index("idx_uploads_created_at").on(table.createdAt)],
)

export type Upload = typeof uploads.$inferSelect
export type NewUpload = typeof uploads.$inferInsert
