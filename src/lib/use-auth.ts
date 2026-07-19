import { useCallback, useEffect, useState } from "react";

export type AuthProvider = "github" | "google";

export interface AuthUser {
  id: string;
  name: string;
  avatar: string;
}

export interface AuthState {
  authEnabled: boolean;
  providers: Array<AuthProvider>;
  user: AuthUser | null;
}

/**
 * Deployment auth state for the share page: whether OAuth sign-in is
 * configured and who is signed in. `auth` is null until /api/auth/me
 * answers, so sign-in-gated UI can stay hidden instead of flashing.
 */
export function useAuth() {
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data: AuthState = JSON.parse(await res.text());
          setAuth(data);
          return;
        }
      } catch {
        // fall through to anonymous mode
      }
      setAuth({ authEnabled: false, providers: [], user: null });
    })();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuth((prev) => (prev ? { ...prev, user: null } : prev));
    } catch {
      // silently fail
    }
  }, []);

  return { auth, signOut };
}
