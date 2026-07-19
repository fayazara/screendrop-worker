import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/api.server";
import { completeLogin } from "@/lib/auth.server";

/**
 * OAuth callback — this exact path (per provider) is what self-hosters
 * register as the authorization callback URL on their OAuth app.
 */
export const Route = createFileRoute("/api/auth/callback/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const provider = params.provider;
        if (provider !== "github" && provider !== "google") {
          return json({ error: "Unknown provider" }, 400);
        }
        return completeLogin(request, provider);
      },
    },
  },
});
