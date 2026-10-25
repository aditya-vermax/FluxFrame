// Service worker: detect media per tab from network traffic, keep temporary
// in-memory state, and respond to the popup and content script.

const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "ogv", "mov", "m4v"];
const VIDEO_CONTENT_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-m4v"];
const HLS_CONTENT_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
  "audio/x-mpegurl",
];
const MAX_CANDIDATES_PER_TAB = 100;
const CANDIDATE_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY_ITEMS = 30;
const MAX_MEDIA_URL_LENGTH = 8192;
let historyWriteQueue = Promise.resolve();
const tabEpochs = new Map();

// Map<tabId, Map<url, videoInfo>>
const videosByTab = new Map();

function getTabMap(tabId) {
  let map = videosByTab.get(tabId);
  if (!map) {
    map = new Map();
    videosByTab.set(tabId, map);
  }
  return map;
}

function pruneTabMap(tabId) {
  const map = videosByTab.get(tabId);
  if (!map) return;
  const cutoff = Date.now() - CANDIDATE_TTL_MS;
  for (const [url, candidate] of map) {
    if (!candidate.lastSeen || candidate.lastSeen < cutoff) map.delete(url);
  }
  updateBadge(tabId);
}

function extensionFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  } catch (e) {
    return "";
  }
}

function looksLikeVideoUrl(url) {
  const ext = extensionFromUrl(url);
  return VIDEO_EXTENSIONS.includes(ext);
}

async function isDomainBlacklisted(url) {
  try {
    const host = new URL(url).hostname;
    const { blacklist = [] } = await chrome.storage.local.get("blacklist");
    return Array.isArray(blacklist) && blacklist.some((domain) =>
      typeof domain === "string" && (host === domain || host.endsWith("." + domain))
    );
  } catch (e) {
    return false;
  }
}

function updateBadge(tabId) {
  const map = videosByTab.get(tabId);
  const count = map ? map.size : 0;
  const text = count > 0 ? String(count) : "";
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#7c6cff" });
}

async function addVideo(tabId, info) {
  if (!Number.isInteger(tabId) || tabId < 0 || !info || typeof info.url !== "string" || info.url.length > MAX_MEDIA_URL_LENGTH) return;
  const epoch = tabEpochs.get(tabId) || 0;
  let parsedUrl;
  try {
    parsedUrl = new URL(info.url);
    if (!(["http:", "https:"].includes(parsedUrl.protocol))) return;
  } catch (error) {
    return;
  }
  if (await isDomainBlacklisted(info.url)) return;
  if ((tabEpochs.get(tabId) || 0) !== epoch) return;

  const map = getTabMap(tabId);
  const now = Date.now();
  for (const [url, candidate] of map) {
    if (now - candidate.lastSeen > CANDIDATE_TTL_MS) map.delete(url);
  }
  const existing = map.get(info.url) || {};
  const kind = info.kind === "hls" || extensionFromUrl(info.url) === "m3u8" ? "hls" : "file";
  map.set(info.url, {
    ...existing,
    ...info,
    kind,
    title: typeof info.title === "string" ? info.title.slice(0, 240) : existing.title || "",
    size: Number.isFinite(info.size) && info.size >= 0 ? info.size : existing.size || 0,
    lastSeen: now,
  });
  while (map.size > MAX_CANDIDATES_PER_TAB) map.delete(map.keys().next().value);
  updateBadge(tabId);
}

// Main detection path: inspect response Content-Type and Content-Length headers.
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const headers = details.responseHeaders || [];
    let contentType = "";
    let contentLength = 0;
    for (const h of headers) {
      const name = h.name.toLowerCase();
      if (name === "content-type") contentType = (h.value || "").split(";")[0].trim().toLowerCase();
      if (name === "content-length") contentLength = parseInt(h.value || "0", 10) || 0;
    }

    const ext = extensionFromUrl(details.url);
    const isHls = HLS_CONTENT_TYPES.includes(contentType) || ext === "m3u8";
    const isVideoType = VIDEO_CONTENT_TYPES.includes(contentType);

    if (isHls) {
      addVideo(details.tabId, {
        url: details.url,
        contentType: "application/vnd.apple.mpegurl",
        size: 0,
        source: "network",
        kind: "hls",
      });
    } else if (isVideoType || looksLikeVideoUrl(details.url)) {
      addVideo(details.tabId, {
        url: details.url,
        contentType: contentType || "video/" + (ext || "mp4"),
        size: contentLength,
        source: "network",
        kind: "file",
      });
    }
  },
  { urls: ["<all_urls>"], types: ["media", "xmlhttprequest", "other"] },
  ["responseHeaders"]
);

// Clear tab state when a tab navigates to a new page or closes.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    tabEpochs.set(tabId, (tabEpochs.get(tabId) || 0) + 1);
    videosByTab.delete(tabId);
    updateBadge(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabEpochs.set(tabId, (tabEpochs.get(tabId) || 0) + 1);
  videosByTab.delete(tabId);
  tabEpochs.delete(tabId);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.blacklist) return;
  const blacklist = Array.isArray(changes.blacklist.newValue) ? changes.blacklist.newValue : [];
  for (const [tabId, map] of videosByTab) {
    for (const [url] of map) {
      try {
        const host = new URL(url).hostname;
        if (blacklist.some((domain) => typeof domain === "string" && (host === domain || host.endsWith("." + domain)))) {
          map.delete(url);
        }
      } catch (error) {
        map.delete(url);
      }
    }
    updateBadge(tabId);
  }
});

function saveHistoryChange(change) {
  historyWriteQueue = historyWriteQueue.then(async () => {
    const { downloadHistory = [] } = await chrome.storage.local.get("downloadHistory");
    const records = Array.isArray(downloadHistory) ? downloadHistory : [];
    const next = change(records).slice(0, MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ downloadHistory: next });
  }).catch((error) => console.error("Could not update local download history", error));
  return historyWriteQueue;
}

function filenameOnly(path) {
  return String(path || "").split(/[\\/]/).pop().slice(0, 180);
}

chrome.downloads.onCreated.addListener((item) => {
  if (item.byExtensionId !== chrome.runtime.id) return;
  const record = {
    id: item.id,
    filename: filenameOnly(item.filename),
    state: item.state || "in_progress",
    bytesReceived: Number(item.bytesReceived) || 0,
    startedAt: item.startTime || new Date().toISOString(),
  };
  saveHistoryChange((records) => [record, ...records.filter((entry) => entry.id !== item.id)]);
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta || !Number.isInteger(delta.id)) return;
  saveHistoryChange((records) => {
    const index = records.findIndex((entry) => entry.id === delta.id);
    if (index < 0) return records;
    const updated = { ...records[index] };
    if (delta.state) updated.state = delta.state.current;
    if (delta.filename) updated.filename = filenameOnly(delta.filename.current);
    if (delta.bytesReceived) updated.bytesReceived = Number(delta.bytesReceived.current) || 0;
    if (delta.endTime) updated.endedAt = delta.endTime.current;
    records[index] = updated;
    return records;
  });
});

chrome.downloads.onErased.addListener((downloadId) => {
  saveHistoryChange((records) => records.filter((entry) => entry.id !== downloadId));
});

// Mensagens do popup e do content script.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "VIDEO_FOUND" && sender.tab && typeof message.url === "string") {
    // Media found in the DOM by the content script.
    addVideo(sender.tab.id, {
      url: message.url,
      contentType: message.contentType || "",
      size: 0,
      source: "dom",
      kind: message.kind === "hls" ? "hls" : "file",
      title: message.title || "",
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "GET_VIDEOS" && sender.id === chrome.runtime.id && Number.isInteger(message.tabId) && message.tabId >= 0) {
    pruneTabMap(message.tabId);
    const tabId = message.tabId;
    const map = videosByTab.get(tabId);
    const videos = map ? Array.from(map.values()) : [];
    sendResponse({ videos });
    return false;
  }

  return false;
});
