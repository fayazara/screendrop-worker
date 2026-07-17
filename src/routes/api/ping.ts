import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { json, optionsResponse, protectedApi } from "@/lib/api.server"
import { WORKER_VERSION } from "@/lib/uploads.server"

export const Route = createFileRoute("/api/ping")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        protectedApi(request, env.UPLOAD_TOKEN, () =>
          json({ ok: true, version: WORKER_VERSION }),
        ),
      OPTIONS: () => optionsResponse(),
    },
  },
})
