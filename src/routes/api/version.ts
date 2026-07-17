import { createFileRoute } from "@tanstack/react-router"
import { json, optionsResponse } from "@/lib/api.server"
import { WORKER_VERSION } from "@/lib/uploads.server"

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: () => json({ version: WORKER_VERSION }),
      OPTIONS: () => optionsResponse(),
    },
  },
})
