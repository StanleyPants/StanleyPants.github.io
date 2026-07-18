/**
 * Decart CORS proxy — Deno Deploy version.
 *
 * Same behavior as decart-proxy.js (the Cloudflare Worker) but for Deno Deploy,
 * whose browser playground deploys reliably on save.
 *
 * Deploy:
 *   1. Sign in at https://dash.deno.com (GitHub login)
 *   2. New Playground -> paste this whole file -> Save & Deploy
 *   3. Copy the URL, e.g. https://your-project.deno.dev
 *   4. In the app: Settings -> API base URL = https://your-project.deno.dev/v1
 *   5. Verify: open https://your-project.deno.dev/__whoami -> should print the marker
 *
 * Forwards a clean, curl-like request (only x-api-key, content-type, accept reach
 * Decart; browser Origin, Referer, Sec-Fetch and User-Agent headers are dropped
 * because Decart's edge 405s on them). Buffers the body for a real Content-Length.
 * Everything is inside try/catch so failures still carry CORS headers.
 */

const ALLOWED_ORIGINS = ["https://stanleypants.github.io"];
const UPSTREAM = "https://api.decart.ai";
const FORWARD_HEADERS = ["x-api-key", "content-type", "accept"];

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const reqUrl = new URL(request.url);

  // Version marker — visit /__whoami to confirm which code is deployed.
  if (reqUrl.pathname === "/__whoami") {
    return new Response("decart-proxy DENO v5 (clean-headers)", {
      status: 200,
      headers: { "content-type": "text/plain", ...cors },
    });
  }

  try {
    const target = UPSTREAM + reqUrl.pathname + reqUrl.search;

    const headers = new Headers();
    for (const name of FORWARD_HEADERS) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }
    if (!headers.has("accept")) headers.set("accept", "*/*");

    let body;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.arrayBuffer();
    }

    const resp = await fetch(target, { method: request.method, headers, body });

    const out = new Response(resp.body, resp);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Proxy error", detail: String((err && err.stack) || err) }),
      { status: 502, headers: { "content-type": "application/json", ...cors } }
    );
  }
});

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
