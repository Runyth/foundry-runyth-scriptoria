import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

class DialogV2Stub {
  constructor(options) {
    this.options = options;
  }
}

test("registers client-specific importer layout settings and reset menu", async () => {
  const registrations = new Map();
  const menus = new Map();
  const writes = [];
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: DialogV2Stub
      }
    }
  };
  globalThis.game = {
    settings: {
      register: (_moduleId, key, data) => registrations.set(key, data),
      registerMenu: (_moduleId, key, data) => menus.set(key, data),
      set: async (_moduleId, key, value) => {
        writes.push([key, value]);
        return value;
      }
    }
  };
  globalThis.ui = {
    notifications: {
      info: () => undefined
    }
  };

  const { registerSettings } = await import("../scripts/settings.mjs");
  registerSettings();

  const remember = registrations.get("rememberImporterWindow");
  assert.equal(remember.scope, "client");
  assert.equal(remember.config, true);
  assert.equal(remember.type, Boolean);
  assert.equal(remember.default, true);

  const layout = registrations.get("importerWindowLayout");
  assert.equal(layout.scope, "client");
  assert.equal(layout.config, false);
  assert.equal(layout.type, String);
  assert.equal(layout.default, "");

  const resetMenu = menus.get("resetImporterWindow");
  assert.equal(resetMenu.restricted, false);
  const dialog = new resetMenu.type();
  const resetButton = dialog.options.buttons.find((button) => button.action === "reset");
  await resetButton.callback();
  assert.deepEqual(writes.at(-1), ["importerWindowLayout", ""]);
});

test("registers a GM-restricted world scene-reader setting with all stable modes", async () => {
  const registrations = new Map();
  globalThis.game = {
    modules: new Map(),
    i18n: {
      localize: (key) => key
    },
    settings: {
      register: (_moduleId, key, data) => registrations.set(key, data),
      registerMenu: () => undefined
    }
  };
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: DialogV2Stub
      }
    }
  };

  const { registerSettings } = await import("../scripts/settings.mjs");
  registerSettings();

  const setting = registrations.get("defaultSceneDocumentView");
  assert.equal(setting.scope, "world");
  assert.equal(setting.config, true);
  assert.equal(setting.restricted, true);
  assert.equal(setting.default, "simple-reader");
  assert.deepEqual(Object.keys(setting.choices), [
    "foundry",
    "enhanced-journal",
    "simple-reader"
  ]);
});


test("registers the GM-only world economics storage and dynamic settings menu", async () => {
  const registrations = new Map();
  const menus = new Map();
  globalThis.game = {
    modules: new Map(),
    i18n: { localize: (key) => key },
    settings: {
      register: (_moduleId, key, data) => registrations.set(key, data),
      registerMenu: (_moduleId, key, data) => menus.set(key, data)
    }
  };
  globalThis.foundry = {
    applications: { api: { DialogV2: DialogV2Stub } }
  };

  const { registerSettings } = await import("../scripts/settings.mjs");
  registerSettings();

  const storage = registrations.get("itemEconomicsOverrides");
  assert.equal(storage.scope, "world");
  assert.equal(storage.config, false);
  assert.equal(storage.restricted, true);
  assert.equal(storage.type, Object);
  assert.deepEqual(storage.default, {});

  const menu = menus.get("itemEconomicsDefaultsMenu");
  assert.equal(menu.restricted, true);
  assert.equal(menu.icon, "fa-solid fa-coins");
  assert.equal(typeof menu.type, "function");
});


test("all visible Runyth Scriptoria settings use localization keys", async () => {
  const source = await readFile(new URL("../scripts/settings.mjs", import.meta.url), "utf8");
  for (const literal of [
    'name: "Root Item folder"',
    'name: "Create document-kind subfolders"',
    'name: "Default world Item access"',
    'name: "Create readable Journal notes on Scene drop"',
    'name: "Scene Journal player access"',
    'name: "Open reader after creation"',
    'name: "Remember importer window position and size"',
    'name: "Reset importer window position and size"'
  ]) assert.equal(source.includes(literal), false, literal);
  assert.match(source, /RUNYTH-SCRIPTORIA\.Settings\.RootFolder\.Name/);
  assert.match(source, /RUNYTH-SCRIPTORIA\.Settings\.ResetImporterWindow\.DialogTitle/);
});
