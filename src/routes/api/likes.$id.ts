import { createFileRoute } from "@tanstack/react-router";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { likes } from "@/db/schema";
import { json, optionsResponse } from "@/lib/api.server";
import { getSessionUser, isAuthEnabled } from "@/lib/auth.server";
import { ensureSchema, getUploadById } from "@/lib/uploads.server";

const bodySchema = z.object({
  viewerId: z.string().min(8).max(64).optional(),
});

/**
 * Likes on a share, one per viewer. Same trust model as comments: the
 * session cookie identifies the viewer when OAuth is configured (the
 * body's viewerId is ignored); otherwise the anonymous localStorage
 * viewer id counts, so likes still work on auth-less deployments.
 */
export const Route = createFileRoute("/api/likes/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        await ensureSchema();
        const viewerId = await resolveViewer(
          request,
          new URL(request.url).searchParams.get("viewerId"),
        );
        const liked = viewerId
          ? (await db.query.likes.findFirst({
              where: and(
                eq(likes.uploadId, params.id),
                eq(likes.viewerId, viewerId),
              ),
            })) !== undefined
          : false;
        return json({ count: await likeCount(params.id), liked });
      },

      POST: async ({ params, request }) => {
        await ensureSchema();
        const upload = await getUploadById(params.id);
        if (!upload) return json({ error: "Upload not found" }, 404);

        const owner = await resolveOwner(request);
        if ("error" in owner) return json({ error: owner.error }, owner.status);

        await db
          .insert(likes)
          .values({ uploadId: params.id, viewerId: owner.viewerId })
          .onConflictDoNothing();
        return json({ count: await likeCount(params.id), liked: true });
      },

      DELETE: async ({ params, request }) => {
        await ensureSchema();
        const owner = await resolveOwner(request);
        if ("error" in owner) return json({ error: owner.error }, owner.status);

        await db
          .delete(likes)
          .where(
            and(
              eq(likes.uploadId, params.id),
              eq(likes.viewerId, owner.viewerId),
            ),
          );
        return json({ count: await likeCount(params.id), liked: false });
      },

      OPTIONS: () => optionsResponse(),
    },
  },
});

async function likeCount(uploadId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(likes)
    .where(eq(likes.uploadId, uploadId));
  return row.total;
}

/** The viewer identity for reads; null when nobody identifiable. */
async function resolveViewer(
  request: Request,
  queryViewerId: string | null,
): Promise<string | null> {
  if (isAuthEnabled()) {
    const user = await getSessionUser(request);
    return user?.sub ?? null;
  }
  return queryViewerId;
}

/** The viewer identity for writes; an error when signed out or invalid. */
async function resolveOwner(
  request: Request,
): Promise<{ viewerId: string } | { error: string; status: number }> {
  if (isAuthEnabled()) {
    const user = await getSessionUser(request);
    if (!user) return { error: "Sign in to like", status: 401 };
    return { viewerId: user.sub };
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.viewerId) {
    return { error: "Invalid request", status: 400 };
  }
  return { viewerId: parsed.data.viewerId };
}
