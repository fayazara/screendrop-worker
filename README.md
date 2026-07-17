# Screendrop Worker

The cloud backend for [Screendrop](https://github.com/fayazara/screendrop), an open-source native macOS screenshot tool. This worker handles uploading, storing, and sharing screenshots and screen recordings via shareable links.

Built with [TanStack Start](https://tanstack.com/start/latest) on [Cloudflare Workers](https://developers.cloudflare.com/workers/), with [Kumo](https://kumo-ui.com/) for the UI, [R2](https://developers.cloudflare.com/r2/) for file storage, and [D1](https://developers.cloudflare.com/d1/) for metadata.

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

Deploy-button clones may not share commit history with this repository. The
first update therefore needs to connect the two histories while replacing the
application files with the current upstream version. Later updates are normal
Git merges.

### First update of a deploy-button clone

Before starting, open the clone's existing `wrangler.json` and save these
deployment-specific values:

- The Worker `name`
- The D1 `database_id` and `database_name`
- The R2 `bucket_name` and `preview_bucket_name`, if present

These values point at your existing Worker, database, and bucket. Do not replace
them with the blank auto-provisioning bindings from this template.

In a local checkout of your clone:

```bash
git switch main
git pull --ff-only
git switch -c update-from-upstream

# Add the template as an upstream remote. This is needed only once per checkout.
git remote add upstream https://github.com/fayazara/screendrop-worker.git
git fetch upstream

# Connect the independent histories, then use the upstream application tree.
git merge --allow-unrelated-histories --strategy=ours --no-commit upstream/main
git restore --source=upstream/main --staged --worktree .
```

The upstream tree uses `wrangler.jsonc`. Update it with the resource values you
saved above:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<YOUR_EXISTING_WORKER_NAME>",
  "main": "@tanstack/react-start/server-entry",
  "compatibility_date": "2026-07-17",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true
  },
  "upload_source_maps": true,
  "d1_databases": [
    {
      "binding": "DB",
      "database_id": "<YOUR_EXISTING_DATABASE_ID>",
      "database_name": "<YOUR_EXISTING_DATABASE_NAME>",
      "migrations_dir": "drizzle"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "<YOUR_EXISTING_BUCKET_NAME>",
      "preview_bucket_name": "<YOUR_EXISTING_PREVIEW_BUCKET_NAME>"
    }
  ]
}
```

Validate, commit, and deploy the update:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run build

git add -A
git commit -m "Sync with Screendrop Worker upstream"
git switch main
git merge --ff-only update-from-upstream
git push origin main
```

The merge commit permanently connects the histories. A push to `main` triggers
Workers Builds and updates the existing Worker because its name and bindings
were preserved.

### Future updates

After the first update, syncing is much simpler:

```bash
git switch main
git pull --ff-only
git fetch upstream
git merge upstream/main

# If wrangler.jsonc conflicts, keep your existing Worker and resource values.
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
git push origin main
```

Notes:

- Your secrets (`UPLOAD_TOKEN`, `AUTHOR_NAME`, `AUTHOR_AVATAR`) live in
  Cloudflare, not in the repository, so syncing does not replace them.
- Do not run `db:migrate:remote` when updating an existing deployment. After
  the redeploy, click **Verify Connection** in Screendrop; `/api/setup` safely
  upgrades the existing schema without deleting uploads.
- If you maintain custom code in your clone, perform the update on a branch and
  review the diff before merging it into `main`.

### Manual setup

If you prefer to deploy manually:

```bash
git clone https://github.com/fayazara/screendrop-worker.git
cd screendrop-worker
pnpm install

# Set your upload token as a secret
wrangler secret put UPLOAD_TOKEN

# Deploy (auto-provisions R2 + D1; the schema self-provisions at runtime)
pnpm run deploy
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
pnpm install
pnpm run dev
```

This starts a local dev server at `http://localhost:3000` with hot reload. Local R2 and D1 resources are created automatically and persist between runs.

### Database migrations

```bash
# Apply migrations locally
pnpm run db:migrate:local

# Apply migrations to production
pnpm run db:migrate:remote
```

## License

MIT
