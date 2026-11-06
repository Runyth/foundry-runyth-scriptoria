// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_ID, SETTINGS } from "../scripts/constants.mjs";

let stockLook;

function windowElement(baseClasses = ["runyth-scriptoria-document-window"]) {
  const classes = new Set(baseClasses);
  const attributes = new Map();
  return {
    classes,
    attributes,
    classList: {
      toggle: (name, force) => {
        const active = force === undefined ? !classes.has(name) : Boolean(force);
        if (active) classes.add(name);
        else classes.delete(name);
        return active;
      },
      add: (name) => classes.add(name),
      contains: (name) => classes.has(name)
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name) ?? null
  };
}

async function loadModule() {
  return import("../scripts/ui-look.mjs");
}

test("registers the stock Foundry look toggle disabled by default on the client scope", async () => {
  const registrations = new Map();
  stockLook = false;
  globalThis.game = {
    settings: {
      register: (_moduleId, key, data) => registrations.set(key, data),
      registerMenu: () => undefined,
      get: (_moduleId, key) => (key === SETTINGS.stockFoundryLook ? stockLook : undefined),
      set: async () => undefined
    }
  };
  globalThis.Hooks = { on: () => 77 };
  globalThis.foundry = {
    applications: { api: { DialogV2: class ScriptoriaDialogStub { constructor(options) { this.options = options; } } } }
  };

  const { registerSettings } = await import("../scripts/settings.mjs");
  registerSettings();

  const entry = registrations.get("stockFoundryLook");
  assert.ok(entry, "the stock look toggle is registered");
  assert.equal(entry.scope, "client");
  assert.equal(entry.config, true);
  assert.equal(entry.type, Boolean);
  assert.equal(entry.default, false);
  assert.equal(entry.name, "Stock Foundry look");
  assert.equal(entry.hint.includes("Garb & Grime"), true);
  assert.equal(MODULE_ID, "runyth-scriptoria");
});

test("applies the fleet class while the stock look stays disabled", async () => {
  stockLook = false;
  const { applyUiLook, FLEET_UI_CLASS } = await loadModule();
  const element = windowElement();
  applyUiLook(element);
  assert.equal(element.classList.contains(FLEET_UI_CLASS), true);
});

test("keeps the stock look verbatim when enabled and windows keep no fleet class", async () => {
  stockLook = true;
  const { applyUiLook, windowClasses, FLEET_UI_CLASS } = await loadModule();
  const element = windowElement();
  applyUiLook(element);
  assert.equal(element.classList.contains(FLEET_UI_CLASS), false);
  assert.deepEqual(
    windowClasses(["runyth-scriptoria-reader-window"]),
    ["runyth-scriptoria-reader-window"]
  );
});

test("extension window factories append the fleet class only while the stock look stays off", async () => {
  const { windowClasses, FLEET_UI_CLASS } = await loadModule();
  stockLook = false;
  assert.deepEqual(
    windowClasses(["runyth-scriptoria-document-window", "runyth-scriptoria-player-selection-window"]),
    [
      "runyth-scriptoria-document-window",
      "runyth-scriptoria-player-selection-window",
      FLEET_UI_CLASS
    ]
  );
  stockLook = true;
  assert.deepEqual(
    windowClasses(["runyth-scriptoria-document-window", "runyth-scriptoria-player-selection-window"]),
    ["runyth-scriptoria-document-window", "runyth-scriptoria-player-selection-window"]
  );
});

test("syncs every mounted module window on settings closure", async () => {
  const reader = windowElement(["runyth-scriptoria-document-window", "runyth-scriptoria-reader-window"]);
  const importer = windowElement(["runyth-scriptoria-importer-window"]);
  const economics = windowElement(["runyth-scriptoria-economics-settings-window"]);
  const sheet = windowElement(["runyth-scriptoria-document-window"]);
  const markerOnly = windowElement([]); // rides only the render-time window marker
  const { FLEET_UI_CLASS, syncOpenWindows, WINDOW_MARKER } = await loadModule();
  markerOnly.setAttribute(WINDOW_MARKER, "");

  const tracked = [];
  globalThis.document = {
    querySelectorAll: (selector) => {
      tracked.push(selector);
      return [reader, importer, economics, sheet, markerOnly];
    }
  };

  stockLook = false;
  assert.equal(syncOpenWindows(), false);
  assert.equal(reader.classList.contains(FLEET_UI_CLASS), true);
  assert.equal(importer.classList.contains(FLEET_UI_CLASS), true);
  assert.equal(economics.classList.contains(FLEET_UI_CLASS), true);
  assert.equal(sheet.classList.contains(FLEET_UI_CLASS), true);
  assert.equal(markerOnly.classList.contains(FLEET_UI_CLASS), true);

  stockLook = true;
  assert.equal(syncOpenWindows(), true);
  assert.equal(reader.classList.contains(FLEET_UI_CLASS), false);
  assert.equal(importer.classList.contains(FLEET_UI_CLASS), false);
  assert.equal(economics.classList.contains(FLEET_UI_CLASS), false);
  assert.equal(sheet.classList.contains(FLEET_UI_CLASS), false);
  assert.equal(markerOnly.classList.contains(FLEET_UI_CLASS), false);

  for (const selector of tracked) {
    assert.ok(selector.includes(`[${WINDOW_MARKER}]`));
    for (const fragment of [
      ".runyth-scriptoria-document-window",
      ".runyth-scriptoria-reader-window",
      ".runyth-scriptoria-importer-window",
      ".runyth-scriptoria-economics-settings-window"
    ]) {
      assert.ok(selector.includes(fragment));
    }
  }
  globalThis.document = undefined;
});
