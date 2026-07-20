import { createFileRoute } from "@tanstack/react-router";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { uploads, viewEvents } from "@/db/schema";
import { json, optionsResponse } from "@/lib/api.server";
import { ensureSchema } from "@/lib/uploads.server";

const bodySchema = z.object({
  // document.referrer of the visit; older clients send no body at all.
  referrer: z.string().max(2048).nullable().optional(),
});

/**
 * View counter ping. The client sends this once per viewer per share
 * (localStorage-guarded), so the count reads as "people who opened it",
 * not raw page loads. Each ping also records an analytics event with
 * viewer geo (Cloudflare request metadata), referrer, and device.
 */
export const Route = createFileRoute("/api/view/$id")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        await ensureSchema();
        const result = await db
          .update(uploads)
          .set({ views: sql`${uploads.views} + 1` })
          .where(eq(uploads.id, params.id));
        if (result.meta.changes === 0) {
          return json({ error: "Upload not found" }, 404);
        }

        const parsed = bodySchema.safeParse(
          await request.json().catch(() => null),
        );
        const referrer = parsed.success
          ? parsed.data.referrer?.trim() || null
          : null;
        const cf = (
          request as Request & { cf?: { country?: string; city?: string } }
        ).cf;
        await db.insert(viewEvents).values({
          id: crypto.randomUUID(),
          uploadId: params.id,
          country: cf?.country ?? request.headers.get("cf-ipcountry"),
          city: cf?.city ?? null,
          referrer,
          device: deviceFromUserAgent(request.headers.get("user-agent")),
        });

        return json({ ok: true });
      },
      OPTIONS: () => optionsResponse(),
    },
  },
});

/** Coarse device label from the User-Agent — enough for analytics. */
function deviceFromUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) {
    return /Mobile/i.test(userAgent) ? "Android" : "Android tablet";
  }
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/CrOS/i.test(userAgent)) return "ChromeOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Other";
}
