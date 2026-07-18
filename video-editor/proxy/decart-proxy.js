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
 * Optional: lock it to your site by setting ALLOW_ORIGIN below to your Pages origin
 * (e.g. "https://stanleypants.github.io"). "*" allows any origin.
 */

const ALLOW_ORIGIN = "*";
const UPSTREAM = "https://api.decart.ai";

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
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
        { status: 502, headers: { "content-type": "application/json", ...corsHeaders() } }
      );
    }

    // Copy the upstream response and attach CORS headers (works for JSON and binary video).
    const out = new Response(resp.body, resp);
    const cors = corsHeaders();
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "x-api-key, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
