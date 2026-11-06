// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createScriptoriaDialogClass,
  getScriptoriaDialogClass
} from "../scripts/scriptoria-dialog.mjs";
import { FLEET_UI_CLASS, WINDOW_MARKER } from "../scripts/ui-look.mjs";

let stockLook;

function configureStockLook() {
  globalThis.game = {
    settings: {
      get: (_moduleId, key) => (key === "stockFoundryLook" ? stockLook : undefined)
    }
  };
}

// A Foundry-shaped host that deliberately does not forward window `classes`
// options onto the rendered element; the subclass must carry the fleet look
// itself at render time.
class HostDialogBase {
  constructor(options) {
    this.options = options;
    const classes = new Set();
    const attributes = new Map();
    this.element = {
      classes,
      attributes,
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle: (name, force) => {
          const active = force === undefined ? !classes.has(name) : Boolean(force);
          if (active) classes.add(name);
          else classes.delete(name);
          return active;
        }
      },
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null
    };
  }

  async render() {
    await this._onRender?.({}, {});
    return this;
  }
}

test.beforeEach(() => {
  stockLook = false;
  configureStockLook();
});

test("applies the fleet look directly to the rendered window element", async () => {
  const ScriptoriaDialog = createScriptoriaDialogClass(HostDialogBase);
  const dialog = new ScriptoriaDialog({
    classes: [
      "runyth-scriptoria-document-window",
      "runyth-scriptoria-reader-window"
    ]
  });

  assert.deepEqual(dialog.options.classes, [
    "runyth-scriptoria-document-window",
    "runyth-scriptoria-reader-window",
    FLEET_UI_CLASS
  ]);

  await dialog.render();
  assert.equal(dialog.element.getAttribute(WINDOW_MARKER), "");
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), true);
});

test("keeps the stock look verbatim at render time while the toggle is enabled", async () => {
  stockLook = true;
  const ScriptoriaDialog = createScriptoriaDialogClass(HostDialogBase);
  const dialog = new ScriptoriaDialog({
    classes: ["runyth-scriptoria-economics-settings-window"]
  });

  assert.deepEqual(dialog.options.classes, ["runyth-scriptoria-economics-settings-window"]);

  await dialog.render();
  assert.equal(dialog.element.getAttribute(WINDOW_MARKER), "");
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), false);
});

test("re-renders flip the fleet class with the toggle in both directions", async () => {
  stockLook = true;
  const ScriptoriaDialog = createScriptoriaDialogClass(HostDialogBase);
  const dialog = new ScriptoriaDialog({
    classes: ["runyth-scriptoria-importer-window"]
  });

  await dialog.render();
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), false);

  stockLook = false;
  await dialog.render();
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), true);

  stockLook = true;
  await dialog.render();
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), false);
});

test("syncOpenWindows reaches marker windows even when no option classes landed", async () => {
  stockLook = true;
  const ScriptoriaDialog = createScriptoriaDialogClass(HostDialogBase);
  const dialog = new ScriptoriaDialog({
    classes: ["runyth-scriptoria-reader-window"]
  });
  await dialog.render();
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), false);
  assert.equal(dialog.element.classes.size, 0);

  const { syncOpenWindows } = await import("../scripts/ui-look.mjs");
  const tracked = [];
  globalThis.document = {
    querySelectorAll: (selector) => {
      tracked.push(selector);
      return [dialog.element];
    }
  };

  stockLook = false;
  assert.equal(syncOpenWindows(), false);
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), true);
  assert.ok(tracked.every((selector) => selector.includes(`[${WINDOW_MARKER}]`)));

  stockLook = true;
  assert.equal(syncOpenWindows(), true);
  assert.equal(dialog.element.classList.contains(FLEET_UI_CLASS), false);

  globalThis.document = undefined;
});

test("resolves the shared dialog class through the host Foundry API", () => {
  globalThis.foundry = { applications: { api: { DialogV2: HostDialogBase } } };
  try {
    const Shared = getScriptoriaDialogClass();
    assert.equal(Object.getPrototypeOf(Shared), HostDialogBase);
    assert.equal(getScriptoriaDialogClass(), Shared);
  } finally {
    globalThis.foundry = undefined;
  }
});
