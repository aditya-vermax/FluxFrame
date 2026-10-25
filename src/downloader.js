import { checkDrm, parsePlaylist } from "./hls-parser.mjs";

// HLS downloader: choose a playlist quality, fetch its segments, decrypt
// standard AES-128 when present, and assemble one file. DRM is not bypassed.

const CONCURRENCY = 4;
const RETRIES = 2;
const MAX_SEGMENT_BYTES = 64 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024;
const MAX_PLAYLIST_BYTES = 5 * 1024 * 1024;

const copy = (key, fallback) => chrome.i18n.getMessage(key) || fallback;
const language = "en";

function localizeDownloader() {
  document.documentElement.lang = language;
  document.title = copy("downloaderTitle", "Downloading video…");
  document.getElementById("page-heading").textContent = copy("downloaderHeading", "HLS downloader");
  document.getElementById("loading-text").textContent = copy("analyzingStream", "Analyzing stream…");
  document.getElementById("quality-heading").textContent = copy("chooseQualityHeading", "Choose a quality");
  document.getElementById("progress-warning").textContent = copy("keepTabOpen", "Keep this tab open until the download finishes.");
  document.getElementById("done-heading").textContent = copy("downloadDoneHeading", "Download complete");
  document.getElementById("error-heading").textContent = copy("downloadFailedHeading", "Download failed");
}

localizeDownloader();

const params = new URLSearchParams(location.search);
const srcUrl = params.get("src") || "";
const pageTitle = params.get("title") || "video";

const steps = {
  loading: document.getElementById("step-loading"),
  quality: document.getElementById("step-quality"),
  progress: document.getElementById("step-progress"),
  done: document.getElementById("step-done"),
  error: document.getElementById("step-error"),
};

const qualityListEl = document.getElementById("quality-list");
const progressBarEl = document.getElementById("progress-bar");
const progressTextEl = document.getElementById("progress-text");
const progressLabelEl = document.getElementById("progress-label");
const doneTextEl = document.getElementById("done-text");
const errorTextEl = document.getElementById("error-text");
const notesEl = document.getElementById("notes");

document.getElementById("video-title").textContent = pageTitle;

function showStep(name) {
  for (const [key, el] of Object.entries(steps)) {
    el.classList.toggle("hidden", key !== name);
  }
}

function showNote(text) {
  notesEl.textContent = text;
  notesEl.classList.remove("hidden");
}

function fail(message) {
  errorTextEl.textContent = message;
  showStep("error");
}

function sanitizeFilename(name) {
  return (name || "video")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + " " + copy("gigabytes", "GB");
  if (mb >= 1) return mb.toFixed(1) + " " + copy("megabytes", "MB");
  return Math.max(1, Math.round(bytes / 1024)) + " " + copy("kilobytes", "KB");
}

function friendlyError(e) {
  const message = e && e.message ? e.message : String(e);
  if (/valid M3U8 playlist/i.test(message)) return copy("invalidPlaylist", "The response is not a valid M3U8 playlist.");
  if (/not HTTP or HTTPS/i.test(message)) return copy("invalidMediaUrl", "The playlist contains an invalid media URL.");
  if (/session encryption key/i.test(message)) return copy("unsupportedSessionKey", "This playlist uses a session encryption key that is not supported.");
  if (/DRM-protected|SAMPLE-AES|Widevine|FairPlay|PlayReady/i.test(message)) return copy("drmRefusal", "This stream uses DRM-protected encryption. FluxFrame does not download protected content.");
  if (/invalid AES-128 IV/i.test(message)) return copy("invalidIv", "The playlist contains an invalid AES-128 IV.");
  if (/does not provide a valid key URL/i.test(message)) return copy("invalidKeyUrl", "The AES-128 playlist does not provide a valid key URL.");
  if (/AES-128 key has an invalid size/i.test(message)) return copy("invalidKeySize", "The AES-128 key has an invalid size.");
  if (/too large/i.test(message)) return copy("playlistTooLarge", "The playlist or segment exceeds the safe memory limit.");
  if (/300 MB/i.test(message)) return copy("downloadLimit", "The stream exceeds the 300 MB safe in-memory assembly limit.");
  if (/fragmented stream is missing/i.test(message)) return copy("missingInitSegment", "The fragmented stream is missing its required initialization segment.");
  if (/unsupported features/i.test(message)) return copy("unsupportedPlaylistFeatures", "This playlist contains features FluxFrame cannot assemble yet.");
  if (/HTTP 40[13]/.test(message)) {
    return (
      copy("httpDenied", "The server refused this download. The link may have expired or the site may not make this media available.")
    );
  }
  if (/Failed to fetch|NetworkError/i.test(message)) {
    return copy("networkError", "The media server connection failed. Check your network and try again.");
  }
  return message;
}

// ---------------------------------------------------------------------------
// Segment downloads
// ---------------------------------------------------------------------------

async function fetchWithRetry(url, asText) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Media URL is not HTTP or HTTPS.");
      const res = await fetch(parsed.href, { credentials: "omit", redirect: "follow" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const maxBytes = asText ? MAX_PLAYLIST_BYTES : MAX_SEGMENT_BYTES;
      const contentLength = Number(res.headers.get("content-length")) || 0;
      if (contentLength > maxBytes) throw new Error(asText ? "Playlist is too large to analyze." : "Segment is too large for the safe memory limit.");
      const body = asText ? await res.text() : await res.arrayBuffer();
      const bodyLength = asText ? body.length : body.byteLength;
      if (bodyLength > maxBytes) throw new Error(asText ? "Playlist is too large to analyze." : "Segment is too large for the safe memory limit.");
      return body;
    } catch (e) {
      lastError = e;
      if (/HTTP 4\d\d|not HTTP or HTTPS|too large/i.test(e.message || "")) break;
    }
  }
  throw lastError;
}

const keyCache = new Map();

async function getKey(uri) {
  if (!keyCache.has(uri)) {
    const raw = await fetchWithRetry(uri, false);
    if (raw.byteLength !== 16) throw new Error("The AES-128 key has an invalid size.");
    const cryptoKey = await crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["decrypt"]);
    keyCache.set(uri, cryptoKey);
  }
  return keyCache.get(uri);
}

function ivForSegment(segment) {
  if (segment.key.iv) {
    // Explicit hexadecimal IV ("0x...").
    const hex = segment.key.iv.replace(/^0x/i, "").padStart(32, "0");
    const iv = new Uint8Array(16);
    for (let i = 0; i < 16; i++) iv[i] = parseInt(hex.substr(i * 2, 2), 16);
    return iv;
  }
  // Without an explicit IV, use the HLS media sequence in big-endian form.
  const iv = new Uint8Array(16);
  new DataView(iv.buffer).setBigUint64(8, BigInt(segment.sequence));
  return iv;
}

async function fetchSegment(segment) {
  let data = await fetchWithRetry(segment.url, false);
  if (segment.key) {
    const key = await getKey(segment.key.uri);
    data = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivForSegment(segment) }, key, data);
  }
  return data;
}

async function downloadSegments(segments, onProgress, initialBytes = 0) {
  const results = new Array(segments.length);
  let next = 0;
  let done = 0;
  let bytesDownloaded = initialBytes;

  const workers = Array.from({ length: Math.min(CONCURRENCY, segments.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= segments.length) return;
      results[i] = await fetchSegment(segments[i]);
      bytesDownloaded += results[i].byteLength;
      if (bytesDownloaded > MAX_DOWNLOAD_BYTES) {
        throw new Error("The stream exceeds the 300 MB safe in-memory assembly limit.");
      }
      done++;
      onProgress(done, segments.length, results, bytesDownloaded);
    }
  });

  await Promise.all(workers);
  return results;
}

function outputExtension(playlist, audioOnly) {
  const firstUrl = (playlist.map && playlist.map.url) || (playlist.segments[0] && playlist.segments[0].url) || "";
  const isFmp4 = !!playlist.map || /\.(m4s|mp4|m4a)(\?|#|$)/i.test(firstUrl);
  if (audioOnly) return isFmp4 ? "m4a" : "ts";
  return isFmp4 ? "mp4" : "ts";
}

async function downloadMediaPlaylist(url, { audioOnly = false, suffix = "" } = {}) {
  const text = await fetchWithRetry(url, true);
  const playlist = parsePlaylist(text, url);

  if (playlist.type === "master") {
    throw new Error(copy("nestedMasterPlaylist", "Unexpected playlist (master inside master)."));
  }
  if (!playlist.segments.length) {
    throw new Error("The playlist contains no media segments.");
  }

  const firstSegmentUrl = playlist.segments[0].url;
  if (!playlist.map && /\.(m4s|m4a|mp4)(\?|#|$)/i.test(firstSegmentUrl)) {
        throw new Error("The fragmented stream is missing its required initialization segment.");
  }

  if (playlist.unsupportedFeatures && playlist.unsupportedFeatures.length) {
    throw new Error("This playlist uses unsupported features: " + playlist.unsupportedFeatures.join(", ") + ".");
  }

  checkDrm(playlist);

  if (playlist.live) {
    showNote(
      copy("liveSnapshotNote", "This appears to be a live stream. Only the portion available now will be downloaded.")
    );
  }

  showStep("progress");
  progressLabelEl.textContent = audioOnly
    ? copy("downloadingAudio", "Downloading audio…")
    : copy("downloadingSegments", "Downloading segments…");

  const parts = [];
  let initialBytes = 0;
  if (playlist.map) {
    const initializationSegment = await fetchWithRetry(playlist.map.url, false);
    initialBytes = initializationSegment.byteLength;
    if (initialBytes > MAX_DOWNLOAD_BYTES) throw new Error("The initialization segment exceeds the 300 MB safe assembly limit.");
    parts.push(initializationSegment);
  }

  const segmentData = await downloadSegments(playlist.segments, (done, total, results, downloadedBytes) => {
    const pct = Math.round((done / total) * 100);
    progressBarEl.style.width = pct + "%";
    progressTextEl.textContent = copy("segmentProgress", "__DONE__ of __TOTAL__ segments · __SIZE__")
      .replace("__DONE__", String(done)).replace("__TOTAL__", String(total)).replace("__SIZE__", formatSize(downloadedBytes));
  }, initialBytes);

  parts.push(...segmentData);

  const ext = outputExtension(playlist, audioOnly);
  const mime = ext === "ts" ? "video/mp2t" : audioOnly ? "audio/mp4" : "video/mp4";
  const blob = new Blob(parts, { type: mime });
  const filename = `${sanitizeFilename(pageTitle)}${suffix}.${ext}`;

  const objectUrl = URL.createObjectURL(blob);
  await chrome.downloads.download({ url: objectUrl, filename });

  return { filename, size: blob.size, ext };
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function startDownload(variantUrl, audioUrl) {
  try {
    const result = await downloadMediaPlaylist(variantUrl);

    let doneText = copy("downloadSent", 'File "__FILE__" (__SIZE__) was sent to your Downloads folder.')
      .replace("__FILE__", result.filename).replace("__SIZE__", formatSize(result.size));

    if (audioUrl) {
      const audio = await downloadMediaPlaylist(audioUrl, { audioOnly: true, suffix: "_audio" });
      doneText += " " + copy("separateAudioNote", 'This stream\'s audio is separate and was saved as "__FILE__". Use a media tool such as FFmpeg to combine them.')
        .replace("__FILE__", audio.filename);
    }

    if (result.ext === "ts") {
      doneText += " " + copy("tsNote", ".ts files open in VLC. Use a converter if you need MP4.");
    }

    doneTextEl.textContent = doneText;
    showStep("done");
  } catch (e) {
    fail(friendlyError(e));
  }
}

function labelForVariant(variant) {
  const parts = [];
  if (variant.resolution) parts.push(variant.resolution);
  if (variant.bandwidth) parts.push(Math.round(variant.bandwidth / 1000) + " kbps");
  return parts.join(" · ") || copy("defaultQuality", "Default quality");
}

function pickAudioUrl(variant, audioRenditions) {
  if (!variant.audioGroup || !audioRenditions.length) return null;
  const group = audioRenditions.filter((a) => a.groupId === variant.audioGroup);
  if (!group.length) return null;
  const chosen = group.find((a) => a.isDefault) || group[0];
  return chosen.url;
}

function renderQualityChoices(master) {
  showStep("quality");
  qualityListEl.innerHTML = "";

  master.variants.forEach((variant) => {
    const li = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = labelForVariant(variant);

    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = copy("download", "Download");
    btn.addEventListener("click", () => {
      startDownload(variant.url, pickAudioUrl(variant, master.audioRenditions));
    });

    li.appendChild(label);
    li.appendChild(btn);
    qualityListEl.appendChild(li);
  });
}

async function init() {
  if (!srcUrl) {
    fail(copy("missingStreamUrl", "No stream URL was provided."));
    return;
  }

  try {
    const text = await fetchWithRetry(srcUrl, true);
    const playlist = parsePlaylist(text, srcUrl);

    if (playlist.type === "master") {
      checkDrm(playlist);
      if (!playlist.variants.length) {
        fail(copy("noVariants", "The master playlist has no video variants."));
        return;
      }
      renderQualityChoices(playlist);
    } else {
      // Direct media playlist: download without a quality prompt.
      await startDownload(srcUrl, null);
    }
  } catch (e) {
    fail(friendlyError(e));
  }
}

init();
