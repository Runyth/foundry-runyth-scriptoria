import assert from "node:assert/strict";
import test from "node:test";

import {
  activateEconomicsListeners,
  buildImporterEconomicsContent,
  readEconomicsDirtyState,
  readEconomicsFormState,
  readEconomicsValues,
  refreshEconomics,
  refreshFinalPreview
} from "../scripts/importer.mjs";
import {
  registerScriptureType,
  resetScriptureTypeRegistryForTests
} from "../scripts/scripture-types.mjs";

class FakeElement {
  constructor({
    value = "",
    textContent = "",
    dataset = {},
    disabled = false,
    readOnly = false
  } = {}) {
    this.value = value;
    this.textContent = textContent;
    this.dataset = { ...dataset };
    this.disabled = disabled;
    this.readOnly = readOnly;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, extra = {}) {
    const event = {
      currentTarget: this,
      target: this,
      preventDefault: () => undefined,
      ...extra
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

let worldOverrides;

function configure() {
  worldOverrides = {};
  globalThis.CONFIG = {
    DND5E: {
      currencies: { pp: {}, gp: {}, ep: {}, sp: {}, cp: {} },
      defaultUnits: { weight: { imperial: "lb", metric: "kg" } }
    }
  };
  globalThis.game = {
    modules: new Map(),
    i18n: { localize: (key) => key },
    settings: {
      get: (_scope, key) => key === "itemEconomicsOverrides" ? worldOverrides : false
    }
  };
  resetScriptureTypeRegistryForTests();
}

function createRoot() {
  const section = new FakeElement({
    dataset: {
      calculatedPriceValue: "5",
      calculatedPriceDenomination: "cp",
      calculatedWeight: "0.08",
      weightUnits: "lb",
      priceDirty: "false",
      priceDenominationDirty: "false",
      weightDirty: "false"
    }
  });
  const elements = new Map([
    ["[data-economics-section]", section],
    ["#scriptoria-kind", new FakeElement({ value: "pamphlet" })],
    ["#scriptoria-source", new FakeElement({ value: "short text" })],
    ["#scriptoria-source-format", new FakeElement({ value: "markdown" })],
    ["[name='economics.price.value']", new FakeElement({ value: "5" })],
    ["[name='economics.price.denomination']", new FakeElement({ value: "cp" })],
    ["[name='economics.weight.value']", new FakeElement({ value: "0.08" })],
    ["[data-economics-type]", new FakeElement()],
    ["[data-economics-word-count]", new FakeElement()],
    ["[data-calculated-price]", new FakeElement()],
    ["[data-calculated-weight]", new FakeElement()],
    ["[data-weight-multiplier]", new FakeElement()],
    ["[data-weight-units]", new FakeElement()],
    ["[data-final-price]", new FakeElement()],
    ["[data-final-weight]", new FakeElement()]
  ]);
  return {
    elements,
    querySelector: (selector) => {
      const direct = elements.get(selector);
      if (direct) return direct;
      const name = selector.match(/^\[name='(.+)'\]$/)?.[1];
      return name ? elements.get(`[name='${name}']`) : undefined;
    }
  };
}

test.beforeEach(configure);

test("renders enabled ordinary price and weight fields with separate units", () => {
  const content = buildImporterEconomicsContent({
    kind: "pamphlet",
    source: "Short pamphlet text.",
    sourceFormat: "markdown"
  });

  assert.match(content, /id="scriptoria-economics-price-value"[\s\S]*?name="economics\.price\.value"[\s\S]*?type="number"[\s\S]*?value="5"/);
  assert.match(content, /id="scriptoria-economics-price-denomination"[\s\S]*?name="economics\.price\.denomination"/);
  assert.match(content, /id="scriptoria-economics-weight-value"[\s\S]*?name="economics\.weight\.value"[\s\S]*?type="number"[\s\S]*?value="0\.08"/);
  assert.match(content, /id="scriptoria-economics-weight-units"[^>]*data-weight-units[^>]*>lb<\/output>/);
  assert.doesNotMatch(content, /scriptoria-economics-(?:price|weight)-value[^>]+(?:readonly|disabled)/);
  assert.doesNotMatch(content, /economics\.(?:price|weight)\.useDefault/);
  assert.doesNotMatch(content, /overrideValue|overrideDenomination/);
  assert.doesNotMatch(content, /id="scriptoria-economics-weight-value"[^>]+value="lb"/);
});

test("helper defaults populate the same directly editable fields", () => {
  game.modules.set("economics-helper", { active: true, version: "1.0.0" });
  const registration = registerScriptureType({
    id: "economics-helper.decree",
    provider: "economics-helper",
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
  });
  assert.equal(registration.ok, true);

  const content = buildImporterEconomicsContent({
    kind: "economics-helper.decree",
    source: "A short decree.",
    sourceFormat: "markdown"
  });
  assert.match(content, /name="economics\.price\.value"[\s\S]*?value="3"/);
  assert.match(content, /name="economics\.weight\.value"[\s\S]*?value="0\.4"/);
});

test("visible directly edited values are authoritative", () => {
  const root = createRoot();
  activateEconomicsListeners(root);
  const price = root.elements.get("[name='economics.price.value']");
  const denomination = root.elements.get("[name='economics.price.denomination']");
  const weight = root.elements.get("[name='economics.weight.value']");

  price.value = "12";
  price.dispatch("change");
  denomination.value = "gp";
  denomination.dispatch("change");
  weight.value = "0.4";
  weight.dispatch("change");

  assert.deepEqual(readEconomicsValues(root), {
    price: { value: 12, denomination: "gp" },
    weight: { value: 0.4, units: "lb" }
  });
  assert.deepEqual(readEconomicsDirtyState(root), {
    price: true,
    priceDenomination: true,
    weight: true
  });
  assert.equal(root.elements.get("[data-final-price]").textContent, "12 gp");
  assert.equal(root.elements.get("[data-final-weight]").textContent, "0.4 lb");
});

test("content recalculates only an untouched weight and never modifies price", () => {
  const root = createRoot();
  activateEconomicsListeners(root);
  const originalPrice = root.elements.get("[name='economics.price.value']").value;
  const originalWeight = Number(root.elements.get("[name='economics.weight.value']").value);

  root.elements.get("#scriptoria-source").value = Array(7000).fill("word").join(" ");
  const result = refreshEconomics(root, { updatePrice: false, updateWeight: true });

  assert.equal(root.elements.get("[name='economics.price.value']").value, originalPrice);
  assert.ok(Number(root.elements.get("[name='economics.weight.value']").value) > originalWeight);
  assert.equal(Number(root.elements.get("[name='economics.weight.value']").value), result.calculatedWeight);
});

test("type changes update untouched fields but preserve dirty fields", () => {
  const root = createRoot();
  activateEconomicsListeners(root);
  root.elements.get("#scriptoria-kind").value = "book";
  refreshEconomics(root, { updatePrice: true, updateWeight: true });
  assert.equal(root.elements.get("[name='economics.price.value']").value, "25");
  assert.equal(root.elements.get("[name='economics.price.denomination']").value, "gp");
  assert.equal(root.elements.get("[name='economics.weight.value']").value, "4");

  const price = root.elements.get("[name='economics.price.value']");
  const weight = root.elements.get("[name='economics.weight.value']");
  price.value = "40";
  price.dispatch("input");
  weight.value = "7.5";
  weight.dispatch("input");
  root.elements.get("#scriptoria-kind").value = "pamphlet";
  refreshEconomics(root, { updatePrice: true, updateWeight: true });

  assert.equal(price.value, "40");
  assert.equal(weight.value, "7.5");
});

test("reset price and recalculate weight clear dirty state and restore suggestions", () => {
  const root = createRoot();
  activateEconomicsListeners(root);
  const price = root.elements.get("[name='economics.price.value']");
  const weight = root.elements.get("[name='economics.weight.value']");
  price.value = "12";
  price.dispatch("input");
  weight.value = "0.22";
  weight.dispatch("input");

  const section = root.elements.get("[data-economics-section]");
  section.dispatch("click", {
    target: { closest: () => ({ dataset: { action: "reset-price-default" } }) }
  });
  assert.equal(price.value, "5");
  assert.equal(readEconomicsDirtyState(root).price, false);
  assert.equal(weight.value, "0.22");

  root.elements.get("#scriptoria-source").value = Array(7000).fill("word").join(" ");
  section.dispatch("click", {
    target: { closest: () => ({ dataset: { action: "recalculate-weight" } }) }
  });
  assert.equal(readEconomicsDirtyState(root).weight, false);
  assert.ok(Number(weight.value) > 0.08);
});

test("zero is valid while empty, non-finite, and negative values fail clearly", () => {
  const root = createRoot();
  root.elements.get("[name='economics.price.value']").value = "0";
  root.elements.get("[name='economics.price.denomination']").value = "gp";
  root.elements.get("[name='economics.weight.value']").value = "0";
  assert.deepEqual(readEconomicsValues(root), {
    price: { value: 0, denomination: "gp" },
    weight: { value: 0, units: "lb" }
  });

  root.elements.get("[name='economics.price.value']").value = "";
  assert.throws(() => readEconomicsValues(root), /price value is empty.*Received: ""/i);
  root.elements.get("[name='economics.price.value']").value = "Infinity";
  assert.throws(() => readEconomicsValues(root), /price value is not a finite number/i);
  root.elements.get("[name='economics.price.value']").value = "-1";
  assert.throws(() => readEconomicsValues(root), /price value must be at least 0/i);
});

test("form state contains only effective values and lightweight dirty flags", () => {
  const root = createRoot();
  assert.deepEqual(readEconomicsFormState(root), {
    price: { value: "5", denomination: "cp" },
    weight: { value: "0.08", units: "lb" },
    dirty: {
      price: false,
      priceDenomination: false,
      weight: false
    }
  });
});


test("world defaults seed each new form without being changed by one edit", () => {
  worldOverrides = {
    pamphlet: {
      price: { value: 2, denomination: "gp" },
      weight: {
        base: 0.25,
        minimum: 0.2,
        maximum: 0.4,
        referenceWordCount: 800,
        adjustForContentLength: true
      }
    }
  };

  const first = buildImporterEconomicsContent({
    kind: "pamphlet",
    source: "Tiny text.",
    sourceFormat: "markdown"
  });
  assert.match(first, /name="economics\.price\.value"[\s\S]*?value="2"/);
  assert.match(first, /name="economics\.price\.denomination"[\s\S]*?<option value="gp" selected>/);
  assert.match(first, /name="economics\.weight\.value"[\s\S]*?value="0\.2"/);

  const root = createRoot();
  root.elements.get("[name='economics.price.value']").value = "7";
  root.elements.get("[name='economics.weight.value']").value = "0.35";

  const second = buildImporterEconomicsContent({
    kind: "pamphlet",
    source: "Tiny text.",
    sourceFormat: "markdown"
  });
  assert.match(second, /name="economics\.price\.value"[\s\S]*?value="2"/);
  assert.match(second, /name="economics\.weight\.value"[\s\S]*?value="0\.2"/);
});

test("denomination dirty tracking is independent from the numeric price", () => {
  const root = createRoot();
  activateEconomicsListeners(root);
  const denomination = root.elements.get("[name='economics.price.denomination']");
  denomination.value = "sp";
  denomination.dispatch("change");
  root.elements.get("#scriptoria-kind").value = "book";
  refreshEconomics(root, { updatePrice: true, updateWeight: true });

  assert.equal(root.elements.get("[name='economics.price.value']").value, "25");
  assert.equal(denomination.value, "sp");
});
