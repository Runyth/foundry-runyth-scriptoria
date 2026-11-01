import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEconomicsSettingsContent,
  readEconomicsSettingsForm
} from "../scripts/economics-settings.mjs";

function field(value, checked = false) {
  return { value: String(value), checked };
}

function row(typeId, useProviderDefaults, values) {
  return {
    dataset: {
      economicsTypeId: typeId,
      useProviderDefaults: String(useProviderDefaults)
    },
    querySelector(selector) {
      const name = selector.match(/data-field='([^']+)'/)?.[1];
      return values[name];
    }
  };
}

test("settings content includes built-in and helper types keyed by stable IDs", () => {
  globalThis.game = { i18n: { localize: (key) => key } };
  globalThis.CONFIG = { DND5E: { currencies: { gp: {}, cp: {} } } };
  const economics = {
    price: { value: 1, denomination: "gp" },
    weight: { base: 1, minimum: 0.8, maximum: 1.2, referenceWordCount: 1000, adjustForContentLength: true }
  };
  const content = buildEconomicsSettingsContent([
    { type: { id: "book", icon: "fa-solid fa-book", label: "Book", builtIn: true }, providerDefaults: economics, effective: economics, overridden: false, unavailable: false },
    { type: { id: "helper.decree", icon: "fa-solid fa-scroll", label: "Decree", provider: "helper", providerVersion: "1.0.0", builtIn: false }, providerDefaults: economics, effective: economics, overridden: true, unavailable: false }
  ]);

  assert.match(content, /data-economics-type-id="book"/);
  assert.match(content, /data-use-provider-defaults="true"/);
  assert.match(content, /data-economics-type-id="helper\.decree"/);
  assert.match(content, /data-use-provider-defaults="false"/);
});

test("form persistence skips provider-default rows and stores only actual overrides", () => {
  const providerRow = row("book", true, {});
  const overrideRow = row("helper.decree", false, {
    "price-value": field(4),
    "price-denomination": field("gp"),
    "weight-base": field(0.5),
    "weight-minimum": field(0.35),
    "weight-maximum": field(0.9),
    "reference-word-count": field(1500),
    "adjust-content-length": field("", true)
  });
  const form = {
    querySelectorAll: () => [providerRow, overrideRow]
  };
  const overrides = readEconomicsSettingsForm(form);

  assert.equal(Object.hasOwn(overrides, "book"), false);
  assert.deepEqual(overrides["helper.decree"], {
    price: { value: 4, denomination: "gp" },
    weight: { base: 0.5, minimum: 0.35, maximum: 0.9, referenceWordCount: 1500, adjustForContentLength: true }
  });
});
