// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import {
  attachImporterLayoutPersistence,
  clampImporterLayout,
  getDefaultImporterPosition,
  getImporterInitialPosition,
  parseImporterLayout,
  serializeImporterLayout
} from "../scripts/importer-layout.mjs";

const viewport = {
  width: 1024,
  height: 768
};

test("uses default dimensions and centered placement when remembering is disabled", () => {
  assert.deepEqual(getImporterInitialPosition({
    remember: false,
    savedValue: JSON.stringify({ width: 600, height: 500, left: 20, top: 20 }),
    viewport
  }), {
    width: 820,
    height: 736
  });
});

test("restores a valid saved importer layout", () => {
  assert.deepEqual(getImporterInitialPosition({
    remember: true,
    savedValue: JSON.stringify({ width: 700, height: 600, left: 120, top: 80 }),
    viewport
  }), {
    width: 700,
    height: 600,
    left: 120,
    top: 80
  });
});

test("clamps off-screen, oversized, and negative saved layouts", () => {
  assert.deepEqual(clampImporterLayout({
    width: 1600,
    height: 1200,
    left: -900,
    top: 900
  }, viewport), {
    width: 992,
    height: 736,
    left: 16,
    top: 16
  });
});

test("preserves minimum dimensions when the viewport supports them", () => {
  assert.deepEqual(clampImporterLayout({
    width: 100,
    height: 100,
    left: 900,
    top: 700
  }, viewport), {
    width: 520,
    height: 480,
    left: 488,
    top: 272
  });
});

test("fits safely into a viewport smaller than the normal minimum", () => {
  const smallViewport = {
    width: 400,
    height: 300
  };

  assert.deepEqual(getDefaultImporterPosition(smallViewport), {
    width: 368,
    height: 268
  });
  assert.deepEqual(clampImporterLayout({
    width: 820,
    height: 740,
    left: -20,
    top: -20
  }, smallViewport), {
    width: 368,
    height: 268,
    left: 16,
    top: 16
  });
});

test("falls back to centered defaults for invalid saved state", () => {
  assert.equal(parseImporterLayout("not-json"), null);
  assert.equal(parseImporterLayout(JSON.stringify({ width: -1, height: 500, left: 0, top: 0 })), null);
  assert.deepEqual(getImporterInitialPosition({
    remember: true,
    savedValue: "not-json",
    viewport
  }), {
    width: 820,
    height: 736
  });
});

test("serializes only complete finite layouts", () => {
  assert.equal(serializeImporterLayout({ width: 700, height: 600, left: 100, top: 80 }), "{\"width\":700,\"height\":600,\"left\":100,\"top\":80}");
  assert.equal(serializeImporterLayout({ width: 700, height: 600, left: Number.NaN, top: 80 }), "");
});

test("debounces position persistence and flushes the latest layout", async () => {
  const listeners = new Map();
  const writes = [];
  const settings = new Map([
    ["rememberImporterWindow", true],
    ["importerWindowLayout", ""]
  ]);
  globalThis.game = {
    settings: {
      get: (_moduleId, key) => settings.get(key),
      set: async (_moduleId, key, value) => {
        settings.set(key, value);
        writes.push([key, value]);
        return value;
      }
    }
  };

  const application = {
    position: {
      width: 700,
      height: 600,
      left: 100,
      top: 80
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    setPosition(position) {
      this.position = { ...position };
    }
  };
  const windowObject = {
    innerWidth: 1200,
    innerHeight: 900,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };

  const controller = attachImporterLayoutPersistence(application, {
    debounceMs: 10,
    windowObject
  });

  listeners.get("position")();
  application.position.left = 130;
  listeners.get("position")();
  application.position.left = 160;
  listeners.get("position")();

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0][1]), {
    width: 700,
    height: 600,
    left: 160,
    top: 80
  });

  application.position.top = 110;
  await controller.flush();
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[1][1]).top, 110);
  controller.dispose();
});

test("resetting prevents an already-open importer from restoring the cleared layout", async () => {
  const writes = [];
  const settings = new Map([
    ["rememberImporterWindow", true],
    ["importerWindowLayout", "{\"width\":700,\"height\":600,\"left\":100,\"top\":80}"]
  ]);
  globalThis.game = {
    settings: {
      get: (_moduleId, key) => settings.get(key),
      set: async (_moduleId, key, value) => {
        settings.set(key, value);
        writes.push([key, value]);
        return value;
      }
    }
  };

  const application = {
    position: {
      width: 720,
      height: 620,
      left: 140,
      top: 100
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };
  const windowObject = {
    innerWidth: 1200,
    innerHeight: 900,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };

  const controller = attachImporterLayoutPersistence(application, {
    debounceMs: 5,
    windowObject
  });
  const { clearImporterLayout } = await import("../scripts/importer-layout.mjs");
  await clearImporterLayout();
  const persisted = await controller.flush();

  assert.equal(persisted, false);
  assert.deepEqual(writes, [["importerWindowLayout", ""]]);
  controller.dispose();
});
