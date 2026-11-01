import assert from "node:assert/strict";
import test from "node:test";

import { migrateLegacyEconomicsMetadata } from "../scripts/migrations.mjs";

test("legacy migration adds provenance only and never changes existing system values", async () => {
  let update;
  const item = {
    documentName: "Item",
    system: { price: { value: 17, denomination: "gp" }, weight: { value: 3, units: "lb" } },
    getFlag: () => ({ kind: "book", source: "# Legacy" }),
    update: async (data, options) => { update = { data, options }; }
  };
  globalThis.game = { user: { isGM: true }, items: [item], actors: [] };

  const count = await migrateLegacyEconomicsMetadata();
  assert.equal(count, 1);
  assert.equal(Object.keys(update.data).some((key) => key.startsWith("system.")), false);
  assert.equal(update.data["flags.runyth-scriptoria.document.economics"].status, "legacy");
  assert.equal(update.options.runythScriptoriaMigration, true);
});

test("non-GM clients never migrate Item data", async () => {
  globalThis.game = { user: { isGM: false }, items: [], actors: [] };
  assert.equal(await migrateLegacyEconomicsMetadata(), 0);
});
