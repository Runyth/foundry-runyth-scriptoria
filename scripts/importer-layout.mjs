import { MODULE_ID, SETTINGS } from "./constants.mjs";

export const DEFAULT_IMPORTER_SIZE = Object.freeze({
  width: 820,
  height: 740
});

export const MIN_IMPORTER_SIZE = Object.freeze({
  width: 520,
  height: 480
});

export const IMPORTER_VIEWPORT_MARGIN = 16;
export const IMPORTER_LAYOUT_DEBOUNCE_MS = 400;

let layoutResetGeneration = 0;

export function getImporterInitialPosition({
  remember = isImporterLayoutRemembered(),
  savedValue = remember ? readImporterLayoutSetting() : "",
  viewport = getViewportSize()
} = {}) {
  const fallback = getDefaultImporterPosition(viewport);
  if (!remember) return fallback;

  const saved = parseImporterLayout(savedValue);
  if (!saved) return fallback;

  return clampImporterLayout(saved, viewport) ?? fallback;
}

export function getDefaultImporterPosition(viewport = getViewportSize()) {
  if (!viewport) return { ...DEFAULT_IMPORTER_SIZE };

  const bounds = getViewportBounds(viewport);
  return {
    width: Math.min(DEFAULT_IMPORTER_SIZE.width, bounds.availableWidth),
    height: Math.min(DEFAULT_IMPORTER_SIZE.height, bounds.availableHeight)
  };
}

export function clampImporterLayout(layout, viewport = getViewportSize()) {
  const candidate = normalizeLayout(layout);
  if (!candidate || !viewport) return null;

  const bounds = getViewportBounds(viewport);
  const minimumWidth = Math.min(MIN_IMPORTER_SIZE.width, bounds.availableWidth);
  const minimumHeight = Math.min(MIN_IMPORTER_SIZE.height, bounds.availableHeight);
  const width = clamp(candidate.width, minimumWidth, bounds.availableWidth);
  const height = clamp(candidate.height, minimumHeight, bounds.availableHeight);
  const maximumLeft = Math.max(bounds.margin, viewport.width - width - bounds.margin);
  const maximumTop = Math.max(bounds.margin, viewport.height - height - bounds.margin);

  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round(clamp(candidate.left, bounds.margin, maximumLeft)),
    top: Math.round(clamp(candidate.top, bounds.margin, maximumTop))
  };
}

export function parseImporterLayout(value) {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return normalizeLayout(parsed);
  } catch {
    return null;
  }
}

export function serializeImporterLayout(layout) {
  const normalized = normalizeLayout(layout);
  return normalized ? JSON.stringify(normalized) : "";
}

export function captureImporterLayout(application, viewport = getViewportSize()) {
  const position = application?.position ?? {};
  const rectangle = application?.element?.getBoundingClientRect?.();
  const candidate = {
    width: finiteNumber(position.width) ?? finiteNumber(rectangle?.width),
    height: finiteNumber(position.height) ?? finiteNumber(rectangle?.height),
    left: finiteNumber(position.left) ?? finiteNumber(rectangle?.left),
    top: finiteNumber(position.top) ?? finiteNumber(rectangle?.top)
  };

  return clampImporterLayout(candidate, viewport);
}

export function attachImporterLayoutPersistence(application, {
  debounceMs = IMPORTER_LAYOUT_DEBOUNCE_MS,
  windowObject = globalThis.window
} = {}) {
  if (!application || !isImporterLayoutRemembered()) {
    return createInactiveController();
  }

  let timeoutId = null;
  let disposed = false;
  const attachedGeneration = layoutResetGeneration;
  let lastSavedValue = readImporterLayoutSetting();

  const persist = async () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (attachedGeneration !== layoutResetGeneration || !isImporterLayoutRemembered()) return false;

    const layout = captureImporterLayout(application, getViewportSize(windowObject));
    if (!layout) return false;

    const serialized = serializeImporterLayout(layout);
    if (!serialized || serialized === lastSavedValue) return false;

    await game.settings.set(MODULE_ID, SETTINGS.importerWindowLayout, serialized);
    lastSavedValue = serialized;
    return true;
  };

  const schedule = () => {
    if (disposed) return;
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      persist().catch(logPersistenceError);
    }, debounceMs);
  };

  const keepOnScreen = () => {
    if (disposed) return;
    const layout = captureImporterLayout(application, getViewportSize(windowObject));
    if (!layout) return;
    application.setPosition?.(layout);
    schedule();
  };

  const onPosition = () => schedule();
  const onViewportResize = () => keepOnScreen();
  const onClose = () => {
    void persist().catch(logPersistenceError);
    dispose();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    application.removeEventListener?.("position", onPosition);
    application.removeEventListener?.("close", onClose);
    windowObject?.removeEventListener?.("resize", onViewportResize);
  };

  application.addEventListener?.("position", onPosition);
  application.addEventListener?.("close", onClose, { once: true });
  windowObject?.addEventListener?.("resize", onViewportResize, { passive: true });

  return Object.freeze({
    schedule,
    flush: persist,
    keepOnScreen,
    dispose
  });
}

export async function clearImporterLayout() {
  layoutResetGeneration += 1;
  await game.settings.set(MODULE_ID, SETTINGS.importerWindowLayout, "");
}

export function getViewportSize(windowObject = globalThis.window) {
  const visualViewport = windowObject?.visualViewport;
  const width = finiteNumber(visualViewport?.width)
    ?? finiteNumber(windowObject?.innerWidth)
    ?? finiteNumber(globalThis.document?.documentElement?.clientWidth);
  const height = finiteNumber(visualViewport?.height)
    ?? finiteNumber(windowObject?.innerHeight)
    ?? finiteNumber(globalThis.document?.documentElement?.clientHeight);

  if (!width || !height || width <= 0 || height <= 0) return null;
  return {
    width,
    height
  };
}

function isImporterLayoutRemembered() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.rememberImporterWindow) === true;
  } catch {
    return false;
  }
}

function readImporterLayoutSetting() {
  try {
    return String(game.settings.get(MODULE_ID, SETTINGS.importerWindowLayout) ?? "");
  } catch {
    return "";
  }
}

function getViewportBounds(viewport) {
  const maximumMargin = Math.max(0, Math.floor(Math.min(viewport.width, viewport.height) / 4));
  const margin = Math.min(IMPORTER_VIEWPORT_MARGIN, maximumMargin);
  return {
    margin,
    availableWidth: Math.max(1, viewport.width - (margin * 2)),
    availableHeight: Math.max(1, viewport.height - (margin * 2))
  };
}

function normalizeLayout(layout) {
  if (!layout || typeof layout !== "object") return null;

  const width = finiteNumber(layout.width);
  const height = finiteNumber(layout.height);
  const left = finiteNumber(layout.left);
  const top = finiteNumber(layout.top);
  if (width === null || height === null || left === null || top === null) return null;
  if (width <= 0 || height <= 0) return null;

  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round(left),
    top: Math.round(top)
  };
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createInactiveController() {
  return Object.freeze({
    schedule: () => undefined,
    flush: async () => false,
    keepOnScreen: () => undefined,
    dispose: () => undefined
  });
}

function logPersistenceError(error) {
  console.error(`${MODULE_ID} | Unable to save importer window placement.`, error);
}
