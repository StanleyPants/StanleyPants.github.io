/**
 * Decart CORS proxy + eBay helper — Deno Deploy version.
 *
 * Endpoints:
 *   GET  /__whoami            -> version string (to confirm which code is live)
 *   GET  /ebay?url=<sellerUrl> -> { listings: [{ title, image, itemUrl }] } (first 10)
 *   GET  /img?url=<imageUrl>  -> proxied image bytes (ebayimg.com only) with CORS
 *   *    (/v1/...)            -> forwarded to https://api.decart.ai with CORS added
 *
 * Why this exists: a browser page on GitHub Pages can't call api.decart.ai (no CORS
 * headers), can't scrape an eBay page (CORS), and can't read eBay image bytes to
 * upload them (CORS). This proxy handles all three server-side. It holds NO secret —
 * your Decart key is sent from the browser as x-api-key and passes through.
 *
 * For the Decart forwarding it sends a clean, curl-like request: only
 * x-api-key/content-type/accept reach Decart (browser Origin, Referer, Sec-Fetch and
 * User-Agent headers are dropped, since Decart's edge 405s on them) and the body is
 * buffered so it goes with a real Content-Length.
 *
 * Deploy: paste this whole file into a Deno Deploy playground -> Save & Deploy.
 * Verify: open https://<your-project>.deno.net/__whoami
 */

const ALLOWED_ORIGINS = ["https://stanleypants.github.io"];
const UPSTREAM = "https://api.decart.ai";
const FORWARD_HEADERS = ["x-api-key", "content-type", "accept"];

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const reqUrl = new URL(request.url);

  // ---- Version marker -----------------------------------------------------
  if (reqUrl.pathname === "/__whoami") {
    return text("decart-proxy DENO v6 (ebay+decart)", cors);
  }

  // ---- eBay listings ------------------------------------------------------
  if (reqUrl.pathname === "/ebay") {
    return handleEbay(reqUrl, cors);
  }

  // ---- eBay image proxy ---------------------------------------------------
  if (reqUrl.pathname === "/img") {
    return handleImg(reqUrl, cors);
  }

  // ---- Decart API forwarding ----------------------------------------------
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
    return json({ error: "Proxy error", detail: String((err && err.stack) || err) }, cors, 502);
  }
});

// ---------------------------------------------------------------------------
async function handleEbay(reqUrl, cors) {
  const target = reqUrl.searchParams.get("url");
  if (!target) return json({ error: "Missing ?url=" }, cors, 400);

  let host;
  try {
    host = new URL(target).hostname;
  } catch {
    return json({ error: "Invalid url" }, cors, 400);
  }
  if (!/(^|\.)ebay\.[a-z.]+$/i.test(host)) {
    return json({ error: "Only ebay.com URLs are allowed" }, cors, 400);
  }

  try {
    const resp = await fetch(target, {
      headers: {
        "user-agent": BROWSER_UA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!resp.ok) {
      return json({ error: `eBay returned ${resp.status}`, listings: [] }, cors, 200);
    }
    const html = await resp.text();
    const listings = parseEbayListings(html, 10);
    return json({ listings, count: listings.length }, cors, 200);
  } catch (err) {
    return json({ error: "Failed to fetch eBay page", detail: String(err), listings: [] }, cors, 200);
  }
}

async function handleImg(reqUrl, cors) {
  const target = reqUrl.searchParams.get("url");
  if (!target) return json({ error: "Missing ?url=" }, cors, 400);

  let host;
  try {
    host = new URL(target).hostname;
  } catch {
    return json({ error: "Invalid url" }, cors, 400);
  }
  if (!/ebayimg\.com$/i.test(host)) {
    return json({ error: "Only ebayimg.com images are allowed" }, cors, 400);
  }

  try {
    const resp = await fetch(target, { headers: { "user-agent": BROWSER_UA } });
    const out = new Response(resp.body, { status: resp.status });
    out.headers.set("content-type", resp.headers.get("content-type") || "image/jpeg");
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  } catch (err) {
    return json({ error: "Failed to fetch image", detail: String(err) }, cors, 502);
  }
}

/**
 * Best-effort parse of eBay listing thumbnails from server-rendered HTML.
 * Finds <img> tags whose source is on i.ebayimg.com, dedupes by image id, and
 * upgrades the thumbnail to a larger (s-l500) version for a better reference image.
 */
function parseEbayListings(html, limit) {
  const listings = [];
  const seen = new Set();

  const tags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (listings.length >= limit) break;

    const srcM =
      tag.match(/\b(?:data-src|data-img-src|src)="([^"]+ebayimg\.com[^"]+)"/i) ||
      tag.match(/\bsrcset="([^"]*ebayimg\.com[^"]*)"/i);
    if (!srcM) continue;

    let src = srcM[1].split(/\s|,/)[0]; // first url if srcset
    src = src.replace(/^http:/i, "https:");
    if (!/i\.ebayimg\.com/i.test(src)) continue;

    const idM = src.match(/\/g\/([^/]+)/i) || src.match(/\/images\/([^/]+)/i);
    const key = idM ? idM[1] : src;
    if (seen.has(key)) continue;
    seen.add(key);

    const altM = tag.match(/\balt="([^"]*)"/i);
    const title = altM ? decodeEntities(altM[1]).trim() : "";

    const image = src.replace(/\/s-l\d+\./i, "/s-l500.");
    listings.push({ title, image });
  }
  return listings;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// ---------------------------------------------------------------------------
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

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

function text(str, cors, status = 200) {
  return new Response(str, { status, headers: { "content-type": "text/plain", ...cors } });
}
