import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie } from "@/lib/auth.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: () =>
        Response.json(
          { ok: true },
          { headers: { "set-cookie": clearSessionCookie() } },
        ),
    },
  },
});
