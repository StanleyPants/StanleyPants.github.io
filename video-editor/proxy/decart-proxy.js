/**
 * Decart CORS proxy — Cloudflare Worker.
 *
 * Purpose: a browser page served from GitHub Pages can't call https://api.decart.ai
 * directly because that API doesn't return CORS headers. This Worker forwards the
 * request to Decart and adds the CORS headers the browser needs.
 *
 * It holds NO secret. Your Decart key is still sent from the browser (the app's
 * "API key" field) as the x-api-key header and simply passes through.
 *
 * It forwards a CLEAN request that mimics curl: only x-api-key + content-type are
 * sent upstream (browser Origin/Referer/Sec-Fetch-* headers are dropped, since some
 * upstream WAFs reject them), and the body is buffered so it goes with a proper
 * Content-Length instead of chunked streaming (which nginx can reject with a 405).
 *
 * Deploy (dashboard, no CLI needed):
 *   1. Open your Worker in dash.cloudflare.com -> edit its code
 *   2. Replace everything with this whole file, then Deploy
 *   3. API base URL in the app stays: https://<your-worker>.workers.dev/v1
 *
 * Locked to your site by default via ALLOWED_ORIGINS. Use ["*"] to allow any origin.
 */

const ALLOWED_ORIGINS = ["https://stanleypants.github.io"];
const UPSTREAM = "https://api.decart.ai";

// Only these request headers are forwarded upstream (case-insensitive).
const FORWARD_HEADERS = ["x-api-key", "content-type", "accept"];

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

    // Build a clean request that looks like curl (no browser-only headers).
    const headers = new Headers();
    for (const name of FORWARD_HEADERS) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }
    if (!headers.has("accept")) headers.set("accept", "*/*");

    // Buffer the body so Content-Length is set (curl-like), not chunked.
    const method = request.method;
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

    let resp;
    try {
      resp = await fetch(target, { method, headers, body, redirect: "follow" });
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
