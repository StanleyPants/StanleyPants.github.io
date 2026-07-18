# AI Video Editor 🎬

A small, dependency-free web app that lets you **upload a video and edit it with AI text
prompts** using the [Decart.ai](https://platform.decart.ai/) API. Built as a static site so it
runs directly on GitHub Pages — no build step, no backend.

**Live:** `https://stanleypants.github.io/video-editor/`

## What it does

1. Drop in a source video (MP4 / MOV / WebM).
2. Write a prompt describing the edit — e.g. *"Restyle as hand-drawn anime with neon highlights"*.
   Optionally add a reference image.
3. The app submits the job to Decart's **Lucy** video-to-video model, polls until it's done,
   and shows the edited video with a download button.

## How it works (Decart Queue API)

All calls go straight from the browser to `https://api.decart.ai/v1`, authenticated with the
`x-api-key` header:

| Step | Request |
| --- | --- |
| Create job | `POST /v1/jobs/{model}` — `multipart/form-data` with `prompt`, `data` (the video), and optional `reference_image` → returns `{ "job_id": "…" }` |
| Poll status | `GET /v1/jobs/{job_id}` → `{ "status": "pending" \| "processing" \| "completed" \| "failed" }` |
| Get result | `GET /v1/jobs/{job_id}/content` → the edited video (binary) |

Model slugs (selectable / editable in **⚙️ API Settings**):
`lucy-fast-v2v` (fastest), `lucy-2-v2v` (higher quality), `lucy-pro-v2v`. Use the exact slug
shown in your Decart dashboard if these change.

## Using it

1. Get an API key from [platform.decart.ai](https://platform.decart.ai/).
2. Open the app, click **⚙️ API Settings**, and paste your key. It's saved only in your browser's
   `localStorage` and sent directly to Decart — nothing goes through any third-party server.
3. Add a video + prompt and hit **✨ Edit video**.

## Important notes & limitations

- **API keys are exposed in client-side apps.** This is a demo/portfolio pattern: your key is
  used directly from the browser. Do **not** hard-code a production key into a public site. For a
  real deployment, put a tiny server-side proxy in front of Decart that injects the key.
- **CORS:** Decart's API does **not** send CORS headers, so direct browser calls from a static
  page fail with "Failed to fetch". Deploy the tiny proxy in [`proxy/`](./proxy/) (a copy-paste
  Cloudflare Worker) and point **Settings → API base URL** at it — e.g.
  `https://your-worker.workers.dev/v1`. The proxy stores no key; yours just passes through.
- Keep clips short for faster turnaround. Jobs time out client-side after 10 minutes.

## Files

- `index.html` — markup
- `styles.css` — styling (dark theme, responsive)
- `app.js` — upload handling + Decart Queue API integration (create → poll → download)
- `proxy/decart-proxy.js` — optional Cloudflare Worker that adds CORS (see `proxy/README.md`)
