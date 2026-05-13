import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { cors } from "hono/cors";
import type { FC, PropsWithChildren } from "hono/jsx";
import { html } from "hono/html";

const app = new Hono<{ Bindings: Env }>();

// ── Helpers ──────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)} days ago`;
  return date.toLocaleDateString();
}

// ── Icons (Lucide via Iconify) ───────────────────────────

const LinkIcon: FC<{ class?: string }> = ({ class: cls }) => (
  <img
    src="https://api.iconify.design/lucide:link-2.svg?color=%23525252"
    alt="Link"
    width="16"
    height="16"
    class={cls}
  />
);

const CopyIcon: FC<{ class?: string }> = ({ class: cls }) => (
  <img
    src="https://api.iconify.design/lucide:copy.svg?color=%23525252"
    alt="Copy"
    width="16"
    height="16"
    class={cls}
  />
);

// ── Layout ───────────────────────────────────────────────

const BaseLayout: FC<
  PropsWithChildren<{
    title: string;
    description?: string;
    ogImage?: string;
  }>
> = ({ title, description, ogImage, children }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {ogImage && (
        <>
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description ?? ""} />
          <meta property="og:image" content={ogImage} />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={title} />
          <meta name="twitter:description" content={description ?? ""} />
          <meta name="twitter:image" content={ogImage} />
        </>
      )}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="icon" href="/favicon.ico" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossorigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <script src="https://cdn.tailwindcss.com"></script>
      {html`<script>
        tailwind.config = {
          theme: {
            extend: {
              fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
              },
            },
          },
        };
      </script>`}
		{html`<style>
				body {
					margin: 0;
					-webkit-font-smoothing: antialiased;
				}
				@keyframes shimmer {
					0% { background-position: -1200px 0; }
					100% { background-position: 1200px 0; }
				}
				.shimmer {
					background: linear-gradient(90deg, #f0f0f0 0%, #f7f7f8 20%, #fafafa 50%, #f7f7f8 80%, #f0f0f0 100%);
					background-size: 1200px 100%;
					animation: shimmer 2.4s ease-in-out infinite;
				}
			</style>`}
    </head>
    <body class="font-sans">{children}</body>
  </html>
);

// ── Image Viewer Page ────────────────────────────────────

interface Upload {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  width: number | null;
  height: number | null;
  media_type: string;
  duration: number | null;
  created_at: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isVideoContentType(contentType: string): boolean {
  return contentType.startsWith("video/");
}

const ImagePage: FC<{
  upload: Upload;
  author: { name: string; avatar: string };
  origin: string;
}> = ({ upload, author, origin }) => {
  const imageSrc = `${origin}/api/image/${upload.id}`;
  const dimensions =
    upload.width && upload.height
      ? `${upload.width} \u00d7 ${upload.height}`
      : null;
  const description = `Shared by ${author.name} via Screendrop${dimensions ? ` \u00b7 ${dimensions}` : ""}`;

  return (
    <BaseLayout
      title={`${upload.filename} — Screendrop Cloud`}
      description={description}
      ogImage={imageSrc}
    >
      {/* Toast container */}
      <div
        id="toast"
        class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center transition-opacity duration-300 opacity-0"
      >
        <div class="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          <span id="toast-msg"></span>
        </div>
      </div>

      <div class="relative isolate flex h-dvh w-full flex-col bg-neutral-100">
        {/* Header */}
        <header class="flex items-center px-4">
          <nav class="flex flex-1 items-center justify-between gap-4 py-2.5 min-w-0">
            {/* Left: author + file info */}
            <div class="flex items-center gap-2.5 min-w-0">
              <img
                src={author.avatar}
                class="h-7 w-7 rounded-full shrink-0"
                alt={escapeHtml(author.name)}
              />
              <div class="min-w-0">
                <p class="font-medium text-neutral-500 truncate">
                  {upload.filename}
                </p>
                <p class="text-xs text-neutral-500 truncate font-medium">
                  {author.name}
                  {dimensions && (
                    <>
                      <span class="mx-1.5">&middot;</span>
                      {dimensions}
                    </>
                  )}
                  <span class="mx-1.5">&middot;</span>
                  {formatBytes(upload.size)}
                  <span class="mx-1.5">&middot;</span>
                  {formatTimeAgo(upload.created_at)}
                </p>
              </div>
            </div>

            {/* Right: actions (desktop only) */}
            <div class="hidden sm:flex items-center gap-1 shrink-0">
              <button
                id="btn-link"
                title="Copy link"
                class="cursor-pointer rounded-lg p-2 transition hover:bg-neutral-200"
              >
                <LinkIcon />
              </button>
              <button
                id="btn-copy"
                title="Copy image"
                class="cursor-pointer rounded-lg p-2 transition hover:bg-neutral-200"
              >
                <CopyIcon />
              </button>
              <a
                href={imageSrc}
                download={upload.filename}
                class="hidden sm:flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-950 h-9 ring-1 ring-neutral-200 transition"
              >
                Download
              </a>
            </div>
          </nav>
        </header>

        {/* Image */}
        <main class="flex flex-1 flex-col px-2 pb-2 gap-2">
          <div class="flex grow items-center justify-center overflow-auto rounded-2xl bg-white shadow-xs ring-1 ring-neutral-950/5">
            <div class="max-h-full w-full max-w-7xl rounded-xl border border-neutral-300 bg-neutral-50 p-1 -mt-1">
              <div class="rounded-lg shadow-md ring-1 ring-neutral-200 shadow-black/[.07] overflow-hidden">
                {/* Skeleton placeholder — shown until image loads */}
                <div
                  id="img-skeleton"
                  class="shimmer w-full rounded-lg"
                  style={`aspect-ratio: ${upload.width && upload.height ? `${upload.width} / ${upload.height}` : "16 / 9"}`}
                />
                {/* Actual image — hidden until loaded */}
                <img
                  id="main-img"
                  src={imageSrc}
                  alt={escapeHtml(upload.filename)}
                  class="max-h-full w-full rounded-lg bg-white object-contain"
                  style="display:none"
                />
              </div>
            </div>
          </div>

          {/* Mobile action bar */}
          <div class="flex sm:hidden items-center justify-end gap-1 px-2 py-1.5">
            <button
              id="btn-link-m"
              title="Copy link"
              class="cursor-pointer rounded-lg p-2 transition hover:bg-neutral-200"
            >
              <LinkIcon />
            </button>
            <button
              id="btn-copy-m"
              title="Copy image"
              class="cursor-pointer rounded-lg p-2 transition hover:bg-neutral-200"
            >
              <CopyIcon />
            </button>
            <a
              href={imageSrc}
              download={upload.filename}
              class="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-900 h-9 ring-1 ring-neutral-200 transition"
            >
              Download
            </a>
          </div>
        </main>
      </div>

      {/* Client-side interactivity */}
      {html`<script>
        function showToast(msg) {
          var t = document.getElementById("toast");
          document.getElementById("toast-msg").textContent = msg;
          t.classList.remove("opacity-0");
          t.classList.add("opacity-100");
          setTimeout(function () {
            t.classList.remove("opacity-100");
            t.classList.add("opacity-0");
          }, 2000);
        }
        function copyLink() {
          navigator.clipboard.writeText(window.location.href);
          showToast("Link copied");
        }
        async function copyImage() {
          try {
            var res = await fetch("${imageSrc}");
            var blob = await res.blob();
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob }),
            ]);
            showToast("Image copied");
          } catch (e) {
            showToast("Failed to copy");
          }
        }
			document.querySelectorAll("[id^=btn-link]").forEach(function (el) {
					el.addEventListener("click", copyLink);
				});
				document.querySelectorAll("[id^=btn-copy]").forEach(function (el) {
					el.addEventListener("click", copyImage);
				});
				var img = document.getElementById("main-img");
				var skeleton = document.getElementById("img-skeleton");
				function revealImage() {
					if (skeleton) skeleton.style.display = "none";
					if (img) img.style.display = "";
				}
				if (img) {
					if (img.complete && img.naturalWidth > 0) {
						revealImage();
					} else {
						img.addEventListener("load", revealImage);
						img.addEventListener("error", revealImage);
					}
				}
      </script>`}
    </BaseLayout>
  );
};

// ── Video Viewer Page ────────────────────────────────────

const VideoPage: FC<{
  upload: Upload;
  author: { name: string; avatar: string };
  origin: string;
}> = ({ upload, author, origin }) => {
  const mediaSrc = `${origin}/api/media/${upload.id}`;
  const durationStr = upload.duration ? formatDuration(upload.duration) : null;
  const dimensions =
    upload.width && upload.height
      ? `${upload.width} \u00d7 ${upload.height}`
      : null;
  const description = `Shared by ${author.name} via Screendrop${durationStr ? ` \u00b7 ${durationStr}` : ""}${dimensions ? ` \u00b7 ${dimensions}` : ""}`;

  return (
    <BaseLayout
      title={`${upload.filename} — Screendrop Cloud`}
      description={description}
      ogImage={undefined}
    >
      {/* Toast container */}
      <div
        id="toast"
        class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center transition-opacity duration-300 opacity-0"
      >
        <div class="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          <span id="toast-msg"></span>
        </div>
      </div>

      <div class="relative isolate flex h-dvh w-full flex-col bg-neutral-100">
        {/* Header */}
        <header class="flex items-center px-4">
          <nav class="flex flex-1 items-center justify-between gap-4 py-2.5 min-w-0">
            {/* Left: author + file info */}
            <div class="flex items-center gap-2.5 min-w-0">
              <img
                src={author.avatar}
                class="h-7 w-7 rounded-full shrink-0"
                alt={escapeHtml(author.name)}
              />
              <div class="min-w-0">
                <p class="font-medium text-neutral-500 truncate">
                  {upload.filename}
                </p>
                <p class="text-xs text-neutral-500 truncate font-medium">
                  {author.name}
                  {dimensions && (
                    <>
                      <span class="mx-1.5">&middot;</span>
                      {dimensions}
                    </>
                  )}
                  {durationStr && (
                    <>
                      <span class="mx-1.5">&middot;</span>
                      {durationStr}
                    </>
                  )}
                  <span class="mx-1.5">&middot;</span>
                  {formatBytes(upload.size)}
                  <span class="mx-1.5">&middot;</span>
                  {formatTimeAgo(upload.created_at)}
                </p>
              </div>
            </div>

            {/* Right: actions (desktop only) */}
            <div class="hidden sm:flex items-center gap-1 shrink-0">
              <button
                id="btn-link"
                title="Copy link"
                class="cursor-pointer rounded-lg p-2 transition hover:bg-neutral-200"
              >
                <LinkIcon />
              </button>
              <a
                href={mediaSrc}
                download={upload.filename}
                class="hidden sm:flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-950 h-9 ring-1 ring-neutral-200 transition"
              >
                Download
              </a>
            </div>
          </nav>
        </header>

        {/* Video */}
        <main class="flex flex-1 flex-col px-2 pb-2 gap-2">
          <div class="flex grow items-center justify-center overflow-auto rounded-2xl bg-white shadow-xs ring-1 ring-neutral-950/5">
            <div class="max-h-full w-full max-w-5xl rounded-xl border border-neutral-300 p-1 -mt-1">
              <div class="rounded-lg shadow-md ring-1 ring-neutral-200 shadow-black/[.07] overflow-hidden">
                <video
                  id="main-video"
                  src={mediaSrc}
                  controls
                  playsinline
                  preload="metadata"
                  class="w-full rounded-lg"
                  style={upload.width && upload.height ? `aspect-ratio: ${upload.width} / ${upload.height}` : "aspect-ratio: 16 / 9"}
                />
              </div>
            </div>
          </div>

          {/* Mobile action bar */}
          <div class="flex sm:hidden items-center justify-end gap-1 px-2 py-1.5">
            <button
              id="btn-link-m"
              title="Copy link"
              class="cursor-pointer rounded-lg p-2 transition hover:bg-neutral-200"
            >
              <LinkIcon />
            </button>
            <a
              href={mediaSrc}
              download={upload.filename}
              class="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-900 h-9 ring-1 ring-neutral-200 transition"
            >
              Download
            </a>
          </div>
        </main>
      </div>

      {/* Client-side interactivity */}
      {html`<script>
        function showToast(msg) {
          var t = document.getElementById("toast");
          document.getElementById("toast-msg").textContent = msg;
          t.classList.remove("opacity-0");
          t.classList.add("opacity-100");
          setTimeout(function () {
            t.classList.remove("opacity-100");
            t.classList.add("opacity-0");
          }, 2000);
        }
        function copyLink() {
          navigator.clipboard.writeText(window.location.href);
          showToast("Link copied");
        }
        document.querySelectorAll("[id^=btn-link]").forEach(function (el) {
          el.addEventListener("click", copyLink);
        });
      </script>`}
    </BaseLayout>
  );
};

// ── Home Page ────────────────────────────────────────────

const HomePage: FC<{ author: { name: string; avatar: string } }> = ({
  author,
}) => (
  <BaseLayout
    title="Screendrop Cloud"
    description="Screenshot sharing powered by Screendrop"
  >
    <div class="flex h-dvh w-full flex-col items-center justify-center bg-neutral-100">
      <div class="flex flex-col items-center gap-4">
        <img
          src={author.avatar}
          class="h-14 w-14 rounded-full"
          alt={escapeHtml(author.name)}
        />
        <div class="text-center">
          <h1 class="text-xl font-semibold text-neutral-900">Screendrop Cloud</h1>
          <p class="mt-1 text-sm text-neutral-500">
            Screenshot sharing by {author.name}
          </p>
        </div>
      </div>
    </div>
  </BaseLayout>
);

// ── API Routes ───────────────────────────────────────────

app.use("/api/*", cors());

// Connection check (token-protected)
app.get(
	"/api/ping",
	async (c, next) => {
		const auth = bearerAuth({ token: c.env.UPLOAD_TOKEN });
		return auth(c, next);
	},
	(c) => c.json({ ok: true })
);

// Upload (token-protected)
app.post(
  "/api/upload",
  async (c, next) => {
    const auth = bearerAuth({ token: c.env.UPLOAD_TOKEN });
    return auth(c, next);
  },
  async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const id = crypto.randomUUID().split("-")[0]!;
    const r2Key = `uploads/${id}/${file.name}`;
    const width = formData.get("width") as string | null;
    const height = formData.get("height") as string | null;
    const durationStr = formData.get("duration") as string | null;
    const mediaTypeField = formData.get("media_type") as string | null;
    const contentType = file.type || "application/octet-stream";
    const mediaType = mediaTypeField || (isVideoContentType(contentType) ? "video" : "image");

    await c.env.BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType },
      customMetadata: { originalName: file.name },
    });

    await c.env.DB.prepare(
      `INSERT INTO uploads (id, filename, content_type, size, width, height, r2_key, media_type, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        file.name,
        contentType,
        file.size,
        width ? parseInt(width, 10) : null,
        height ? parseInt(height, 10) : null,
        r2Key,
        mediaType,
        durationStr ? parseFloat(durationStr) : null,
      )
      .run();

    const origin = new URL(c.req.url).origin;
    return c.json(
      { id, url: `${origin}/${id}`, filename: file.name, size: file.size },
      201,
    );
  },
);

// Register metadata for a file already uploaded directly to R2 via S3 API.
// The mac app uploads to R2 first, then calls this to create the D1 row.
app.post(
  "/api/register",
  async (c, next) => {
    const auth = bearerAuth({ token: c.env.UPLOAD_TOKEN });
    return auth(c, next);
  },
  async (c) => {
    const body = await c.req.json<{
      r2_key: string;
      filename: string;
      content_type: string;
      size: number;
      width?: number | null;
      height?: number | null;
      media_type?: string;
      duration?: number | null;
    }>();

    if (!body.r2_key || !body.filename) {
      return c.json({ error: "r2_key and filename are required" }, 400);
    }

    const id = crypto.randomUUID().split("-")[0]!;
    const contentType = body.content_type || "application/octet-stream";
    const mediaType = body.media_type || (isVideoContentType(contentType) ? "video" : "image");

    await c.env.DB.prepare(
      `INSERT INTO uploads (id, filename, content_type, size, width, height, r2_key, media_type, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        body.filename,
        contentType,
        body.size ?? 0,
        body.width ?? null,
        body.height ?? null,
        body.r2_key,
        mediaType,
        body.duration ?? null,
      )
      .run();

    const origin = new URL(c.req.url).origin;
    return c.json(
      {
        id,
        url: `${origin}/${id}`,
        filename: body.filename,
        size: body.size ?? 0,
      },
      201,
    );
  },
);

// Stream-upload a file directly to R2 via the Worker binding, then create
// the D1 metadata row. The request body IS the raw file bytes (not multipart).
// Metadata is passed via headers to avoid buffering the body.
//
// Required headers:
//   X-Filename:     original filename (e.g. "screenshot.png")
//   Content-Type:   MIME type (e.g. "image/png")
// Optional headers:
//   X-Media-Type:   "image" | "video"  (auto-detected from Content-Type if omitted)
//   X-Width:        pixel width
//   X-Height:       pixel height
//   X-Duration:     video duration in seconds
//   Content-Length:  file size in bytes (set automatically by most HTTP clients)
app.put(
  "/api/upload",
  async (c, next) => {
    const auth = bearerAuth({ token: c.env.UPLOAD_TOKEN });
    return auth(c, next);
  },
  async (c) => {
    const filename = c.req.header("X-Filename");
    const contentType = c.req.header("Content-Type") || "application/octet-stream";

    if (!filename) {
      return c.json({ error: "X-Filename header is required" }, 400);
    }

    const body = c.req.raw.body;
    if (!body) {
      return c.json({ error: "Request body is required" }, 400);
    }

    const id = crypto.randomUUID().split("-")[0]!;
    const r2Key = `uploads/${id}/${filename}`;
    const mediaTypeHeader = c.req.header("X-Media-Type");
    const mediaType = mediaTypeHeader || (isVideoContentType(contentType) ? "video" : "image");
    const width = c.req.header("X-Width");
    const height = c.req.header("X-Height");
    const duration = c.req.header("X-Duration");
    const contentLength = c.req.header("Content-Length");

    // Stream the request body directly to R2 — no buffering in Worker memory
    await c.env.BUCKET.put(r2Key, body, {
      httpMetadata: { contentType },
      customMetadata: { originalName: filename },
    });

    const size = contentLength ? parseInt(contentLength, 10) : 0;

    await c.env.DB.prepare(
      `INSERT INTO uploads (id, filename, content_type, size, width, height, r2_key, media_type, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        filename,
        contentType,
        size,
        width ? parseInt(width, 10) : null,
        height ? parseInt(height, 10) : null,
        r2Key,
        mediaType,
        duration ? parseFloat(duration) : null,
      )
      .run();

    const origin = new URL(c.req.url).origin;
    return c.json(
      { id, url: `${origin}/${id}`, filename, size },
      201,
    );
  },
);

// Serve raw file (image or video) from R2
async function serveMedia(c: any) {
  const { id } = c.req.param();

  const row = await c.env.DB.prepare(
    "SELECT r2_key, content_type, filename FROM uploads WHERE id = ?",
  )
    .bind(id)
    .first<{ r2_key: string; content_type: string; filename: string }>();

  if (!row) return c.notFound();

  const object = await c.env.BUCKET.get(row.r2_key);
  if (!object) return c.notFound();

  const headers = new Headers();
  headers.set("Content-Type", row.content_type);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  object.writeHttpMetadata(headers);

  return new Response(object.body, { headers });
}

app.get("/api/media/:id", serveMedia);
// Keep /api/image/:id as a backward-compatible alias
app.get("/api/image/:id", serveMedia);

// ── Page Routes ──────────────────────────────────────────

// Media viewer (image or video)
app.get("/:id{[a-f0-9]{8}}", async (c) => {
  const { id } = c.req.param();

  const row = await c.env.DB.prepare(
    "SELECT id, filename, content_type, size, width, height, media_type, duration, created_at FROM uploads WHERE id = ?",
  )
    .bind(id)
    .first<Upload>();

  if (!row) return c.notFound();

  // Default media_type for rows created before the migration
  if (!row.media_type) {
    row.media_type = isVideoContentType(row.content_type) ? "video" : "image";
  }

  const author = {
    name: c.env.AUTHOR_NAME || "Anonymous",
    avatar:
      c.env.AUTHOR_AVATAR ||
      "https://api.dicebear.com/9.x/shapes/svg?seed=Screendrop",
  };
  const origin = new URL(c.req.url).origin;

  if (row.media_type === "video") {
    return c.html(<VideoPage upload={row} author={author} origin={origin} />);
  }

  return c.html(<ImagePage upload={row} author={author} origin={origin} />);
});

// Home
app.get("/", (c) => {
  const author = {
    name: c.env.AUTHOR_NAME || "Anonymous",
    avatar:
      c.env.AUTHOR_AVATAR ||
      "https://api.dicebear.com/9.x/shapes/svg?seed=Screendrop",
  };
  return c.html(<HomePage author={author} />);
});

export default app;
