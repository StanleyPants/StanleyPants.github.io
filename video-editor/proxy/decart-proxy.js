/**
 * Decart CORS proxy — Cloudflare Worker.
 *
 * Purpose: a browser page served from GitHub Pages can't call https://api.decart.ai
 * directly because that API doesn't return CORS headers. This Worker forwards every
 * request through to Decart unchanged and adds the CORS headers the browser needs.
 *
 * It holds NO secret. Your Decart key is still sent from the browser (the app's
 * "API key" field) as the x-api-key header and simply passes through — so there is
 * nothing here to leak, and callers must bring their own valid key.
 *
 * Deploy (dashboard, no CLI needed):
 *   1. Sign in at https://dash.cloudflare.com  (free plan is fine)
 *   2. Workers & Pages  ->  Create  ->  Create Worker
 *   3. Name it (e.g. "decart-proxy"), Deploy, then "Edit code"
 *   4. Replace the sample with this whole file, then Deploy
 *   5. Copy the URL, e.g. https://decart-proxy.<you>.workers.dev
 *   6. In the video editor's  Settings -> API base URL  put:
 *        https://decart-proxy.<you>.workers.dev/v1
 *
 * Locked to your site by default: only requests from ALLOW_ORIGIN get CORS access.
 * Set it to "*" to allow any origin, or add more origins to the list.
 */

// Origins allowed to use this proxy from a browser. Add more if you host the app elsewhere
// (e.g. "http://localhost:8000" for local testing). Use "*" to allow everything.
const ALLOWED_ORIGINS = ["https://stanleypants.github.io"];
const UPSTREAM = "https://api.decart.ai";

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const target = UPSTREAM + url.pathname + url.search;

    // Forward method, headers (incl. x-api-key), and body verbatim.
    const upstreamReq = new Request(target, request);

    let resp;
    try {
      resp = await fetch(upstreamReq);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy could not reach Decart", detail: String(err) }),
        { status: 502, headers: { "content-type": "application/json", ...cors } }
      );
    }

    // Copy the upstream response and attach CORS headers (works for JSON and binary video).
    const out = new Response(resp.body, resp);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

// Echo the caller's Origin only when it's on the allow-list (or when "*" is allowed).
function corsHeaders(origin) {
  const allowAll = ALLOWED_ORIGINS.includes("*");
  const allowed = allowAll ? "*" : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "x-api-key, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
