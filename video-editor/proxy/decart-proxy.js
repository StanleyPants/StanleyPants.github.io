/**
 * Decart CORS proxy — Cloudflare Worker.
 *
 * A browser page on GitHub Pages can't call https://api.decart.ai directly because
 * that API returns no CORS headers. This Worker forwards the request to Decart and
 * adds the CORS headers the browser needs. It holds NO secret — your Decart key is
 * sent from the browser as x-api-key and simply passes through.
 *
 * Deploy: paste this whole file into your Cloudflare Worker's code editor and Deploy.
 * Then set the app's "API base URL" to https://<your-worker>.workers.dev/v1
 *
 * Locked to your site via ALLOWED_ORIGINS. Use ["*"] to allow any origin.
 */

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

    try {
      const url = new URL(request.url);
      const target = UPSTREAM + url.pathname + url.search;

      // Forward method, headers (incl. x-api-key), and body verbatim.
      const resp = await fetch(new Request(target, request));

      // Copy the upstream response and attach CORS (works for JSON and binary video).
      const out = new Response(resp.body, resp);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      return out;
    } catch (err) {
      // Always return CORS headers, even on failure, so the browser sees the error.
      return new Response(
        JSON.stringify({ error: "Proxy could not reach Decart", detail: String(err) }),
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
