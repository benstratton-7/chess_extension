const EXTENSION_ENABLED_KEY = "extensionEnabled";
const BOARD_SELECTOR = "wc-chess-board.board, wc-chess-board";
const NATIVE_COORDINATE_SELECTOR = ":scope > svg.coordinates";
const DEBUG = true;

type BoardOrientation = "white" | "black";
type ParsedCoordinateText = { x: number; y: number; value: string };

const boardObserverMap = new WeakMap<HTMLElement, MutationObserver>();
const boardOriginalMarkup = new WeakMap<HTMLElement, string>();
const boardRenderTimerMap = new WeakMap<HTMLElement, number>();
let documentObserver: MutationObserver | null = null;
let documentScanTimer: number | null = null;
let lastObservedBoardCount: number | null = null;
let enabled = false;
type CoordinateWindow = Window & { __ceModifyCoordinatesBooted?: boolean };
const DOCUMENT_SCAN_DEBOUNCE_MS = 250;

function logDebug(message: string, details?: unknown): void {
  if (!DEBUG) {
    return;
  }

  if (details === undefined) {
    console.log("[CE modifyCoordinates]", message);
    return;
  }

  console.log("[CE modifyCoordinates]", message, details);
}

function getBoardElements(): HTMLElement[] {
  const allBoards = Array.from(document.querySelectorAll<HTMLElement>(BOARD_SELECTOR));
  return allBoards.filter(isLikelyChessBoard);
}

function isLikelyChessBoard(boardElement: HTMLElement): boolean {
  return boardElement.matches("wc-chess-board") || boardElement.querySelector(NATIVE_COORDINATE_SELECTOR) !== null;
}

function getCoordinateSvg(boardElement: HTMLElement): SVGElement | null {
  return boardElement.querySelector<SVGElement>(NATIVE_COORDINATE_SELECTOR);
}

function saveOriginalMarkup(boardElement: HTMLElement, coordinateSvg: SVGElement): void {
  if (boardOriginalMarkup.has(boardElement)) {
    return;
  }

  boardOriginalMarkup.set(boardElement, coordinateSvg.innerHTML);
}

function parseCoordinateTextsFromSvg(svgElement: SVGElement): ParsedCoordinateText[] {
  return Array.from(svgElement.querySelectorAll<SVGTextElement>("text"))
    .map((node) => {
      const x = Number.parseFloat(node.getAttribute("x") ?? "");
      const y = Number.parseFloat(node.getAttribute("y") ?? "");
      const value = (node.textContent ?? "").trim().toLowerCase();

      return { x, y, value };
    })
    .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y) && entry.value.length > 0);
}

function parseCoordinateTextsFromMarkup(markup: string): ParsedCoordinateText[] {
  const namespace = "http://www.w3.org/2000/svg";
  const svgElement = document.createElementNS(namespace, "svg");
  svgElement.innerHTML = markup;
  return parseCoordinateTextsFromSvg(svgElement);
}

function detectOrientationFromClass(boardElement: HTMLElement): BoardOrientation | null {
  const classString = boardElement.className.toLowerCase();

  if (classString.includes("orientation-black") || classString.includes("flipped") || classString.includes("board-flipped")) {
    return "black";
  }

  if (classString.includes("orientation-white")) {
    return "white";
  }

  return null;
}

function buildCoordinates(orientation: BoardOrientation): string[] {
  const coordinates: string[] = [];

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const fileIndex = orientation === "white" ? column : 7 - column;
      const rankNumber = orientation === "white" ? 8 - row : row + 1;
      coordinates.push(`${String.fromCharCode(97 + fileIndex)}${rankNumber}`);
    }
  }

  return coordinates;
}

function detectOrientationFromTexts(parsedNodes: ParsedCoordinateText[]): BoardOrientation | null {
  const fileEntries = parsedNodes
    .filter((entry) => /^[a-h]$/.test(entry.value))
    .sort((left, right) => left.x - right.x);

  const rankEntries = parsedNodes
    .filter((entry) => /^[1-8]$/.test(entry.value))
    .sort((left, right) => left.y - right.y);

  if (fileEntries.length < 8 || rankEntries.length < 8) {
    return null;
  }

  const leftToRightFiles = fileEntries.slice(0, 8).map((entry) => entry.value).join("");
  const topToBottomRanks = rankEntries.slice(0, 8).map((entry) => entry.value).join("");

  if (leftToRightFiles === "abcdefgh" && topToBottomRanks === "87654321") {
    return "white";
  }

  if (leftToRightFiles === "hgfedcba" && topToBottomRanks === "12345678") {
    return "black";
  }

  return null;
}

function detectOrientation(boardElement: HTMLElement, coordinateSvg: SVGElement): BoardOrientation {
  const classOrientation = detectOrientationFromClass(boardElement);
  if (classOrientation) {
    return classOrientation;
  }

  const currentOrientation = detectOrientationFromTexts(parseCoordinateTextsFromSvg(coordinateSvg));
  if (currentOrientation) {
    return currentOrientation;
  }

  const originalMarkup = boardOriginalMarkup.get(boardElement);
  if (!originalMarkup) {
    return "white";
  }

  return detectOrientationFromTexts(parseCoordinateTextsFromMarkup(originalMarkup)) ?? "white";
}

function inferFontSize(coordinateSvg: SVGElement): string {
  const firstText = coordinateSvg.querySelector<SVGTextElement>("text");
  return firstText?.getAttribute("font-size") ?? "2.8";
}

function getContrastClassName(row: number, column: number): string {
  const isDarkSquare = (row + column) % 2 === 0;
  return isDarkSquare ? "coordinate-light" : "coordinate-dark";
}

function formatCoordValue(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function isAlreadyRendered(
  coordinateSvg: SVGElement,
  coordinates: string[],
  fontSize: string,
): boolean {
  const textNodes = Array.from(coordinateSvg.querySelectorAll<SVGTextElement>("text"));
  if (textNodes.length !== 64) {
    return false;
  }

  for (let index = 0; index < 64; index += 1) {
    const textNode = textNodes[index];
    if ((textNode.textContent ?? "") !== coordinates[index]) {
      return false;
    }

    if ((textNode.getAttribute("font-size") ?? "") !== fontSize) {
      return false;
    }
  }

  return true;
}

function renderInSquareCoordinates(boardElement: HTMLElement): void {
  const coordinateSvg = getCoordinateSvg(boardElement);
  if (!coordinateSvg) {
    logDebug("Board found but no coordinate SVG present", {
      boardId: boardElement.id || null,
      classes: boardElement.className,
    });
    return;
  }

  saveOriginalMarkup(boardElement, coordinateSvg);

  const orientation = detectOrientation(boardElement, coordinateSvg);
  const coordinates = buildCoordinates(orientation);
  const fontSize = inferFontSize(coordinateSvg);

  if (isAlreadyRendered(coordinateSvg, coordinates, fontSize)) {
    return;
  }

  logDebug("Rendering board coordinates", {
    boardId: boardElement.id || null,
    orientation,
    fontSize,
  });

  const namespace = "http://www.w3.org/2000/svg";
  const fragment = document.createDocumentFragment();

  const cellWidth = 12.5;
  const cellHeight = 12.5;

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const textNode = document.createElementNS(namespace, "text");
      const index = row * 8 + column;

      const x = column * cellWidth + 1.0;
      const y = row * cellHeight + 11.6;

      textNode.setAttribute("x", formatCoordValue(x));
      textNode.setAttribute("y", formatCoordValue(y));
      textNode.setAttribute("font-size", fontSize);
      textNode.setAttribute("class", getContrastClassName(row, column));
      textNode.textContent = coordinates[index];

      fragment.appendChild(textNode);
    }
  }

  coordinateSvg.replaceChildren(fragment);
  boardElement.setAttribute("data-ce-coordinates-overridden", "true");
  logDebug("Coordinate SVG replaced with in-square labels", {
    boardId: boardElement.id || null,
    labelCount: 64,
  });
}

function restoreNativeCoordinates(boardElement: HTMLElement): void {
  const coordinateSvg = getCoordinateSvg(boardElement);
  if (!coordinateSvg) {
    logDebug("Restore skipped because coordinate SVG is missing", {
      boardId: boardElement.id || null,
    });
    return;
  }

  const originalMarkup = boardOriginalMarkup.get(boardElement);
  if (!originalMarkup) {
    logDebug("Restore skipped because original markup is unavailable", {
      boardId: boardElement.id || null,
    });
    return;
  }

  coordinateSvg.innerHTML = originalMarkup;
  boardElement.removeAttribute("data-ce-coordinates-overridden");
  logDebug("Native coordinates restored", { boardId: boardElement.id || null });
}

function scheduleBoardRender(boardElement: HTMLElement): void {
  if (!enabled) {
    return;
  }

  const previousTimer = boardRenderTimerMap.get(boardElement);
  if (previousTimer !== undefined) {
    window.clearTimeout(previousTimer);
  }

  const timer = window.setTimeout(() => {
    boardRenderTimerMap.delete(boardElement);
    renderInSquareCoordinates(boardElement);
  }, 80);

  boardRenderTimerMap.set(boardElement, timer);
}

function renderAllBoards(): void {
  const boards = getBoardElements();
  logDebug("Rendering all boards", { count: boards.length, enabled });

  for (const boardElement of boards) {
    renderInSquareCoordinates(boardElement);
  }
}

function clearAllBoards(): void {
  const boards = getBoardElements();
  logDebug("Clearing all boards", { count: boards.length });

  for (const boardElement of boards) {
    restoreNativeCoordinates(boardElement);
  }
}

function rerenderActiveBoards(): void {
  if (!enabled) {
    return;
  }

  renderAllBoards();
}

function ensureBoardObserver(boardElement: HTMLElement): void {
  if (boardObserverMap.has(boardElement)) {
    return;
  }

  logDebug("Attaching board observer", {
    boardId: boardElement.id || null,
    classes: boardElement.className,
  });

  const observer = new MutationObserver((mutations) => {
    if (!enabled) {
      return;
    }

    const coordinateSvg = getCoordinateSvg(boardElement);
    const shouldRender = mutations.some((mutation) => {
      if (mutation.type === "attributes" && mutation.target === boardElement) {
        return true;
      }

      if (!coordinateSvg) {
        return mutation.type === "childList";
      }

      if (mutation.target === coordinateSvg || coordinateSvg.contains(mutation.target)) {
        return false;
      }

      return mutation.type === "childList";
    });

    if (!shouldRender) {
      return;
    }

    scheduleBoardRender(boardElement);
  });

  observer.observe(boardElement, {
    childList: true,
    subtree: false,
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  boardObserverMap.set(boardElement, observer);
}

function observeBoards(): void {
  const boards = getBoardElements();
  if (lastObservedBoardCount !== boards.length) {
    logDebug("Observing boards", { count: boards.length, previousCount: lastObservedBoardCount });
    lastObservedBoardCount = boards.length;
  }

  for (const boardElement of boards) {
    ensureBoardObserver(boardElement);
  }
}

function scheduleObserveBoards(): void {
  if (!enabled) {
    return;
  }

  if (documentScanTimer !== null) {
    return;
  }

  documentScanTimer = window.setTimeout(() => {
    documentScanTimer = null;
    observeBoards();
  }, DOCUMENT_SCAN_DEBOUNCE_MS);
}

function ensureDocumentObserver(): void {
  if (documentObserver) {
    return;
  }

  logDebug("Attaching document observer");

  documentObserver = new MutationObserver(() => {
    scheduleObserveBoards();
  });

  documentObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function applyEnabledState(nextEnabled: boolean): void {
  logDebug("Applying enabled state", { previous: enabled, next: nextEnabled });
  enabled = nextEnabled;

  if (enabled) {
    lastObservedBoardCount = null;
    ensureDocumentObserver();
    observeBoards();
    renderAllBoards();
    return;
  }

  if (documentScanTimer !== null) {
    window.clearTimeout(documentScanTimer);
    documentScanTimer = null;
  }

  clearAllBoards();
}

function initializeFromStorage(): void {
  chrome.storage.local.get(EXTENSION_ENABLED_KEY, (result) => {
    logDebug("Initial state read from storage", {
      raw: result[EXTENSION_ENABLED_KEY],
      enabled: Boolean(result[EXTENSION_ENABLED_KEY]),
    });
    applyEnabledState(Boolean(result[EXTENSION_ENABLED_KEY]));
  });
}

function setupStorageListener(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[EXTENSION_ENABLED_KEY]) {
      return;
    }

    logDebug("Storage change received", {
      oldValue: changes[EXTENSION_ENABLED_KEY].oldValue,
      newValue: changes[EXTENSION_ENABLED_KEY].newValue,
    });

    applyEnabledState(Boolean(changes[EXTENSION_ENABLED_KEY].newValue));
  });
}

function setupRuntimeMessageListener(): void {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== "object") {
      return;
    }

    const payload = message as { type?: string };
    if (payload.type !== "CE_REFRESH_COORDINATE_OVERLAY") {
      return;
    }

    logDebug("Refresh message received", payload);

    rerenderActiveBoards();
  });
}

function boot(): void {
  logDebug("Booting modifyCoordinates script", { readyState: document.readyState, href: window.location.href });
  setupStorageListener();
  setupRuntimeMessageListener();
  initializeFromStorage();
}

const coordinateWindow = window as CoordinateWindow;

if (!coordinateWindow.__ceModifyCoordinatesBooted) {
  coordinateWindow.__ceModifyCoordinatesBooted = true;
  logDebug("First-time bootstrap");

  if (document.readyState === "loading") {
    logDebug("Document loading; waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
} else {
  logDebug("Bootstrap skipped because script is already initialized");
}
