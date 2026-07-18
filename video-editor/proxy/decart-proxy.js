/**
 * Decart CORS proxy — Cloudflare Worker.
 *
 * A browser page on GitHub Pages can't call https://api.decart.ai directly (no CORS
 * headers). This Worker forwards the request to Decart and adds the CORS headers the
 * browser needs. It holds NO secret — your Decart key is sent from the browser as
 * x-api-key and passes through.
 *
 * It forwards a CLEAN, curl-like request: only x-api-key + content-type reach Decart.
 * Browser-only headers (Origin, Referer, Sec-Fetch-*, User-Agent) are dropped because
 * Decart's edge rejects them with a 405. The body is buffered so it is sent with a
 * Content-Length instead of chunked. EVERYTHING runs inside try/catch, so any failure
 * still returns CORS headers (you get a real error, never an opaque "Failed to fetch").
 *
 * Deploy: paste this whole file into your Cloudflare Worker and Deploy.
 * App "API base URL": https://<your-worker>.workers.dev/v1
 *
 * Locked to your site via ALLOWED_ORIGINS. Use ["*"] to allow any origin.
 */

const ALLOWED_ORIGINS = ["https://stanleypants.github.io"];
const UPSTREAM = "https://api.decart.ai";
const FORWARD_HEADERS = ["x-api-key", "content-type", "accept"];

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(request.url);
      const target = UPSTREAM + url.pathname + url.search;

      // Only forward the headers Decart needs (drop browser Origin/Referer/Sec-Fetch-*).
      const headers = new Headers();
      for (const name of FORWARD_HEADERS) {
        const v = request.headers.get(name);
        if (v) headers.set(name, v);
      }
      if (!headers.has("accept")) headers.set("accept", "*/*");

      // Buffer the body so it is sent with Content-Length (curl-like), not chunked.
      let body;
      if (request.method !== "GET" && request.method !== "HEAD") {
        body = await request.arrayBuffer();
      }

      const resp = await fetch(target, { method: request.method, headers, body });

      // Copy the upstream response and attach CORS (works for JSON and binary video).
      const out = new Response(resp.body, resp);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      return out;
    } catch (err) {
      // Always return CORS headers, even on failure, so the browser sees the error.
      return new Response(
        JSON.stringify({ error: "Proxy error", detail: String((err && err.stack) || err) }),
        { status: 502, headers: { "content-type": "application/json", ...cors } }
      );
    }
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
