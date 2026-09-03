import { getActionIconPaths } from "./utils/actionIcon";

const EXTENSION_ENABLED_KEY = "extensionEnabled";

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

function syncStateFromStorage(): void {
  chrome.storage.local.get(EXTENSION_ENABLED_KEY, (result) => {
    const enabled = Boolean(result[EXTENSION_ENABLED_KEY]);
    setActionState(enabled);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ [EXTENSION_ENABLED_KEY]: false }, () => {
    setActionState(false);
  });
});

chrome.runtime.onStartup.addListener(() => {
  syncStateFromStorage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[EXTENSION_ENABLED_KEY]) {
    return;
  }

  setActionState(Boolean(changes[EXTENSION_ENABLED_KEY].newValue));
});
