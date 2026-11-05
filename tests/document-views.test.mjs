// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { FLEET_UI_CLASS } from "../scripts/ui-look.mjs";

import {
  getDefaultSceneDocumentView,
  getReaderModeDescriptors,
  openDocumentView,
  resetDocumentViewStateForTests
} from "../scripts/document-views.mjs";

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

function configure({ mode = "simple-reader", enhanced = false } = {}) {
  const settingsState = { mode };
  const renders = [];
  const enhancedCalls = [];
  const warnings = [];
  const itemData = {
    typeId: "book",
    kind: "book",
    html: "<p>Readable</p>",
    author: ""
  };
  const item = {
    id: "item-1",
    uuid: "Item.item-1",
    name: "Book",
    img: "modules/runyth-scriptoria/assets/book.svg",
    documentName: "Item",
    isOwner: true,
    getFlag: (scope, key) => scope === "runyth-scriptoria" && key === "document"
      ? itemData
      : undefined,
    testUserPermission: () => true,
    getRollData: () => ({}),
    sheet: {
      render: async (options) => {
        renders.push(["item", options]);
        return { addEventListener: () => undefined };
      }
    }
  };
  const page = {
    id: "page-1",
    uuid: "JournalEntry.journal-1.JournalEntryPage.page-1",
    name: "Page",
    documentName: "JournalEntryPage",
    text: { content: "<p>Journal</p>" },
    getFlag: (scope, key) => {
      if (scope !== "runyth-scriptoria") return undefined;
      if (key === "sourceItemUuid") return item.uuid;
      if (key === "typeId") return "book";
      return undefined;
    },
    testUserPermission: () => true
  };
  const journal = {
    id: "journal-1",
    uuid: "JournalEntry.journal-1",
    name: "Book",
    documentName: "JournalEntry",
    pages: {
      contents: [page],
      get: (id) => id === page.id ? page : null
    },
    ownership: {},
    getFlag: (scope, key) => {
      if (scope !== "runyth-scriptoria") return undefined;
      if (key === "sourceItemUuid") return item.uuid;
      if (key === "typeId") return "book";
      return undefined;
    },
    testUserPermission: () => true,
    sheet: {
      render: async (options) => {
        renders.push(["journal", options]);
        return { addEventListener: () => undefined };
      }
    }
  };
  page.parent = journal;

  const modules = new Map([
    ["runyth-scriptoria", { id: "runyth-scriptoria", active: true }]
  ]);
  if (enhanced) {
    modules.set("monks-enhanced-journal", {
      id: "monks-enhanced-journal",
      active: true
    });
  }

  globalThis.game = {
    user: { id: "gm", isGM: true },
    modules,
    settings: {
      get: (_moduleId, key) => key === "defaultSceneDocumentView"
        ? settingsState.mode
        : undefined
    },
    i18n: {
      localize: (key) => key
    },
    MonksEnhancedJournal: enhanced ? {
      openJournalEntry: async (...args) => {
        enhancedCalls.push(args);
        return { id: "MonksEnhancedJournal" };
      }
    } : undefined
  };
  globalThis.ui = {
    notifications: {
      warn: (message) => warnings.push(message)
    }
  };
  globalThis.CONST = {
    DOCUMENT_OWNERSHIP_LEVELS: {
      OBSERVER: 2
    }
  };
  globalThis.foundry = {
    applications: {
      api: { DialogV2: DialogV2Stub },
      ux: {
        TextEditor: {
          implementation: {
            enrichHTML: async (html) => html
          }
        }
      }
    },
    utils: {
      fromUuid: async (uuid) => ({
        [item.uuid]: item,
        [journal.uuid]: journal,
        [page.uuid]: page
      })[uuid] ?? null
    }
  };

  return {
    item,
    journal,
    page,
    renders,
    enhancedCalls,
    warnings,
    settingsState
  };
}

test.beforeEach(() => resetDocumentViewStateForTests());

test("reads the world default and advertises all stable modes", () => {
  configure({ mode: "foundry" });
  assert.equal(getDefaultSceneDocumentView(), "foundry");
  assert.deepEqual(getReaderModeDescriptors().map((entry) => entry.id), [
    "foundry",
    "enhanced-journal",
    "simple-reader"
  ]);
});

test("foundry mode opens the generated Journal sheet at the selected page", async () => {
  const { journal, page, renders } = configure();
  await openDocumentView({ journal, page }, { mode: "foundry" });
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0], "journal");
  assert.equal(renders[0][1].pageId, "page-1");
});

test("simple-reader mode opens the shared dark DialogV2 reader", async () => {
  const { item } = configure();
  const dialog = await openDocumentView(item, { mode: "simple-reader" });
  assert.equal(dialog.runythScriptoriaViewMode, "simple-reader");
  assert.deepEqual(dialog.options.classes, [
    "runyth-scriptoria-document-window",
    "runyth-scriptoria-reader-window",
    FLEET_UI_CLASS
  ]);
});

test("enhanced mode uses the compatible active integration", async () => {
  const { journal, page, enhancedCalls } = configure({ enhanced: true });
  await openDocumentView({ journal, page }, { mode: "enhanced-journal" });
  assert.equal(enhancedCalls.length, 1);
  assert.equal(enhancedCalls[0][0], journal);
  assert.equal(enhancedCalls[0][1].pageId, page.id);
});

test("missing enhanced integration falls back safely to Foundry", async () => {
  const { journal, page, renders, warnings } = configure();
  await openDocumentView({ journal, page }, { mode: "enhanced-journal" });
  assert.equal(renders[0][0], "journal");
  assert.equal(warnings.length, 1);
});


test("changing the world setting changes subsequent scene openings", async () => {
  const { item, renders, settingsState } = configure({ mode: "simple-reader" });

  const simple = await openDocumentView(item);
  assert.equal(simple.runythScriptoriaViewMode, "simple-reader");

  settingsState.mode = "foundry";
  await openDocumentView(item);
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0], "item");
});
