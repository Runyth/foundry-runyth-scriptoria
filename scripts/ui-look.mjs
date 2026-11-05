// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, SETTINGS } from "./constants.mjs";

export const FLEET_UI_CLASS = "runyth-scriptoria-fleet-ui";

export function isStockFoundryLook() {
  try {
    return Boolean(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.stockFoundryLook));
  } catch {
    return false;
  }
}

export function applyUiLook(element, stock = isStockFoundryLook()) {
  element?.classList?.toggle(FLEET_UI_CLASS, !stock);
}

export function windowClasses(classes) {
  if (isStockFoundryLook()) return [...classes];
  return [...classes, FLEET_UI_CLASS];
}

const WINDOW_SELECTOR = [
  ".runyth-scriptoria-document-window",
  ".runyth-scriptoria-reader-window",
  ".runyth-scriptoria-importer-window",
  ".runyth-scriptoria-economics-settings-window"
].join(",");

export function syncOpenWindows() {
  const stock = isStockFoundryLook();
  for (const element of globalThis.document?.querySelectorAll?.(WINDOW_SELECTOR) ?? []) {
    applyUiLook(element, stock);
  }
  return stock;
}
