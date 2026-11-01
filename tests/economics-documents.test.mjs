import assert from "node:assert/strict";
import test from "node:test";

import {
  createFromSource,
  prepareDocumentData,
  updateFromSource
} from "../scripts/documents.mjs";

function configure() {
  globalThis.CONFIG = {
    DND5E: {
      currencies: { pp: {}, gp: {}, ep: {}, sp: {}, cp: {} },
      defaultUnits: { weight: { imperial: "lb", metric: "kg" } }
    }
  };
  globalThis.game = {
    user: { isGM: true },
    system: { id: "dnd5e" },
    documentTypes: { Item: ["base", "loot"] },
    modules: new Map(),
    folders: [],
    i18n: { localize: (key) => key },
    settings: {
      get: (_scope, key) => {
        if (key === "createKindFolders") return false;
        if (key === "itemEconomicsOverrides") return {};
        if (key === "metricWeightUnits") return false;
        return "Runyth Scriptoria";
      }
    }
  };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
  globalThis.Folder = { implementation: { create: async (data) => ({ id: "folder", ...data }) } };
  globalThis.foundry = { utils: {} };
  globalThis.ui = { notifications: { info: () => undefined, warn: () => undefined } };
}

test.beforeEach(configure);

test("new D&D 5e Items receive calculated native price and weight plus provenance", async () => {
  let created;
  globalThis.Item = { implementation: { create: async (data) => (created = data) } };

  await createFromSource({
    source: "# Small Pamphlet\n\nA very short notice.",
    sourceFormat: "markdown",
    kind: "pamphlet",
    itemType: "loot"
  });

  assert.deepEqual(created.system.price, { value: 5, denomination: "cp" });
  assert.deepEqual(created.system.weight, { value: 0.08, units: "lb" });
  const metadata = created.flags["runyth-scriptoria"].document.economics;
  assert.equal(metadata.typeId, "pamphlet");
  assert.equal(metadata.priceOverridden, false);
  assert.equal(metadata.weightOverridden, false);
  assert.ok(metadata.normalizedWordCount > 0);
});

test("explicit creation price and weight overrides are authoritative", () => {
  const prepared = prepareDocumentData({
    source: "# Book\n\nBody",
    sourceFormat: "markdown",
    kind: "book",
    itemType: "loot",
    economicsOverrides: {
      price: { value: 99, denomination: "gp" },
      weight: 7.25
    }
  });

  assert.deepEqual(prepared.economicsResult.price, { value: 99, denomination: "gp" });
  assert.equal(prepared.economicsResult.weight, 7.25);
  assert.equal(prepared.flagData.economics.priceOverridden, true);
  assert.equal(prepared.flagData.economics.weightOverridden, true);
});

test("editing an existing Item does not recalculate economics unless explicitly requested", async () => {
  let update;
  const existingEconomics = { schemaVersion: 1, status: "calculated", createdWeight: 9 };
  const item = {
    documentName: "Item",
    type: "loot",
    img: "book.svg",
    isOwner: true,
    isEmbedded: false,
    system: { description: { value: "old" } },
    getFlag: () => ({
      kind: "book",
      typeId: "book",
      sourceFormat: "markdown",
      source: "# Old\n\nText",
      access: "embedded",
      economics: existingEconomics
    }),
    update: async (data) => { update = data; }
  };

  await updateFromSource(item, { source: "# Updated\n\nMuch longer body text here." });

  assert.equal(Object.hasOwn(update, "system.price"), false);
  assert.equal(Object.hasOwn(update, "system.weight"), false);
  assert.deepEqual(update["flags.runyth-scriptoria.document"].economics, existingEconomics);
});

test("unsupported systems preserve document creation without invalid system economics", () => {
  globalThis.game.system.id = "other-system";
  const prepared = prepareDocumentData({
    source: "# Book\n\nBody",
    kind: "book",
    itemType: "loot"
  });
  assert.equal(prepared.economicsResult.price.value, 25);
  assert.equal(prepared.flagData.economics.status, "calculated");
});

test("direct importer values are written exactly without recalculation", async () => {
  let created;
  globalThis.Item = { implementation: { create: async (data) => (created = data) } };

  await createFromSource({
    source: "# Pamphlet\n\nA much longer body that would otherwise recalculate weight.",
    sourceFormat: "markdown",
    kind: "pamphlet",
    itemType: "loot",
    economicsValues: {
      price: { value: 12, denomination: "gp" },
      weight: { value: 0.4, units: "lb" }
    },
    economicsDirty: {
      price: true,
      priceDenomination: true,
      weight: true
    }
  });

  assert.deepEqual(created.system.price, { value: 12, denomination: "gp" });
  assert.deepEqual(created.system.weight, { value: 0.4, units: "lb" });
  assert.equal(created.flags["runyth-scriptoria"].document.economics.priceOverridden, true);
  assert.equal(created.flags["runyth-scriptoria"].document.economics.weightOverridden, true);
});

test("unchanged visible importer defaults remain exact and are not marked dirty", () => {
  const prepared = prepareDocumentData({
    source: "# Small Pamphlet\n\nA very short notice.",
    sourceFormat: "markdown",
    kind: "pamphlet",
    itemType: "loot",
    economicsValues: {
      price: { value: 5, denomination: "cp" },
      weight: { value: 0.08, units: "lb" }
    },
    economicsDirty: {
      price: false,
      priceDenomination: false,
      weight: false
    }
  });

  assert.deepEqual(prepared.economicsResult.price, { value: 5, denomination: "cp" });
  assert.equal(prepared.economicsResult.weight, 0.08);
  assert.equal(prepared.flagData.economics.priceOverridden, false);
  assert.equal(prepared.flagData.economics.weightOverridden, false);
});
