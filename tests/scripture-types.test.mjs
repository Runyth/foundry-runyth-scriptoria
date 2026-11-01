import assert from "node:assert/strict";
import test from "node:test";

import {
  getScriptureType,
  getScriptureTypeOrFallback,
  getScriptureTypes,
  hasScriptureType,
  registerScriptureType,
  resetScriptureTypeRegistryForTests,
  resolveScriptureTypeLabel,
  unregisterScriptureType,
  validateDocumentForScriptureType
} from "../scripts/scripture-types.mjs";

const PROVIDER_ID = "example-scriptoria-helper";

function descriptor(overrides = {}) {
  return {
    id: `${PROVIDER_ID}.prophecy`,
    provider: PROVIDER_ID,
    label: "Prophecy",
    labelKey: `${PROVIDER_ID}.types.prophecy.label`,
    description: "A prophetic scripture.",
    icon: "fa-solid fa-eye",
    image: `modules/${PROVIDER_ID}/assets/prophecy.svg`,
    sort: 250,
    capabilities: {
      creation: true,
      import: true,
      scenePlacement: true,
      reader: true
    },
    metadata: {
      category: "vision"
    },
    ...overrides
  };
}

function configureGame({ active = true } = {}) {
  const modules = new Map([
    [PROVIDER_ID, {
      id: PROVIDER_ID,
      active,
      version: "2.3.4"
    }],
    ["other-helper", {
      id: "other-helper",
      active: true,
      version: "1.0.0"
    }]
  ]);
  globalThis.game = {
    modules,
    i18n: {
      localize: (key) => key === `${PROVIDER_ID}.types.prophecy.label`
        ? "Localized Prophecy"
        : key
    }
  };
  globalThis.Hooks = {
    callAll: () => undefined
  };
}

test.beforeEach(() => {
  configureGame();
  resetScriptureTypeRegistryForTests();
});

test("registers, discovers, and localizes a helper-provided type", () => {
  const result = registerScriptureType(descriptor());

  assert.equal(result.ok, true);
  assert.equal(result.status, "registered");
  assert.equal(result.type.provider, PROVIDER_ID);
  assert.equal(result.type.providerVersion, "2.3.4");
  assert.equal(hasScriptureType(`${PROVIDER_ID}.prophecy`), true);
  assert.equal(getScriptureType(`${PROVIDER_ID}.prophecy`).id, `${PROVIDER_ID}.prophecy`);
  assert.equal(resolveScriptureTypeLabel(result.type), "Localized Prophecy");
  assert.equal(
    getScriptureTypes().some((type) => type.id === `${PROVIDER_ID}.prophecy`),
    true
  );
});

test("equivalent repeated registration is idempotent", () => {
  const first = registerScriptureType(descriptor());
  const second = registerScriptureType(descriptor());

  assert.equal(first.status, "registered");
  assert.equal(second.ok, true);
  assert.equal(second.status, "unchanged");
  assert.equal(
    getScriptureTypes().filter((type) => type.id === `${PROVIDER_ID}.prophecy`).length,
    1
  );
});

test("conflicting repeated registration fails without overwriting the first type", () => {
  registerScriptureType(descriptor());
  const result = registerScriptureType(descriptor({ label: "Different" }));

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INCOMPATIBLE_DUPLICATE");
  assert.equal(getScriptureType(`${PROVIDER_ID}.prophecy`).label, "Prophecy");
});

test("rejects missing, malformed, and unnamespaced IDs", () => {
  assert.equal(registerScriptureType(descriptor({ id: undefined })).error.code, "MISSING_ID");
  assert.equal(registerScriptureType(descriptor({ id: "Not Valid" })).error.code, "INVALID_ID");
  assert.equal(registerScriptureType(descriptor({ id: "prophecy" })).error.code, "INVALID_ID");
});

test("rejects missing labels and provider impersonation", () => {
  const missingLabel = descriptor();
  delete missingLabel.label;
  delete missingLabel.labelKey;

  assert.equal(registerScriptureType(missingLabel).error.code, "MISSING_LABEL");
  assert.equal(
    registerScriptureType(descriptor({ provider: "other-helper" })).error.code,
    "PROVIDER_IMPERSONATION"
  );
});

test("rejects inactive providers and protected built-in replacement", () => {
  configureGame({ active: false });
  resetScriptureTypeRegistryForTests();
  assert.equal(registerScriptureType(descriptor()).error.code, "PROVIDER_INACTIVE");

  configureGame();
  resetScriptureTypeRegistryForTests();
  assert.equal(
    registerScriptureType({
      id: "book",
      provider: PROVIDER_ID,
      label: "Replacement Book"
    }).error.code,
    "BUILT_IN_CONFLICT"
  );
});

test("rejects invalid callbacks, unsupported fields, and unsafe image paths", () => {
  assert.equal(
    registerScriptureType(descriptor({ validate: "not-callable" })).error.code,
    "INVALID_CALLBACK"
  );
  assert.equal(
    registerScriptureType(descriptor({ template: "../../bad.hbs" })).error.code,
    "UNSUPPORTED_FIELD"
  );
  assert.equal(
    registerScriptureType(descriptor({ image: "modules/other-helper/bad.svg" })).error.code,
    "IMAGE_OUTSIDE_PROVIDER_SCOPE"
  );
});

test("one defective helper registration does not disable a valid registration", () => {
  const broken = registerScriptureType(descriptor({ id: "bad" }));
  const valid = registerScriptureType(descriptor());

  assert.equal(broken.ok, false);
  assert.equal(valid.ok, true);
  assert.equal(hasScriptureType(`${PROVIDER_ID}.prophecy`), true);
});

test("returned descriptors, nested data, and collections cannot mutate the registry", () => {
  const original = descriptor();
  const result = registerScriptureType(original);
  original.label = "Mutated";
  original.capabilities.reader = false;
  original.metadata.category = "changed";

  assert.equal(result.type.label, "Prophecy");
  assert.equal(Object.isFrozen(result.type), true);
  assert.equal(Object.isFrozen(result.type.capabilities), true);
  assert.equal(Object.isFrozen(result.type.metadata), true);

  const types = getScriptureTypes();
  assert.equal(Object.isFrozen(types), true);
  assert.throws(() => types.push({}), TypeError);
  assert.equal(getScriptureType(`${PROVIDER_ID}.prophecy`).metadata.category, "vision");
});

test("unregistration is ownership-aware and unavailable documents retain a fallback", () => {
  registerScriptureType(descriptor());

  const wrongOwner = unregisterScriptureType(`${PROVIDER_ID}.prophecy`, {
    provider: "other-helper"
  });
  assert.equal(wrongOwner.ok, false);
  assert.equal(hasScriptureType(`${PROVIDER_ID}.prophecy`), true);

  const removed = unregisterScriptureType(`${PROVIDER_ID}.prophecy`, {
    provider: PROVIDER_ID
  });
  assert.equal(removed.ok, true);
  assert.equal(removed.status, "unregistered");
  assert.equal(hasScriptureType(`${PROVIDER_ID}.prophecy`), false);

  const fallback = getScriptureTypeOrFallback(`${PROVIDER_ID}.prophecy`);
  assert.equal(fallback.unavailable, true);
  assert.equal(
    fallback.label,
    `Unavailable scripture type: ${PROVIDER_ID}.prophecy`
  );
  assert.equal(fallback.capabilities.reader, true);

  const restored = registerScriptureType(descriptor());
  assert.equal(restored.ok, true);
  assert.equal(getScriptureType(`${PROVIDER_ID}.prophecy`).unavailable, false);
});

test("built-in types cannot be unregistered", () => {
  const result = unregisterScriptureType("book", {
    provider: "scriptoria"
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "BUILT_IN_PROTECTED");
  assert.equal(hasScriptureType("book"), true);
});

test("provider validators are awaited and isolated behind actionable errors", async () => {
  registerScriptureType(descriptor({
    validate: async ({ title }) => title.startsWith("Seen")
      ? true
      : "Prophecy titles must begin with Seen."
  }));

  await assert.doesNotReject(() => validateDocumentForScriptureType(
    `${PROVIDER_ID}.prophecy`,
    { title: "Seen Beyond" }
  ));

  await assert.rejects(
    () => validateDocumentForScriptureType(
      `${PROVIDER_ID}.prophecy`,
      { title: "Hidden" }
    ),
    /provider "example-scriptoria-helper" rejected the document: Prophecy titles must begin with Seen/
  );
});

test("registration and unregistration hooks receive frozen public data and listener errors are isolated", () => {
  configureGame();
  resetScriptureTypeRegistryForTests();
  const calls = [];
  globalThis.Hooks = {
    callAll: (...args) => calls.push(args)
  };

  const registered = registerScriptureType(descriptor());
  const removed = unregisterScriptureType(`${PROVIDER_ID}.prophecy`, {
    provider: PROVIDER_ID
  });

  assert.equal(registered.ok, true);
  assert.equal(removed.ok, true);
  assert.equal(calls[0][0], "scriptoria.scriptureTypeRegistered");
  assert.equal(calls[0][1].id, `${PROVIDER_ID}.prophecy`);
  assert.equal(Object.isFrozen(calls[0][1]), true);
  assert.equal(calls[1][0], "scriptoria.scriptureTypeUnregistered");

  globalThis.Hooks = {
    callAll: () => {
      throw new Error("broken listener");
    }
  };
  const isolated = registerScriptureType(descriptor({
    id: `${PROVIDER_ID}.second`,
    label: "Second"
  }));
  assert.equal(isolated.ok, true);
  assert.equal(hasScriptureType(`${PROVIDER_ID}.second`), true);
});


test("built-in scripture types expose stable localization keys", () => {
  resetScriptureTypeRegistryForTests();
  const book = getScriptureType("book");
  assert.equal(book.labelKey, "SCRIPTORIA.Types.Book.Label");
  assert.equal(book.pluralKey, "SCRIPTORIA.Types.Book.Plural");
  assert.equal(book.descriptionKey, "SCRIPTORIA.Types.Book.Description");
});
