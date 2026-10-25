const text = (key, fallback) => chrome.i18n.getMessage(key) || fallback;
const blacklistInput = document.getElementById("blacklist");
const status = document.getElementById("settings-status");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");

function localizeOptions() {
  document.documentElement.lang = "en";
  document.title = `${text("extensionName", "FluxFrame")} ${text("settings", "Settings")}`;
  document.getElementById("page-title").textContent = text("settings", "Settings");
  document.getElementById("blocked-title").textContent = text("blockedTitle", "Ignored websites");
  document.getElementById("blocked-help").textContent = text("blockedHelp", "Media from these domains will not appear in detection results. Add one domain per line.");
  document.getElementById("save-settings").textContent = text("saveSettings", "Save changes");
  document.getElementById("history-title").textContent = text("historyTitle", "Recent downloads");
  document.getElementById("history-help").textContent = text("historyHelp", "A list of up to 30 downloads started by FluxFrame, stored only on this device.");
  document.getElementById("clear-history").textContent = text("clearHistory", "Clear list");
  historyEmpty.textContent = text("historyEmpty", "No FluxFrame downloads yet.");
  document.getElementById("privacy-note").textContent = text("privacyNote", "Detection stays in your browser. Media requests go directly to the source website; recent download names and ignored domains stay in local extension storage.");
  blacklistInput.placeholder = text("blacklistPlaceholder", "example.com");
}

function normalizeDomain(value) {
  const input = value.trim();
  if (!input) return "";
  if (input.includes("*") || /[\s/@?#]/.test(input)) throw new Error(text("invalidDomain", "Enter a domain only, such as example.com."));
  let parsed;
  try { parsed = new URL(`https://${input}`); }
  catch (error) { throw new Error(text("invalidDomain", "Enter a domain only, such as example.com.")); }
  if (!parsed.hostname || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port || parsed.username || parsed.password) {
    throw new Error(text("invalidDomain", "Enter a domain only, such as example.com."));
  }
  return parsed.hostname.toLowerCase().replace(/\.$/, "");
}

async function loadSettings() {
  const { blacklist = [] } = await chrome.storage.local.get("blacklist");
  blacklistInput.value = Array.isArray(blacklist) ? blacklist.join("\n") : "";
}

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.dataset.kind = kind;
}

async function saveSettings() {
  try {
    const domains = blacklistInput.value.split(/[\n,]+/).map(normalizeDomain).filter(Boolean);
    const uniqueDomains = [...new Set(domains)];
    if (uniqueDomains.length > 100) {
      throw new Error(text("tooManyDomains", "You can ignore up to 100 domains."));
    }
    await chrome.storage.local.set({ blacklist: uniqueDomains });
    blacklistInput.value = uniqueDomains.join("\n");
    setStatus(text("settingsSaved", "Settings saved."), "success");
  } catch (error) {
    setStatus(error.message || text("settingsError", "Could not save settings."), "error");
  }
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderHistory(records) {
  historyList.replaceChildren();
  historyEmpty.classList.toggle("hidden", records.length > 0);
  for (const record of records) {
    const row = document.createElement("li");
    row.className = "history-item";
    const details = document.createElement("div");
    details.style.minWidth = "0";
    const filename = document.createElement("div");
    filename.className = "history-name";
    filename.textContent = record.filename || text("downloadItem", "Download");
    const metadata = document.createElement("div");
    metadata.className = "history-meta";
    const timestamp = record.endedAt || record.startedAt;
    const date = timestamp ? new Date(timestamp).toLocaleString("en-US") : "";
    metadata.textContent = [formatBytes(record.bytesReceived), date].filter(Boolean).join(" · ");
    const state = document.createElement("span");
    state.className = "history-state";
    const stateKey = record.state === "complete" ? "downloadComplete" : record.state === "interrupted" ? "downloadInterrupted" : "downloadInProgress";
    const stateFallback = record.state === "complete" ? "Complete" : record.state === "interrupted" ? "Interrupted" : "In progress";
    state.textContent = text(stateKey, stateFallback);
    details.append(filename, metadata);
    row.append(details, state);
    historyList.append(row);
  }
}

async function loadHistory() {
  const { downloadHistory = [] } = await chrome.storage.local.get("downloadHistory");
  const records = Array.isArray(downloadHistory) ? downloadHistory : [];
  renderHistory(records.slice(0, 30));
}

document.getElementById("save-settings").addEventListener("click", saveSettings);
document.getElementById("clear-history").addEventListener("click", async () => {
  await chrome.storage.local.set({ downloadHistory: [] });
  renderHistory([]);
  setStatus(text("historyCleared", "Download list cleared. Downloaded files were not removed."), "success");
});

localizeOptions();
Promise.all([loadSettings(), loadHistory()]).catch(() => setStatus(text("loadSettingsError", "Could not load saved settings."), "error"));
