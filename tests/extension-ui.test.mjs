// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

import { buildImporterContent } from "../scripts/importer.mjs";
import {
  registerScriptureType,
  resetScriptureTypeRegistryForTests,
  unregisterScriptureType
} from "../scripts/scripture-types.mjs";

function configureGame() {
  globalThis.game = {
    modules: new Map([
      ["ui-helper", {
        id: "ui-helper",
        active: true,
        version: "1.0.0"
      }]
    ]),
    documentTypes: {
      Item: ["base", "loot"]
    },
    i18n: {
      localize: (key) => key
    }
  };
  globalThis.Hooks = {
    callAll: () => undefined
  };
}

test("helper types appear in newly built importer selectors without duplicating entries", () => {
  configureGame();
  resetScriptureTypeRegistryForTests();
  const helper = {
    id: "ui-helper.decree",
    provider: "ui-helper",
    label: "UI Decree",
    icon: "fa-solid fa-scroll",
    image: "modules/ui-helper/decree.svg",
    sort: 225
  };

  registerScriptureType(helper);
  registerScriptureType(helper);

  const html = buildImporterContent({
    kind: "ui-helper.decree",
    title: "",
    author: "",
    itemType: "loot",
    access: "embedded",
    removeTitleHeading: true,
    sourceFormat: "markdown",
    source: "",
    sourceFileName: ""
  }, false);

  assert.match(html, /value="ui-helper\.decree" selected>UI Decree<\/option>/);
  assert.equal((html.match(/value="ui-helper\.decree"/g) ?? []).length, 1);
});

test("an unavailable stored type remains selectable with an explicit fallback", () => {
  configureGame();
  resetScriptureTypeRegistryForTests();
  registerScriptureType({
    id: "ui-helper.decree",
    provider: "ui-helper",
    label: "UI Decree",
    icon: "fa-solid fa-scroll",
    image: "modules/ui-helper/decree.svg"
  });
  unregisterScriptureType("ui-helper.decree", {
    provider: "ui-helper"
  });

  const html = buildImporterContent({
    kind: "ui-helper.decree",
    title: "Existing",
    author: "",
    itemType: "loot",
    access: "embedded",
    removeTitleHeading: true,
    sourceFormat: "markdown",
    source: "# Existing",
    sourceFileName: ""
  }, true);

  assert.match(
    html,
    /value="ui-helper\.decree" selected>Unavailable scripture type: ui-helper\.decree<\/option>/
  );
});
