// Popup logic: find media on the active tab, render results, and start downloads.

const listEl = document.getElementById("video-list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("media-count");
const statusEl = document.getElementById("status");
const refreshButton = document.getElementById("refresh");
const helpButton = document.getElementById("help");
const settingsButton = document.getElementById("settings");
const helpPanel = document.getElementById("help-panel");

const copy = (key, fallback) => chrome.i18n.getMessage(key) || fallback;

function localizePage() {
  document.documentElement.lang = "en";
  document.title = copy("extensionName", "FluxFrame");
  document.getElementById("section-title").textContent = copy("popupTitle", "Media on this page");
  document.getElementById("empty").textContent = copy("emptyState", "No supported media found yet. Play a video, then refresh detection.");
  document.getElementById("footer-copy").textContent = copy("privacyFooter", "Only media available to you is shown.");
  refreshButton.setAttribute("aria-label", copy("refresh", "Refresh detection"));
  refreshButton.title = copy("refresh", "Refresh detection");
  helpButton.setAttribute("aria-label", copy("about", "About FluxFrame"));
  helpButton.title = copy("about", "About FluxFrame");
  settingsButton.setAttribute("aria-label", copy("settings", "Settings"));
  settingsButton.title = copy("settings", "Settings");
  helpPanel.textContent = copy("aboutText", "FluxFrame finds media files and HLS streams made available by the page. Download only when you have permission. DRM-protected content is not supported.");
}

localizePage();

function sanitizeFilename(name) {
  return (name || "video")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function extensionFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "mp4";
  } catch (e) {
    return "mp4";
  }
}

function extensionForVideo(video) {
  const fromUrl = extensionFromUrl(video.url);
  if (fromUrl && fromUrl !== "mp4") return fromUrl;
  const mimeExtensions = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogg",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
  };
  return mimeExtensions[(video.contentType || "").split(";")[0].toLowerCase()] || fromUrl;
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ""); }
  catch (e) { return ""; }
}

function titleFromVideo(video, index) {
  try {
    const pathname = new URL(video.url).pathname;
    const filename = decodeURIComponent(pathname.split("/").pop() || "");
    if (filename && /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8)$/i.test(filename)) return filename;
  } catch (e) { /* Use the page title when the media URL cannot be parsed. */ }
  const pageTitle = (video.title || "").trim();
  return pageTitle || `${copy("mediaFallback", "Media")} ${index + 1}`;
}

function showStatus(message, kind = "info") {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
  statusEl.classList.remove("hidden");
}

function formatSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toFixed(1) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function handleDownload(video, tab) {
  const pageTitle = video.title || tab.title;

  if (video.kind === "hls") {
    // HLS streams use a dedicated page for quality selection and progress.
    const url =
      chrome.runtime.getURL("src/downloader.html") +
      `?src=${encodeURIComponent(video.url)}` +
      `&title=${encodeURIComponent(video.title || pageTitle || "video")}`;
    try {
      await chrome.tabs.create({ url });
    } catch (error) {
      showStatus(copy("downloadOpenError", "The downloader could not be opened. Please try again."), "error");
    }
    return;
  }

  const ext = extensionForVideo(video);
  const base = sanitizeFilename(video.title || pageTitle || "video");
  const filename = base.endsWith("." + ext) ? base : `${base}.${ext}`;

  try {
    await chrome.downloads.download({ url: video.url, filename });
    showStatus(copy("downloadStarted", "Download started in Chrome."), "success");
  } catch (error) {
    showStatus(copy("downloadError", "Chrome could not start this download. Check that the page is still open and try again."), "error");
  }
}

function renderVideos(videos, tab) {
  listEl.innerHTML = "";
  countEl.textContent = videos.length
    ? copy("foundCount", "__COUNT__ found").replace("__COUNT__", String(videos.length))
    : copy("foundCountZero", "0 found");

  if (!videos.length) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  videos.forEach((video, index) => {
    const li = document.createElement("li");
    li.className = "video-item";

    const icon = document.createElement("span");
    icon.className = "media-type-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = video.kind === "hls"
      ? '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="11" cy="18" r="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>';

    const meta = document.createElement("div");
    meta.className = "video-meta";

    const name = document.createElement("span");
    name.className = "video-name";
    name.textContent = titleFromVideo(video, index);
    name.title = name.textContent;

    const sub = document.createElement("span");
    sub.className = "video-sub";
    const size = formatSize(video.size);
    const format = video.kind === "hls"
      ? copy("hlsStream", "HLS stream")
      : extensionForVideo(video).toUpperCase();
    sub.textContent = [format, size].filter(Boolean).join(" · ");

    const origin = document.createElement("span");
    origin.className = "video-origin";
    origin.textContent = hostFromUrl(video.url) || copy("unknownSource", "Origem desconhecida");

    meta.appendChild(name);
    meta.appendChild(sub);
    meta.appendChild(origin);

    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = video.kind === "hls"
      ? copy("chooseQuality", "Choose quality")
      : copy("download", "Download");
    btn.addEventListener("click", () => handleDownload(video, tab));

    li.appendChild(icon);
    li.appendChild(meta);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

async function init() {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    document.getElementById("site-name").textContent = hostFromUrl(tab.url || "");
    if (!/^https?:/i.test(tab.url || "")) {
      showStatus(copy("unsupportedPage", "Detection is unavailable on this Chrome page."));
      renderVideos([], tab);
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: "GET_VIDEOS", tabId: tab.id });
    renderVideos((response && response.videos) || [], tab);
  } catch (error) {
    showStatus(copy("loadError", "Could not load media from this page."), "error");
    emptyEl.classList.remove("hidden");
  }
}

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  refreshButton.classList.add("spinning");
  statusEl.classList.add("hidden");
  try {
    const tab = await getActiveTab();
    if (!tab || !/^https?:/i.test(tab.url || "")) {
      showStatus(copy("unsupportedPage", "Detection is unavailable on this Chrome page."));
      return;
    }
    await chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE" });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const response = await chrome.runtime.sendMessage({ type: "GET_VIDEOS", tabId: tab.id });
    renderVideos((response && response.videos) || [], tab);
    showStatus(copy("refreshed", "Detection refreshed."), "success");
  } catch (error) {
    showStatus(copy("refreshError", "Could not refresh. Reload the page and try again."), "error");
  } finally {
    refreshButton.disabled = false;
    refreshButton.classList.remove("spinning");
  }
});

helpButton.addEventListener("click", () => {
  const expanded = helpButton.getAttribute("aria-expanded") === "true";
  helpButton.setAttribute("aria-expanded", String(!expanded));
  helpPanel.classList.toggle("hidden", expanded);
});

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage().catch(() => showStatus(copy("settingsOpenError", "Could not open settings."), "error"));
});

init();
