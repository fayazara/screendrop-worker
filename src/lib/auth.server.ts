import { env } from "cloudflare:workers";

/**
 * Optional OAuth sign-in for commenting. Self-hosters register their own
 * GitHub/Google OAuth app and provide the client id + secret as Worker
 * secrets; each configured provider shows up as a sign-in option. When
 * neither is configured, commenting stays anonymous (localStorage viewer
 * identity), so auth never blocks the Deploy-to-Cloudflare flow.
 *
 * Sessions are a stateless HMAC-signed cookie carrying the provider
 * identity ({ sub, name, avatar }) — no users or sessions table. The
 * comment endpoints trust the cookie, not the request body, when auth is
 * enabled.
 */

export type ProviderId = "github" | "google";

export interface SessionUser {
  /** Namespaced stable id, e.g. "github:1234" — stored as viewer_id. */
  sub: string;
  name: string;
  avatar: string;
}

interface SessionPayload extends SessionUser {
  exp: number;
}

const SESSION_COOKIE = "screendrop_session";
const STATE_COOKIE = "screendrop_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const STATE_MAX_AGE = 60 * 10;

function optionalEnv(name: string): string {
  const value = Reflect.get(env, name);
  return typeof value === "string" ? value : "";
}

interface ProviderConfig {
  id: ProviderId;
  clientId: string;
  clientSecret: string;
}

function getProvider(id: ProviderId): ProviderConfig | null {
  const prefix = id.toUpperCase();
  const clientId = optionalEnv(`${prefix}_CLIENT_ID`);
  const clientSecret = optionalEnv(`${prefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) return null;
  return { id, clientId, clientSecret };
}

export function enabledProviders(): Array<ProviderId> {
  return (["github", "google"] as const).filter((id) => getProvider(id));
}

export function isAuthEnabled(): boolean {
  return enabledProviders().length > 0;
}

// --- Signed cookies -------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signingKey(): Promise<CryptoKey> {
  // AUTH_SECRET can override, but UPLOAD_TOKEN is already a required
  // per-deployment secret, so it works as the default signing key.
  const secret = optionalEnv("AUTH_SECRET") || env.UPLOAD_TOKEN;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`screendrop-auth:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signValue(payload: unknown): Promise<string> {
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await signingKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyValue<T>(value: string): Promise<T | null> {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  try {
    const key = await signingKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as T;
  } catch {
    return null;
  }
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// --- Sessions -------------------------------------------------------------

export async function getSessionUser(
  request: Request,
): Promise<SessionUser | null> {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (!cookie) return null;
  const payload = await verifyValue<SessionPayload>(cookie);
  if (!payload || typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub || !payload.name) return null;
  return { sub: payload.sub, name: payload.name, avatar: payload.avatar };
}

export async function sessionCookie(user: SessionUser): Promise<string> {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  return cookieHeader(
    SESSION_COOKIE,
    await signValue(payload),
    SESSION_MAX_AGE,
  );
}

export function clearSessionCookie(): string {
  return cookieHeader(SESSION_COOKIE, "", 0);
}

// --- OAuth flow -----------------------------------------------------------

interface OAuthState {
  provider: ProviderId;
  nonce: string;
  redirect: string;
  exp: number;
}

/** Only same-site paths, so the login route can't be an open redirect. */
export function safeRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function callbackUrl(request: Request, provider: ProviderId): string {
  return `${new URL(request.url).origin}/api/auth/callback/${provider}`;
}

export async function beginLogin(
  request: Request,
  providerId: ProviderId,
  redirect: string,
): Promise<Response | null> {
  const provider = getProvider(providerId);
  if (!provider) return null;

  const nonce = crypto.randomUUID();
  const state: OAuthState = {
    provider: providerId,
    nonce,
    redirect,
    exp: Math.floor(Date.now() / 1000) + STATE_MAX_AGE,
  };

  const authorizeUrl =
    providerId === "github"
      ? new URL("https://github.com/login/oauth/authorize")
      : new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", provider.clientId);
  authorizeUrl.searchParams.set(
    "redirect_uri",
    callbackUrl(request, providerId),
  );
  authorizeUrl.searchParams.set("state", nonce);
  if (providerId === "google") {
    authorizeUrl.searchParams.set("response_type", "code");
    // Only the basic profile — we never see repos, email, or drive data.
    authorizeUrl.searchParams.set("scope", "openid profile");
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl.toString(),
      "set-cookie": cookieHeader(
        STATE_COOKIE,
        await signValue(state),
        STATE_MAX_AGE,
      ),
    },
  });
}

async function fetchProviderUser(
  provider: ProviderConfig,
  code: string,
  redirectUri: string,
): Promise<SessionUser | null> {
  const tokenUrl =
    provider.id === "github"
      ? "https://github.com/login/oauth/access_token"
      : "https://oauth2.googleapis.com/token";
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return null;
  const token: { access_token?: string } = await tokenResponse.json();
  if (!token.access_token) return null;

  if (provider.id === "github") {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${token.access_token}`,
        accept: "application/vnd.github+json",
        "user-agent": "screendrop-worker",
      },
    });
    if (!userResponse.ok) return null;
    const user: {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
    } = await userResponse.json();
    return {
      sub: `github:${user.id}`,
      name: user.name || user.login,
      avatar: user.avatar_url,
    };
  }

  const userResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { authorization: `Bearer ${token.access_token}` } },
  );
  if (!userResponse.ok) return null;
  const user: {
    sub: string;
    name?: string;
    picture?: string;
  } = await userResponse.json();
  if (!user.sub) return null;
  return {
    sub: `google:${user.sub}`,
    name: user.name || "Google user",
    avatar: user.picture ?? "",
  };
}

export async function completeLogin(
  request: Request,
  providerId: ProviderId,
): Promise<Response> {
  const failure = (reason: string) =>
    new Response(`Sign-in failed: ${reason}`, {
      status: 400,
      headers: { "set-cookie": cookieHeader(STATE_COOKIE, "", 0) },
    });

  const provider = getProvider(providerId);
  if (!provider) return failure("provider not configured");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateNonce = url.searchParams.get("state");
  if (!code || !stateNonce) return failure("missing code or state");

  const stateCookie = readCookie(request, STATE_COOKIE);
  const state = stateCookie ? await verifyValue<OAuthState>(stateCookie) : null;
  if (
    !state ||
    state.nonce !== stateNonce ||
    state.provider !== providerId ||
    state.exp * 1000 < Date.now()
  ) {
    return failure("state mismatch — please try signing in again");
  }

  const user = await fetchProviderUser(
    provider,
    code,
    callbackUrl(request, providerId),
  );
  if (!user) return failure("could not verify your account");

  const headers = new Headers({ location: safeRedirectPath(state.redirect) });
  headers.append("set-cookie", await sessionCookie(user));
  headers.append("set-cookie", cookieHeader(STATE_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}
