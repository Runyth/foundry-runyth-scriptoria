// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import {
  addApplicationV2Controls,
  getSupportedApplicationTarget,
  isSupportedDocument
} from "../scripts/window-controls.mjs";

function configure() {
  const data = {
    typeId: "book",
    kind: "book",
    html: "<p>Book</p>"
  };
  const item = {
    documentName: "Item",
    uuid: "Item.item-1",
    getFlag: (scope, key) => scope === "runyth-scriptoria" && key === "document"
      ? data
      : undefined
  };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    modules: new Map(),
    i18n: {
      localize: (key) => key
    }
  };
  return item;
}

test("adds GM menu actions once and identifies the current reader", () => {
  const item = configure();
  const application = {
    document: item,
    runythScriptoriaViewMode: "simple-reader"
  };
  const controls = [];

  addApplicationV2Controls(application, controls);
  addApplicationV2Controls(application, controls);

  assert.equal(
    controls.filter((control) => control.action === "runyth-scriptoria-show-selected").length,
    1
  );
  assert.equal(
    controls.filter((control) => control.action.startsWith("runyth-scriptoria-open-with-")).length,
    2
  );
  const current = controls.find(
    (control) => control.action === "runyth-scriptoria-open-with-simple-reader"
  );
  assert.equal(Boolean(current), true);
  assert.equal(current.disabled, true);
});

test("recognizes Runyth Scriptoria Item and generated Journal applications only", () => {
  const item = configure();
  const journal = {
    documentName: "JournalEntry",
    getFlag: (scope, key) => scope === "runyth-scriptoria" && key === "sourceItemUuid"
      ? item.uuid
      : undefined
  };
  assert.equal(isSupportedDocument(item), true);
  assert.equal(isSupportedDocument(journal), true);
  assert.equal(isSupportedDocument({ documentName: "JournalEntry", getFlag: () => undefined }), false);
  assert.equal(getSupportedApplicationTarget({ document: item }), item);
});

test("players do not receive broadcast or alternative-view controls", () => {
  const item = configure();
  globalThis.game.user.isGM = false;
  const controls = [];
  addApplicationV2Controls({ document: item }, controls);
  assert.deepEqual(controls, []);
});

test("sources the window look sync from the module-level DialogV2 render hook", async () => {
  configure();
  const registrations = new Map();
  globalThis.Hooks = {
    on: (name, handler) => registrations.set(name, handler)
  };

  const { registerWindowControlHooks } = await import("../scripts/window-controls.mjs");
  registerWindowControlHooks();
  const { syncRenderedDialog } = await import("../scripts/scriptoria-dialog.mjs");

  assert.equal(registrations.get("renderDialogV2"), syncRenderedDialog);
});
