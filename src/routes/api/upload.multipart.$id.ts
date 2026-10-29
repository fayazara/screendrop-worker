import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { json, optionsResponse, protectedApi } from "@/lib/api.server";
import { ensureSchema } from "@/lib/uploads.server";

const sessionSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
});
const partNumberSchema = z.coerce.number().int().min(1).max(10_000);
const completionSchema = sessionSchema.extend({
  parts: z
    .array(z.object({ partNumber: partNumberSchema, etag: z.string().min(1) }))
    .min(1)
    .max(10_000),
});

async function handle(request: Request, id: string) {
  return protectedApi(request, env.UPLOAD_TOKEN, async () => {
    let input: unknown;
    try {
      input =
        request.method === "POST"
          ? await request.json()
          : Object.fromEntries(new URL(request.url).searchParams);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const session = sessionSchema.safeParse(input);
    if (!session.success || !session.data.key.startsWith(`uploads/${id}/`)) {
      return json(
        { error: "Valid key and uploadId for this upload are required" },
        400,
      );
    }
    const { key, uploadId } = session.data;
    const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
    if (request.method === "PUT") {
      const partNumber = partNumberSchema.safeParse(
        new URL(request.url).searchParams.get("partNumber"),
      );
      if (!partNumber.success || !request.body)
        return json(
          { error: "A part number (1–10000) and body are required" },
          400,
        );
      try {
        return json(await upload.uploadPart(partNumber.data, request.body));
      } catch {
        return json({ error: "The upload or part is invalid" }, 400);
      }
    }
    if (request.method === "DELETE") {
      await upload.abort();
      return json({ aborted: true });
    }
    const completion = completionSchema.safeParse(input);
    if (!completion.success)
      return json({ error: "A valid parts list is required" }, 400);
    const parts = completion.data.parts.sort(
      (a, b) => a.partNumber - b.partNumber,
    );
    if (parts.some((part, index) => part.partNumber !== index + 1)) {
      return json({ error: "Parts must be consecutive and unique" }, 400);
    }
    await ensureSchema();
    // A lost response or D1 failure must not require completing R2 twice.
    let object = await env.BUCKET.head(key);
    if (!object) {
      try {
        await upload.complete(parts);
      } catch {
        return json({ error: "The upload or parts list is invalid" }, 400);
      }
      // R2 completion responses omit metadata; read it from the stored object.
      object = await env.BUCKET.head(key);
    }
    const metadata = object?.customMetadata?.uploadMetadata;
    if (!object || !metadata)
      return json({ error: "Upload metadata is missing" }, 400);
    const fields = JSON.parse(metadata) as Pick<
      typeof uploads.$inferInsert,
      | "filename"
      | "contentType"
      | "width"
      | "height"
      | "duration"
      | "mediaType"
      | "title"
      | "socialEnabled"
    >;
    await db
      .insert(uploads)
      .values({ ...fields, id, r2Key: key, size: object.size })
      .onConflictDoNothing({ target: uploads.id });
    return json(
      {
        id,
        url: `${new URL(request.url).origin}/${id}`,
        filename: fields.filename,
        size: object.size,
      },
      201,
    );
  });
}

export const Route = createFileRoute("/api/upload/multipart/$id")({
  server: {
    handlers: {
      PUT: ({ request, params }) => handle(request, params.id),
      POST: ({ request, params }) => handle(request, params.id),
      DELETE: ({ request, params }) => handle(request, params.id),
      OPTIONS: () => optionsResponse(),
    },
  },
});
