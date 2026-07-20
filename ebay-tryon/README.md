# eBay Motion Studio 🎬

Upload **one** video, paste an **eBay** seller/store/search URL, pick **up to 5** listings, and
generate **one AI video per selected item** — the input video combined with each listing's image as
the `reference_image`, via [Decart.ai](https://platform.decart.ai/)'s try-on model.

**Live:** `https://stanleypants.github.io/ebay-tryon/`

## Optional step -1: create a character + setting (fal.ai image models)

You can start from **text only**:

Step 1 shows the **Actor** and **Setting** side by side, each with a **Create New** / **Select** toggle:

- **1a Your Video's Actor** — *Create New Actor* generates **4 candidates** (all Nano Banana, each nudged
  by a different pose/angle so they vary) at 9:16 — pick your favorite. You only describe the person's
  appearance and wardrobe; the framing is **fixed** to a full-body studio audition photo on a plain white
  background. Or *Select From Your Cast* (a saved gallery of actors you've made/uploaded). Chosen images
  are saved to your **cast**.
- **1b Your Video's Setting** — same **4-candidate** chooser (varied lighting/angle) at 16:9, or
  *Select From Your Set Locations*.

Cast and set-location libraries persist in `localStorage` (quota-safe: oldest entries drop if full).
- **1b Setting** (optional) — describe a scene/background → another generated image.
- **1c Motion Magic** — instead of typing a prompt, pick a **Template**, a **Director**, and a **Vibe**,
  and choose **Include Sound** (Yes/No). Templates live in [`templates.js`](templates.js), directors in
  [`directors.js`](directors.js), and vibes in [`vibes.js`](vibes.js) (see below). The baseline video is
  made with **Kling 2.5 Turbo Pro** image-to-video (it permits human subjects, unlike Seedance). Kling
  animates a **single** image: if you chose a Setting, the app first composites the actor into that scene
  with **Nano Banana** (image edit), then animates the composite; with only an actor, it animates the
  actor image directly.

### Motion Magic templates (`templates.js`)

The baseline-video motion is defined by templates in `templates.js` — edit that one file to add or
change them (no app-code changes needed). Each entry has an `id`, a dropdown `label`, a `prompt`
(referring to `Actor` / `Setting`), and a `sound` description. The `sound` is appended to the prompt
as an audio cue and turns on video audio generation **only** when the **Include Sound** dropdown is
set to **Yes**.

### Directors (`directors.js`)

A **Director** is a one-sentence stylistic modifier layered on top of the selected template. Directors
live in `directors.js` — each has an `id`, a dropdown `label` (the director name), and a one-sentence
`modifier`. The app appends the chosen director's `modifier` to the template prompt (after the template
text, before the audio cue), so it shapes the overall look without changing the template's motion. Five
archetypal directors ship by default (Epic Visionary, Intimate Realist, Neon Stylist, Vintage Romantic,
Kinetic Energizer).

### Vibes (`vibes.js`)

A **Vibe** is a one-sentence mood modifier layered on the template alongside the Director. Vibes live in
`vibes.js` — each has an `id`, a dropdown `label`, and a one-sentence `modifier`. The app appends the
chosen vibe's `modifier` after the director's modifier (before the audio cue). Six vibes ship by default
(Playful, Luxurious, Mysterious, Dreamy, Bold & Edgy, Serene).

So the full chain is:

**character (+ setting) images → baseline video (Kling) → pick eBay items → try-on videos.**

Each image can also be **uploaded** instead of generated. Uses the same `FAL_KEY` and `/fal` proxy
passthrough as the video step — no extra setup. (OpenArt has no public API, so fal is used for image
generation.)

## Optional step 0: generate the baseline video from an image (fal.ai Kling 2.5)

Instead of uploading a video, you can build an actor (+ optional setting) and generate the baseline video
with **Kling 2.5 Turbo Pro image-to-video** (via [fal.ai](https://fal.ai)) — it permits human subjects,
which Seedance does not. The generated video is downloaded and used as the baseline video for the try-on
step. To enable it:

1. Get a fal.ai API key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).
2. In your Deno Deploy project → **Settings → Environment Variables**, add `FAL_KEY` = your fal key.
3. Redeploy the proxy. The proxy forwards to `queue.fal.run` with the key injected (never exposed to
   the browser); the image is sent as a data URI, so no separate upload step.

The selected **template** describes the motion (and its sound). Options: duration (5 or 10 sec) and
Include Sound (Yes/No). The source image and video are always **16:9** — with a setting the actor is
composited into the scene at 16:9; without one the actor's portrait is reframed onto a 16:9 studio
backdrop, so Kling (which inherits the image's aspect) always outputs 16:9.

## How it works

```
input video ─┐
             ├─► Decart job (data=video, reference_image=item 1)  ─► output video 1
item 1 ──────┘
input video ─┐
             ├─► Decart job (data=video, reference_image=item 2)  ─► output video 2
item 2 ──────┘   … up to 5
```

1. **Baseline video** — cast an actor (and optionally a set); the app stages a 16:9 composite shot,
   shows it under **Generate baseline video**, then animates it with Kling when you hit the button.
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

Fixed to **`lucy-latest`** (Decart's current reference-guided video model) — it applies the item from
each listing's reference image onto the person in the baseline video.

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
- `templates.js` — Motion Magic template definitions (edit to change the motion presets)
- `directors.js` — Director definitions (one-sentence style modifiers layered on a template)
- `vibes.js` — Vibe definitions (one-sentence mood modifiers layered on a template)
- `reel.svg` — app icon
- Shared proxy: `../video-editor/proxy/decart-proxy.deno.js`
