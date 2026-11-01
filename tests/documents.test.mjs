import assert from "node:assert/strict";
import test from "node:test";

import {
  getDocumentSource,
  getDocumentSourceFormat,
  prepareDocumentData
} from "../scripts/documents.mjs";

function configureFoundry() {
  globalThis.game = {
    documentTypes: {
      Item: ["base", "loot"]
    }
  };
  globalThis.foundry = {
    utils: {}
  };
}

test("prepares Markdown source with backwards-compatible flags", () => {
  configureFoundry();
  const prepared = prepareDocumentData({
    sourceFormat: "markdown",
    source: "# Field Guide\n\nBody",
    itemType: "loot",
    kind: "documentation"
  });

  assert.equal(prepared.title, "Field Guide");
  assert.equal(prepared.flagData.sourceFormat, "markdown");
  assert.equal(prepared.flagData.source, "# Field Guide\n\nBody");
  assert.equal(prepared.flagData.markdown, "# Field Guide\n\nBody");
  assert.doesNotMatch(prepared.html, /<h1>/);
});

test("prepares sanitised HTML source and extracts its title", () => {
  configureFoundry();
  const prepared = prepareDocumentData({
    sourceFormat: "html",
    source: "<html><head><title>Fallback</title></head><body><h1>Merchant Ledger</h1><p>Coins</p><script>bad()</script></body></html>",
    sourceFileName: "ledger.html",
    itemType: "loot",
    kind: "book"
  });

  assert.equal(prepared.title, "Merchant Ledger");
  assert.equal(prepared.flagData.sourceFormat, "html");
  assert.equal(prepared.flagData.sourceFileName, "ledger.html");
  assert.equal(prepared.flagData.markdown, "");
  assert.match(prepared.html, /<p>Coins<\/p>/);
  assert.doesNotMatch(prepared.html, /script|<h1>/i);
});

test("reads legacy 1.0.x Markdown flags", () => {
  const legacy = {
    markdown: "# Legacy Book"
  };
  assert.equal(getDocumentSourceFormat(legacy), "markdown");
  assert.equal(getDocumentSource(legacy), "# Legacy Book");
});

test("maps the legacy createFromMarkdown API payload into the new source model", async () => {
  configureFoundry();
  globalThis.game.user = { isGM: true };
  globalThis.game.settings = {
    get: (scope, key) => key === "createKindFolders" ? false : "Runyth Scriptoria"
  };
  globalThis.game.folders = [];
  globalThis.game.system = { id: "dnd5e" };
  globalThis.CONST = {
    DOCUMENT_OWNERSHIP_LEVELS: {
      NONE: 0,
      OBSERVER: 2
    }
  };
  globalThis.Folder = {
    implementation: {
      create: async (data) => ({ id: "folder", ...data })
    }
  };
  let createdData;
  globalThis.Item = {
    implementation: {
      create: async (data) => {
        createdData = data;
        return data;
      }
    }
  };
  globalThis.ui = {
    notifications: {
      info: () => undefined
    }
  };

  const { createFromMarkdown } = await import("../scripts/documents.mjs");
  await createFromMarkdown({
    markdown: "# Legacy API Book\n\nBody",
    kind: "book",
    itemType: "loot"
  });

  const flag = createdData.flags["runyth-scriptoria"].document;
  assert.equal(flag.sourceFormat, "markdown");
  assert.equal(flag.source, "# Legacy API Book\n\nBody");
});
