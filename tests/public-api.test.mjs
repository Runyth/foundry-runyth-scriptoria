import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicApi,
  publishPublicApi,
  resetApiPublicationForTests
} from "../scripts/public-api.mjs";
import { resetScriptureTypeRegistryForTests } from "../scripts/scripture-types.mjs";

function operations() {
  return {
    openImporter: () => undefined,
    openReader: async () => undefined,
    openDocumentView: async () => undefined,
    getReaderModes: () => [],
    getDefaultSceneDocumentView: () => "simple-reader",
    showToAllPlayers: async () => undefined,
    showToSelectedPlayers: async () => undefined,
    showPlayerSelectionDialog: async () => undefined,
    createFromMarkdown: async () => undefined,
    createFromSource: async () => undefined,
    updateFromMarkdown: async () => undefined,
    updateFromSource: async () => undefined,
    isScriptoriaItem: () => false
  };
}

test.beforeEach(() => {
  resetScriptureTypeRegistryForTests();
  resetApiPublicationForTests();
});

test("publishes the versioned API on the Runyth Scriptoria module and announces the same object", () => {
  const moduleRecord = {
    id: "runyth-scriptoria",
    active: true,
    version: "1.7.3"
  };
  const calls = [];
  globalThis.game = {
    modules: new Map([["runyth-scriptoria", moduleRecord]])
  };
  globalThis.Hooks = {
    callAll: (...args) => calls.push(args)
  };

  const api = createPublicApi(operations());
  assert.equal(api.version, "1.2.0");
  assert.deepEqual(api.capabilities, [
    "scripture-types",
    "document-readers",
    "player-display",
    "item-economics"
  ]);
  assert.equal(typeof api.openDocumentView, "function");
  assert.equal(typeof api.showToSelectedPlayers, "function");
  assert.equal(Object.isFrozen(api), true);

  assert.equal(publishPublicApi(api, { announce: true }), true);
  assert.equal(moduleRecord.api, api);
  assert.deepEqual(calls, [["runyth-scriptoria.apiReady", api]]);

  publishPublicApi(api, { announce: true });
  assert.equal(calls.length, 1);
});

test("public registry methods expose immutable safe data rather than the internal registry", () => {
  const provider = {
    id: "api-test-helper",
    active: true,
    version: "1.0.0"
  };
  globalThis.game = {
    modules: new Map([
      ["runyth-scriptoria", { id: "runyth-scriptoria", active: true, version: "1.7.3" }],
      [provider.id, provider]
    ]),
    i18n: {
      localize: (key) => key
    }
  };
  globalThis.Hooks = {
    callAll: () => undefined
  };

  const api = createPublicApi(operations());
  const result = api.registerScriptureType({
    id: "api-test-helper.test",
    provider: "api-test-helper",
    label: "Test",
    icon: "fa-solid fa-flask",
    image: "modules/api-test-helper/test.svg"
  });

  assert.equal(result.ok, true);
  assert.equal(api.hasScriptureType("api-test-helper.test"), true);
  assert.equal(api.getScriptureType("api-test-helper.test").label, "Test");
  assert.equal(Object.isFrozen(api.getScriptureTypes()), true);
});
