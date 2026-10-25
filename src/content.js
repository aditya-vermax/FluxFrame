// Content script: scan the DOM for video/source tags and report direct media
// URLs to the service worker. Watch for media injected after page load.

const VIDEO_EXT_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i;
const HLS_EXT_RE = /\.m3u8(\?|#|$)/i;
const reportedUrls = new Set();

function reportUrl(url) {
  if (!url) return;
  // Ignore blob and data URIs because they cannot be downloaded directly.
  if (url.startsWith("blob:") || url.startsWith("data:")) return;

  let absolute;
  try {
    absolute = new URL(url, location.href).href;
  } catch (e) {
    return;
  }
  if (!/^https?:/i.test(absolute) || reportedUrls.has(absolute)) return;

  let kind = null;
  if (HLS_EXT_RE.test(absolute)) kind = "hls";
  else if (VIDEO_EXT_RE.test(absolute)) kind = "file";
  if (!kind) return;
  if (reportedUrls.size >= 500) reportedUrls.clear();
  reportedUrls.add(absolute);

  chrome.runtime.sendMessage({
    type: "VIDEO_FOUND",
    url: absolute,
    kind,
    title: document.title,
  });
}

function scan() {
  const videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    if (video.currentSrc) reportUrl(video.currentSrc);
    if (video.src) reportUrl(video.src);
    video.querySelectorAll("source").forEach((source) => reportUrl(source.src));
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "SCAN_PAGE") {
    scan();
    sendResponse({ ok: true });
  }
  return false;
});

// Scan once and briefly repeat to catch media that loads later.
scan();

const observer = new MutationObserver(() => scan());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src"],
});
