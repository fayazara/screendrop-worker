import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/api.server";
import { beginLogin, safeRedirectPath } from "@/lib/auth.server";

/**
 * Starts an OAuth sign-in: /api/auth/login?provider=github&redirect=/abc123.
 * Sets a signed state cookie and bounces to the provider's consent page.
 */
export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const provider = url.searchParams.get("provider");
        if (provider !== "github" && provider !== "google") {
          return json({ error: "Unknown provider" }, 400);
        }

        const response = await beginLogin(
          request,
          provider,
          safeRedirectPath(url.searchParams.get("redirect")),
        );
        return response ?? json({ error: "Provider not configured" }, 404);
      },
    },
  },
});
