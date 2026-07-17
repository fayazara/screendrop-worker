import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import { WORKER_VERSION, ensureSchema } from "@/lib/uploads.server"

export const Route = createFileRoute("/api/setup")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, async () => {
          const applied = await ensureSchema()
          return json({ ok: true, applied, version: WORKER_VERSION })
        }),
      OPTIONS: () => optionsResponse(),
    },
  },
})
