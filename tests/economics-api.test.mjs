import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateItemEconomics,
  getEffectiveTypeEconomics,
  getTypeEconomics,
  setTypeEconomicsOverride
} from "../scripts/economics.mjs";
import {
  getScriptureType,
  registerScriptureType,
  resetScriptureTypeRegistryForTests,
  unregisterScriptureType
} from "../scripts/scripture-types.mjs";

const PROVIDER = "economics-helper";
let storedOverrides;

function configure() {
  storedOverrides = {};
  globalThis.CONFIG = {
    DND5E: {
      currencies: { pp: {}, gp: {}, ep: {}, sp: {}, cp: {} },
      defaultUnits: { weight: { imperial: "lb", metric: "kg" } }
    }
  };
  globalThis.game = {
    user: { isGM: true },
    system: { id: "dnd5e" },
    modules: new Map([[PROVIDER, { id: PROVIDER, active: true, version: "1.0.0" }]]),
    i18n: { localize: (key) => key },
    settings: {
      get: (_scope, key) => key === "itemEconomicsOverrides" ? storedOverrides : false,
      set: async (_scope, key, value) => {
        if (key === "itemEconomicsOverrides") storedOverrides = value;
        return value;
      }
    }
  };
  globalThis.Hooks = { callAll: () => undefined };
  resetScriptureTypeRegistryForTests();
}

function descriptor() {
  return {
    id: `${PROVIDER}.decree`,
    provider: PROVIDER,
    label: "Decree",
    economics: {
      price: { value: 3, denomination: "gp" },
      weight: {
        base: 0.5,
        minimum: 0.35,
        maximum: 0.9,
        referenceWordCount: 1500,
        adjustForContentLength: true
      }
    }
  };
}

test.beforeEach(configure);

test("helper economics are registered immutably and exposed through the public calculation model", () => {
  const input = descriptor();
  const result = registerScriptureType(input);
  input.economics.price.value = 999;

  assert.equal(result.ok, true);
  assert.equal(getTypeEconomics(`${PROVIDER}.decree`).price.value, 3);
  assert.equal(Object.isFrozen(getScriptureType(`${PROVIDER}.decree`).economics), true);

  const calculation = calculateItemEconomics({
    typeId: `${PROVIDER}.decree`,
    content: "short decree",
    sourceFormat: "markdown"
  });
  assert.equal(calculation.price.value, 3);
  assert.equal(calculation.weight, 0.4);
  assert.equal(Object.isFrozen(calculation), true);
});

test("creation override wins over world override, which wins over provider defaults", async () => {
  registerScriptureType(descriptor());
  await setTypeEconomicsOverride(`${PROVIDER}.decree`, {
    price: { value: 7, denomination: "sp" },
    weight: {
      base: 0.7,
      minimum: 0.5,
      maximum: 1,
      referenceWordCount: 1000,
      adjustForContentLength: true
    }
  });

  assert.equal(getEffectiveTypeEconomics(`${PROVIDER}.decree`).price.value, 7);

  const defaulted = calculateItemEconomics({
    typeId: `${PROVIDER}.decree`,
    content: Array(1000).fill("word").join(" ")
  });
  assert.deepEqual(defaulted.price, { value: 7, denomination: "sp" });
  assert.equal(defaulted.weight, 0.7);

  const overridden = calculateItemEconomics({
    typeId: `${PROVIDER}.decree`,
    content: "short",
    overrides: {
      price: { value: 11, denomination: "gp" },
      weight: 0.88
    }
  });
  assert.deepEqual(overridden.price, { value: 11, denomination: "gp" });
  assert.equal(overridden.weight, 0.88);
  assert.equal(overridden.priceOverridden, true);
  assert.equal(overridden.weightOverridden, true);
});

test("helper re-registration cannot overwrite world overrides and unavailable types keep them", async () => {
  registerScriptureType(descriptor());
  await setTypeEconomicsOverride(`${PROVIDER}.decree`, {
    price: { value: 9, denomination: "gp" }
  });

  unregisterScriptureType(`${PROVIDER}.decree`, { provider: PROVIDER });
  const unavailable = calculateItemEconomics({
    typeId: `${PROVIDER}.decree`,
    content: "stored document"
  });
  assert.equal(unavailable.price.value, 9);

  registerScriptureType(descriptor());
  assert.equal(getEffectiveTypeEconomics(`${PROVIDER}.decree`).price.value, 9);
});

test("malformed helper economics reject only the defective registration", () => {
  const broken = registerScriptureType({
    ...descriptor(),
    economics: {
      price: { value: -1, denomination: "gp" }
    }
  });
  const valid = registerScriptureType(descriptor());

  assert.equal(broken.ok, false);
  assert.equal(broken.error.code, "INVALID_ECONOMICS_NUMBER");
  assert.equal(broken.error.providerId, PROVIDER);
  assert.equal(valid.ok, true);
});

test("partial world overrides deeply preserve provider price and weight fields", async () => {
  registerScriptureType(descriptor());
  await setTypeEconomicsOverride(`${PROVIDER}.decree`, {
    weight: { base: 0.6 }
  });

  const effective = getEffectiveTypeEconomics(`${PROVIDER}.decree`);
  assert.deepEqual(effective.price, { value: 3, denomination: "gp" });
  assert.equal(effective.weight.base, 0.6);
  assert.equal(effective.weight.minimum, 0.35);
  assert.equal(effective.weight.maximum, 0.9);
  assert.equal(effective.weight.referenceWordCount, 1500);
  assert.equal(effective.weight.adjustForContentLength, true);
});
