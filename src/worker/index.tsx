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
  created_at: string;
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
  const description = `Shared by ${author.name} via OpenShot${dimensions ? ` \u00b7 ${dimensions}` : ""}`;

  return (
    <BaseLayout
      title={`${upload.filename} — OpenShot Cloud`}
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
              <div class="rounded-lg shadow-md ring-1 ring-neutral-200 shadow-black/[.07]">
                <img
                  src={imageSrc}
                  alt={escapeHtml(upload.filename)}
                  class="max-h-full w-full rounded-lg bg-white object-contain"
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
      </script>`}
    </BaseLayout>
  );
};

// ── Home Page ────────────────────────────────────────────

const HomePage: FC<{ author: { name: string; avatar: string } }> = ({
  author,
}) => (
  <BaseLayout
    title="OpenShot Cloud"
    description="Screenshot sharing powered by OpenShot"
  >
    <div class="flex h-dvh w-full flex-col items-center justify-center bg-neutral-100">
      <div class="flex flex-col items-center gap-4">
        <img
          src={author.avatar}
          class="h-14 w-14 rounded-full"
          alt={escapeHtml(author.name)}
        />
        <div class="text-center">
          <h1 class="text-xl font-semibold text-neutral-900">OpenShot Cloud</h1>
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

    await c.env.BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || "image/png" },
      customMetadata: { originalName: file.name },
    });

    await c.env.DB.prepare(
      `INSERT INTO uploads (id, filename, content_type, size, width, height, r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        file.name,
        file.type || "image/png",
        file.size,
        width ? parseInt(width, 10) : null,
        height ? parseInt(height, 10) : null,
        r2Key,
      )
      .run();

    const origin = new URL(c.req.url).origin;
    return c.json(
      { id, url: `${origin}/${id}`, filename: file.name, size: file.size },
      201,
    );
  },
);

// Serve raw image from R2
app.get("/api/image/:id", async (c) => {
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
});

// ── Page Routes ──────────────────────────────────────────

// Image viewer
app.get("/:id{[a-f0-9]{8}}", async (c) => {
  const { id } = c.req.param();

  const row = await c.env.DB.prepare(
    "SELECT id, filename, content_type, size, width, height, created_at FROM uploads WHERE id = ?",
  )
    .bind(id)
    .first<Upload>();

  if (!row) return c.notFound();

  const author = {
    name: c.env.AUTHOR_NAME || "Anonymous",
    avatar:
      c.env.AUTHOR_AVATAR ||
      "https://api.dicebear.com/9.x/shapes/svg?seed=OpenShot",
  };
  const origin = new URL(c.req.url).origin;

  return c.html(<ImagePage upload={row} author={author} origin={origin} />);
});

// Home
app.get("/", (c) => {
  const author = {
    name: c.env.AUTHOR_NAME || "Anonymous",
    avatar:
      c.env.AUTHOR_AVATAR ||
      "https://api.dicebear.com/9.x/shapes/svg?seed=OpenShot",
  };
  return c.html(<HomePage author={author} />);
});

export default app;
