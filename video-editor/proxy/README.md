# Decart CORS proxy

The Decart API doesn't send CORS headers, so a static page (like this one on GitHub Pages)
can't call `https://api.decart.ai` directly from the browser — you get a
**"Failed to fetch" / CORS** error. This tiny proxy fixes that: it forwards your request to
Decart and adds the CORS header the browser requires.

It holds **no secret**. Your Decart key is still typed into the app and passes through as the
`x-api-key` header, so there's nothing here to leak and every caller must bring their own key.

## Deploy as a Cloudflare Worker (easiest — no CLI, free)

1. Sign in at **https://dash.cloudflare.com** (create a free account if needed).
2. **Workers & Pages → Create → Create Worker**.
3. Give it a name (e.g. `decart-proxy`) → **Deploy** → **Edit code**.
4. Delete the sample code, paste in all of [`decart-proxy.js`](./decart-proxy.js), then **Deploy**.
5. Copy the Worker URL, e.g. `https://decart-proxy.yourname.workers.dev`.
6. In the video editor: **⚙️ API Settings → API base URL**, enter:
   ```
   https://decart-proxy.yourname.workers.dev/v1
   ```
7. Add your Decart key as usual and edit a video — the CORS error is gone.

By default the proxy is **locked to `https://stanleypants.github.io`** — only your site can use it
from a browser. To allow another origin (e.g. local testing), add it to the `ALLOWED_ORIGINS` list
in `decart-proxy.js`, for example:

```js
const ALLOWED_ORIGINS = ["https://stanleypants.github.io", "http://localhost:8000"];
```

Use `["*"]` to allow any origin.

## Alternatives

Any host that can run a small forwarding function works — Deno Deploy, Vercel/Netlify functions,
or your own server. The logic is the same: forward the request to `https://api.decart.ai` and
return the response with `Access-Control-Allow-Origin` set.
