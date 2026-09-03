const EXTENSION_ENABLED_KEY = "extensionEnabled";

export {};

const statusElement = document.getElementById("status") as HTMLParagraphElement;
const toggleButton = document.getElementById("toggle-button") as HTMLButtonElement;

function render(enabled: boolean): void {
	statusElement.textContent = enabled ? "Extension is enabled" : "Extension is disabled";
	toggleButton.textContent = enabled ? "ON" : "OFF";
	toggleButton.classList.toggle("enabled", enabled);
	toggleButton.classList.toggle("disabled", !enabled);
}

function readEnabledState(callback: (enabled: boolean) => void): void {
	chrome.storage.local.get(EXTENSION_ENABLED_KEY, (result) => {
		callback(Boolean(result[EXTENSION_ENABLED_KEY]));
	});
}

readEnabledState((enabled) => {
	render(enabled);
});

toggleButton.addEventListener("click", () => {
	readEnabledState((enabled) => {
		chrome.storage.local.set({ [EXTENSION_ENABLED_KEY]: !enabled }, () => {
			render(!enabled);
		});
	});
});