# eBay Try-On Video Generator 🛍️🎬

Upload **one** video, paste an **eBay** seller/store/search URL, pick **up to 5** listings, and
generate **one AI video per selected item** — the input video combined with each listing's image as
the `reference_image`, via [Decart.ai](https://platform.decart.ai/)'s try-on model.

**Live:** `https://stanleypants.github.io/ebay-tryon/`

## How it works

```
input video ─┐
             ├─► Decart job (data=video, reference_image=item 1)  ─► output video 1
item 1 ──────┘
input video ─┐
             ├─► Decart job (data=video, reference_image=item 2)  ─► output video 2
item 2 ──────┘   … up to 5
```

1. **Source video** — drop in a short clip (a person, for try-on).
2. **eBay listings** — paste a URL like `https://www.ebay.com/sch/i.html?_ssn=SELLER`. The proxy
   fetches the page server-side and returns the first 10 listing images. Select up to 5.
3. **Generate** — one Decart job per selected item runs concurrently; each output appears in its own
   card with its own progress and a download button.

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
