import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  calculateBoundedWeight,
  countNormalizedWords,
  getWeightMultiplier,
  normalizeReadableText,
  validateTypeEconomics
} from "../scripts/economics-core.mjs";
import {
  getScriptureType,
  getScriptureTypes,
  resetScriptureTypeRegistryForTests
} from "../scripts/scripture-types.mjs";

function configure() {
  globalThis.CONFIG = {
    DND5E: {
      currencies: { pp: {}, gp: {}, ep: {}, sp: {}, cp: {} },
      defaultUnits: { weight: { imperial: "lb", metric: "kg" } }
    }
  };
  globalThis.game = {
    modules: new Map(),
    i18n: { localize: (key) => key },
    settings: { get: () => false }
  };
  globalThis.Hooks = { callAll: () => undefined };
  resetScriptureTypeRegistryForTests();
}

test.beforeEach(configure);

test("every built-in type has valid immutable economics and books outweigh pamphlets", () => {
  const types = getScriptureTypes().filter((type) => type.builtIn);
  assert.ok(types.length >= 5);

  for (const type of types) {
    const result = validateTypeEconomics(type.economics, {
      typeId: type.id,
      providerId: type.provider
    });
    assert.equal(result.ok, true, type.id);
    assert.equal(Object.isFrozen(type.economics), true);
    assert.ok(Number.isFinite(type.economics.price.value));
    assert.ok(Number.isFinite(type.economics.weight.base));
    assert.ok(type.economics.weight.minimum >= 0);
  }

  assert.ok(
    getScriptureType("book").economics.weight.base
      > getScriptureType("pamphlet").economics.weight.base
  );
  assert.ok(
    getScriptureType("scripture").economics.weight.base
      > getScriptureType("journal").economics.weight.base
  );
});

test("content-aware weight bands are deterministic, modest, and bounded", () => {
  const weight = {
    base: 5,
    minimum: 4,
    maximum: 6.5,
    referenceWordCount: 1000,
    adjustForContentLength: true
  };

  assert.equal(calculateBoundedWeight(weight, 0).value, 4);
  assert.equal(calculateBoundedWeight(weight, 100).multiplier, 0.8);
  assert.equal(calculateBoundedWeight(weight, 300).value, 4.5);
  assert.equal(calculateBoundedWeight(weight, 1000).value, 5);
  assert.equal(calculateBoundedWeight(weight, 2000).value, 5.4);
  assert.equal(calculateBoundedWeight(weight, 5000).value, 5.8);
  assert.equal(calculateBoundedWeight(weight, 100000).value, 6.25);
  assert.equal(getWeightMultiplier(1000000, 1000), 1.25);
});

test("normalization excludes Markdown syntax, HTML markup, metadata, and entities", () => {
  const markdown = `---\nid: metadata-only\n---\n# Heading\n\n**Human words** with [a link](https://example.com) and \`code value\`.`;
  const html = `<style>.noise { color: red }</style><h1>Heading</h1><p>Human &amp; readable words.</p><script>ignored code words</script>`;

  assert.equal(countNormalizedWords(markdown, { sourceFormat: "markdown" }), 9);
  assert.equal(countNormalizedWords(html, { sourceFormat: "html" }), 4);
  assert.doesNotMatch(normalizeReadableText(markdown), /metadata-only|https|\*\*/);
  assert.doesNotMatch(normalizeReadableText(html, { sourceFormat: "html" }), /style|script|ignored/);
});

test("Unicode text is counted safely and large inputs remain practical", () => {
  const unicode = "Über alte Straßen gehen Händler. 日本語の文章です。 Привет мир.";
  assert.ok(countNormalizedWords(unicode) >= 7);

  const large = Array.from({ length: 100_000 }, () => "word").join(" ");
  const started = performance.now();
  assert.equal(countNormalizedWords(large), 100_000);
  assert.ok(performance.now() - started < 1500);
});

test("invalid economics are rejected with actionable validation codes", () => {
  const cases = [
    [{ price: { value: -1, denomination: "gp" } }, "INVALID_ECONOMICS_NUMBER"],
    [{ weight: { base: 1, minimum: 2, maximum: 3, referenceWordCount: 100, adjustForContentLength: true } }, "BASE_WEIGHT_OUT_OF_BOUNDS"],
    [{ weight: { base: 2, minimum: 3, maximum: 1, referenceWordCount: 100, adjustForContentLength: true } }, "INVALID_WEIGHT_BOUNDS"],
    [{ weight: { base: 1, minimum: 0, maximum: 2, referenceWordCount: 0, adjustForContentLength: true } }, "INVALID_REFERENCE_WORD_COUNT"],
    [{ price: { value: 1, denomination: "credits" } }, "UNSUPPORTED_DENOMINATION"],
    [{ unsafe: true }, "UNSUPPORTED_ECONOMICS_FIELD"]
  ];

  for (const [economics, code] of cases) {
    const result = validateTypeEconomics(economics, {
      typeId: "helper.type",
      providerId: "helper"
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
    assert.match(result.error.message, /helper/);
  }
});

test("economics numeric normalization preserves zero and rejects missing or non-finite values", async () => {
  const {
    normalizeEconomicsNumber
  } = await import("../scripts/economics.mjs");

  assert.equal(normalizeEconomicsNumber(0, { field: "price override" }), 0);
  assert.equal(normalizeEconomicsNumber(" 0.25 ", { field: "weight override" }), 0.25);
  assert.equal(normalizeEconomicsNumber("0,25", { field: "weight override" }), 0.25);
  assert.throws(
    () => normalizeEconomicsNumber("", { field: "price override" }),
    /price override is empty.*Received: ""/i
  );
  assert.throws(
    () => normalizeEconomicsNumber(undefined, { field: "price override" }),
    /price override is missing.*Received: undefined/i
  );
  assert.throws(
    () => normalizeEconomicsNumber(Number.NaN, { field: "price override" }),
    /not a finite number.*Received: NaN/i
  );
  assert.throws(
    () => normalizeEconomicsNumber(Infinity, { field: "weight override" }),
    /not a finite number.*Received: Infinity/i
  );
});
