/* eBay Motion Studio — Decart.ai (client-side).
 *
 * Flow:
 *   1. Upload one baseline video.
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

// Aspect ratios: actor 9:16 (portrait), setting 16:9 (landscape).
const ACTOR_ASPECT = "9:16";
const SETTING_ASPECT = "16:9";

// GPT Image uses image_size presets instead of aspect_ratio.
const gptSize = (ar) => (ar === "16:9" ? "landscape_16_9" : "portrait_16_9");

// Create generates one candidate per model for the user to choose from —
// four top image models (Black Forest Labs / Google / OpenAI / Google).
const TEXT_MODELS = [
  { id: "fal-ai/flux-pro/v1.1-ultra", label: "FLUX ultra",  input: (p, ar) => ({ prompt: p, aspect_ratio: ar, num_images: 1 }) },
  { id: "fal-ai/nano-banana",         label: "Nano Banana", input: (p, ar) => ({ prompt: p, aspect_ratio: ar, num_images: 1 }) },
  { id: "openai/gpt-image-2",         label: "GPT Image 2", input: (p, ar) => ({ prompt: p, image_size: gptSize(ar), quality: "high", num_images: 1 }) },
  { id: "fal-ai/imagen4/preview/ultra", label: "Imagen 4 Ultra", input: (p, ar) => ({ prompt: p, aspect_ratio: ar, num_images: 1 }) },
];
// "Put the actor in this scene" uses image-editing models.
const EDIT_MODELS = [
  { id: "fal-ai/flux-pro/kontext", label: "FLUX Kontext", input: (p, ar, img) => ({ prompt: p, image_url: img, aspect_ratio: ar, guidance_scale: 3.5, num_images: 1 }) },
  { id: "fal-ai/nano-banana/edit", label: "Nano Banana",  input: (p, ar, img) => ({ prompt: p, image_urls: [img], num_images: 1 }) },
  { id: "openai/gpt-image-2/edit", label: "GPT Image 2",  input: (p, ar, img) => ({ prompt: p, image_urls: [img], image_size: gptSize(ar), quality: "high", num_images: 1 }) },
];
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
  dzEmpty: document.querySelector("#dropzone .dz-empty"),
  fileMeta: $("fileMeta"),

  charSeg: $("charSeg"),
  charCreatePane: $("charCreatePane"),
  charSelectPane: $("charSelectPane"),
  castGrid: $("castGrid"),
  charPrompt: $("charPrompt"),
  charBtn: $("charBtn"),
  charCandidates: $("charCandidates"),
  charUploadBtn: $("charUploadBtn"),
  charFile: $("charFile"),
  charThumb: $("charThumb"),
  charStatus: $("charStatus"),

  setSeg: $("setSeg"),
  setCreatePane: $("setCreatePane"),
  setSelectPane: $("setSelectPane"),
  setGrid: $("setGrid"),
  setPrompt: $("setPrompt"),
  setBtn: $("setBtn"),
  setCandidates: $("setCandidates"),
  setUploadBtn: $("setUploadBtn"),
  setFile: $("setFile"),
  setThumb: $("setThumb"),
  setStatus: $("setStatus"),

  genPrompt: $("genPrompt"),
  genDur: $("genDur"),
  genAsp: $("genAsp"),
  genAudio: $("genAudio"),
  genBtn: $("genBtn"),
  genStatus: $("genStatus"),

  ebayUrl: $("ebayUrl"),
  sellerInput: $("sellerInput"),
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
let charImgSrc = null;         // chosen actor image (data URI or fal URL)
let setImgSrc = null;          // chosen setting image (optional)
let cast = [];                 // saved actors: [{ id, src, label }]
let setLocations = [];         // saved settings: [{ id, src, label }]

const LS_CAST = "tryon_cast";
const LS_SETLOC = "tryon_setlocations";
let generating = false;
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
  setupSourceImages();
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
  els.fileMeta.textContent = `${file.name || "video"} · ${formatBytes(file.size)}`;
  els.fileMeta.classList.remove("hidden");
  refreshGenerate();
}

// ---- Source images: Actor (cast) + Setting (set locations) ----------------
function setupSourceImages() {
  // Load saved libraries
  cast = loadLib(LS_CAST);
  setLocations = loadLib(LS_SETLOC);

  // Actor
  els.charPrompt.addEventListener("input", refreshImgBtns);
  els.charBtn.addEventListener("click", () => createImage("character"));
  els.charUploadBtn.addEventListener("click", () => els.charFile.click());
  els.charFile.addEventListener("change", (e) => addToLibrary("character", e.target.files));
  setupSeg(els.charSeg, els.charCreatePane, els.charSelectPane, () => renderLibrary("character"));

  // Setting
  els.setPrompt.addEventListener("input", refreshImgBtns);
  els.setBtn.addEventListener("click", () => createImage("setting"));
  els.setUploadBtn.addEventListener("click", () => els.setFile.click());
  els.setFile.addEventListener("change", (e) => addToLibrary("setting", e.target.files));
  setupSeg(els.setSeg, els.setCreatePane, els.setSelectPane, () => renderLibrary("setting"));

  // Video
  els.genPrompt.addEventListener("input", refreshGenBtn);
  els.genBtn.addEventListener("click", generateSource);

  renderLibrary("character");
  renderLibrary("setting");
}

// Segmented Create/Select toggle.
function setupSeg(seg, createPane, selectPane, onSelect) {
  seg.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
      const create = btn.dataset.mode === "create";
      createPane.classList.toggle("hidden", !create);
      selectPane.classList.toggle("hidden", create);
      if (!create) onSelect();
    });
  });
}

// Per-kind config.
function slot(kind) {
  return kind === "character"
    ? { get: () => charImgSrc, set: (v) => (charImgSrc = v), prompt: els.charPrompt, btn: els.charBtn, thumb: els.charThumb, status: els.charStatus, file: els.charFile,
        grid: els.castGrid, cand: els.charCandidates, lib: cast, libKey: LS_CAST, label: "actor", makeN: "🧑‍🎨 Create Actor options" }
    : { get: () => setImgSrc, set: (v) => (setImgSrc = v), prompt: els.setPrompt, btn: els.setBtn, thumb: els.setThumb, status: els.setStatus, file: els.setFile,
        grid: els.setGrid, cand: els.setCandidates, lib: setLocations, libKey: LS_SETLOC, label: "setting", makeN: "🏞️ Create Setting options" };
}

function refreshImgBtns() {
  const bad = generating || /api\.decart\.ai/i.test(apiBase());
  els.charBtn.disabled = bad || els.charPrompt.value.trim().length === 0;
  els.setBtn.disabled = bad || els.setPrompt.value.trim().length === 0;
  els.charBtn.textContent = generating ? "…" : "🧑‍🎨 Create Actor options";
  els.setBtn.textContent = generating ? "…" : "🏞️ Create Setting options";
}

// Add an uploaded photo to a library and select it.
async function addToLibrary(kind, fileList) {
  const s = slot(kind);
  const f = Array.from(fileList || []).find((x) => x.type.startsWith("image/"));
  if (f) {
    const src = await readAsDataURL(f);
    saveToLib(kind, src, "uploaded");
    chooseFromLibrary(kind, src);
    setStatusEl(s.status, `✅ Added to your ${kind === "character" ? "cast" : "set locations"}.`, "ok");
  }
  s.file.value = "";
}

async function createImage(kind) {
  clearError();
  const s = slot(kind);
  const prompt = s.prompt.value.trim();
  if (!prompt) return showError(`Describe the ${s.label} first.`);
  if (/api\.decart\.ai/i.test(apiBase())) {
    return showError("Set the API base URL to your Deno proxy (Settings) — it talks to fal.ai.");
  }

  const aspect = kind === "setting" ? SETTING_ASPECT : ACTOR_ASPECT;
  const models = TEXT_MODELS.map((m) => ({
    id: m.id, label: m.label, input: m.input(prompt, aspect),
  }));

  generating = true;
  refreshImgBtns(); refreshGenBtn();
  setStatusEl(s.status, `<div class="spinner"></div><p>Generating ${models.length} options…</p>`, "");

  // Render a loading cell per option, then fill each as it completes.
  s.cand.innerHTML = "";
  const cells = models.map(() => {
    const cell = document.createElement("div");
    cell.className = "cand-item";
    cell.innerHTML = `<div class="spinner"></div>`;
    s.cand.appendChild(cell);
    return cell;
  });

  await Promise.allSettled(models.map((m, i) => (async () => {
    try {
      const result = await falRun(m.id, m.input, null);
      const url = result.images && result.images[0] && result.images[0].url;
      if (!url) throw new Error("no image");
      cells[i].innerHTML = `<img src="${url}" alt="option ${i + 1}">`;
      cells[i].addEventListener("click", () => {
        cells.forEach((c) => c.classList.remove("selected"));
        cells[i].classList.add("selected");
        saveToLib(kind, url, prompt.slice(0, 60));
        chooseFromLibrary(kind, url);
        setStatusEl(s.status, `✅ Saved to your ${kind === "character" ? "cast" : "set locations"}.`, "ok");
      });
    } catch (err) {
      cells[i].innerHTML = `<div class="err">${escapeHtml(err.message || "failed")}</div>`;
    }
  })()));

  if (s.status.textContent.includes("Generating")) setStatusEl(s.status, `Pick your favorite ${s.label} above 👆`, "");
  generating = false;
  refreshImgBtns(); refreshGenBtn();
}

// Set the chosen image for a kind (shown in the "Chosen …" thumb) and mark it in the grid.
function chooseFromLibrary(kind, src) {
  const s = slot(kind);
  s.set(src);
  renderChosen(kind);
  renderLibrary(kind);
  refreshGenBtn();
}

function renderChosen(kind) {
  const s = slot(kind);
  s.thumb.innerHTML = "";
  const src = s.get();
  if (!src) return;
  const wrap = document.createElement("div");
  wrap.className = "img-thumb";
  const img = document.createElement("img");
  img.src = src; img.alt = s.label;
  const rm = document.createElement("button");
  rm.className = "rm"; rm.type = "button"; rm.textContent = "×"; rm.title = "Clear selection";
  rm.addEventListener("click", () => { s.set(null); renderChosen(kind); renderLibrary(kind); refreshGenBtn(); });
  wrap.append(img, rm);
  s.thumb.appendChild(wrap);
}

// Render the saved cast / set-locations gallery.
function renderLibrary(kind) {
  const s = slot(kind);
  s.grid.innerHTML = "";
  s.lib.forEach((item) => {
    const cell = document.createElement("div");
    cell.className = "picker-item" + (s.get() === item.src ? " selected" : "");
    cell.title = item.label || "";
    const img = document.createElement("img");
    img.src = item.src; img.alt = item.label || s.label; img.loading = "lazy";
    const rm = document.createElement("button");
    rm.className = "rm"; rm.type = "button"; rm.textContent = "×"; rm.title = "Delete";
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromLib(kind, item.id);
      if (s.get() === item.src) { s.set(null); renderChosen(kind); }
      renderLibrary(kind); refreshGenBtn();
    });
    cell.addEventListener("click", () => {
      chooseFromLibrary(kind, item.src);
    });
    cell.append(img, rm);
    s.grid.appendChild(cell);
  });
}

// ---- Library persistence (localStorage, quota-safe) -----------------------
function loadLib(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function saveToLib(kind, src, label) {
  const s = slot(kind);
  const id = "id" + s.lib.length + "_" + src.slice(-8);
  s.lib.unshift({ id, src, label: label || "" });
  if (s.lib.length > 24) s.lib.length = 24;
  persistLib(kind);
}
function removeFromLib(kind, id) {
  const s = slot(kind);
  const i = s.lib.findIndex((x) => x.id === id);
  if (i >= 0) s.lib.splice(i, 1);
  persistLib(kind);
}
function persistLib(kind) {
  const s = slot(kind);
  // Drop oldest until it fits localStorage (uploaded data URIs can be large).
  let arr = s.lib.slice();
  while (arr.length) {
    try { localStorage.setItem(s.libKey, JSON.stringify(arr)); break; }
    catch { arr = arr.slice(0, -1); }
  }
  if (!arr.length) { try { localStorage.setItem(s.libKey, "[]"); } catch { /* ignore */ } }
}

function refreshGenBtn() {
  const ready = !generating && !!charImgSrc &&
                els.genPrompt.value.trim().length > 0 && !/api\.decart\.ai/i.test(apiBase());
  els.genBtn.disabled = !ready;
  els.genBtn.textContent = generating ? "🎬 Generating…" : "🎬 Generate baseline video";
}

async function generateSource() {
  clearError();
  const images = [charImgSrc, setImgSrc].filter(Boolean);
  if (!images.length) return showError("Create or select an actor first.");
  if (!els.genPrompt.value.trim()) return showError("Write a prompt for the video.");
  if (/api\.decart\.ai/i.test(apiBase())) {
    return showError("Set the API base URL to your Deno proxy (Settings) — it talks to fal.ai.");
  }

  generating = true;
  refreshGenBtn(); refreshImgBtns();
  setGenStatus(`<div class="spinner"></div><p>Submitting…</p>`, "");

  // Two images -> reference-to-video; one -> image-to-video.
  const useImages = images;
  const combine = useImages.length >= 2;
  // Users write "Actor" / "Setting" in the prompt; Seedance's reference-to-video
  // addresses images as @Image1/@Image2 in image_urls order (actor first, then
  // setting). Encode the friendly names to the reference tokens here.
  let prompt = els.genPrompt.value.trim();
  if (combine) {
    prompt = prompt
      .replace(/\bactor\b/gi, `@Image${useImages.indexOf(charImgSrc) + 1}`)
      .replace(/\bsetting\b/gi, `@Image${useImages.indexOf(setImgSrc) + 1}`);
  }
  const model = `bytedance/seedance-2.0/${combine ? "reference-to-video" : "image-to-video"}`;
  const input = {
    prompt,
    resolution: "720p",
    aspect_ratio: els.genAsp.value,
    generate_audio: els.genAudio.checked,
    duration: els.genDur.value,
  };
  if (combine) input.image_urls = useImages; else input.image_url = useImages[0];

  try {
    const result = await falRun(model, input, (status, secs) =>
      setGenStatus(`<div class="spinner"></div><p>${status === "IN_PROGRESS" ? "Rendering video" : "In queue"}… (${secs}s)</p>`, ""));
    const videoUrl = result.video && result.video.url;
    if (!videoUrl) throw new Error("No video URL in the result.");

    setGenStatus(`<div class="spinner"></div><p>Downloading generated video…</p>`, "");
    const vidRes = await fetch(`${proxyRoot()}/img?url=${encodeURIComponent(videoUrl)}`);
    if (!vidRes.ok) throw new Error(`Couldn't download the generated video (HTTP ${vidRes.status}).`);
    const blob = await vidRes.blob();
    const file = new File([blob], "seedance-source.mp4", { type: blob.type || "video/mp4" });

    setVideo(file);
    setGenStatus(`✅ Generated — set as your baseline video below. <video src="${videoUrl}" controls playsinline></video>`, "ok");
  } catch (err) {
    console.error(err);
    setGenStatus("⚠️ " + escapeHtml(err.message), "err");
  } finally {
    generating = false;
    refreshGenBtn(); refreshImgBtns();
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Submit an input to a fal.ai model via the proxy queue, poll to completion,
// and return the result JSON. onStatus(status, seconds) is called while polling.
async function falRun(model, input, onStatus) {
  const submitRes = await fetch(`${proxyRoot()}/fal/${model}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const submit = await submitRes.json().catch(() => ({}));
  if (!submitRes.ok) throw new Error(submit.error || submit.detail || `Submit failed (HTTP ${submitRes.status})`);
  const reqId = submit.request_id;
  const statusUrl = falToProxy(submit.status_url) || `${proxyRoot()}/fal/${model}/requests/${reqId}/status`;
  const resultUrl = falToProxy(submit.response_url) || `${proxyRoot()}/fal/${model}/requests/${reqId}`;

  const started = Date.now();
  while (true) {
    if (Date.now() - started > 15 * 60 * 1000) throw new Error("Timed out after 15 minutes.");
    await sleep(3000);
    const st = await (await fetch(statusUrl)).json().catch(() => ({}));
    const status = String(st.status || "").toUpperCase();
    if (status === "COMPLETED") break;
    if (["FAILED", "ERROR", "CANCELLED"].includes(status)) {
      throw new Error("fal " + status.toLowerCase() + (st.error ? `: ${st.error}` : ""));
    }
    if (onStatus) onStatus(status, Math.round((Date.now() - started) / 1000));
  }
  return await (await fetch(resultUrl)).json().catch(() => ({}));
}

function setStatusEl(el, html, cls) {
  el.className = "gen-status" + (cls ? " " + cls : "");
  el.innerHTML = html;
  el.classList.remove("hidden");
}
function setGenStatus(html, cls) { setStatusEl(els.genStatus, html, cls); }
function falToProxy(u) {
  return u ? String(u).replace(/^https:\/\/queue\.fal\.run\//i, `${proxyRoot()}/fal/`) : null;
}
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---- eBay listings --------------------------------------------------------
async function loadListings() {
  clearError();
  const query = els.ebayUrl.value.trim();
  const seller = els.sellerInput.value.trim();
  if (!query) return showError("Enter keywords or an eBay search/seller URL.");
  if (/api\.decart\.ai/i.test(apiBase())) {
    return showError("Set the API base URL to your Deno proxy (Settings) — it's what queries eBay.");
  }

  setListingsStatus("Searching eBay…", false);
  els.listingsGrid.classList.add("hidden");
  els.loadBtn.disabled = true;

  try {
    let endpoint = `${proxyRoot()}/ebay?url=${encodeURIComponent(query)}`;
    if (seller) endpoint += `&seller=${encodeURIComponent(seller)}`;
    const res = await fetch(endpoint);
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
      data.error ? data.error : "No results — try different keywords, or use the paste option below."
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
  if (!videoFile) return showError("Choose a baseline video first.");
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
