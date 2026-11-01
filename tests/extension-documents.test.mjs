// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import {
  createFromSource,
  getDocumentTypeId,
  getScriptoriaData,
  prepareDocumentData
} from "../scripts/documents.mjs";
import {
  getScriptureType,
  getScriptureTypeOrFallback,
  registerScriptureType,
  resetScriptureTypeRegistryForTests
} from "../scripts/scripture-types.mjs";

const PROVIDER_ID = "document-helper";
const TYPE_ID = `${PROVIDER_ID}.decree`;

function configureFoundry() {
  globalThis.game = {
    user: {
      isGM: true
    },
    modules: new Map([
      [PROVIDER_ID, {
        id: PROVIDER_ID,
        active: true,
        version: "1.2.0"
      }]
    ]),
    documentTypes: {
      Item: ["base", "loot"]
    },
    settings: {
      get: (_scope, key) => {
        if (key === "rootFolder") return "Runyth Scriptoria";
        if (key === "createKindFolders") return false;
        return "embedded";
      }
    },
    folders: [],
    system: {
      id: "dnd5e"
    },
    i18n: {
      localize: (key) => key
    }
  };
  globalThis.Hooks = {
    callAll: () => undefined
  };
  globalThis.foundry = {
    utils: {}
  };
  globalThis.CONST = {
    DOCUMENT_OWNERSHIP_LEVELS: {
      NONE: 0,
      OBSERVER: 2
    }
  };
  globalThis.Folder = {
    implementation: {
      create: async (data) => ({
        id: "runyth-scriptoria-folder",
        ...data
      })
    }
  };
  globalThis.ui = {
    notifications: {
      info: () => undefined
    }
  };
}

function registerType() {
  return registerScriptureType({
    id: TYPE_ID,
    provider: PROVIDER_ID,
    label: "Decree",
    plural: "Decrees",
    icon: "fa-solid fa-scroll",
    image: `modules/${PROVIDER_ID}/assets/decree.svg`,
    sort: 225
  });
}

test("creates a document with a helper type and persists only its stable ID", async () => {
  configureFoundry();
  resetScriptureTypeRegistryForTests();
  assert.equal(registerType().ok, true);

  let createdData;
  globalThis.Item = {
    implementation: {
      create: async (data) => {
        createdData = data;
        return {
          documentName: "Item",
          uuid: "Item.created",
          ...data,
          getFlag: () => data.flags["runyth-scriptoria"].document
        };
      }
    }
  };

  const item = await createFromSource({
    typeId: TYPE_ID,
    sourceFormat: "markdown",
    source: "# Imperial Notice\n\nUse `game.settings.get()`.",
    itemType: "loot"
  });

  const stored = createdData.flags["runyth-scriptoria"].document;
  assert.equal(stored.typeId, TYPE_ID);
  assert.equal(stored.kind, TYPE_ID);
  assert.equal(getDocumentTypeId(stored), TYPE_ID);
  assert.equal(createdData.img, `modules/${PROVIDER_ID}/assets/decree.svg`);
  assert.match(createdData.system.description.value, /runyth-scriptoria-rendered-content/);
  assert.equal(getScriptoriaData(item).typeId, TYPE_ID);
});

test("a stored helper type survives registry reload and temporary provider absence", () => {
  configureFoundry();
  resetScriptureTypeRegistryForTests();
  registerType();

  const stored = {
    typeId: TYPE_ID,
    kind: TYPE_ID,
    sourceFormat: "markdown",
    source: "# Existing Decree\n\nBody"
  };

  resetScriptureTypeRegistryForTests();
  const unavailable = getScriptureTypeOrFallback(getDocumentTypeId(stored));
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.capabilities.reader, true);

  const editable = prepareDocumentData({
    typeId: TYPE_ID,
    sourceFormat: "markdown",
    source: stored.source,
    itemType: "loot",
    allowUnavailableType: true
  });
  assert.equal(editable.typeId, TYPE_ID);
  assert.equal(editable.type.unavailable, true);

  assert.equal(registerType().ok, true);
  assert.equal(getScriptureType(TYPE_ID).unavailable, false);
});
