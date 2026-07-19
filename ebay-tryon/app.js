/* eBay Try-On Video Generator — Decart.ai (client-side).
 *
 * Flow:
 *   1. Upload one source video.
 *   2. Paste an eBay seller/store/search URL -> proxy /ebay fetches the page and
 *      returns the first 10 listing images.
 *   3. Select up to 5 listings.
 *   4. For each selected listing, submit a Decart job:
 *        POST {base}/jobs/{model}  form-data { data: <video>, reference_image: <listing image>, prompt? }
 *      then poll {base}/jobs/{id} and download {base}/jobs/{id}/content.
 *   -> up to 5 output videos, one per selected item.
 *
 * The proxy (Deno) also exposes /ebay?url= and /img?url= so the browser can read
 * eBay HTML and image bytes despite CORS.
 */

const DEFAULT_API_BASE = "https://salty-osprey-9099.stanleypants.deno.net/v1";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SELECT = 5;

const $ = (id) => document.getElementById(id);
const els = {
  settingsToggle: $("settingsToggle"),
  settingsPanel: $("settingsPanel"),
  apiKey: $("apiKey"),
  toggleKey: $("toggleKey"),
  model: $("model"),
  apiBase: $("apiBase"),

  dropzone: $("dropzone"),
  fileInput: $("fileInput"),
  sourcePreview: $("sourcePreview"),
  dzEmpty: document.querySelector(".dz-empty"),
  fileMeta: $("fileMeta"),

  ebayUrl: $("ebayUrl"),
  loadBtn: $("loadBtn"),
  pasteBox: $("pasteBox"),
  extractBtn: $("extractBtn"),
  listingsStatus: $("listingsStatus"),
  listingsGrid: $("listingsGrid"),
  selCount: $("selCount"),
  prompt: $("prompt"),

  generateBtn: $("generateBtn"),
  inlineError: $("inlineError"),
  resultsPanel: $("resultsPanel"),
  outputGrid: $("outputGrid"),
};

// Shared with the other editor on this site (same origin).
const LS_KEY = "decart_api_key";
const LS_BASE = "decart_api_base";
const LS_MODEL = "decart_tryon_model"; // separate: this app defaults to a try-on model

let videoFile = null;
let listings = [];             // { title, image }
let selected = [];             // indices into listings, in click order (max 5)
let running = false;

// ---- Init -----------------------------------------------------------------
(function init() {
  const savedKey = localStorage.getItem(LS_KEY);
  if (savedKey) els.apiKey.value = savedKey;
  const savedBase = localStorage.getItem(LS_BASE);
  if (savedBase) els.apiBase.value = savedBase;
  const savedModel = localStorage.getItem(LS_MODEL);
  if (savedModel) els.model.value = savedModel;

  els.apiKey.addEventListener("input", () => {
    localStorage.setItem(LS_KEY, els.apiKey.value.trim());
    refreshGenerate();
  });
  els.apiBase.addEventListener("input", () => localStorage.setItem(LS_BASE, els.apiBase.value.trim()));
  els.model.addEventListener("input", () => localStorage.setItem(LS_MODEL, els.model.value.trim()));

  els.settingsToggle.addEventListener("click", () => {
    const open = els.settingsPanel.classList.toggle("hidden") === false;
    els.settingsToggle.setAttribute("aria-expanded", String(open));
  });
  els.toggleKey.addEventListener("click", () => {
    els.apiKey.type = els.apiKey.type === "password" ? "text" : "password";
  });

  setupDropzone();
  els.loadBtn.addEventListener("click", loadListings);
  els.ebayUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") loadListings(); });
  els.extractBtn.addEventListener("click", extractFromPaste);
  els.generateBtn.addEventListener("click", generate);

  if (!savedKey) {
    els.settingsPanel.classList.remove("hidden");
    els.settingsToggle.setAttribute("aria-expanded", "true");
  }
})();

// ---- Derived --------------------------------------------------------------
function apiBase() {
  const v = (els.apiBase.value || "").trim().replace(/\/+$/, "");
  return v || DEFAULT_API_BASE;
}
// Proxy root = API base without the trailing /v1 (where /ebay and /img live).
function proxyRoot() {
  return apiBase().replace(/\/v1$/, "");
}

// ---- Video upload ---------------------------------------------------------
function setupDropzone() {
  const dz = els.dropzone;
  dz.addEventListener("click", () => els.fileInput.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
  });
  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) setVideo(e.target.files[0]);
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) setVideo(f);
    else if (f) showError("That doesn't look like a video file.");
  });
}

function setVideo(file) {
  videoFile = file;
  els.sourcePreview.src = URL.createObjectURL(file);
  els.sourcePreview.classList.remove("hidden");
  els.dzEmpty.classList.add("hidden");
  els.fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  els.fileMeta.classList.remove("hidden");
  clearError();
  refreshGenerate();
}

// ---- eBay listings --------------------------------------------------------
async function loadListings() {
  clearError();
  let url = els.ebayUrl.value.trim();
  if (!url) return showError("Paste an eBay seller, store, or search URL first.");
  if (!/ebay\./i.test(url)) return showError("That doesn't look like an eBay URL.");
  if (!/^https?:\/\//i.test(url)) url = "https://" + url; // tolerate a missing scheme
  if (/api\.decart\.ai/i.test(apiBase())) {
    return showError("Set the API base URL to your Deno proxy (Settings) — it's what fetches eBay listings.");
  }

  setListingsStatus("Loading listings from eBay…", false);
  els.listingsGrid.classList.add("hidden");
  els.loadBtn.disabled = true;

  try {
    const res = await fetch(`${proxyRoot()}/ebay?url=${encodeURIComponent(url)}`);
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : null;
    if (!res.ok) {
      throw new Error((data && data.error) ? data.error : `Proxy returned HTTP ${res.status}`);
    }
    if (!data) {
      throw new Error("Proxy didn't return listings — redeploy the Deno proxy (it needs the /ebay endpoint).");
    }
    applyListings(
      Array.isArray(data.listings) ? data.listings : [],
      data.error
        ? `No listings (${data.error}). Use the paste box above — eBay blocks server-side fetches.`
        : "No listings on that page. Use the paste box above instead."
    );
  } catch (err) {
    console.error(err);
    setListingsStatus(err.message, true);
  } finally {
    els.loadBtn.disabled = false;
    refreshGenerate();
  }
}

// Extract eBay image URLs from pasted page source or a list of URLs (client-side —
// no eBay fetch, so it sidesteps eBay's server IP blocking).
function extractFromPaste() {
  clearError();
  const text = els.pasteBox.value || "";
  if (!text.trim()) return showError("Paste eBay page source or image URLs into the box first.");
  applyListings(extractImagesFromText(text), "No eBay image URLs (i.ebayimg.com) found in what you pasted.");
}

function extractImagesFromText(text) {
  const urls = text.match(/https?:\/\/i\.ebayimg\.com\/[^\s"'<>)\\]+/gi) || [];
  const listings = [];
  const seen = new Set();
  for (let src of urls) {
    if (listings.length >= 10) break;
    src = src.replace(/^http:/i, "https:").replace(/\/s-l\d+\./i, "/s-l500.");
    const idM = src.match(/\/g\/([^/]+)/i) || src.match(/\/images\/([^/]+)/i);
    const key = idM ? idM[1] : src;
    if (seen.has(key)) continue;
    seen.add(key);
    listings.push({ title: "", image: src });
  }
  return listings;
}

// Render a set of {title, image} listings and reset selection.
function applyListings(list, emptyNote) {
  listings = Array.isArray(list) ? list : [];
  selected = [];
  renderListings();
  if (!listings.length) {
    setListingsStatus(emptyNote || "No images found.", true);
  } else {
    setListingsStatus(`Found ${listings.length} image${listings.length === 1 ? "" : "s"} — select up to ${MAX_SELECT}.`, false);
  }
  refreshGenerate();
}

function renderListings() {
  els.listingsGrid.innerHTML = "";
  listings.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "listing";
    card.dataset.index = String(i);

    const img = document.createElement("img");
    // Load thumbnails straight from eBay's CDN (allowed for <img>); fall back to proxy on error.
    img.src = item.image;
    img.loading = "lazy";
    img.alt = item.title || `Listing ${i + 1}`;
    img.addEventListener("error", () => {
      if (!img.dataset.proxied) {
        img.dataset.proxied = "1";
        img.src = `${proxyRoot()}/img?url=${encodeURIComponent(item.image)}`;
      }
    });

    const badge = document.createElement("div");
    badge.className = "badge";

    const cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = item.title || `Listing ${i + 1}`;

    card.append(badge, img, cap);
    card.addEventListener("click", () => toggleSelect(i));
    els.listingsGrid.appendChild(card);
  });
  els.listingsGrid.classList.remove("hidden");
  els.selCount.classList.remove("hidden");
  updateSelectionUI();
}

function toggleSelect(i) {
  const pos = selected.indexOf(i);
  if (pos >= 0) {
    selected.splice(pos, 1);
  } else {
    if (selected.length >= MAX_SELECT) return; // at cap
    selected.push(i);
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const atMax = selected.length >= MAX_SELECT;
  els.listingsGrid.querySelectorAll(".listing").forEach((card) => {
    const i = Number(card.dataset.index);
    const pos = selected.indexOf(i);
    card.classList.toggle("selected", pos >= 0);
    card.classList.toggle("disabled", atMax && pos < 0);
    const badge = card.querySelector(".badge");
    badge.textContent = pos >= 0 ? String(pos + 1) : "";
  });
  els.selCount.textContent = `${selected.length} / ${MAX_SELECT} selected`;
  els.selCount.classList.toggle("max", atMax);
  refreshGenerate();
}

function setListingsStatus(msg, isError) {
  els.listingsStatus.textContent = msg;
  els.listingsStatus.classList.remove("hidden");
  els.listingsStatus.style.background = isError ? "rgba(255,107,107,0.12)" : "";
  els.listingsStatus.style.borderColor = isError ? "rgba(255,107,107,0.4)" : "";
  els.listingsStatus.style.color = isError ? "#ffc9c9" : "";
}

// ---- Generate -------------------------------------------------------------
function refreshGenerate() {
  const ready = !running && !!videoFile && selected.length >= 1 &&
                selected.length <= MAX_SELECT && els.apiKey.value.trim().length > 0;
  els.generateBtn.disabled = !ready;
  els.generateBtn.textContent = selected.length
    ? `✨ Generate ${selected.length} video${selected.length === 1 ? "" : "s"}`
    : "✨ Generate videos";
}

async function generate() {
  clearError();
  const apiKey = els.apiKey.value.trim();
  const model = els.model.value.trim() || "lucy-vton-2";
  const prompt = els.prompt.value.trim();
  if (!apiKey) return showError("Add your Decart API key in ⚙️ API Settings.");
  if (!videoFile) return showError("Choose a source video first.");
  if (!selected.length) return showError("Select at least one listing.");

  running = true;
  refreshGenerate();
  els.resultsPanel.hidden = false;
  els.outputGrid.innerHTML = "";
  els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  // Build one output card per selected listing (in selection order).
  const jobs = selected.map((idx, n) => {
    const item = listings[idx];
    const card = buildOutputCard(item, n + 1);
    els.outputGrid.appendChild(card.el);
    return { item, card };
  });

  // Run all jobs concurrently; each updates its own card.
  await Promise.allSettled(jobs.map(({ item, card }) => runOne(item, card, { apiKey, model, prompt })));

  running = false;
  refreshGenerate();
}

function buildOutputCard(item, n) {
  const el = document.createElement("div");
  el.className = "output-card";

  const head = document.createElement("div");
  head.className = "oc-head";
  const thumb = document.createElement("img");
  thumb.className = "oc-thumb";
  thumb.src = item.image;
  thumb.alt = "";
  thumb.addEventListener("error", () => {
    thumb.src = `${proxyRoot()}/img?url=${encodeURIComponent(item.image)}`;
  });
  const title = document.createElement("div");
  title.className = "oc-title";
  title.textContent = item.title || `Video ${n}`;
  head.append(thumb, title);

  const body = document.createElement("div");
  body.className = "oc-body";

  const actions = document.createElement("div");
  actions.className = "oc-actions";

  el.append(head, body, actions);
  return { el, body, actions };
}

async function runOne(item, card, { apiKey, model, prompt }) {
  const setBody = (html) => { card.body.innerHTML = html; };
  const setStatus = (msg, cls = "") => setBody(
    `<div><div class="spinner"></div><p class="status ${cls}">${escapeHtml(msg)}</p>` +
    `<div class="bar"><div class="bar-fill" style="width:${cls === "" ? 15 : 0}%"></div></div></div>`
  );
  const setProgress = (msg, pct) => {
    const bar = card.body.querySelector(".bar-fill");
    const st = card.body.querySelector(".status");
    if (bar) bar.style.width = `${pct}%`;
    if (st) st.textContent = msg;
  };

  try {
    setStatus("Fetching item image…");
    // Pull the eBay image bytes through the proxy so we can upload them.
    const imgRes = await fetch(`${proxyRoot()}/img?url=${encodeURIComponent(item.image)}`);
    if (!imgRes.ok) throw new Error(`Couldn't load item image (HTTP ${imgRes.status}).`);
    const refBlob = await imgRes.blob();

    setProgress("Uploading & creating job…", 25);
    const form = new FormData();
    form.append("data", videoFile, videoFile.name);
    form.append("reference_image", refBlob, "reference.jpg");
    if (prompt) form.append("prompt", prompt);

    const createRes = await fetch(`${apiBase()}/jobs/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
    });
    if (!createRes.ok) throw new Error(await describeHttpError(createRes, "create job"));
    const created = await createRes.json();
    const jobId = created.job_id || created.id || created.jobId;
    if (!jobId) throw new Error("No job_id returned by the API.");

    setProgress("Queued — waiting for the model…", 35);
    await pollUntilDone(jobId, apiKey, setProgress);

    setProgress("Downloading result…", 92);
    const contentRes = await fetch(`${apiBase()}/jobs/${encodeURIComponent(jobId)}/content`, {
      headers: { "x-api-key": apiKey },
    });
    if (!contentRes.ok) throw new Error(await describeHttpError(contentRes, "download result"));
    const blob = await contentRes.blob();
    showOutputVideo(card, blob, item);
  } catch (err) {
    console.error(err);
    card.body.innerHTML = `<p class="status err">⚠️ ${escapeHtml(err.message)}</p>`;
    card.actions.innerHTML = "";
  }
}

async function pollUntilDone(jobId, apiKey, setProgress) {
  const started = Date.now();
  let ticks = 0;
  while (true) {
    if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error("Timed out (10 min).");
    const res = await fetch(`${apiBase()}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) throw new Error(await describeHttpError(res, "check status"));
    const data = await res.json();
    const status = String(data.status || data.state || "").toLowerCase();

    if (["completed", "succeeded", "success"].includes(status)) return;
    if (["failed", "error", "cancelled"].includes(status)) {
      throw new Error(`Job ${status}: ${data.error || data.message || "no detail"}`);
    }
    ticks++;
    setProgress(status === "processing" ? "Editing…" : "In queue…", Math.min(88, 35 + ticks * 6));
    await sleep(POLL_INTERVAL_MS);
  }
}

function showOutputVideo(card, blob, item) {
  const url = URL.createObjectURL(blob);
  card.body.innerHTML = "";
  const video = document.createElement("video");
  video.src = url;
  video.controls = true;
  video.playsInline = true;
  card.body.appendChild(video);

  card.actions.innerHTML = "";
  const dl = document.createElement("a");
  dl.className = "primary-btn";
  dl.href = url;
  dl.download = suggestedName(item);
  dl.textContent = "⬇️ Download";
  card.actions.appendChild(dl);
}

// ---- Errors / utils -------------------------------------------------------
async function describeHttpError(res, action) {
  let detail = "";
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json();
      detail = j.error || j.message || j.detail || JSON.stringify(j);
    } else {
      detail = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    }
  } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) return `Auth failed (${res.status}). Check your API key. ${detail}`.trim();
  if (res.status === 404) return `Not found (404) — check the model slug. ${detail}`.trim();
  if (res.status === 429) return `Rate limited (429) — try fewer at once. ${detail}`.trim();
  return `Failed to ${action} (HTTP ${res.status}). ${detail}`.trim();
}

function showError(msg) {
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    msg = "Couldn't reach the proxy. Check the API base URL in Settings and that the Deno proxy is deployed. (" + msg + ")";
  }
  els.inlineError.textContent = msg;
  els.inlineError.classList.remove("hidden");
}
function clearError() { els.inlineError.classList.add("hidden"); els.inlineError.textContent = ""; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function formatBytes(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}
function suggestedName(item) {
  const base = (item.title || "tryon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "tryon";
  return `${base}.mp4`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
