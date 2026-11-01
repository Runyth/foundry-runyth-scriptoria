// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  MODULE_ID,
  SETTINGS
} from "./constants.mjs";

export function debugLog(boundary, data) {
  if (!isDebugLoggingEnabled()) return;
  console.debug(`${MODULE_ID} | ${boundary}`, cloneDebugValue(data));
}

function isDebugLoggingEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.debugLogging) === true;
  } catch {
    return false;
  }
}

function cloneDebugValue(value) {
  if (Array.isArray(value)) return value.map(cloneDebugValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !new Set(["source", "markdown", "html", "content"]).has(key))
        .map(([key, nested]) => [key, cloneDebugValue(nested)])
    );
  }
  return value;
}
