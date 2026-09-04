import { getActionIconPaths } from "./utils/actionIcon";

const EXTENSION_ENABLED_KEY = "extensionEnabled";
const REFRESH_COORDINATE_OVERLAY_MESSAGE = "CE_REFRESH_COORDINATE_OVERLAY";
const CHESS_URL_MATCHES = ["https://*.chess.com/*"];
const DEBUG = true;

function logDebug(message: string, details?: unknown): void {
  if (!DEBUG) {
    return;
  }

  if (details === undefined) {
    console.log("[CE background]", message);
    return;
  }

  console.log("[CE background]", message, details);
}

function setIcon(enabled: boolean): void {
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setIcon({ path: getActionIconPaths(enabled) }, () => {
    if (!chrome.runtime.lastError) {
      return;
    }

    console.warn("Failed to set action icon", {
      enabled,
      message: chrome.runtime.lastError.message,
    });

    chrome.action.setIcon({ path: getActionIconPaths(true) });
  });
}

function setActionState(enabled: boolean): void {
  setIcon(enabled);
}

function sendRefreshMessage(tabId: number): void {
  logDebug("Sending refresh message", { tabId, type: REFRESH_COORDINATE_OVERLAY_MESSAGE });
  chrome.tabs.sendMessage(tabId, { type: REFRESH_COORDINATE_OVERLAY_MESSAGE }, () => {
    if (chrome.runtime.lastError) {
      logDebug("Refresh message failed", {
        tabId,
        error: chrome.runtime.lastError.message,
      });
      return;
    }

    logDebug("Refresh message delivered", { tabId });
  });
}

function syncChessTabs(enabled: boolean): void {
  logDebug("Syncing chess tabs", { enabled });
  chrome.tabs.query({ url: CHESS_URL_MATCHES }, (tabs) => {
    logDebug("Matched chess tabs", { count: tabs.length, tabIds: tabs.map((tab) => tab.id) });

    for (const tab of tabs) {
      if (typeof tab.id !== "number") {
        logDebug("Skipping tab without numeric id", tab);
        continue;
      }

      sendRefreshMessage(tab.id);
    }
  });
}

function syncStateFromStorage(): void {
  chrome.storage.local.get(EXTENSION_ENABLED_KEY, (result) => {
    const enabled = Boolean(result[EXTENSION_ENABLED_KEY]);
    logDebug("State from storage", { enabled, raw: result[EXTENSION_ENABLED_KEY] });
    setActionState(enabled);
    syncChessTabs(enabled);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  logDebug("onInstalled fired; initializing extension state");
  chrome.storage.local.set({ [EXTENSION_ENABLED_KEY]: false }, () => {
    setActionState(false);
    logDebug("Initial state set to disabled");
  });
});

chrome.runtime.onStartup.addListener(() => {
  logDebug("onStartup fired");
  syncStateFromStorage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[EXTENSION_ENABLED_KEY]) {
    return;
  }

  const enabled = Boolean(changes[EXTENSION_ENABLED_KEY].newValue);
  logDebug("Storage changed", {
    oldValue: changes[EXTENSION_ENABLED_KEY].oldValue,
    newValue: changes[EXTENSION_ENABLED_KEY].newValue,
    enabled,
  });
  setActionState(enabled);
  syncChessTabs(enabled);
});
