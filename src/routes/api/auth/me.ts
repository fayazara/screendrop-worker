import { createFileRoute } from "@tanstack/react-router";
import {
  enabledProviders,
  getSessionUser,
  isAuthEnabled,
} from "@/lib/auth.server";

/**
 * Session probe for the comments UI: whether sign-in is configured on
 * this deployment, which providers, and who (if anyone) is signed in.
 */
export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = isAuthEnabled() ? await getSessionUser(request) : null;
        return Response.json(
          {
            authEnabled: isAuthEnabled(),
            providers: enabledProviders(),
            user: user
              ? { id: user.sub, name: user.name, avatar: user.avatar }
              : null,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
