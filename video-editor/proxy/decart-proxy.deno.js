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

// Rich, browser-like headers to reduce eBay's bot 403s on the HTML fetch.
const RICH_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "sec-ch-ua": '"Chromium";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const reqUrl = new URL(request.url);

  // ---- Version marker -----------------------------------------------------
  if (reqUrl.pathname === "/__whoami") {
    return text("decart-proxy DENO v7 (ebay-rss+decart)", cors);
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

  // Try candidate URLs in order. eBay 403s datacenter IPs on the HTML page more
  // readily than on the RSS feed, so we try the page first, then the RSS variant.
  const candidates = [target];
  const rss = withParam(target, "_rss", "1");
  if (rss && rss !== target) candidates.push(rss);

  let lastStatus = 0;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { headers: RICH_HEADERS, redirect: "follow" });
      lastStatus = resp.status;
      if (!resp.ok) continue;
      const bodyText = await resp.text();
      const isRss = /_rss=1/.test(url) || /<rss\b/i.test(bodyText) || bodyText.startsWith("<?xml");
      const listings = isRss ? parseEbayRss(bodyText, 10) : parseEbayListings(bodyText, 10);
      if (listings.length) return json({ listings, source: isRss ? "rss" : "html" }, cors, 200);
    } catch { /* try next candidate */ }
  }

  const msg = lastStatus === 403 || lastStatus === 429
    ? `eBay blocked the request (HTTP ${lastStatus}) — its bot protection. Try an eBay search URL like ` +
      `https://www.ebay.com/sch/i.html?_nkw=KEYWORDS, or see the README about eBay's official API.`
    : lastStatus
      ? `eBay returned ${lastStatus} and no listings were found.`
      : "Couldn't reach eBay.";
  return json({ error: msg, listings: [] }, cors, 200);
}

// Add or replace a query param on a URL, returning the new URL string (or null).
function withParam(urlStr, key, value) {
  try {
    const u = new URL(urlStr);
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Parse eBay RSS (feed) items into listings. Each <item> has a title and usually a
 * thumbnail via <enclosure>, media:content/thumbnail, or an <img> in the description.
 */
function parseEbayRss(xml, limit) {
  const listings = [];
  const seen = new Set();
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    if (listings.length >= limit) break;

    const titleM = item.match(/<title>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/title>/i);
    const title = titleM ? decodeEntities(titleM[1]).trim() : "";

    let img =
      (item.match(/<enclosure[^>]+url="([^"]+ebayimg[^"]+)"/i) || [])[1] ||
      (item.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+ebayimg[^"]+)"/i) || [])[1] ||
      (item.match(/<img[^>]+src="([^"]+ebayimg\.com[^"]+)"/i) || [])[1];
    if (!img) continue;

    img = img.replace(/^http:/i, "https:").replace(/\/s-l\d+\./i, "/s-l500.");
    const idM = img.match(/\/g\/([^/]+)/i) || img.match(/\/images\/([^/]+)/i);
    const key = idM ? idM[1] : img;
    if (seen.has(key)) continue;
    seen.add(key);
    listings.push({ title, image: img });
  }
  return listings;
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
