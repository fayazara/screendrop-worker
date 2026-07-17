import { timingSafeEqual } from "node:crypto"

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "access-control-allow-headers":
    "Authorization, Content-Type, Content-Length, X-Filename, X-Media-Type, X-Width, X-Height, X-Duration",
} as const

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function json(
  body: unknown,
  init: ResponseInit | number = {},
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init
  return withCors(Response.json(body, responseInit))
}

export function optionsResponse(): Response {
  return withCors(new Response(null, { status: 204 }))
}

async function securelyEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ])
  return timingSafeEqual(new Uint8Array(leftHash), new Uint8Array(rightHash))
}

async function isAuthorized(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  if (!expectedToken) return false

  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return false

  return securelyEqual(authorization.slice(7), expectedToken)
}

export async function protectedApi(
  request: Request,
  expectedToken: string,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  if (!(await isAuthorized(request, expectedToken))) {
    return json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "www-authenticate": "Bearer" },
      },
    )
  }

  try {
    return await handler()
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "API request failed",
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return json({ error: "Internal server error" }, 500)
  }
}
