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

// Actor images are always framed as a professional audition photo — the user
// only describes the person; this fixed style locks the framing/background.
const ACTOR_STYLE =
  "Full-body studio audition photograph: the person stands facing the camera, " +
  "the entire body from head to toe fully in frame, against a plain seamless " +
  "white background with even, professional studio lighting.";

// Both actor and setting images are generated with Nano Banana — four candidates
// each. To keep the four options from coming back nearly identical, each one gets
// a distinct variation directive appended to the prompt (same subject/scene, but
// a different pose/angle/lighting), which meaningfully diversifies the results.
const NANO_MODEL = "fal-ai/nano-banana";

const ACTOR_VARIATIONS = [
  "Standing straight and facing the camera directly, arms relaxed at the sides, neutral expression.",
  "In a relaxed stance with weight shifted onto one leg and a gentle three-quarter turn toward the camera.",
  "In a confident pose with one hand on the hip, chin slightly lifted, a subtle smile.",
  "In a natural, candid stance captured mid-motion at a slight side angle, easy and relaxed.",
];

const SETTING_VARIATIONS = [
  "Bright midday light, a wide and symmetrical composition, clear and vibrant.",
  "Warm late-afternoon light, a slightly lower angle and off-center framing.",
  "Soft overcast light with a calm, muted palette at eye level.",
  "Golden-hour light from a gently elevated angle, with long shadows and rich warm tones.",
];
// Motion Magic templates are defined in templates.js (window.VIDEO_TEMPLATES).
const TEMPLATES = Array.isArray(window.VIDEO_TEMPLATES) ? window.VIDEO_TEMPLATES : [];
// Directors (one-sentence style modifiers) are defined in directors.js.
const DIRECTORS = Array.isArray(window.DIRECTOR_DEFINITIONS) ? window.DIRECTOR_DEFINITIONS : [];
// Vibes (one-sentence mood modifiers) are defined in vibes.js.
const VIBES = Array.isArray(window.VIBE_DEFINITIONS) ? window.VIBE_DEFINITIONS : [];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SELECT = 5;

const $ = (id) => document.getElementById(id);
const els = {
  settingsToggle: $("settingsToggle"),
  settingsPanel: $("settingsPanel"),
  apiKey: $("apiKey"),
  toggleKey: $("toggleKey"),
  apiBase: $("apiBase"),

  stage: $("stage"),
  stageSpinner: $("stageSpinner"),
  compositeImg: $("compositeImg"),
  stageOverlay: $("stageOverlay"),
  stageHint: $("stageHint"),
  videoWrap: $("videoWrap"),
  baselineVideo: $("baselineVideo"),

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

  genTemplate: $("genTemplate"),
  genDirector: $("genDirector"),
  genVibe: $("genVibe"),
  genTemplateDesc: $("genTemplateDesc"),
  genSound: $("genSound"),
  genDur: $("genDur"),
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

let videoFile = null;
let charImgSrc = null;         // chosen actor image (data URI or fal URL)
let setImgSrc = null;          // chosen setting image (optional)
let cast = [];                 // saved actors: [{ id, src, label }]
let setLocations = [];         // saved settings: [{ id, src, label }]

const LS_CAST = "tryon_cast";
const LS_SETLOC = "tryon_setlocations";
let generating = false;
let generatingKind = null; // "character" | "setting" while an image is generating
let compositeUrl = null;   // staged 16:9 shot (actor composited/reframed), animated by Kling
let compositeSig = null;   // signature of the (actor,set) the composite was built from
let compositeToken = 0;    // supersedes in-flight composite builds
let compositing = false;   // true while the composite is being staged
let compositeTimer = null; // debounce for auto-staging on selection changes
let listings = [];             // { title, image }
let selected = [];             // indices into listings, in click order (max 5)
let running = false;

// ---- Init -----------------------------------------------------------------
(function init() {
  const savedKey = localStorage.getItem(LS_KEY);
  if (savedKey) els.apiKey.value = savedKey;
  const savedBase = localStorage.getItem(LS_BASE);
  if (savedBase) els.apiBase.value = savedBase;

  els.apiKey.addEventListener("input", () => {
    localStorage.setItem(LS_KEY, els.apiKey.value.trim());
    refreshGenerate();
  });
  els.apiBase.addEventListener("input", () => localStorage.setItem(LS_BASE, els.apiBase.value.trim()));

  els.settingsToggle.addEventListener("click", () => {
    const open = els.settingsPanel.classList.toggle("hidden") === false;
    els.settingsToggle.setAttribute("aria-expanded", String(open));
  });
  els.toggleKey.addEventListener("click", () => {
    els.apiKey.type = els.apiKey.type === "password" ? "text" : "password";
  });

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

// ---- Baseline video output ------------------------------------------------
function setVideo(file) {
  videoFile = file;
  els.baselineVideo.src = URL.createObjectURL(file);
  els.videoWrap.classList.remove("hidden");
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
  els.genBtn.addEventListener("click", generateSource);
  els.genTemplate.addEventListener("change", updateTemplateDesc);
  els.genDirector.addEventListener("change", updateTemplateDesc);
  els.genVibe.addEventListener("change", updateTemplateDesc);
  renderTemplates();
  renderDirectors();
  renderVibes();

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
  // Only the button that's actually generating shows the spinner label; the
  // other keeps its normal label (just disabled) so it never appears to vanish.
  els.charBtn.textContent = generatingKind === "character" ? "…" : "🧑‍🎨 Create Actor options";
  els.setBtn.textContent = generatingKind === "setting" ? "…" : "🏞️ Create Setting options";
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
  // The actor is always a fixed full-body studio audition photo; the user's text
  // only describes who the person is. Settings use the prompt as-is.
  const finalPrompt = kind === "character" ? `${prompt} ${ACTOR_STYLE}` : prompt;
  // Four Nano Banana candidates, each nudged by a distinct variation directive so
  // the options differ meaningfully instead of coming back nearly identical.
  const variations = kind === "character" ? ACTOR_VARIATIONS : SETTING_VARIATIONS;
  const models = variations.map((variation) => ({
    id: NANO_MODEL,
    input: { prompt: `${finalPrompt} ${variation}`, aspect_ratio: aspect, num_images: 1 },
  }));

  generating = true;
  generatingKind = kind;
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
  generatingKind = null;
  refreshImgBtns(); refreshGenBtn();
}

// Set the chosen image for a kind (shown in the "Chosen …" thumb) and mark it in the grid.
function chooseFromLibrary(kind, src) {
  const s = slot(kind);
  s.set(src);
  renderChosen(kind);
  renderLibrary(kind);
  refreshGenBtn();
  queueComposite();
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
  rm.addEventListener("click", () => { s.set(null); renderChosen(kind); renderLibrary(kind); refreshGenBtn(); queueComposite(); });
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
      renderLibrary(kind); refreshGenBtn(); queueComposite();
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
  // Enabled only once a staged composite exists; the dynamic "Action" text
  // shows while the video is being generated.
  const ready = !generating && !compositing && !!compositeUrl && TEMPLATES.length > 0;
  els.genBtn.disabled = !ready;
  els.genBtn.textContent = generating
    ? "🎬 Quiet on set. Actor in position. And Action."
    : "🎬 Generate baseline video";
}

// ---- Staging the shot (composite) -----------------------------------------
function compositeSignature() {
  return charImgSrc ? `${charImgSrc}||${setImgSrc || ""}` : null;
}

// Set the stage UI to one of: empty | building | ready | generating | error.
function setStage(mode, msg) {
  const show = (el, on) => el && el.classList.toggle("hidden", !on);
  const hasImg = mode === "ready" || mode === "generating";
  show(els.stage, mode === "building" || hasImg);
  show(els.stageSpinner, mode === "building");
  show(els.compositeImg, hasImg);
  if (hasImg && compositeUrl) els.compositeImg.src = compositeUrl;
  show(els.stageOverlay, mode === "generating");
  if (mode === "error") {
    els.stageHint.textContent = "⚠️ " + (msg || "Couldn't stage the shot.");
    show(els.stageHint, true);
  } else {
    els.stageHint.textContent = "";
    show(els.stageHint, false);
  }
}

// Debounced entry point: called whenever the actor/set selection changes.
function queueComposite() {
  if (generating) return; // don't disturb the stage while a video is rendering
  const sig = compositeSignature();
  if (!sig) { // no actor -> clear the stage
    compositeToken++; compositing = false; compositeUrl = null; compositeSig = null;
    clearTimeout(compositeTimer);
    setStage("empty"); refreshGenBtn();
    return;
  }
  if (sig === compositeSig && compositeUrl) { setStage("ready"); refreshGenBtn(); return; }
  // Something changed and we need a fresh composite — debounce rapid re-picks.
  clearTimeout(compositeTimer);
  compositing = true; compositeUrl = null; compositeSig = null;
  setStage("building"); refreshGenBtn();
  compositeTimer = setTimeout(refreshComposite, 600);
}

// Build (or rebuild) the staged composite for the current actor/set.
async function refreshComposite() {
  const sig = compositeSignature();
  if (!sig) { setStage("empty"); return; }
  if (/api\.decart\.ai/i.test(apiBase())) {
    compositing = false; compositeUrl = null; compositeSig = null;
    setStage("error", "Set the API base URL to your Deno proxy (Settings) to stage the shot.");
    refreshGenBtn();
    return;
  }
  const token = ++compositeToken;
  compositing = true; setStage("building"); refreshGenBtn();
  try {
    const url = await buildComposite();
    if (token !== compositeToken) return; // superseded by a newer selection
    compositeUrl = url; compositeSig = sig; compositing = false;
    setStage("ready"); refreshGenBtn();
  } catch (err) {
    if (token !== compositeToken) return;
    console.error(err);
    compositing = false; compositeUrl = null; compositeSig = null;
    setStage("error", err.message); refreshGenBtn();
  }
}

// Produce a single 16:9 source image with Nano Banana: composite the actor into
// the chosen setting, or (no setting) reframe the actor's portrait onto a 16:9
// studio backdrop. Kling inherits the image's aspect, so both stay 16:9.
async function buildComposite() {
  const input = setImgSrc
    ? {
        prompt:
          "Blend the person from the first image naturally into the scene from the second image as a " +
          "single photorealistic 16:9 landscape photograph. Set the person back within the environment " +
          "at a natural full-body distance from the camera, standing on the actual ground in the " +
          "mid-ground of the scene — not close-up in the foreground. Ground them with realistic contact " +
          "shadows and any reflections, match the scene's light direction, color temperature, perspective, " +
          "scale, depth of field, and grain, and let environmental elements sit both in front of and " +
          "behind them so they are truly embedded in the space. The result must look like a real photo " +
          "taken in that location, with natural depth — never like a cut-out pasted on a flat backdrop.",
        image_urls: [charImgSrc, setImgSrc],
        aspect_ratio: "16:9",
        num_images: 1,
      }
    : {
        prompt:
          "Reframe this full-body studio audition photo as a 16:9 landscape image: keep the same " +
          "person, entire body from head to toe fully in frame, standing centered against a plain " +
          "seamless white studio background with even, professional lighting.",
        image_urls: [charImgSrc],
        aspect_ratio: "16:9",
        num_images: 1,
      };
  const comp = await falRun("fal-ai/nano-banana/edit", input, null);
  const url = comp.images && comp.images[0] && comp.images[0].url;
  if (!url) throw new Error(setImgSrc ? "Couldn't composite the actor into the scene." : "Couldn't reframe the actor to 16:9.");
  return url;
}

// Populate the Motion Magic template dropdown from templates.js.
function renderTemplates() {
  if (!els.genTemplate) return;
  els.genTemplate.innerHTML = "";
  if (!TEMPLATES.length) {
    els.genTemplateDesc.textContent = "No templates defined (templates.js failed to load).";
    return;
  }
  TEMPLATES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    els.genTemplate.appendChild(opt);
  });
  updateTemplateDesc();
}

// Populate the Director dropdown from directors.js.
function renderDirectors() {
  if (!els.genDirector) return;
  els.genDirector.innerHTML = "";
  DIRECTORS.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.label;
    els.genDirector.appendChild(opt);
  });
  updateTemplateDesc();
}

// Return the currently selected template object (falls back to the first).
function selectedTemplate() {
  return TEMPLATES.find((t) => t.id === els.genTemplate.value) || TEMPLATES[0] || null;
}

// Populate the Vibe dropdown from vibes.js.
function renderVibes() {
  if (!els.genVibe) return;
  els.genVibe.innerHTML = "";
  VIBES.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.label;
    els.genVibe.appendChild(opt);
  });
  updateTemplateDesc();
}

// Return the currently selected director object (falls back to the first, if any).
function selectedDirector() {
  return DIRECTORS.find((d) => d.id === els.genDirector.value) || DIRECTORS[0] || null;
}

// Return the currently selected vibe object (falls back to the first, if any).
function selectedVibe() {
  return VIBES.find((v) => v.id === els.genVibe.value) || VIBES[0] || null;
}

// Compose the prompt: template + director's style modifier + vibe's mood modifier.
function composedPrompt() {
  const t = selectedTemplate();
  if (!t) return "";
  const d = selectedDirector();
  const v = selectedVibe();
  let out = t.prompt;
  if (d) out += ` ${d.modifier}`;
  if (v) out += ` ${v.modifier}`;
  return out;
}

// Show the composed template + director description beneath the dropdowns.
function updateTemplateDesc() {
  els.genTemplateDesc.textContent = composedPrompt();
}

async function generateSource() {
  clearError();
  if (!compositeUrl) return showError("Stage your shot first — cast an actor above.");
  const tpl = selectedTemplate();
  if (!tpl) return showError("No motion template is available.");
  if (/api\.decart\.ai/i.test(apiBase())) {
    return showError("Set the API base URL to your Deno proxy (Settings) — it talks to fal.ai.");
  }

  generating = true;
  refreshGenBtn(); refreshImgBtns();
  setStage("generating");          // film-reel overlay + "Motion Magic in Progress"
  els.videoWrap.classList.add("hidden");
  setGenStatus(`<div class="spinner"></div><p>Rolling…</p>`, "");

  // Kling animates the pre-staged 16:9 composite. Build the motion prompt from the
  // template + director + vibe, add the audio cue if wanted, and phrase it in
  // natural terms (no @Image tokens — those were only for Seedance's referencing).
  const wantSound = els.genSound.value === "yes";
  let prompt = composedPrompt();
  if (wantSound && tpl.sound) {
    prompt += ` Audio: ${tpl.sound}. Ambient background music only — no speech, dialogue, singing, or voices.`;
  }
  prompt = prompt.replace(/\bactor\b/gi, "the subject").replace(/\bsetting\b/gi, "the scene");

  try {
    const input = {
      prompt,
      image_url: compositeUrl,
      duration: els.genDur.value, // "5" or "10"
      cfg_scale: 0.5,
      generate_audio: wantSound, // Kling 2.6 Pro native audio
    };
    const result = await falRun("fal-ai/kling-video/v2.6/pro/image-to-video", input, (status, secs) =>
      setGenStatus(`<div class="spinner"></div><p>${status === "IN_PROGRESS" ? "Rendering video" : "In queue"}… (${secs}s)</p>`, ""));
    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) {
      console.error("Kling result:", result);
      throw new Error("No video URL in the result. Got: " + JSON.stringify(result).slice(0, 400));
    }

    setGenStatus(`<div class="spinner"></div><p>Downloading generated video…</p>`, "");
    const vidRes = await fetch(`${proxyRoot()}/img?url=${encodeURIComponent(videoUrl)}`);
    if (!vidRes.ok) throw new Error(`Couldn't download the generated video (HTTP ${vidRes.status}).`);
    const blob = await vidRes.blob();
    const file = new File([blob], "baseline-source.mp4", { type: blob.type || "video/mp4" });

    setVideo(file);
    setGenStatus(`✅ That's a wrap — set as your baseline video below.`, "ok");
  } catch (err) {
    console.error(err);
    setGenStatus("⚠️ " + escapeHtml(err.message), "err");
  } finally {
    generating = false;
    refreshImgBtns();
    queueComposite(); // drop the overlay; rebuild if the selection changed mid-render
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Pull the output video URL from a fal/Seedance result, tolerant of schema
// differences between model variants (video.url, videos[], data/output wrappers).
// Falls back to the first video-looking URL found anywhere in the object.
function extractVideoUrl(r) {
  if (!r || typeof r !== "object") return null;
  const first = (v) => (typeof v === "string" ? v : v && v.url) || null;
  const candidates = [
    r.video && r.video.url,
    typeof r.video === "string" ? r.video : null,
    r.videos && r.videos[0] && first(r.videos[0]),
    r.output && (r.output.video ? first(r.output.video) : (r.output.videos && first(r.output.videos[0]))),
    r.data && (r.data.video ? first(r.data.video) : (r.data.videos && first(r.data.videos[0]))),
    typeof r.url === "string" ? r.url : null,
  ].filter(Boolean);
  if (candidates.length) return candidates[0];
  // Deep fallback: first http(s) URL that looks like a video file.
  let found = null;
  try {
    JSON.stringify(r, (k, v) => {
      if (!found && typeof v === "string" && /^https?:\/\/\S+\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(v)) found = v;
      return v;
    });
  } catch { /* ignore */ }
  return found;
}

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
  const model = "lucy-latest";
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
    card.body.innerHTML = `<p class="status err">⚠️ ${escapeHtml(netHint(err.message))}</p>`;
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

// Turn a raw network failure into an actionable hint. The Decart try-on step
// uploads the whole baseline video through the proxy, so a large clip (e.g. a
// 10s render) is a common cause of "Failed to fetch".
function netHint(msg) {
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Couldn't reach the proxy for the Decart job. Common causes: the baseline video is too " +
      "large to upload through the proxy (try a 5-second clip), or the proxy isn't deployed / the " +
      "API base URL is wrong (check ⚙️ Settings and open the /__whoami URL). (" + msg + ")";
  }
  return msg;
}

function showError(msg) {
  els.inlineError.textContent = netHint(msg);
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
