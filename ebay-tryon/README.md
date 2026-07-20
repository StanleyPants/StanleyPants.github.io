# eBay Motion Studio 🎬

Upload **one** video, paste an **eBay** seller/store/search URL, pick **up to 5** listings, and
generate **one AI video per selected item** — the input video combined with each listing's image as
the `reference_image`, via [Decart.ai](https://platform.decart.ai/)'s try-on model.

**Live:** `https://stanleypants.github.io/ebay-tryon/`

## Optional step -1: create a character + setting (fal.ai image models)

You can start from **text only**:

Step 1 shows the **Actor** and **Setting** side by side, each with a **Create New** / **Select** toggle:

- **1a Your Video's Actor** — *Create New Actor* generates **3 candidates from 3 models** (FLUX ultra /
  Nano Banana / GPT Image 2) at 9:16 — pick your favorite. Or *Select From Your Cast* (a saved gallery of
  actors you've made/uploaded). Chosen images are saved to your **cast**.
- **1b Your Video's Setting** — same **candidate** chooser at 16:9, or *Select From Your Set Locations*.
  The actor + setting are combined by Seedance reference-to-video.

Cast and set-location libraries persist in `localStorage` (quota-safe: oldest entries drop if full).
- **1b Setting** (optional) — describe a scene/background → another generated image.
- **1c Baseline video** — Seedance combines them: with both images it uses **reference-to-video**,
  with only a character it uses **image-to-video**. Write the motion prompt using the words
  **Actor** and **Setting** — the app encodes them to Seedance's `@Image1` / `@Image2` reference
  tokens (actor first, then setting) before submitting.

So the full chain is:

**character (+ setting) images → baseline video (Seedance) → pick eBay items → try-on videos.**

Each image can also be **uploaded** instead of generated. Uses the same `FAL_KEY` and `/fal` proxy
passthrough as the video step — no extra setup. (OpenArt has no public API, so fal is used for image
generation.)

## Optional step 0: generate the baseline video from an image (fal.ai Seedance 2.0)

Instead of uploading a video, you can upload **one image** + a prompt and generate the baseline video
with **Seedance 2.0 image-to-video** (via [fal.ai](https://fal.ai)). The generated video is downloaded
and used as the baseline video for the try-on step. To enable it:

1. Get a fal.ai API key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).
2. In your Deno Deploy project → **Settings → Environment Variables**, add `FAL_KEY` = your fal key.
3. Redeploy the proxy. The proxy forwards to `queue.fal.run` with the key injected (never exposed to
   the browser); the image is sent as a data URI, so no separate upload step.

The prompt describes the motion (e.g. *"The person turns slowly to face the camera, full-body, soft
studio lighting"*). Options: duration (8/10/12/15 sec), aspect ratio (portrait/landscape/square), and audio.
Resolution is fixed at 720p.

## How it works

```
input video ─┐
             ├─► Decart job (data=video, reference_image=item 1)  ─► output video 1
item 1 ──────┘
input video ─┐
             ├─► Decart job (data=video, reference_image=item 2)  ─► output video 2
item 2 ──────┘   … up to 5
```

1. **Baseline video** — drop in a short clip (a person, for try-on).
2. **eBay listings** — paste a URL like `https://www.ebay.com/sch/i.html?_ssn=SELLER`. The proxy
   fetches the page server-side and returns the first 10 listing images. Select up to 5.
3. **Generate** — one Decart job per selected item runs concurrently; each output appears in its own
   card with its own progress and a download button.

## eBay listings: official Browse API (recommended)

eBay blocks scraping from datacenter IPs, so the proxy uses eBay's official **Browse API**. One-time setup:

1. At [developer.ebay.com](https://developer.ebay.com/) → **Application Keysets**, get your **Production**
   **App ID (Client ID)** and **Cert ID (Client Secret)**.
2. In your Deno Deploy project → **Settings → Environment Variables**, add:
   - `EBAY_CLIENT_ID` = your App ID
   - `EBAY_CLIENT_SECRET` = your Cert ID
3. Redeploy the proxy. Now the **Search** box takes keywords (or a seller/search URL) and returns real
   listings via the API. The proxy does the OAuth client-credentials flow and caches the token.

No key? A collapsed **paste** option lets you copy an eBay page's source / image URLs from your own
browser and extract the images client-side instead.

## Requirements: the Deno proxy

This app needs the **Deno** proxy from [`../video-editor/proxy/decart-proxy.deno.js`](../video-editor/proxy/decart-proxy.deno.js),
which exposes three things the browser can't do itself (all blocked by CORS):

| Endpoint | Purpose |
| --- | --- |
| `/v1/*` | Forward Decart API calls (adds CORS, strips browser headers Decart's edge rejects) |
| `/ebay?url=` | Fetch an eBay page and parse the first 10 listing images |
| `/img?url=` | Proxy an `ebayimg.com` image so it can be uploaded to Decart |

Redeploy that file to your Deno project, then set **⚙️ API Settings → API base URL** to
`https://<your-project>.deno.net/v1`. Verify with `https://<your-project>.deno.net/__whoami`
→ should print `decart-proxy DENO v6 (ebay+decart)`.

## Model

Defaults to **`lucy-vton-2`** (Decart's virtual try-on model) — it puts the item from the reference
image onto the person in the video. Switch to `lucy-vton-3`, `lucy-clip`, `lucy-2.5`, or
`lucy-restyle-2` in Settings if you want a different style of reference-guided edit.

## Notes & limitations

- **eBay may block scraping.** eBay 403s datacenter IPs (like Deno's) aggressively. The proxy sends
  browser-like headers and falls back to eBay's **RSS feed** (`&_rss=1`) for search URLs, which is
  more tolerant — so a **search URL** (`https://www.ebay.com/sch/i.html?_nkw=KEYWORDS` or `?_ssn=SELLER`)
  works far more reliably than a store page. If eBay still blocks it, the robust fix is eBay's official
  [Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html) (free developer account +
  OAuth) — ask and I can wire the proxy to use it instead of scraping.
- **API keys are client-side** — fine for a personal demo; use a key-injecting proxy for production.
- Keep clips short; 5 concurrent uploads/jobs are heavier and may hit rate limits (the app shows a
  429 message per card if so).

## Files

- `index.html` · `styles.css` · `app.js` — the app
- Shared proxy: `../video-editor/proxy/decart-proxy.deno.js`
