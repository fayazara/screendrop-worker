import { env } from "cloudflare:workers"
import { withCors } from "@/lib/api.server"

export async function serveMedia(id: string): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT r2_key, content_type FROM uploads WHERE id = ?",
  )
    .bind(id)
    .first<{ r2_key: string; content_type: string }>()

  if (!row) {
    return withCors(new Response("Not found", { status: 404 }))
  }

  const object = await env.BUCKET.get(row.r2_key)
  if (!object) {
    return withCors(new Response("Not found", { status: 404 }))
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("content-type", row.content_type)
  headers.set("cache-control", "public, max-age=31536000, immutable")
  headers.set("etag", object.httpEtag)

  return withCors(new Response(object.body, { headers }))
}
