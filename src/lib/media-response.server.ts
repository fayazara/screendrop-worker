import { env } from "cloudflare:workers"
import { withCors } from "@/lib/api.server"

interface ByteRange {
  offset: number
  length: number
}

/** Parses a single-range `Range: bytes=...` header against a known size.
 *  Multi-range requests fall back to the full body. */
function parseRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, startRaw, endRaw] = match

  if (startRaw === "" && endRaw !== "") {
    // Suffix range: last N bytes.
    const length = Math.min(Number(endRaw), size)
    if (length === 0) return null
    return { offset: size - length, length }
  }
  if (startRaw === "") return null

  const offset = Number(startRaw)
  if (offset >= size) return null
  const end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1)
  if (end < offset) return null
  return { offset, length: end - offset + 1 }
}

/**
 * Serves an upload's primary media from R2, honoring Range requests so
 * video seeking works without downloading the whole file. The range is
 * parsed here rather than delegated to R2 so behavior is identical in
 * production and local Miniflare.
 */
export async function serveMedia(
  id: string,
  request?: Request,
): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT r2_key, content_type FROM uploads WHERE id = ?",
  )
    .bind(id)
    .first<{ r2_key: string; content_type: string }>()

  if (!row) {
    return withCors(new Response("Not found", { status: 404 }))
  }

  const head = await env.BUCKET.head(row.r2_key)
  if (!head) {
    return withCors(new Response("Not found", { status: 404 }))
  }

  const rangeHeader = request?.headers.get("range") ?? null
  const range = rangeHeader ? parseRange(rangeHeader, head.size) : null

  const object = await env.BUCKET.get(
    row.r2_key,
    range ? { range } : undefined,
  )
  if (!object) {
    return withCors(new Response("Not found", { status: 404 }))
  }

  const headers = new Headers()
  headers.set("content-type", row.content_type)
  headers.set("cache-control", "public, max-age=31536000, immutable")
  headers.set("etag", object.httpEtag)
  headers.set("accept-ranges", "bytes")

  if (range) {
    headers.set(
      "content-range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
    )
    headers.set("content-length", String(range.length))
    return withCors(new Response(object.body, { status: 206, headers }))
  }

  headers.set("content-length", String(head.size))
  return withCors(new Response(object.body, { headers }))
}

/** Serves a sidecar asset (poster, transcript) straight from R2. */
export async function serveAsset(
  r2Key: string | null,
  contentType: string,
): Promise<Response> {
  if (!r2Key) {
    return withCors(new Response("Not found", { status: 404 }))
  }

  const object = await env.BUCKET.get(r2Key)
  if (!object) {
    return withCors(new Response("Not found", { status: 404 }))
  }

  const headers = new Headers()
  headers.set("content-type", contentType)
  headers.set("cache-control", "public, max-age=31536000, immutable")
  headers.set("etag", object.httpEtag)
  return withCors(new Response(object.body, { headers }))
}
