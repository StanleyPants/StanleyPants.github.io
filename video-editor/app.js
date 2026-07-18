/* AI Video Editor — Decart.ai Queue API integration (client-side).
 *
 * Flow (Decart Queue REST API):
 *   1. POST https://api.decart.ai/v1/jobs/{model}
 *        headers: { "x-api-key": <key> }
 *        body:    multipart/form-data { prompt, data: <video file>, reference_image? }
 *        -> { job_id: "..." }
 *   2. Poll GET https://api.decart.ai/v1/jobs/{job_id}
 *        headers: { "x-api-key": <key> }
 *        -> { status: "pending" | "processing" | "completed" | "failed", ... }
 *   3. When completed, GET https://api.decart.ai/v1/jobs/{job_id}/content
 *        headers: { "x-api-key": <key> }
 *        -> binary video (downloaded as a Blob)
 */

// Default to the CORS proxy so the app works out-of-the-box from GitHub Pages.
// (Decart's API sends no CORS headers, so a direct browser call is blocked.)
// Change this in Settings, or edit it here, if you deploy your own proxy.
const DEFAULT_API_BASE = "https://decart-proxy.nitzan90265.workers.dev/v1";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // give up after 10 minutes

// ---- Element refs ---------------------------------------------------------
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

  prompt: $("prompt"),
  promptChips: $("promptChips"),
  refInput: $("refInput"),
  refPreview: $("refPreview"),

  editBtn: $("editBtn"),
  inlineError: $("inlineError"),

  resultEmpty: $("resultEmpty"),
  progress: $("progress"),
  progressLabel: $("progressLabel"),
  progressBar: $("progressBar"),
  cancelBtn: $("cancelBtn"),
  resultPreview: $("resultPreview"),
  resultActions: $("resultActions"),
  downloadLink: $("downloadLink"),
  againBtn: $("againBtn"),
  log: $("log"),
};

// ---- State ----------------------------------------------------------------
let videoFile = null;
let refImageFile = null;
let currentJob = null;      // { id, aborted }
let resultObjectUrl = null; // for revoke on re-run

const LS_KEY = "decart_api_key";
const LS_MODEL = "decart_model";
const LS_BASE = "decart_api_base";

// Current API base (no trailing slash), falling back to the direct Decart API.
function apiBase() {
  const v = (els.apiBase.value || "").trim().replace(/\/+$/, "");
  return v || DEFAULT_API_BASE;
}

// ---- Init -----------------------------------------------------------------
(function init() {
  // Restore saved settings
  const savedKey = localStorage.getItem(LS_KEY);
  if (savedKey) els.apiKey.value = savedKey;
  const savedModel = localStorage.getItem(LS_MODEL);
  if (savedModel) els.model.value = savedModel;
  const savedBase = localStorage.getItem(LS_BASE);
  if (savedBase) els.apiBase.value = savedBase;

  els.apiKey.addEventListener("input", () => {
    localStorage.setItem(LS_KEY, els.apiKey.value.trim());
    refreshEditButton();
  });
  els.model.addEventListener("input", () => {
    localStorage.setItem(LS_MODEL, els.model.value.trim());
  });
  els.apiBase.addEventListener("input", () => {
    localStorage.setItem(LS_BASE, els.apiBase.value.trim());
  });

  els.settingsToggle.addEventListener("click", () => {
    const open = els.settingsPanel.classList.toggle("hidden") === false;
    els.settingsToggle.setAttribute("aria-expanded", String(open));
  });

  els.toggleKey.addEventListener("click", () => {
    els.apiKey.type = els.apiKey.type === "password" ? "text" : "password";
  });

  setupDropzone();
  setupPromptChips();
  setupRefImage();

  els.prompt.addEventListener("input", refreshEditButton);
  els.editBtn.addEventListener("click", onEdit);
  els.cancelBtn.addEventListener("click", cancelJob);
  els.againBtn.addEventListener("click", resetForNextRun);

  // Open settings automatically if no key is stored yet.
  if (!savedKey) {
    els.settingsPanel.classList.remove("hidden");
    els.settingsToggle.setAttribute("aria-expanded", "true");
  }
})();

// ---- Dropzone / file selection -------------------------------------------
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
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); })
  );
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) setVideo(f);
    else if (f) showError("That doesn't look like a video file.");
  });
}

function setVideo(file) {
  videoFile = file;
  const url = URL.createObjectURL(file);
  els.sourcePreview.src = url;
  els.sourcePreview.classList.remove("hidden");
  els.dzEmpty.classList.add("hidden");
  els.fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  els.fileMeta.classList.remove("hidden");
  clearError();
  refreshEditButton();
}

function setupRefImage() {
  els.refInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    refImageFile = f || null;
    if (f) {
      els.refPreview.src = URL.createObjectURL(f);
      els.refPreview.classList.remove("hidden");
    } else {
      els.refPreview.classList.add("hidden");
    }
  });
}

function setupPromptChips() {
  els.promptChips.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      els.prompt.value = chip.textContent.trim();
      refreshEditButton();
      els.prompt.focus();
    })
  );
}

function refreshEditButton() {
  const ready = !!videoFile && els.prompt.value.trim().length > 0 &&
                els.apiKey.value.trim().length > 0 && !currentJob;
  els.editBtn.disabled = !ready;
}

// ---- Main action: submit + poll + fetch result ---------------------------
async function onEdit() {
  clearError();
  const apiKey = els.apiKey.value.trim();
  const model = (els.model.value.trim() || "lucy-latest");
  const prompt = els.prompt.value.trim();

  if (!apiKey) return showError("Add your Decart API key in ⚙️ API Settings first.");
  if (!videoFile) return showError("Choose a source video first.");
  if (!prompt) return showError("Describe the edit you want.");

  currentJob = { id: null, aborted: false };
  startProgress("Uploading video & creating job…", 8);
  clearLog();
  log(`Model: ${model}`);
  log(`Prompt: ${prompt}`);

  try {
    // --- 1. Create job ---
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("data", videoFile, videoFile.name);
    if (refImageFile) form.append("reference_image", refImageFile, refImageFile.name);

    const createRes = await fetch(`${apiBase()}/jobs/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
    });
    if (currentJob.aborted) return;

    if (!createRes.ok) {
      throw new Error(await describeHttpError(createRes, "create job"));
    }
    const created = await createRes.json();
    const jobId = created.job_id || created.id || created.jobId;
    if (!jobId) throw new Error("Job created but no job_id was returned by the API.");
    currentJob.id = jobId;
    log(`Job created: ${jobId}`);
    setProgress("Queued — waiting for the model…", 20);

    // --- 2. Poll status ---
    const finalStatus = await pollUntilDone(jobId, apiKey);
    if (currentJob.aborted) return;
    log(`Final status: ${finalStatus}`);

    // --- 3. Fetch result content ---
    setProgress("Downloading edited video…", 92);
    const contentRes = await fetch(`${apiBase()}/jobs/${encodeURIComponent(jobId)}/content`, {
      headers: { "x-api-key": apiKey },
    });
    if (currentJob.aborted) return;
    if (!contentRes.ok) throw new Error(await describeHttpError(contentRes, "download result"));

    const blob = await contentRes.blob();
    showResult(blob);
  } catch (err) {
    if (!currentJob || currentJob.aborted) return;
    console.error(err);
    log(`ERROR: ${err.message}`);
    stopProgress();
    showError(err.message);
    currentJob = null;
    refreshEditButton();
  }
}

async function pollUntilDone(jobId, apiKey) {
  const started = Date.now();
  let ticks = 0;
  while (true) {
    if (currentJob.aborted) throw new Error("Cancelled.");
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new Error("Timed out waiting for the job to finish (10 min).");
    }

    const res = await fetch(`${apiBase()}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { "x-api-key": apiKey },
    });
    if (currentJob.aborted) throw new Error("Cancelled.");
    if (!res.ok) throw new Error(await describeHttpError(res, "check status"));

    const data = await res.json();
    const status = String(data.status || data.state || "").toLowerCase();
    log(`status: ${status || "(unknown)"}`);

    if (status === "completed" || status === "succeeded" || status === "success") {
      setProgress("Finishing up…", 90);
      return status;
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      const reason = data.error || data.message || data.failure_reason || "job failed";
      throw new Error(`Decart reported the job ${status}: ${reason}`);
    }

    // Animate progress between 20% and 88% while we wait.
    ticks++;
    const pct = Math.min(88, 20 + ticks * 6);
    setProgress(
      status === "processing" ? "Editing your video…" : "Waiting in the queue…",
      pct
    );

    await sleep(POLL_INTERVAL_MS);
  }
}

// ---- Result / UI helpers --------------------------------------------------
function showResult(blob) {
  stopProgress();
  if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
  resultObjectUrl = URL.createObjectURL(blob);

  els.resultPreview.src = resultObjectUrl;
  els.resultPreview.classList.remove("hidden");
  els.downloadLink.href = resultObjectUrl;
  els.downloadLink.download = suggestedName();
  els.resultActions.classList.remove("hidden");
  log("Done ✔");

  currentJob = null;
  refreshEditButton();
}

function resetForNextRun() {
  els.resultPreview.classList.add("hidden");
  els.resultActions.classList.add("hidden");
  els.resultEmpty.classList.remove("hidden");
  els.prompt.focus();
}

function startProgress(label, pct) {
  els.resultEmpty.classList.add("hidden");
  els.resultPreview.classList.add("hidden");
  els.resultActions.classList.add("hidden");
  els.progress.classList.remove("hidden");
  setProgress(label, pct);
  refreshEditButton();
}
function setProgress(label, pct) {
  els.progressLabel.textContent = label;
  els.progressBar.style.width = `${pct}%`;
}
function stopProgress() {
  els.progress.classList.add("hidden");
  els.resultEmpty.classList.remove("hidden");
}

function cancelJob() {
  if (currentJob) currentJob.aborted = true;
  currentJob = null;
  stopProgress();
  log("Cancelled by user.");
  refreshEditButton();
}

// ---- Errors / logging -----------------------------------------------------
async function describeHttpError(res, action) {
  let detail = "";
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json();
      detail = j.error || j.message || JSON.stringify(j);
    } else {
      detail = (await res.text()).slice(0, 300);
    }
  } catch { /* ignore parse errors */ }

  if (res.status === 401 || res.status === 403) {
    return `Authentication failed (${res.status}). Check your Decart API key. ${detail}`.trim();
  }
  if (res.status === 404) {
    return `Not found (404) while trying to ${action}. The model slug or job may be wrong. ${detail}`.trim();
  }
  if (res.status === 429) {
    return `Rate limited (429). Wait a moment and try again. ${detail}`.trim();
  }
  return `Failed to ${action} (HTTP ${res.status}). ${detail}`.trim();
}

function showError(msg) {
  // Browsers surface CORS/network failures as a generic "Failed to fetch".
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    msg =
      "Couldn't reach the Decart API from the browser. This is usually a network issue or " +
      "a CORS restriction on direct browser calls. If it persists, route the request through " +
      "a small server-side proxy that adds your x-api-key. (Original: " + msg + ")";
  }
  els.inlineError.textContent = msg;
  els.inlineError.classList.remove("hidden");
}
function clearError() { els.inlineError.classList.add("hidden"); els.inlineError.textContent = ""; }

function log(line) {
  const t = new Date().toLocaleTimeString();
  els.log.textContent += `[${t}] ${line}\n`;
  els.log.scrollTop = els.log.scrollHeight;
}
function clearLog() { els.log.textContent = ""; }

// ---- Small utils ----------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function suggestedName() {
  const base = (videoFile && videoFile.name.replace(/\.[^.]+$/, "")) || "video";
  return `${base}-edited.mp4`;
}
