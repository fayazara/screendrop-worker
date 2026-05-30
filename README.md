# Screendrop Worker

The cloud backend for [Screendrop](https://github.com/fayazara/screendrop), an open-source native macOS screenshot tool. This worker handles uploading, storing, and sharing screenshots and screen recordings via shareable links.

Built with [Hono](https://hono.dev) on [Cloudflare Workers](https://developers.cloudflare.com/workers/), using [R2](https://developers.cloudflare.com/r2/) for file storage and [D1](https://developers.cloudflare.com/d1/) for metadata.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fayazara/screendrop-worker)

## How it works

1. The Screendrop macOS app captures a screenshot or screen recording
2. The file is uploaded to this worker (either via multipart form or streaming upload)
3. The worker stores the file in R2 and creates a metadata row in D1
4. A shareable link is returned (e.g. `https://your-worker.workers.dev/a1b2c3d4`)
5. Anyone with the link sees a clean viewer page with download, copy link, and copy image actions

## Deploy

The smoothest path is to start from the Screendrop app:

1. Open **Screendrop → Settings → Cloud**. The app generates a secure `UPLOAD_TOKEN` for you — copy it.
2. Click **Deploy to Cloudflare** (the button above, also available in the app). The deploy flow will:
   - Clone this repo into your GitHub account
   - Automatically provision an R2 bucket and D1 database
   - Prompt you for the `UPLOAD_TOKEN` secret — **paste the token you copied from the app**
   - Deploy the worker and set up CI/CD via Workers Builds
3. Back in the app, paste your worker URL (the token is already filled in) and click **Verify Connection**.

**Database schema:** the worker provisions its own D1 schema at runtime (it is created
idempotently on `/api/setup` and self-heals on the first upload), so there is no manual
migration step after a one-click deploy. `Verify Connection` calls `/api/setup` for you.

## Updating your worker

When you deploy with the button, Cloudflare **clones** this repo into your own
GitHub account and connects it to Workers Builds. Your copy is independent — it
does not auto-update when this upstream repo changes. The Screendrop app checks
the deployed worker's version (via `/api/version`) and shows a non-blocking
notice when an update is available.

Updating is a one-time setup, then a quick sync. Any push to your clone's
default branch triggers a Workers Builds redeploy automatically, and the
database schema migrates itself, so there are no manual steps after the push.

```bash
# In a local checkout of YOUR clone (one time only):
git remote add upstream https://github.com/fayazara/screendrop-worker.git

# To update:
git fetch upstream
git merge upstream/main      # or: git rebase upstream/main
git push origin main         # Workers Builds redeploys automatically
```

Notes:

- Your secrets (`UPLOAD_TOKEN`, `AUTHOR_NAME`, `AUTHOR_AVATAR`) live in Cloudflare,
  not in the repo, so syncing never touches them.
- If you edited the worker code yourself, you may need to resolve merge conflicts.
- After the redeploy, click **Verify Connection** in the app to confirm.

### Manual setup

If you prefer to deploy manually:

```bash
git clone https://github.com/fayazara/screendrop-worker.git
cd screendrop-worker
npm install

# Set your upload token as a secret
wrangler secret put UPLOAD_TOKEN

# Deploy (auto-provisions R2 + D1, then applies migrations)
npm run deploy
```

## API

All API routes are CORS-enabled. Routes marked with a lock require a Bearer token (`UPLOAD_TOKEN`).

| Method | Route            | Auth   | Description                                         |
| ------ | ---------------- | ------ | --------------------------------------------------- |
| `GET`  | `/api/version`   | Public | Returns the deployed worker version                 |
| `POST` | `/api/setup`     | Bearer | Idempotently provision the D1 schema                |
| `GET`  | `/api/ping`      | Bearer | Connection health check (returns `version`)         |
| `POST` | `/api/upload`    | Bearer | Multipart file upload                               |
| `PUT`  | `/api/upload`    | Bearer | Streaming upload (raw bytes, metadata via headers)  |
| `POST` | `/api/register`  | Bearer | Register metadata for a file already uploaded to R2 |
| `GET`  | `/api/media/:id` | Public | Serve raw file from R2                              |
| `GET`  | `/:id`           | Public | Image/video viewer page with OG tags                |

### Upload (multipart)

```bash
curl -X POST https://your-worker.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@screenshot.png" \
  -F "width=1920" \
  -F "height=1080"
```

### Upload (streaming)

For large files. The request body is the raw file — no buffering in Worker memory.

```bash
curl -X PUT https://your-worker.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: image/png" \
  -H "X-Filename: screenshot.png" \
  -H "X-Width: 1920" \
  -H "X-Height: 1080" \
  --data-binary @screenshot.png
```

### Response

```json
{
  "id": "a1b2c3d4",
  "url": "https://your-worker.workers.dev/a1b2c3d4",
  "filename": "screenshot.png",
  "size": 204800
}
```

## Configuration

### Secrets

Set via `wrangler secret put`, or prompted automatically during the Deploy to Cloudflare flow (defined in `.dev.vars.example`):

| Secret          | Description                                                         | Required |
| --------------- | ------------------------------------------------------------------- | -------- |
| `UPLOAD_TOKEN`  | Shared token for authenticating uploads (generated by the Screendrop app) | Yes      |
| `AUTHOR_NAME`   | Display name shown on shared pages (falls back to `Anonymous`)      | No       |
| `AUTHOR_AVATAR` | Avatar URL shown on shared pages (falls back to a generated avatar) | No       |

### Bindings (auto-provisioned)

| Type | Binding  | Purpose                                     |
| ---- | -------- | ------------------------------------------- |
| R2   | `BUCKET` | File storage for screenshots and recordings |
| D1   | `DB`     | SQLite database for upload metadata         |

## Development

```bash
npm install
npm run dev
```

This starts a local dev server at `http://localhost:5173` with hot reload. Local R2 and D1 resources are created automatically and persist between runs.

### Database migrations

```bash
# Apply migrations locally
npm run db:migrate:local

# Apply migrations to production
npm run db:migrate:remote
```

## License

MIT
