import assert from "node:assert/strict";
import test from "node:test";

import { buildReaderContent, openReader } from "../scripts/reader.mjs";
import { resetScriptureTypeRegistryForTests } from "../scripts/scripture-types.mjs";

class DialogV2Stub {
  constructor(options) {
    this.options = options;
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  async render() {
    return this;
  }
}

function configureFoundry() {
  globalThis.game = {
    user: {
      isGM: true
    },
    modules: new Map(),
    i18n: {
      localize: (key) => key
    }
  };
  globalThis.ui = {
    notifications: {
      warn: () => undefined
    }
  };
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: DialogV2Stub
      },
      ux: {
        TextEditor: {
          implementation: {
            enrichHTML: async (html) => html
          }
        }
      }
    },
    utils: {}
  };
}

function itemWithType(typeId) {
  const data = {
    typeId,
    kind: typeId,
    html: "<p>Use <code>game.settings.get()</code>.</p><pre><code>block()</code></pre>",
    author: "Archivist"
  };
  return {
    id: `item-${typeId}`,
    uuid: `Item.${typeId}`,
    name: "Reader Test",
    img: "modules/scriptoria/assets/book.svg",
    documentName: "Item",
    isOwner: true,
    getFlag: () => data,
    getRollData: () => ({})
  };
}

test("unavailable helper documents remain readable through the shared dark reader content", async () => {
  configureFoundry();
  resetScriptureTypeRegistryForTests();
  const item = itemWithType("missing-helper.prophecy");

  const content = await buildReaderContent(item);
  assert.match(content, /scriptoria-reader scriptoria-rendered-surface/);
  assert.match(content, /scriptoria-rendered-content/);
  assert.match(content, /Unavailable scripture type: missing-helper\.prophecy/);
  assert.match(content, /<pre><code>block\(\)<\/code><\/pre>/);
});

test("openReader uses the one shared Scriptoria document window", async () => {
  configureFoundry();
  resetScriptureTypeRegistryForTests();
  const dialog = await openReader(itemWithType("book"));

  assert.deepEqual(dialog.options.classes, [
    "scriptoria-document-window",
    "scriptoria-reader-window"
  ]);
  assert.match(dialog.options.content, /scriptoria-rendered-content/);
  assert.doesNotMatch(dialog.options.content, /parchment|efe5cf/i);
});
